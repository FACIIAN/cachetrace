'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const L = require('../src/engine.js');
const { referenceRun, makeRng } = require('./reference.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'examples', f), 'utf8');
const BASE = { addrBits: 16, lineBytes: 8, cacheBytes: 128, policy: 'LRU', stopAtNop: true };
const model = (sim, key) => sim.models.find((m) => m.model.key === key);

test('el ejercicio de ejemplo produce los resultados esperados', () => {
  const sim = L.simulate({ ...BASE, program: read('programa.txt'), dump: read('dump.txt') });
  assert.equal(sim.ok, true, sim.errors.join('\n'));
  assert.equal(sim.steps.length, 23);
  assert.equal(sim.stop, 'nop');

  const expected = { DM: [16, 13, 6, 1], SA2W: [16, 13, 5, 1], SA4W: [19, 10, 1, 0], FA: [19, 10, 0, 0] };
  for (const [key, [hits, misses, evictions, writebacks]] of Object.entries(expected)) {
    const s = model(sim, key).stats;
    assert.deepEqual([s.accesses, s.hits, s.misses, s.evictions, s.writebacks], [29, hits, misses, evictions, writebacks], key);
  }

  const regs = sim.steps[sim.steps.length - 1].regs;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((r) => regs[r]), [0x1008, 0x2008, 0x2088, 0, 0x22, 0x200, 0x222]);
  // r5, r6 and r7 after the first iteration (little-endian words from the dump)
  const first = sim.steps[7].regs;
  assert.deepEqual([first[5], first[6], first[7]], [0x11, 0x100, 0x111]);
});

test('mapeo directo: la línea 0 termina con tag 0x041, sucia y con los bytes en little-endian', () => {
  const sim = L.simulate({ ...BASE, program: read('programa.txt'), dump: read('dump.txt') });
  const line0 = model(sim, 'DM').finalSnap[0];
  assert.equal(line0.valid, 1);
  assert.equal(line0.dirty, 1);
  assert.equal(line0.tag, 0x41);
  assert.deepEqual(L.wordBytes(line0.words[0]), ['11', '01', '00', '00']);
  assert.deepEqual(L.wordBytes(line0.words[1]), ['22', '02', '00', '00']);
});

test('reparto de bits para 16 bits, caché de 128 B y líneas de 8 B', () => {
  const cfg = { addrBits: 16, lineBytes: 8, cacheBytes: 128 };
  const bits = Object.fromEntries(L.MODELS.map((m) => { const g = L.modelGeometry(m, cfg); return [m.key, [g.tag, g.idx, g.off]]; }));
  assert.deepEqual(bits, { DM: [9, 4, 3], SA2W: [10, 3, 3], SA4W: [11, 2, 3], FA: [13, 0, 3] });
});

test('el programa admite zero, inmediatos negativos, etiquetas y saltos a dirección', () => {
  const byLabel = L.simulate({ ...BASE, program: 'li r4, 3\nloop: addi r4, r4, -1\nbne r4, zero, loop\nnop', dump: '' });
  const byAddr = L.simulate({ ...BASE, program: 'li r4, 3\naddi r4, r4, -1\nbne r4, zero, 0x0004\nnop', dump: '' });
  assert.equal(byLabel.ok && byAddr.ok, true);
  assert.equal(byLabel.steps.length, byAddr.steps.length);
  assert.equal(byLabel.steps.length, 1 + 3 * 2 + 1);
});

test('nop termina la ejecución solo si la opción está activa', () => {
  const src = 'li r1, 1\nnop\nli r1, 2';
  assert.equal(L.simulate({ ...BASE, program: src, dump: '' }).steps.length, 2);
  assert.equal(L.simulate({ ...BASE, stopAtNop: false, program: src, dump: '' }).steps.length, 3);
});

