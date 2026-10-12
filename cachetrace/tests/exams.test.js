'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/blockmodel.js');
const C = require('../src/checker.js');
const E = require('../src/exams.js');
const Hints = require('../src/hints.js');

const LEVELS = ['facil', 'medio', 'dificil'];

test('los tres exámenes se construyen con las diez actividades', () => {
  const ids = ['diag', 'ubic', 'trace-DM', 'trace-SA2', 'trace-SA4', 'trace-FA', 'comp', 'error', 'wb', 'final'];
  LEVELS.forEach((lv) => {
    const ex = E.build(lv);
    assert.deepEqual(ex.sections.map((s) => s.id), ids, lv);
    ex.sections.forEach((s) => assert.ok(Hints.get(s.hint, ex.cfg).length > 80, `pista de ${s.id} (${lv})`));
  });
});

test('la construcción es determinista: mismos identificadores y mismas celdas dadas', () => {
  LEVELS.forEach((lv) => {
    const a = E.build(lv), b = E.build(lv);
    assert.deepEqual(a.cells.map((c) => [c.id, c.given, E.fmt(c)]), b.cells.map((c) => [c.id, c.given, E.fmt(c)]));
    assert.equal(new Set(a.cells.map((c) => c.id)).size, a.cells.length, 'identificadores únicos');
  });
});

test('la dificultad aumenta: menos celdas dadas y más celdas por responder', () => {
  const stat = (lv) => { const ex = E.build(lv); return { given: ex.cells.filter((c) => c.given).length / ex.cells.length, scored: ex.scored.length }; };
  const f = stat('facil'), m = stat('medio'), d = stat('dificil');
  assert.ok(f.given > m.given && m.given > d.given, JSON.stringify({ f, m, d }));
  assert.ok(f.scored < m.scored && m.scored < d.scored);
});

test('el nivel difícil cambia los parámetros de la caché', () => {
  assert.deepEqual(E.build('facil').cfg, E.build('medio').cfg);
  const hard = E.build('dificil').cfg, easy = E.build('facil').cfg;
  assert.ok(hard.addrBits !== easy.addrBits && hard.blockBytes !== easy.blockBytes);
});

test('cada solución es aceptada por el corrector, también en minúsculas', () => {
  LEVELS.forEach((lv) => {
    const ex = E.build(lv);
    ex.scored.forEach((c) => {
      const raw = c.t === 'multi' ? c.exp : E.fmt(c); // desplegables y casillas se eligen, no se escriben
      assert.equal(C.check(c.t, raw, c.exp), 'ok', `${lv} ${c.id} ${c.t} ${E.fmt(c)}`);
      if (typeof raw === 'string' && c.t !== 'select') assert.equal(C.check(c.t, raw.toLowerCase(), c.exp), 'ok', `${lv} ${c.id} minúsculas`);
    });
  });
});

test('una celda vacía o equivocada no cuenta como correcta', () => {
  const ex = E.build('medio');
  ex.scored.filter((c) => !['multi', 'select'].includes(c.t)).forEach((c) => {
    assert.equal(C.check(c.t, '', c.exp), 'empty');
    assert.notEqual(C.check(c.t, 'zzz@', c.exp), 'ok');
  });
});

test('las celdas dadas coinciden con la solución calculada por el motor', () => {
  LEVELS.forEach((lv) => {
    const ex = E.build(lv), cfg = ex.cfg;
    ['DM', 'SA2', 'SA4', 'FA'].forEach((key) => {
      const sec = ex.sections.find((s) => s.id === 'trace-' + key);
      const tr = ex.traces[key];
      const table = sec.blocks[0];
      table.rows.forEach((row, i) => {
        const r = tr.rows[i];
        assert.equal(row[1], r.op);
        const [hm, place, victim, wb] = row.slice(5);
        assert.equal(hm.exp, r.hit ? 'H' : 'M');
        assert.equal(place.exp, r.place);
        assert.equal(wb.exp, r.wb);
        assert.equal(E.fmt(victim), T.victimLabel(r.victim));
      });
    });
    assert.ok(cfg.cacheBytes > 0);
  });
});

test('los exámenes tienen la variedad pedida: conflictos, write-backs y una escalera de aciertos', () => {
  LEVELS.forEach((lv) => {
    const t = E.build(lv).traces;
    const hits = ['DM', 'SA2', 'SA4', 'FA'].map((k) => t[k].totals.hits);
    assert.ok(hits[0] < hits[1] && hits[1] < hits[2] && hits[2] <= hits[3], `${lv}: ${hits}`);
    assert.ok(t.DM.totals.writebacks >= 1 && t.DM.totals.evictions >= 2, lv);
    assert.ok(t.SA2.totals.evictions >= 1, lv);
    assert.ok(t.FA.totals.compulsory === E.build(lv).stats.blocks, lv);
  });
  assert.equal(E.build('facil').traces.FA.totals.evictions, 0);
  assert.ok(E.build('dificil').traces.FA.totals.evictions >= 1, 'el difícil llena la caché completamente asociativa');
});

test('cada variante tiene un acceso que cambia frente a otra organización', () => {
  LEVELS.forEach((lv) => {
    E.build(lv).sections.filter((s) => s.data).forEach((s) => assert.ok(s.data.change > 0, `${lv} ${s.id}`));
  });
});

test('las opciones de las actividades de error incluyen la corrección y no se repiten', () => {
  LEVELS.forEach((lv) => {
    const sec = E.build(lv).sections.find((s) => s.id === 'error');
    sec.blocks[0].rows.forEach((row) => {
      const c = row[2];
      assert.equal(c.opts.length, 4);
      assert.equal(new Set(c.opts).size, 4);
      assert.ok(c.opts.includes(c.exp));
    });
  });
});

test('las pistas usan los parámetros del examen', () => {
  const hard = E.build('dificil').cfg;
  assert.match(Hints.get('ubic', hard), /últimos <b>3<\/b> bits/);
  assert.match(Hints.get('trace-SA2', hard), /Conjunto = bloque mod 4/);
  assert.match(Hints.get('wb', hard), /× 16/);
  assert.match(Hints.get('ubic', E.build('facil').cfg), /últimos <b>4<\/b> bits/);
});
