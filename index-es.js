import { createConsole } from 'verbosity';
import _isEqual from 'lodash/isEqual';
import { relative } from 'path';
import fs from 'fs';
import promisify from 'es6-promisify';
import { fromBytes, fromPrecise, OCOValueEX, fromLab, fromCMYK } from '@thebespokepixel/oco-colorvalue-ex';
import oco from 'opencolor';
import ase from 'ase-util';

const loader = promisify(fs.readFile);

const supportedTypes = ['oco', 'json', 'sippalette', 'ase'];

const fileFilter = new RegExp(`\.(${ supportedTypes.join('|') })$`);
const fileMatch = new RegExp(`(.*\/)(.+?).(${ supportedTypes.join('|') })$`);

function createIdentity(rootPath) {
	return function (path) {
		const address = path.replace(rootPath, '').match(fileMatch);
		return {
			source: path,
			name: address[2],
			path: address[1].replace(/^\//, '').replace(/\//g, '.'),
			type: address[3]
		};
	};
}

function isPaletteJSON(datum) {
	const tests = {
		palette: {
			name: typeof datum.name === 'string' && datum.name,
			colors: Array.isArray(datum.colors) && datum.colors
		},
		rgba: {
			name: typeof datum.name === 'string' && datum.name,
			red: datum.red >= 0.0 && datum.red <= 1.0 && datum.red,
			green: datum.green >= 0.0 && datum.green <= 1.0 && datum.green,
			blue: datum.blue >= 0.0 && datum.blue <= 1.0 && datum.blue,
			alpha: datum.alpha >= 0.0 && datum.alpha <= 1.0 && datum.alpha
		},
		rgbaInteger: {
			name: typeof datum.name === 'string' && datum.name,
			red: datum.red >= 0 && datum.red <= 255 && datum.red,
			green: datum.green >= 0 && datum.green <= 255 && datum.green,
			blue: datum.blue >= 0 && datum.blue <= 255 && datum.blue,
			alpha: datum.alpha >= 0 && datum.alpha <= 255 && datum.alpha
		}
	};
	return {
		isPalette: _isEqual(datum, tests.palette),
		isRGBA: _isEqual(datum, tests.rgba),
		isIntegerRGBA: _isEqual(datum, tests.rgbaInteger)
	};
}

function loadOCO(identity) {
	return loader(identity.source, 'utf8').then(oco.parse);
}

function loadJSON(identity) {
	return loader(identity.source, 'utf8').then(JSON.parse).then(palette => {
		if (isPaletteJSON(palette).isPalette) {
			console.debug(`JSON Palette: ${ palette.name }`);
			return new oco.Entry(identity.name, [OCOValueEX.generateOCO(palette.name, palette.colors.map(color => {
				const paletteColor = isPaletteJSON(color);
				switch (true) {
					case paletteColor.isRGBA:
						console.debug(`JSON Color (RGBA): ${ color.name }`);
						return fromPrecise(color);
					case paletteColor.isIntegerRGBA:
						console.debug(`JSON Color (Integer RGBA): ${ color.name }`);
						return fromBytes(color);
					default:
						throw new Error(`${ color.name }.json is not a valid JSON color object`);
				}
			}))]);
		}
		throw new Error(`${ identity.name }.json is not a valid palette`);
	});
}

function loadASE(identity) {
	function scan(node) {
		return node.map(datum => {
			switch (datum.type) {
				case 'color':
					switch (datum.color.model) {
						case 'RGB':
							console.debug(`ASE Color (RGB): ${ datum.name }`);
							return new OCOValueEX(datum.color.hex, datum.name);
						case 'CMYK':
							console.debug(`ASE Color (CMYK): ${ datum.name }`);
							return fromCMYK({
								name: datum.name,
								cyan: datum.color.c,
								magenta: datum.color.m,
								yellow: datum.color.y,
								black: datum.color.k
							});
						case 'LAB':
							console.debug(`ASE Color (Lab): ${ datum.name }`);
							return fromLab({
								name: datum.name,
								L: datum.color.lightness,
								a: datum.color.a,
								b: datum.color.b
							});
						case 'Gray':
							console.debug(`ASE Color (Gray): ${ datum.name }`);
							return new OCOValueEX(datum.color.hex, datum.name);
						default:
							throw new Error(`${ datum.color.model } is not a valid ASE color model`);
					}

				case 'group':
					console.debug(`ASE Group: ${ datum.name }`);
					return OCOValueEX.generateOCO(datum.name, scan(datum.entries));

				default:
					throw new Error(`${ datum.type } is not a valid ASE data type`);
			}
		});
	}

	return loader(identity.source).then(ase.read).then(palette => {
		if (Array.isArray(palette)) {
			return palette.length === 1 ? new oco.Entry(identity.name, scan(palette)) : OCOValueEX.generateOCO(identity.name, scan(palette));
		}
		throw new Error(`${ identity.name }.ase is not a valid palette`);
	});
}

function selectLoaderByIndentity(type) {
	switch (type) {
		case 'sippalette':
			return loadJSON;
		case 'json':
			return loadJSON;
		case 'ase':
			return loadASE;
		case 'oco':
			return loadOCO;
		default:
			throw new Error(`${ type } is not recognised`);
	}
}

class Reader {
	constructor(source_) {
		this.sourcePath = source_;
		this.tree = new oco.Entry();
	}

	pick(key_) {
		return key_ ? this.tree.get(key_) : this.tree.root();
	}

	transformColors(formats) {
		this.tree.traverseTree('Color', color_ => {
			const original = color_.get(0).identifiedValue.getOriginalInput();
			color_.children = [];

			formats.forEach((format, index_) => {
				const newFormat = new OCOValueEX(original, color_.name);
				newFormat._format = format;

				color_.addChild(new oco.ColorValue(format, newFormat.toString(format), newFormat), true, index_);
			});
		});
		return this;
	}

	load(pathArray) {
		return Promise.all(pathArray.filter(file => file.match(fileFilter)).map(createIdentity(this.sourcePath)).map(identity => selectLoaderByIndentity(identity.type)(identity).then(entry => {
			entry.addMetadata({
				'import/file/source': relative(process.cwd(), identity.source),
				'import/file/type': identity.type
			});
			return entry;
		}).then(entry => this.tree.set(`${ identity.path }${ identity.name }`, entry)))).then(() => this);
	}

	render(path) {
		return oco.render(this.pick(path));
	}
}

const writeFile = promisify(fs.writeFile);

function writer(destination, oco) {
  console.debug(`Writing oco file to ${ destination }`);
  return writeFile(destination, oco);
}

const console = createConsole({ outStream: process.stderr });

function paletteReader(pathArray) {
  return new Reader(pathArray);
}

function paletteWriter(palette, destination) {
  return writer(palette, destination);
}

export { console, paletteReader, paletteWriter };