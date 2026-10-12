'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/blockmodel.js');
const { referenceRun, makeRng } = require('./reference.js');

const CFG = { addrBits: 16, cacheBytes: 128, blockBytes: 8 };
const acc = (list) => list.map(([op, addr]) => ({ op, addr }));

test('bloque, offset y rango de una dirección', () => {
  const d = T.decompose(0x2A47, CFG);
  assert.deepEqual([d.block, d.offset, d.start, d.end], [0x548, 7, 0x2A40, 0x2A47]);
  const last = T.decompose(0xFFFF, CFG);
  assert.deepEqual([last.block, last.offset, last.start, last.end], [0x1FFF, 7, 0xFFF8, 0xFFFF]);
});

test('reparto de bits y conjuntos por organización', () => {
  const g = (w) => T.geometry(CFG, w);
  assert.deepEqual([g(1).sets, g(1).idxBits, g(1).tagBits], [16, 4, 9]);
  assert.deepEqual([g(2).sets, g(2).idxBits, g(2).tagBits], [8, 3, 10]);
  assert.deepEqual([g(4).sets, g(4).idxBits, g(4).tagBits], [4, 2, 11]);
  assert.deepEqual([g('full').sets, g('full').idxBits, g('full').tagBits], [1, 0, 13]);
  const hard = T.geometry({ addrBits: 15, cacheBytes: 128, blockBytes: 16 }, 1);
  assert.deepEqual([hard.lines, hard.offBits, hard.idxBits, hard.tagBits], [8, 4, 3, 8]);
});

test('línea, conjunto y tag salen del número de bloque', () => {
  const [row] = T.tablaB([0x13D], CFG);
  assert.deepEqual([row.dm.set, row.dm.tag, row.sa2.set, row.sa2.tag, row.sa4.set, row.sa4.tag], [13, 0x13, 5, 0x27, 1, 0x4F]);
  assert.equal(T.groups4(0x13D, 13), '0000 0001 0011 1101');
  assert.equal(T.groups4(0x13D, 11), '0001 0011 1101');
});

test('competencia entre bloques según el número de conjuntos', () => {
  const blocks = [0x2A4, 0x2B4, 0x2C4, 0x2AC, 0x2A8, 0x2A5];
  assert.deepEqual(T.competing(blocks, 0x2A4, 16).sort((a, b) => a - b), [0x2A4, 0x2B4, 0x2C4]);
  assert.deepEqual(T.competing(blocks, 0x2A4, 8).sort((a, b) => a - b), [0x2A4, 0x2AC, 0x2B4, 0x2C4]);
  assert.deepEqual(T.competing(blocks, 0x2A4, 4).sort((a, b) => a - b), [0x2A4, 0x2A8, 0x2AC, 0x2B4, 0x2C4]);
});

test('traza en directa: conflicto, víctima limpia y víctima sucia con write-back', () => {
  // A, B and C share line 5; B and C are written
  const tr = T.trace(acc([['LW', 0x1828], ['SW', 0x18AA], ['LW', 0x182F], ['SW', 0x1929]]), CFG, T.policy('DM'));
  assert.deepEqual(tr.rows.map((r) => r.hit), [false, false, false, false]);
  assert.deepEqual(tr.rows.map((r) => T.victimLabel(r.victim)), ['—', 'A limpia', 'B sucia', 'A limpia']);
  assert.deepEqual(tr.rows.map((r) => r.wb), [false, false, true, false]);
  assert.deepEqual(tr.rows[2].victim && [tr.rows[2].victim.start, tr.rows[2].victim.end], [0x18A8, 0x18AF]);
  assert.equal(tr.rows[0].place, 'L5');
});

test('en conjuntos se ocupa primero la vía inválida y después se expulsa la LRU', () => {
  const tr = T.trace(acc([['LW', 0x1828], ['SW', 0x18AA], ['LW', 0x182F], ['SW', 0x1929], ['LW', 0x18AD]]), CFG, T.policy('SA2'));
  assert.deepEqual(tr.rows.map((r) => r.place), ['S5/V0', 'S5/V1', 'S5/V0', 'S5/V1', 'S5/V0']);
  assert.equal(tr.rows[2].hit, true);
  assert.equal(T.victimLabel(tr.rows[3].victim), 'B sucia'); // B is the LRU after A was touched again
  assert.equal(tr.rows[3].wb, true);
  assert.deepEqual(tr.final[0].order.map((w) => tr.final[0].ways[w].letter), ['C', 'B']);
});

