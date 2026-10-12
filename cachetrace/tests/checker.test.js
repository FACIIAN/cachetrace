'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/checker.js');

const ok = (type, raw, exp) => assert.equal(C.check(type, raw, exp), 'ok', `${type} ${JSON.stringify(raw)}`);
const bad = (type, raw, exp) => assert.equal(C.check(type, raw, exp), 'bad', `${type} ${JSON.stringify(raw)}`);

test('hexadecimal: 0x204, 0X204, 204 y 0x0204 son lo mismo', () => {
  ['0x204', '0X204', '204', '0x0204', ' 0x204 ', '0x 204'].forEach((v) => ok('hex', v, 0x204));
  bad('hex', '0x205', 0x204); bad('hex', 'zz', 0x204);
  assert.equal(C.check('hex', '', 0x204), 'empty');
});

test('rangos: guiones distintos y con o sin prefijo', () => {
  ['0x1020–0x1027', '0x1020-0x1027', '1020 - 1027', '0X1020—0X1027'].forEach((v) => ok('hexrange', v, [0x1020, 0x1027]));
  bad('hexrange', '0x1020–0x1028', [0x1020, 0x1027]);
  ok('hexrange', '—', null);
});

test('números decimales: separadores y potencias', () => {
  ['65536', '65.536', '65 536', '2^16'].forEach((v) => ok('int', v, 65536));
  bad('int', '65535', 65536);
});

test('hit/miss, sí/no y lugar', () => {
  ['H', 'h', 'Hit', 'HIT'].forEach((v) => ok('hm', v, 'H'));
  ['M', 'miss', 'Fallo'].forEach((v) => ok('hm', v, 'M'));
  ['Sí', 'si', 'S', 'yes'].forEach((v) => ok('yn', v, true));
  ['No', 'n', '0'].forEach((v) => ok('yn', v, false));
  ['L4', 'l4', 'L 4'].forEach((v) => ok('place', v, 'L4'));
  ['S4/V0', 's4 / v0', 'S4-V0', 'S4 V0'].forEach((v) => ok('place', v, 'S4/V0'));
  ok('place', 'v12', 'V12');
  bad('place', 'S4/V1', 'S4/V0');
});

test('víctima: letra y estado, o ninguna', () => {
  ['A limpia', 'a limpia', 'A (limpia)', 'A, limpia', 'A clean', 'A D=0'].forEach((v) => ok('victim', v, { letter: 'A', dirty: false }));
  ['B sucia', 'b SUCIA', 'B dirty'].forEach((v) => ok('victim', v, { letter: 'B', dirty: true }));
  ['—', '-', 'ninguna', 'no hay'].forEach((v) => ok('victim', v, null));
  bad('victim', 'B limpia', { letter: 'B', dirty: true });
  bad('victim', 'A', { letter: 'A', dirty: false });
  ok('victimtag', 'tag 0x40 sucia', { tag: 0x40, dirty: true });
  ok('victimtag', '0X41 limpia', { tag: 0x41, dirty: false });
});

test('listas: letras, vías y bloques sin importar el separador', () => {
  ok('letters', 'A, C, B', ['A', 'C', 'B']); ok('letters', 'A > C > B', ['A', 'C', 'B']); ok('letters', 'LRU: A C B (MRU)', ['A', 'C', 'B']);
  bad('letters', 'A B C', ['A', 'C', 'B']);
  ok('ways', 'V1, V0', [1, 0]); ok('ways', '1 0', [1, 0]);
  ok('hexlist', '0x204, 0x214  0x224', [0x204, 0x214, 0x224]); ok('hexlist', '224 204 214', [0x204, 0x214, 0x224]);
  bad('hexlist', '0x204', [0x204, 0x214]);
});

test('selección múltiple y listas desplegables', () => {
  ok('multi', ['2 vías', 'FA'], ['FA', '2 vías']);
  bad('multi', ['2 vías'], ['FA', '2 vías']);
  assert.equal(C.check('multi', [], ['FA']), 'empty');
  ok('select', 'conflicto', 'conflicto'); bad('select', 'capacidad', 'conflicto');
});
