'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { examPdf } = require('../src/pdf.js');

const root = path.join(__dirname, '..');
const json = (f) => JSON.parse(fs.readFileSync(path.join(root, 'website', 'i18n', f), 'utf8'));

test('los textos de la web en español e inglés tienen las mismas claves', () => {
  const es = json('es.json'), en = json('en.json');
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  Object.entries(en).forEach(([k, v]) => assert.ok(String(v).trim().length > 0, `en.${k} vacío`));
});

test('cada solución en PDF se genera y tiene varias páginas', async () => {
  for (const lv of ['facil', 'medio', 'dificil']) {
    const buf = await examPdf(lv);
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buf.length > 20000, `${lv}: ${buf.length} bytes`);
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.ok(pages >= 8, `${lv}: ${pages} páginas`);
  }
});