test('completamente asociativa: solo expulsa cuando todas las líneas están ocupadas', () => {
  const cfg = { addrBits: 16, cacheBytes: 32, blockBytes: 8 }; // 4 lines
  const tr = T.trace(acc([['SW', 0x0000], ['LW', 0x0008], ['LW', 0x0010], ['LW', 0x0018], ['LW', 0x0020]]), cfg, T.policy('FA'));
  assert.deepEqual(tr.rows.map((r) => r.place), ['V0', 'V1', 'V2', 'V3', 'V0']);
  assert.equal(T.victimLabel(tr.rows[4].victim), 'A sucia');
  assert.equal(tr.totals.writebacks, 1);
});

test('conjunto con estado inicial: write-back del bloque expulsado y orden LRU', () => {
  const cfg = CFG, g = T.geometry(cfg, 2);
  const addr = (0x33 * g.sets + 6) * 8 + 5;
  const tr = T.trace([{ op: 'SW', addr }], cfg, T.saPolicy(2), [{ set: 6, ways: [{ v: 1, d: 0, tag: 0x31 }, { v: 1, d: 1, tag: 0x32 }], order: [1, 0] }]);
  const r = tr.rows[0];
  assert.equal(r.hit, false);
  assert.deepEqual([r.victim.way, r.victim.tag, r.victim.dirty, r.wb], [1, 0x32, true, true]);
  assert.deepEqual([r.victim.start, r.victim.end], [(0x32 * 8 + 6) * 8, (0x32 * 8 + 6) * 8 + 7]);
  assert.equal(tr.final[0].ways[1].d, 1);
  assert.deepEqual(tr.final[0].order, [0, 1]); // V1 is now the MRU
});

test('un hit de escritura ensucia la línea y no hay expulsión', () => {
  const g = T.geometry(CFG, 2), addr = (0x21 * g.sets + 2) * 8 + 3;
  const tr = T.trace([{ op: 'SW', addr }], CFG, T.saPolicy(2), [{ set: 2, ways: [{ v: 1, d: 0, tag: 0x21 }, { v: 1, d: 1, tag: 0x22 }], order: [0, 1] }]);
  assert.deepEqual([tr.rows[0].hit, tr.rows[0].victim, tr.rows[0].wb], [true, null, false]);
  assert.equal(tr.final[0].ways[0].d, 1);
});

test('la traza coincide con el modelo de referencia en secuencias aleatorias', () => {
  const rng = makeRng(77);
  const cfgs = [CFG, { addrBits: 15, cacheBytes: 128, blockBytes: 16 }, { addrBits: 12, cacheBytes: 64, blockBytes: 4 }];
  let n = 0;
  for (let t = 0; t < 150; t++) {
    const cfg = cfgs[rng(cfgs.length)], top = Math.pow(2, cfg.addrBits);
    const accesses = Array.from({ length: 6 + rng(14) }, () => ({ op: rng(2) ? 'SW' : 'LW', addr: rng(top) }));
    for (const pol of T.POLICIES) {
      const tr = T.trace(accesses, cfg, pol);
      const ref = referenceRun(accesses.map((a) => ({ addr: a.addr, write: a.op === 'SW' })), { lineBytes: cfg.blockBytes, cacheBytes: cfg.cacheBytes, ways: pol.ways, policy: 'LRU' });
      tr.rows.forEach((r, i) => {
        n++;
        const where = `${pol.key} acceso ${i + 1} en ${JSON.stringify(cfg)}`;
        assert.equal(r.hit, ref[i].hit, 'hit ' + where);
        assert.equal(r.victim ? r.victim.dirty : null, ref[i].evictedDirty, 'víctima ' + where);
      });
    }
  }
  assert.ok(n > 5000);
});

test('primer acceso que cambia entre dos organizaciones y su motivo', () => {
  const list = acc([['LW', 0x1828], ['LW', 0x182C], ['SW', 0x18AA], ['LW', 0x182F]]);
  const fc = T.firstChange(T.trace(list, CFG, T.policy('DM')), T.trace(list, CFG, T.policy('SA2')));
  assert.equal(fc.n, 4);
  assert.equal(fc.reason, 'conflict');
  assert.match(fc.text, /expulsado de L5 por B/);
  assert.equal(T.firstChange(T.trace(list, CFG, T.policy('SA4')), T.trace(list, CFG, T.policy('FA'))), null);
});

test('validación de la configuración', () => {
  assert.deepEqual(T.validate(CFG), []);
  assert.match(T.validate({ ...CFG, addrBits: 6 }).join(' '), /128 bytes.*64 bytes/);
  assert.match(T.validate({ ...CFG, blockBytes: 6 }).join(' '), /potencia de 2/);
});
