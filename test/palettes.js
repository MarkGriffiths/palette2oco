import test from 'ava'
import {cat} from 'shelljs'
import {paletteReader, paletteWriter, console} from '..'

test('Named palette (JSON)', t => {
	const fixture = cat('fixtures/out/json.oco').toString()
	return paletteReader('fixtures/in/json')
		.load(['fixtures/in/json/test.json'])
		.then(palette => {
			t.is(palette.render(), fixture)
		})
})

test('Named palette (Sip pallette)', t => {
	const fixture = cat('fixtures/out/sippalette.oco').toString()
	return paletteReader('fixtures/in/sippalette')
		.load(['fixtures/in/sippalette/test.sippalette'])
		.then(palette => {
			t.is(palette.render(), fixture)
		})
})

test('Named palette (OCO)', t => {
	const fixture = cat('fixtures/out/oco.oco').toString()
	return paletteReader('fixtures/in/oco')
		.load(['fixtures/in/oco/test.oco'])
		.then(palette => {
			t.is(palette.render(), fixture)
		})
})

test('Named palette (ASE)', t => {
	const fixture = cat('fixtures/out/ase.oco').toString()
	return paletteReader('fixtures/in/ase')
		.load(['fixtures/in/ase/test.ase'])
		.then(palette => {
			t.is(palette.render(), fixture)
		})
})

test('Photoshop palette (ASE)', t => {
	const fixture = cat('fixtures/out/ps-test.oco').toString()
	return paletteReader('fixtures/in/ase')
		.load(['fixtures/in/ase/ps-test.ase'])
		.then(palette => {
			t.is(palette.render(), fixture)
		})
})
