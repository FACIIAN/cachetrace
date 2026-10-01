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
      const kind = rng(6);
      const op = ['lw', 'sw', 'lb', 'sb', 'lh', 'sh'][kind];
      const size = [4, 4, 1, 1, 2, 2][kind];
      lines.push(`li r1, ${a}`, `${op} r5, ${size * rng(3)}(r1)`);
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

test('lb, lbu, lh, lhu: extensión de signo y desplazamiento opcional', () => {
  const src = ['li r1, 0x1000', 'lb r2, (r1)', 'lbu r3, 0(r1)', 'lh r4, 2(r1)', 'lhu r5, 2(r1)', 'lw r6, 0(r1)', 'nop'].join('\n');
  const sim = L.simulate({ ...BASE, program: src, dump: '0x1000: F0 00 00 80' });
  assert.equal(sim.ok, true, sim.errors.join('\n'));
  const r = sim.steps[sim.steps.length - 1].regs;
  assert.deepEqual([r[2], r[3], r[4], r[5], r[6]], [0xFFFFFFF0, 0xF0, 0xFFFF8000, 0x8000, 0x800000F0]);
});

test('sb y sh solo modifican los bytes afectados de la línea y la dejan sucia', () => {
  const src = ['li r1, 0x1002', 'addi r2, r1, 0x1001', 'lb r10, (r1)', 'sb r10, (r2)', 'li r3, 0xBEEF', 'li r4, 0x2004', 'sh r3, 0(r4)', 'nop'].join('\n');
  const dump = '0x1000: 00 11 22 33 44 55 66 77\n0x2000: 88 99 AA BB CC DD EE FF';
  const sim = L.simulate({ ...BASE, program: src, dump });
  assert.equal(sim.ok, true, sim.errors.join('\n'));
  const dm = model(sim, 'DM');
  const line = dm.finalSnap[dm.finalSnap.findIndex((l) => l.valid && l.tag === 0x40)];
  assert.equal(line.dirty, 1);
  // byte 3 holds 0x22 (stored by sb); bytes 4 and 5 hold the half-word 0xBEEF in little-endian order (EF BE)
  assert.deepEqual([...L.wordBytes(line.words[0]), ...L.wordBytes(line.words[1])], ['88', '99', 'AA', '22', 'EF', 'BE', 'EE', 'FF']);
  // earlier states are not modified by later writes to the same line
  const first = dm.rows.find((r) => r.phase === 'Execute' && r.addr === 0x2003);
  assert.deepEqual(L.wordBytes(first.snap[first.changedLine].words[0]), ['88', '99', 'AA', '22']);
});

test('los accesos de byte y media palabra exigen su alineación', () => {
  assert.match(L.simulate({ ...BASE, program: 'li r1, 0x1001\nlh r2, 0(r1)', dump: '' }).errors[0], /media palabra/);
  assert.equal(L.simulate({ ...BASE, program: 'li r1, 0x1001\nlb r2, 0(r1)\nnop', dump: '' }).ok, true);
});

test('el límite de instrucciones detiene un bucle sin salida y lo avisa', () => {
  const src = 'li r1, 5\nloop: addi r1, r1, 1\nbeq r1, r1, 0x0004\nnop';
  const sim = L.simulate({ ...BASE, maxSteps: 9, program: src, dump: '' });
  assert.equal(sim.ok, true);
  assert.equal(sim.steps.length, 9);
  assert.equal(sim.stop, 'limite');
  assert.match(sim.warnings[0], /límite de 9 instrucciones/);
});

test('un registro donde se espera un inmediato da un mensaje claro', () => {
  assert.match(L.simulate({ ...BASE, program: 'addi r1, r1, r11', dump: '' }).errors[0], /es un registro/);
});

test('el Excel conserva las etiquetas I_n de las líneas con instrucciones tras guardarlo y leerlo', async () => {
  const sim = L.simulate({ ...BASE, program: read('programa.txt'), dump: read('dump.txt') });
  const buf = await L.buildWorkbook(ExcelJS, sim, {}).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  for (const name of ['Mapeo Directo(DM)', 'SA2W', 'SA4W', 'FA', 'DM - evolución']) {
    const labels = new Set();
    wb.getWorksheet(name).eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === 'string' && /^I\d+$/.test(cell.value)) labels.add(cell.value); }));
    assert.ok(labels.size > 0, `${name}: faltan las etiquetas de instrucción`);
  }
  // every instruction word that is in the final SA4W state must appear in the sheet
  const expected = new Set();
  model(sim, 'SA4W').finalSnap.forEach((ln) => { if (ln.valid) ln.words.forEach((w) => { if (L.wordIns(w)) expected.add(L.wordIns(w)); }); });
  assert.ok(expected.size >= 4);
  const all = new Set();
  wb.getWorksheet('SA4W').eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === 'string' && /^I\d+$/.test(cell.value)) all.add(cell.value); }));
  for (const label of expected) assert.ok(all.has(label), `SA4W: falta ${label}`);
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

  const seq = L.buildWorkbook(ExcelJS, sim, { models: ['DM'], evolution: false, insMode: 'seq' }).getWorksheet('Mapeo Directo(DM)');
  assert.equal(seq.getCell('A2').value, 0);
  assert.equal(seq.getCell('A4').value, 1);

  const buf = await all.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 10000);
});
