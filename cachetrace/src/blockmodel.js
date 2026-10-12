'use strict';
/*
 * Block-level cache model used by the calculator and the practice exams.
 * Conventions: unified cache, empty at start unless an initial state is given, write-back with
 * write-allocate, LRU replacement, lowest-numbered invalid way first. No DOM access.
 */
const BlockModel = (function () {
  const hexs = (n, w) => Math.floor(n).toString(16).toUpperCase().padStart(w || 0, '0');
  const H = (n, w) => '0x' + hexs(n, w);
  const log2i = (n) => Math.round(Math.log2(n));
  const isPow2 = (n) => Number.isInteger(n) && n > 0 && Math.log2(n) % 1 === 0;
  const bin = (n, w) => Math.floor(n).toString(2).padStart(w || 0, '0');

  const POLICIES = [
    { key: 'DM', kind: 'DM', ways: 1, name: 'Direct Mapping', short: 'Directa', tab: 'DM' },
    { key: 'SA2', kind: 'SA', ways: 2, name: 'Set Associative 2 vías', short: '2 vías', tab: 'SA 2 vías' },
    { key: 'SA4', kind: 'SA', ways: 4, name: 'Set Associative 4 vías', short: '4 vías', tab: 'SA 4 vías' },
    { key: 'FA', kind: 'FA', ways: 'full', name: 'Full Associative', short: 'Completamente asociativa', tab: 'FA' },
  ];
  const policy = (key) => POLICIES.find((p) => p.key === key);
  const saPolicy = (ways) => ({ key: 'SA' + ways, kind: 'SA', ways, name: `Set Associative ${ways} vías`, short: `${ways} vías`, tab: `SA ${ways} vías` });

  function validate(cfg) {
    const errs = [];
    if (!Number.isInteger(cfg.addrBits) || cfg.addrBits < 6 || cfg.addrBits > 32) errs.push('El bus de direcciones debe tener entre 6 y 32 bits.');
    if (!isPow2(cfg.blockBytes) || cfg.blockBytes < 2) errs.push('El tamaño de bloque debe ser una potencia de 2 (mínimo 2 bytes).');
    if (!isPow2(cfg.cacheBytes)) errs.push('El tamaño de la caché debe ser una potencia de 2.');
    if (isPow2(cfg.blockBytes) && isPow2(cfg.cacheBytes)) {
      if (cfg.cacheBytes < cfg.blockBytes * 4) errs.push('La caché necesita al menos 4 líneas para poder calcular la asociativa de 4 vías.');
      if (cfg.cacheBytes > Math.pow(2, cfg.addrBits)) errs.push(`La caché (${cfg.cacheBytes} bytes) no puede ser mayor que la memoria principal (${Math.pow(2, cfg.addrBits)} bytes, con un bus de ${cfg.addrBits} bits).`);
    }
    return errs;
  }

  function geometry(cfg, ways) {
    const lines = cfg.cacheBytes / cfg.blockBytes;
    const w = ways === 'full' ? lines : ways;
    const sets = lines / w;
    const offBits = log2i(cfg.blockBytes);
    const idxBits = log2i(sets);
    return {
      memBytes: Math.pow(2, cfg.addrBits), lines, ways: w, sets, offBits, idxBits,
      tagBits: cfg.addrBits - offBits - idxBits, blockBits: cfg.addrBits - offBits, hexW: Math.ceil(cfg.addrBits / 4),
    };
  }

  function decompose(addr, cfg) {
    const B = cfg.blockBytes, block = Math.floor(addr / B), start = block * B;
    return { block, offset: addr % B, start, end: start + B - 1 };
  }

  const place = (block, g) => ({ set: block % g.sets, tag: Math.floor(block / g.sets) });

  function placeLabel(pol, set, way) {
    if (pol.kind === 'DM') return 'L' + set;
    if (pol.kind === 'FA') return 'V' + way;
    return `S${set}/V${way}`;
  }

  const letterFor = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

  /** Letters A, B, C... by order of first appearance of each block. */
  function assignLetters(blocks) {
    const map = new Map();
    blocks.forEach((b) => { if (!map.has(b)) map.set(b, letterFor(map.size)); });
    return map;
  }

  /**
   * Replays a list of accesses [{ op: 'LW'|'SW', addr }] on one organization.
   * init (optional): [{ set, ways: [{ v, d, tag }], order: [way, ...] }] with order from LRU to MRU.
   */
  function trace(accesses, cfg, pol, init, letters) {
    const g = geometry(cfg, pol.ways);
    const blocks = accesses.map((a) => decompose(a.addr, cfg).block);
    const L = letters || assignLetters(blocks);
    const sets = Array.from({ length: g.sets }, () => Array.from({ length: g.ways }, () => ({ v: 0, d: 0, tag: 0, stamp: 0 })));
    const seen = new Set();
    let clock = 0;
    (init || []).forEach((st) => {
      st.ways.forEach((w, i) => {
        sets[st.set][i] = { v: w.v ? 1 : 0, d: w.d ? 1 : 0, tag: w.tag, stamp: 0 };
        if (w.v) seen.add(w.tag * g.sets + st.set);
      });
      (st.order || []).forEach((wi, rank) => { sets[st.set][wi].stamp = rank + 1; clock = Math.max(clock, rank + 1); });
    });

    const describe = (set) => {
      const S = sets[set];
      const order = S.map((w, i) => i).filter((i) => S[i].v).sort((a, b) => S[a].stamp - S[b].stamp);
      return {
        set,
        ways: S.map((w, i) => {
          const block = w.v ? w.tag * g.sets + set : null;
          return { way: i, v: w.v, d: w.d, tag: w.v ? w.tag : null, block, letter: block !== null ? L.get(block) || null : null };
        }),
        order,
      };
    };

    const rows = [];
    const totals = { accesses: accesses.length, hits: 0, misses: 0, evictions: 0, writebacks: 0, compulsory: 0 };
    accesses.forEach((a, i) => {
      const dc = decompose(a.addr, cfg), pl = place(dc.block, g), S = sets[pl.set];
      let way = S.findIndex((w) => w.v && w.tag === pl.tag);
      const hit = way >= 0;
      let victim = null;
      clock++;
      if (!hit) {
        way = S.findIndex((w) => !w.v);
        if (way < 0) {
          let best = Infinity;
          S.forEach((w, k) => { if (w.stamp < best) { best = w.stamp; way = k; } });
          const vb = S[way].tag * g.sets + pl.set;
          victim = { way, tag: S[way].tag, block: vb, letter: L.get(vb) || null, dirty: !!S[way].d, start: vb * cfg.blockBytes, end: vb * cfg.blockBytes + cfg.blockBytes - 1 };
        }
        S[way] = { v: 1, d: 0, tag: pl.tag, stamp: clock };
      }
      S[way].stamp = clock;
      if (a.op === 'SW') S[way].d = 1;

      const first = !seen.has(dc.block);
      seen.add(dc.block);
      if (hit) totals.hits++; else { totals.misses++; if (first) totals.compulsory++; }
      if (victim) totals.evictions++;
      if (victim && victim.dirty) totals.writebacks++;
      rows.push({
        n: i + 1, op: a.op, addr: a.addr, block: dc.block, letter: L.get(dc.block), offset: dc.offset, start: dc.start, end: dc.end,
        set: pl.set, tag: pl.tag, way, hit, place: placeLabel(pol, pl.set, way), victim, wb: !!(victim && victim.dirty), first,
        after: describe(pl.set),
      });
    });

    const used = [];
    for (let s = 0; s < g.sets; s++) if (sets[s].some((w) => w.v)) used.push(describe(s));
    return { policy: pol, geo: g, letters: L, rows, totals, final: used };
  }

  /** Text used in the "Víctima" column: "A limpia", "B sucia" or "—". */
  function victimLabel(v) {
    if (!v) return '—';
    return `${v.letter || H(v.block)} ${v.dirty ? 'sucia' : 'limpia'}`;
  }

  /** First access whose hit/miss result differs between two traces, and the reason. */
  function firstChange(low, high) {
    for (let i = 0; i < low.rows.length; i++) {
      const a = low.rows[i], b = high.rows[i];
      if (a.hit === b.hit) continue;
      let reason = 'other', text = '';
      if (!a.hit && b.hit) {
        reason = 'conflict';
        let expeller = null;
        for (let k = i - 1; k >= 0; k--) if (low.rows[k].victim && low.rows[k].victim.block === a.block) { expeller = low.rows[k]; break; }
        text = expeller
          ? `En ${low.policy.short} el bloque ${a.letter} había sido expulsado de ${expeller.place} por ${expeller.letter} (acceso ${expeller.n}) al competir por el mismo lugar; con ${high.policy.short} sigue presente.`
          : `En ${low.policy.short} el bloque ${a.letter} no se encuentra por conflicto; con ${high.policy.short} sigue presente.`;
      } else {
        text = `Con ${high.policy.short} el bloque ${a.letter} ya no está: su política de reemplazo (LRU) eligió expulsarlo antes.`;
      }
      return { n: a.n, row: a, reason, text };
    }
    return null;
  }

  /** Answers for the diagnostic activity. */
  function diagnostics(cfg, addr) {
    const g = geometry(cfg, 1), g2 = geometry(cfg, 2), g4 = geometry(cfg, 4), gf = geometry(cfg, 'full');
    const dc = decompose(addr, cfg);
    return {
      positions: g.memBytes, rangeEnd: g.memBytes - 1, busBits: cfg.addrBits, lines: g.lines, offBits: g.offBits, addr, block: dc.block, offset: dc.offset, start: dc.start, end: dc.end,
      dm: { tag: g.tagBits, line: g.idxBits, off: g.offBits },
      sa2: { sets: g2.sets, tag: g2.tagBits, set: g2.idxBits, off: g2.offBits },
      sa4: { sets: g4.sets, tag: g4.tagBits, set: g4.idxBits, off: g4.offBits },
      fa: { tag: gf.tagBits, off: gf.offBits },
    };
  }

  /** Table A: address -> block, range, offset. */
  const tablaA = (addrs, cfg) => addrs.map((addr) => ({ addr, ...decompose(addr, cfg) }));

  /** Table B: block -> line/set and tag for DM, 2 ways and 4 ways. */
  function tablaB(blocks, cfg) {
    const g1 = geometry(cfg, 1), g2 = geometry(cfg, 2), g4 = geometry(cfg, 4), gf = geometry(cfg, 'full');
    return blocks.map((b) => ({ block: b, dm: place(b, g1), sa2: place(b, g2), sa4: place(b, g4), fa: { tag: b }, bin: bin(b, gf.blockBits) }));
  }

  /** Blocks of the list that go to the same line/set as ref for a given number of sets. */
  const competing = (blocks, ref, sets) => Array.from(new Set(blocks)).filter((b) => b % sets === ref % sets);

  /** Binary string in groups of four bits, padded on the left. */
  function groups4(n, width) {
    const w = Math.ceil(width / 4) * 4;
    return bin(n, w).replace(/(.{4})(?=.)/g, '$1 ');
  }

  /** "1 bit", "4 bits". */
  const bits = (n) => `${n} ${n === 1 ? 'bit' : 'bits'}`;
  /** "el último bit" / "los últimos 4 bits" (plain text). */
  const lastBits = (n) => (n === 1 ? 'el último bit' : `los últimos ${n} bits`);

  return { bits, lastBits, POLICIES, policy, saPolicy, validate, geometry, decompose, place, placeLabel, assignLetters, trace, victimLabel, firstChange, diagnostics, tablaA, tablaB, competing, groups4, hexs, H, bin, log2i, isPow2, letterFor };
})();
if (typeof module !== 'undefined') module.exports = BlockModel;