test('los errores de entrada se describen', () => {
  const bad = (over) => L.simulate({ ...BASE, program: 'nop', dump: '', ...over });
  assert.match(bad({ program: 'foo r1' }).errors[0], /instrucción desconocida/);
  assert.match(bad({ program: 'bne r1, zero, 0x0100' }).errors[0], /dirección de salto/);
  assert.match(bad({ dump: '0x10: 1FF' }).errors[0], /byte hexadecimal/);
  assert.match(bad({ cacheBytes: 100 }).errors[0], /potencia de 2/);
  assert.match(bad({ program: 'li r1, 0x0002\nlw r2, 0(r1)' }).errors[0], /alineada/);
  assert.match(bad({ program: 'li r1, 0xFFFF\nlw r2, 0(r1)' }).errors[0], /fuera de la memoria|alineada/);
});

test('el motor coincide con un modelo de referencia independiente en programas aleatorios', () => {
  const rng = makeRng(2026);
  const setups = [
    { addrBits: 16, lineBytes: 8, cacheBytes: 128 },
    { addrBits: 16, lineBytes: 16, cacheBytes: 256 },
    { addrBits: 12, lineBytes: 4, cacheBytes: 64 },
    { addrBits: 16, lineBytes: 32, cacheBytes: 512 },
  ];
  let compared = 0;
  for (let t = 0; t < 120; t++) {
    const cfg = setups[rng(setups.length)];
    const top = Math.pow(2, cfg.addrBits) - 64;
    const lines = [`li r4, ${1 + rng(4)}`];
    for (let k = 0; k < 2 + rng(6); k++) {
      const a = (0x100 + rng(Math.floor((top - 0x100) / 4)) * 4);
      lines.push(`li r1, ${a}`, rng(2) ? 'lw r5, 0(r1)' : `sw r5, ${4 * rng(3)}(r1)`);
    }
    lines.push('addi r4, r4, -1', 'bne r4, zero, 0x0004', 'nop');
    const policy = rng(2) ? 'LRU' : 'FIFO';
    const sim = L.simulate({ ...cfg, policy, stopAtNop: true, program: lines.join('\n'), dump: '' });
    assert.equal(sim.ok, true, sim.errors.join('\n'));

    for (const m of sim.models) {
      const accesses = m.rows.filter((r) => !r.empty).map((r) => ({ addr: r.addr, write: r.phase === 'Execute' && sim.steps[r.step].access.kind === 'W' }));
      const ref = referenceRun(accesses, { lineBytes: cfg.lineBytes, cacheBytes: cfg.cacheBytes, ways: m.model.key === 'FA' ? 'full' : m.geo.ways, policy });
      const got = m.rows.filter((r) => !r.empty);
      got.forEach((r, i) => {
        compared++;
        const where = `${m.model.key} ${policy} acceso ${i} (${L.H(r.addr)}) en ${JSON.stringify(cfg)}`;
        assert.equal(r.hit, ref[i].hit, `hit/miss: ${where}`);
        assert.equal(r.line, ref[i].line, `línea: ${where}`);
        assert.equal(r.evict ? r.evict.dirty : null, ref[i].evictedDirty, `desalojo: ${where}`);
      });
    }
  }
  assert.ok(compared > 5000);
});

test('el libro de Excel se genera con las hojas, fórmulas y filtro de modelos', async () => {
  const sim = L.simulate({ ...BASE, program: read('programa.txt'), dump: read('dump.txt') });
  const all = L.buildWorkbook(ExcelJS, sim, {});
  assert.deepEqual(all.worksheets.map((w) => w.name), ['Mapeo Directo(DM)', 'SA2W', 'SA4W', 'FA', 'DM - evolución', 'SA2W - evolución', 'SA4W - evolución', 'FA - evolución', 'Registros', 'Enunciado']);

  const sa4 = all.getWorksheet('SA4W');
  assert.equal(sa4.getCell('C2').value, '0x0000');
  assert.match(sa4.getCell('D2').value.formula, /HEX2DEC/);
  assert.equal(sa4.getCell('T2').value.result, '0x000');

  const some = L.buildWorkbook(ExcelJS, sim, { models: ['SA2W', 'FA'], evolution: false });
  assert.deepEqual(some.worksheets.map((w) => w.name), ['SA2W', 'FA', 'Enunciado']);
  assert.throws(() => L.buildWorkbook(ExcelJS, sim, { models: [] }), /al menos un tipo/);

  const buf = await all.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 10000);
});
