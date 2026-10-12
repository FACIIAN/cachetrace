'use strict';
/*
 * Three practice exams (easy, medium, hard). Every exam has the same ten activities. The statement data are fixed
 * below; every answer is computed with the engine in blockmodel.js, so the solutions cannot disagree with the model.
 */
const Exams = (function () {
  const T = typeof BlockModel !== 'undefined' ? BlockModel : require('./blockmodel.js');
  const H = T.H;

  const mulberry = (seed) => {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ------------------------------------------------------------------ statement data */
  const LEVELS = {
    facil: {
      id: 'facil', name: 'Fácil', pre: 'f', seed: 101, cfg: { addrBits: 16, cacheBytes: 128, blockBytes: 8 },
      diagAddr: 0x2D1B, addrsA: [0x1C40, 0x1C47, 0x1C48, 0x2B10, 0x2B35, 0x30A6, 0x4004, 0xFFFF], givenA: [2, 2, 2, 1, 2, 1, 2, 1],
      blocksB: [0x2A4, 0x2B4, 0x2C4, 0x2AC, 0x2A8, 0x2A5, 0x1FFF], pB: 0.5, pDiag: 0.45, pTot: 0.3,
      blocks: { A: 0x305, B: 0x315, C: 0x325, D: 0x306 },
      seq: [['LW', 'A', 0], ['LW', 'A', 4], ['SW', 'B', 2], ['LW', 'A', 7], ['SW', 'C', 1], ['LW', 'B', 5], ['LW', 'D', 3], ['LW', 'A', 0]],
      givenRows: [0, 1, 2, 5],
      act6: { ways: 2, set: 6, init: [{ v: 1, d: 0, tag: 0x31 }, { v: 1, d: 1, tag: 0x32 }], order: [1, 0], op: 'SW', tag: 0x33, offset: 5 },
      final: { ways: 2, set: 4, init: [{ v: 1, d: 1, tag: 0x60 }, { v: 1, d: 0, tag: 0x61 }], order: [0, 1], seq: [['LW', 0x60, 1], ['SW', 0x62, 6], ['LW', 0x63, 3], ['SW', 0x62, 0]] },
      errors: [1, 2, 4, 5, 9],
    },
    medio: {
      id: 'medio', name: 'Intermedio', pre: 'm', seed: 202, cfg: { addrBits: 16, cacheBytes: 128, blockBytes: 8 },
      diagAddr: 0x5E4D, addrsA: [0x2F18, 0x2F1F, 0x2F20, 0x3A93, 0x4B24, 0x6C0D, 0x9F70, 0xFFF9], givenA: [1, 1, 1, 1, 1, 1, 1, 1],
      blocksB: [0x5E3, 0x5F3, 0x603, 0x5EB, 0x5E7, 0x5E4, 0x1FFE], pB: 0.3, pDiag: 0.2, pTot: 0.2,
      blocks: { A: 0x4A2, B: 0x4B2, C: 0x4C2, D: 0x4D2, E: 0x4E2, F: 0x4A3 },
      seq: [['SW', 'A', 6], ['LW', 'B', 3], ['LW', 'A', 4], ['SW', 'A', 1], ['SW', 'C', 0], ['SW', 'C', 5], ['LW', 'F', 5], ['SW', 'D', 7], ['LW', 'A', 5], ['LW', 'E', 5], ['LW', 'A', 6], ['LW', 'B', 7]],
      givenRows: [0, 1, 4],
      act6: { ways: 2, set: 2, init: [{ v: 1, d: 0, tag: 0x21 }, { v: 1, d: 1, tag: 0x22 }], order: [0, 1], op: 'SW', tag: 0x21, offset: 3 },
      final: { ways: 2, set: 5, init: [{ v: 1, d: 0, tag: 0x30 }, { v: 1, d: 1, tag: 0x31 }], order: [0, 1], seq: [['SW', 0x32, 2], ['LW', 0x31, 5], ['LW', 0x33, 1], ['SW', 0x31, 7]] },
      errors: [3, 6, 7, 11, 12],
    },
    dificil: {
      id: 'dificil', name: 'Difícil', pre: 'd', seed: 303, cfg: { addrBits: 15, cacheBytes: 128, blockBytes: 16 },
      diagAddr: 0x3C5E, addrsA: [0x1A30, 0x1A3F, 0x1A40, 0x2B77, 0x3C08, 0x5D19, 0x6E2A, 0x7FFF], givenA: [0, 1, 0, 0, 1, 0, 0, 0],
      blocksB: [0x1A3, 0x1AB, 0x1B3, 0x1A7, 0x1A5, 0x1A4, 0x7FF], pB: 0.12, pDiag: 0.08, pTot: 0.12,
      blocks: { A: 0x1A3, B: 0x1AB, C: 0x1B3, D: 0x1BB, E: 0x1C3, F: 0x1A5, G: 0x1A6, H: 0x1A7, I: 0x1A0 },
      seq: [['SW', 'A', 3], ['LW', 'A', 15], ['LW', 'B', 6], ['SW', 'F', 9], ['LW', 'C', 1], ['LW', 'G', 15], ['SW', 'F', 6], ['SW', 'D', 10], ['LW', 'H', 0], ['LW', 'D', 9], ['SW', 'C', 8], ['LW', 'B', 11], ['LW', 'C', 12], ['LW', 'E', 14], ['LW', 'E', 9], ['SW', 'I', 12]],
      givenRows: [0],
      act6: { ways: 4, set: 1, init: [{ v: 1, d: 1, tag: 0x150 }, { v: 1, d: 0, tag: 0x151 }, { v: 1, d: 1, tag: 0x152 }, { v: 1, d: 0, tag: 0x153 }], order: [2, 0, 3, 1], op: 'LW', tag: 0x154, offset: 9 },
      final: { ways: 4, set: 0, init: [{ v: 1, d: 1, tag: 0x100 }, { v: 1, d: 0, tag: 0x101 }, { v: 0, d: 0, tag: 0 }, { v: 1, d: 1, tag: 0x103 }], order: [3, 0, 1],
        seq: [['LW', 0x102, 3], ['SW', 0x104, 12], ['LW', 0x100, 0], ['SW', 0x105, 5], ['LW', 0x102, 14], ['LW', 0x103, 8]] },
      errors: [8, 10, 13, 5, 6],
    },
  };

  /* ------------------------------------------------------------------ answer cells */
  const LABELS = { DM: 'Directa', SA2: '2 vías', SA4: '4 vías', FA: 'Completamente asociativa' };
  const stateText = (dirty) => (dirty ? 'sucia' : 'limpia');

  /** Text of the expected answer, used for given cells and for the solution PDF. */
  function fmt(c) {
    const e = c.exp, w = c.w || 4;
    switch (c.t) {
      case 'hex': return H(e);
      case 'hexrange': return e ? `${H(e[0], w)}–${H(e[1], w)}` : '—';
      case 'int': return String(e);
      case 'hm': return e;
      case 'yn': return e ? 'Sí' : 'No';
      case 'place': return e;
      case 'victim': return e ? `${e.letter} ${stateText(e.dirty)}` : '—';
      case 'victimtag': return e ? `tag ${H(e.tag)} ${stateText(e.dirty)}` : '—';
      case 'letters': return e.length ? e.join(', ') : '—';
      case 'way': return e === null ? '—' : 'V' + e;
      case 'ways': return e.map((x) => 'V' + x).join(', ');
      case 'hexlist': return e.map((x) => H(x)).join(', ');
      case 'multi': return e.join(', ');
      default: return String(e);
    }
  }

  /* ------------------------------------------------------------------ error templates (activity 5) */
  function errorTemplates(cfg, ex) {
    const B = cfg.blockBytes, g1 = T.geometry(cfg, 1), g2 = T.geometry(cfg, 2), g4 = T.geometry(cfg, 4);
    const addr = ex.addr, dc = T.decompose(addr, cfg), hexW = g1.hexW;
    const set2 = dc.block % g2.sets, line = dc.block % g1.sets, set4 = dc.block % g4.sets;
    const wbBlock = ex.wbBlock, wbStart = wbBlock * B;
    return {
      1: { wrong: `Para ${H(addr, hexW)}: bloque = ${H(addr, hexW)}, offset = ${dc.offset}.`, fix: `El número de bloque no es la dirección: es la dirección dividida entre ${B}. Aquí, bloque ${H(dc.block)} y offset ${dc.offset}.` },
      2: { wrong: `En directa, si L${line} está ocupada, se aplica LRU entre L${line} y L${(line + 1) % g1.lines}.`, fix: `En directa no hay elección de víctima: el bloque solo puede ir a L${line}, y si está ocupada esa línea es la víctima.` },
      3: { wrong: `En 2 vías, si S${set2} está lleno, el bloque puede colocarse en S${(set2 + 1) % g2.sets}.`, fix: `Un bloque no puede cambiar de conjunto: si S${set2} está lleno hay que reemplazar una de sus vías.` },
      4: { wrong: 'Se expulsa una línea válida con D=0; por tanto hay write-back.', fix: 'D=0 significa línea limpia: hay expulsión, pero no write-back.' },
      5: { wrong: 'Un hit de lectura pone el bit dirty a 1.', fix: 'Una lectura (LW) no modifica el dato: el bit dirty conserva su valor y solo un SW lo pone a 1.' },
      6: { wrong: `En 4 vías hay una vía inválida en S${set4}, pero se expulsa la LRU para colocar el bloque.`, fix: 'Si el conjunto tiene una vía inválida se ocupa primero la de menor número, sin expulsar nada.' },
      7: { wrong: `Para el bloque ${H(dc.block)} en directa, la línea son los bits de la izquierda y el tag ${T.lastBits(g1.idxBits)}.`, fix: `La línea son ${T.lastBits(g1.idxBits)} del número de bloque y el tag es lo que queda a la izquierda.` },
      8: { wrong: `Con bloques de ${B} bytes, el offset ocupa ${T.bits(T.log2i(g1.lines))}.`, fix: `El offset ocupa log2(${B}) = ${T.bits(g1.offBits)}, porque identifica un byte dentro del bloque.` },
      9: { wrong: 'Un miss de escritura (SW) no trae el bloque a la caché: escribe directamente en memoria.', fix: 'Con write-allocate, el miss de escritura también trae el bloque a la caché y después lo marca como sucio (D=1).' },
      10: { wrong: `En completamente asociativa el bloque ${H(dc.block)} debe ir obligatoriamente a la línea V${dc.block % g1.lines}.`, fix: 'En completamente asociativa no hay lugar fijo: se usa primero una línea inválida y, si no existe, la víctima LRU.' },
      11: { wrong: 'El orden LRU solo se actualiza cuando hay un miss.', fix: 'LRU se actualiza en cada acceso, tanto hit como miss: el bloque accedido pasa a ser el MRU.' },
      12: { wrong: `La línea L${line} tiene V=0 pero conserva el tag del bloque buscado, así que es un hit.`, fix: 'Solo se compara el tag con las líneas válidas: con V=0 es un miss y esa línea se ocupa sin expulsar nada.' },
      13: { wrong: `El write-back del bloque ${H(wbBlock)} escribe en memoria las direcciones ${H(wbBlock, hexW)}–${H(wbBlock + B - 1, hexW)}.`, fix: `El rango empieza en bloque × ${B} = ${H(wbStart, hexW)} y termina en inicio + ${B - 1} = ${H(wbStart + B - 1, hexW)}.` },
    };
  }

  /* ------------------------------------------------------------------ builder */
  function buildExam(levelId) {
    const L = LEVELS[levelId];
    if (!L) throw new Error('Nivel desconocido: ' + levelId);
    const cfg = L.cfg, B = cfg.blockBytes, rnd = mulberry(L.seed);
    const g1 = T.geometry(cfg, 1), g2 = T.geometry(cfg, 2), g4 = T.geometry(cfg, 4), gF = T.geometry(cfg, 'full');
    const hexW = g1.hexW;
    let counter = 0;
    const cell = (t, exp, extra) => ({ id: L.pre + String(++counter).padStart(3, '0'), t, exp, given: false, w: hexW, ...extra });
    const given = (c, p) => { if (rnd() < p) c.given = true; return c; };
    const sections = [];
    const add = (s) => { sections.push(s); return s; };
    const levelNote = { facil: 'Nivel fácil: bastantes celdas vienen dadas.', medio: 'Nivel intermedio: menos celdas dadas.', dificil: 'Nivel difícil: parámetros distintos a los habituales y casi nada dado.' }[levelId];

    /* ---- Activity 1: diagnostic */
    const dg = T.diagnostics(cfg, L.diagAddr);
    const dRows = [];
    const dRow = (q, cells, p) => { cells.forEach((c) => { if (p !== 0) given(c.cell, p === undefined ? L.pDiag : p); }); dRows.push({ q, cells }); };
    const cI = (label, v) => ({ label, cell: cell('int', v) });
    dRow('¿Cuántas posiciones direccionables tiene la memoria principal y cuál es su rango?', [cI('Posiciones', dg.positions), { label: 'Rango', cell: cell('hexrange', [0, dg.rangeEnd]) }]);
    dRow('¿Cuántos bits tiene el bus de direcciones?', [cI('Bits', dg.busBits)]);
    dRow(`Para la dirección ${H(L.diagAddr, hexW)}, indica número de bloque y offset.`, [{ label: 'Bloque', cell: cell('hex', dg.block) }, cI('Offset', dg.offset)]);
    dRow('¿Qué rango de direcciones contiene el bloque anterior?', [{ label: 'Rango', cell: cell('hexrange', [dg.start, dg.end]) }]);
    dRow('¿Cuántas líneas tiene la caché?', [cI('Líneas', dg.lines)]);
    dRow('En correspondencia directa, ¿cuántos bits forman tag, línea y offset?', [cI('Tag', dg.dm.tag), cI('Línea', dg.dm.line), cI('Offset', dg.dm.off)]);
    dRow('En una caché de 2 vías, ¿cuántos conjuntos hay y cuántos bits forman tag, conjunto y offset?', [cI('Conjuntos', dg.sa2.sets), cI('Tag', dg.sa2.tag), cI('Conjunto', dg.sa2.set), cI('Offset', dg.sa2.off)]);
    if (levelId !== 'facil') dRow('En una caché de 4 vías, ¿cuántos conjuntos hay y cuántos bits forman tag, conjunto y offset?', [cI('Conjuntos', dg.sa4.sets), cI('Tag', dg.sa4.tag), cI('Conjunto', dg.sa4.set), cI('Offset', dg.sa4.off)]);
    if (levelId === 'dificil') dRow('En completamente asociativa, ¿cuántos bits forman tag y offset?', [cI('Tag', dg.fa.tag), cI('Offset', dg.fa.off)]);
    dRow('¿Todo miss provoca una expulsión? (Sí/No)', [{ label: 'Respuesta', cell: cell('yn', false) }], 0);
    dRow('¿Toda expulsión provoca un write-back? (Sí/No)', [{ label: 'Respuesta', cell: cell('yn', false) }], 0);
    dRow('¿En qué políticas puede ser necesario aplicar LRU?', [{ label: 'Políticas', cell: cell('multi', ['2 vías', '4 vías', 'Completamente asociativa'], { opts: ['Directa', '2 vías', '4 vías', 'Completamente asociativa'] }) }], 0);
    dRows[0].cells[0].cell.given = levelId === 'facil';
    add({
      id: 'diag', title: 'Actividad 1 · Diagnóstico individual', hint: 'diag',
      intro: `Configuración: memoria principal de ${g1.memBytes / 1024 >= 1 ? g1.memBytes / 1024 + ' KiB' : g1.memBytes + ' B'} direccionable por bytes, direcciones de ${T.bits(cfg.addrBits)}, caché de ${cfg.cacheBytes} B (${g1.lines} líneas) y bloque de ${B} B. Escritura write-back y write-allocate; LRU en los conjuntos asociativos.`,
      blocks: [{ k: 'qa', rows: dRows }],
      notes: [
        `Posiciones = 2^${cfg.addrBits} = ${dg.positions}; rango ${H(0, hexW)}–${H(dg.rangeEnd, hexW)}.`,
        `Bloque = dirección / ${B} (se quitan los ${T.bits(dg.offBits)} de la derecha); offset = dirección mod ${B}. El bloque ${H(dg.block)} cubre ${H(dg.start, hexW)}–${H(dg.end, hexW)}.`,
        `Líneas = ${cfg.cacheBytes} / ${B} = ${dg.lines}. Directa: línea ${T.bits(dg.dm.line)}, offset ${T.bits(dg.dm.off)}, tag ${cfg.addrBits} - ${dg.dm.line} - ${dg.dm.off} = ${dg.dm.tag}.`,
        `2 vías: ${dg.sa2.sets} conjuntos (${T.bits(dg.sa2.set)}), tag ${dg.sa2.tag}. 4 vías: ${dg.sa4.sets} conjuntos (${T.bits(dg.sa4.set)}), tag ${dg.sa4.tag}. Completamente asociativa: sin conjunto, tag ${dg.fa.tag}.`,
        'No todo miss expulsa: si hay una línea inválida en el lugar permitido se ocupa sin expulsar. No toda expulsión hace write-back: solo si la víctima es válida y está sucia (D=1). LRU solo hace falta cuando hay varias víctimas posibles: 2 vías, 4 vías y completamente asociativa.',
      ],
    });

    /* ---- Activity 2: from address to location */
    const rowsA = T.tablaA(L.addrsA, cfg);
    const tableARows = rowsA.map((r, i) => {
      const cs = [cell('hex', r.block), cell('hexrange', [r.start, r.end]), cell('int', r.offset)];
      const idx = shuffle([0, 1, 2], rnd).slice(0, L.givenA[i]);
      idx.forEach((k) => { cs[k].given = true; });
      return [H(r.addr, hexW), ...cs];
    });
    const rowsB = T.tablaB(L.blocksB, cfg);
    const tableBRows = rowsB.map((r, i) => {
      const cs = [cell('int', r.dm.set), cell('hex', r.dm.tag), cell('int', r.sa2.set), cell('hex', r.sa2.tag), cell('int', r.sa4.set), cell('hex', r.sa4.tag)];
      cs.forEach((c) => given(c, L.pB));
      if (levelId === 'facil' && i === 0) cs.forEach((c) => { c.given = true; });
      return [H(r.block), ...cs];
    });
    const refBlock = L.blocksB[0];
    const comp = (sets) => T.competing(L.blocksB, refBlock, sets).sort((a, b) => a - b);
    add({
      id: 'ubic', title: 'Actividad 2 · De la dirección a la ubicación', hint: 'ubic',
      intro: 'Completa primero la tabla A. Después utiliza el número de bloque, no la dirección completa, para resolver la tabla B. Las celdas grises ya vienen dadas.',
      blocks: [
        { k: 'p', text: 'Tabla A · Bloque y desplazamiento', strong: true },
        { k: 'table', head: ['Dirección', 'Bloque MP', 'Rango del bloque', 'Offset'], rows: tableARows },
        { k: 'p', text: 'Tabla B · Lugar y tag', strong: true },
        { k: 'table', head: ['Bloque', 'Línea DM', 'Tag DM', 'Set 2v', 'Tag 2v', 'Set 4v', 'Tag 4v'], rows: tableBRows },
        { k: 'p', text: `Escribe los bloques de la tabla B que compiten con el bloque ${H(refBlock)} (incluido él mismo) por la misma línea o conjunto:`, strong: true },
        { k: 'qa', rows: [
          { q: 'Direct Mapping', cells: [{ label: 'Bloques', cell: cell('hexlist', comp(g1.sets), { ph: '0x…, 0x…' }) }] },
          { q: '2 ways', cells: [{ label: 'Bloques', cell: cell('hexlist', comp(g2.sets), { ph: '0x…, 0x…' }) }] },
          { q: '4 ways', cells: [{ label: 'Bloques', cell: cell('hexlist', comp(g4.sets), { ph: '0x…, 0x…' }) }] },
        ] },
      ],
      notes: [
        `Tabla A: bloque = dirección / ${B}; inicio = bloque × ${B}; fin = inicio + ${B - 1}; offset = dirección − inicio.`,
        `Tabla B: se pasa el bloque a binario (grupos de 4 cifras). Directa: línea = ${T.bits(g1.idxBits)} de la derecha, tag = el resto. 2 vías: set = ${T.bits(g2.idxBits)} de la derecha. 4 vías: set = ${T.bits(g4.idxBits)} de la derecha.`,
        `Compiten con ${H(refBlock)}: en directa ${comp(g1.sets).map((b) => H(b)).join(', ')}; en 2 vías ${comp(g2.sets).map((b) => H(b)).join(', ')}; en 4 vías ${comp(g4.sets).map((b) => H(b)).join(', ')}. Al aumentar las vías cambia el módulo (${g1.sets}, ${g2.sets}, ${g4.sets}) y entran más bloques en el mismo grupo.`,
      ],
    });

    /* ---- Activities 3A-3D: traces */
    const accesses = L.seq.map(([op, k, off]) => ({ op, addr: L.blocks[k] * B + off }));
    const letters = T.assignLetters(accesses.map((a) => T.decompose(a.addr, cfg).block));
    const traces = {};
    T.POLICIES.forEach((p) => { traces[p.key] = T.trace(accesses, cfg, p, null, letters); });

    // Which organisation each variant is compared with (first one that gives a difference).
    const order = { DM: ['SA2', 'SA4', 'FA'], SA2: ['SA4', 'DM', 'FA'], SA4: ['FA', 'SA2', 'DM'], FA: ['SA4', 'SA2', 'DM'] };
    const pickCompare = (key) => {
      for (const other of order[key]) {
        const aLow = T.POLICIES.findIndex((p) => p.key === key) < T.POLICIES.findIndex((p) => p.key === other);
        const fc = aLow ? T.firstChange(traces[key], traces[other]) : T.firstChange(traces[other], traces[key]);
        if (fc) return { other, fc };
      }
      return { other: order[key][0], fc: null };
    };

    const variantNames = { DM: ['3A', 'Variante A · Direct Mapping'], SA2: ['3B', 'Variante B · SET Associative 2 ways'], SA4: ['3C', 'Variante C · SET Associative 4 ways'], FA: ['3D', 'Variante D · Full Associative'] };
    const reasonOpts = [
      'Conflicto: el bloque había sido expulsado por otro que competía por el mismo lugar',
      'Miss obligatorio: es el primer acceso al bloque',
      'Capacidad: la caché está llena',
      'Reemplazo distinto: LRU eligió otra víctima',
    ];
    T.POLICIES.forEach((pol) => {
      const tr = traces[pol.key], g = tr.geo;
      const head = ['N.º', 'Op.', 'Dirección', 'Bloque', 'N.º bloque', 'H/M', 'Lugar', 'Víctima', 'WB'];
      const rows = tr.rows.map((r, i) => {
        const control = L.givenRows.includes(i);
        const numCell = levelId === 'dificil' ? cell('hex', r.block) : H(r.block);
        const cs = [
          cell('hm', r.hit ? 'H' : 'M'), cell('place', r.place), cell('victim', r.victim ? { letter: r.victim.letter, dirty: r.victim.dirty } : null, { ph: '— / A limpia' }), cell('yn', r.wb),
        ];
        if (control) cs.forEach((c) => { c.given = true; });
        if (control && typeof numCell === 'object') numCell.given = true;
        return [r.n, r.op, H(r.addr, hexW), r.letter, numCell, ...cs];
      });
      // final state of the used zone
      const stateHead = pol.kind === 'DM' ? ['Línea', 'Contenido'] : pol.kind === 'FA' ? ['Zona usada'] : ['Conjunto', ...Array.from({ length: g.ways }, (_, i) => 'V' + i), 'Orden LRU → MRU'];
      let stateRows;
      const wayCell = (w) => cell('victim', w && w.v ? { letter: w.letter, dirty: !!w.d } : null, { ph: '— / B sucia' });
      if (pol.kind === 'DM') stateRows = tr.final.map((s) => [`L${s.set}`, wayCell(s.ways[0])]);
      else if (pol.kind === 'FA') {
        const st = tr.final[0];
        stateRows = [[...st.ways.filter((w) => w.v).map((w) => wayCell(w)), cell('letters', st.order.map((i) => st.ways[i].letter), { ph: 'A, C, B' })]];
        stateHead.splice(0, stateHead.length, ...st.ways.filter((w) => w.v).map((w) => 'V' + w.way), 'Orden LRU → MRU');
      } else stateRows = tr.final.map((s) => [`S${s.set}`, ...s.ways.map((w) => wayCell(w)), cell('letters', s.order.map((i) => s.ways[i].letter), { ph: 'A, C, B' })]);

      const t = tr.totals;
      const cmp = pickCompare(pol.key);
      const cmpReason = cmp.fc ? (cmp.fc.reason === 'conflict' ? reasonOpts[0] : reasonOpts[3]) : reasonOpts[0];
      const [num, title] = variantNames[pol.key];
      const lines = [];
      const evict = tr.rows.filter((r) => r.victim);
      const wbs = tr.rows.filter((r) => r.wb);
      lines.push(`Aciertos ${t.hits}, fallos ${t.misses}, expulsiones ${t.evictions}, write-backs ${t.writebacks}.`);
      lines.push(evict.length ? `Hay expulsión en los accesos ${evict.map((r) => r.n).join(', ')}${wbs.length ? `; write-back en ${wbs.map((r) => r.n).join(', ')} porque la víctima estaba sucia` : '; ninguna víctima estaba sucia, así que no hay write-back'}.` : 'No hay ninguna expulsión: todos los bloques caben a la vez.');
      lines.push(`Misses obligatorios: ${t.compulsory} (primer acceso a cada bloque); el resto son misses de conflicto o capacidad.`);
      if (cmp.fc) lines.push(`Primer acceso que cambia frente a ${LABELS[cmp.other]}: el ${cmp.fc.n}. ${cmp.fc.text}`);

      add({
        id: 'trace-' + pol.key, title: `Actividad ${num} · ${title}`, hint: 'trace-' + pol.key, policy: pol.key,
        intro: `${pol.kind === 'DM' ? `tag ${T.bits(g.tagBits)} | línea ${T.bits(g.idxBits)} | offset ${T.bits(g.offBits)}` : pol.kind === 'FA' ? `tag ${T.bits(g.tagBits)} | offset ${T.bits(g.offBits)}` : `tag ${T.bits(g.tagBits)} | conjunto ${T.bits(g.idxBits)} | offset ${T.bits(g.offBits)}`}. Las letras identifican los bloques por orden de aparición. Completa únicamente las celdas blancas; las filas grises son datos de control.`,
        blocks: [
          { k: 'table', head, rows },
          { k: 'p', text: 'Estado final de la zona utilizada de la caché (indica la letra del bloque y si está limpia o sucia; usa — si la vía está vacía):', strong: true },
          { k: 'table', head: stateHead, rows: stateRows },
          { k: 'qa', rows: [
            { q: 'Totales', cells: [{ label: 'Hits', cell: given(cell('int', t.hits), L.pTot) }, { label: 'Misses', cell: given(cell('int', t.misses), L.pTot) }, { label: 'Expulsiones', cell: given(cell('int', t.evictions), L.pTot) }, { label: 'Write-backs', cell: given(cell('int', t.writebacks), L.pTot) }] },
            { q: `Primer acceso cuyo resultado hit/miss cambia frente a ${LABELS[cmp.other]} (0 si no cambia ninguno) y motivo`, cells: [{ label: 'Acceso n.º', cell: cell('int', cmp.fc ? cmp.fc.n : 0) }, { label: 'Motivo', cell: cell('select', cmpReason, { opts: reasonOpts }) }] },
          ] },
        ],
        notes: lines,
        data: { policy: pol.key, other: cmp.other, change: cmp.fc ? cmp.fc.n : 0 },
      });
    });

    /* ---- Activity 4: comparison */
    const compHead = ['Política', 'Hits', 'Misses', 'Expulsiones', 'Write-backs'];
    const compRows = T.POLICIES.map((p) => {
      const t = traces[p.key].totals;
      return [LABELS[p.key], ...[t.hits, t.misses, t.evictions, t.writebacks].map((v) => given(cell('int', v), L.pTot))];
    });
    const dmM = traces.DM.totals.misses, faM = traces.FA.totals.misses, oblig = traces.FA.totals.compulsory;
    add({
      id: 'comp', title: 'Actividad 4 · Comparación entre políticas', hint: 'comp',
      intro: 'Resume los totales de las cuatro variantes y razona qué misses permanecen y cuáles desaparecen al aumentar la asociatividad.',
      blocks: [
        { k: 'table', head: compHead, rows: compRows },
        { k: 'qa', rows: [
          { q: 'Misses obligatorios (primer acceso a cada bloque): ¿cuántos hay? Permanecen incluso con asociatividad completa.', cells: [{ label: 'Misses', cell: cell('int', oblig) }] },
          { q: 'Misses que desaparecen al pasar de Directa a Completamente asociativa: ¿cuántos?', cells: [{ label: 'Misses', cell: cell('int', dmM - faM) }] },
          { q: 'Los misses que desaparecen son misses de…', cells: [{ label: 'Tipo', cell: cell('select', 'conflicto', { opts: ['obligatorios', 'conflicto', 'capacidad'] }) }] },
        ] },
      ],
      notes: [
        `Misses por organización: Directa ${dmM}, 2 vías ${traces.SA2.totals.misses}, 4 vías ${traces.SA4.totals.misses}, completamente asociativa ${faM}.`,
        `Permanecen ${oblig} misses obligatorios: ninguna política puede evitar el primer acceso a un bloque con la caché vacía.`,
        `Desaparecen ${dmM - faM} misses de conflicto al pasar de directa a completamente asociativa: el lugar permitido estaba lleno aunque quedaran líneas libres en otros sitios.`,
        ...(faM > oblig ? [`En completamente asociativa quedan ${faM - oblig} misses más, por capacidad: la caché solo tiene ${g1.lines} líneas.`] : []),
      ],
    });

    /* ---- Activity 5: find the error */
    const ex = { addr: L.addrsA[1], wbBlock: L.blocksB[1] };
    const tpl = errorTemplates(cfg, ex);
    const all = Object.keys(tpl).map(Number);
    const errRows = L.errors.map((id, i) => {
      const others = shuffle(all.filter((x) => x !== id), rnd).slice(0, 3);
      const opts = shuffle([id, ...others], rnd).map((x) => tpl[x].fix);
      return [i + 1, tpl[id].wrong, cell('select', tpl[id].fix, { opts, wide: true })];
    });
    add({
      id: 'error', title: 'Actividad 5 · Encuentra el error', hint: 'error',
      intro: `Cada caso contiene un error. Elige la corrección adecuada. Configuración: ${g1.lines} líneas, bloques de ${B} bytes.`,
      blocks: [{ k: 'table', head: ['N.º', 'Resolución propuesta', 'Corrección'], rows: errRows, wideLast: true }],
      notes: errRows.map((r, i) => `Caso ${i + 1}. ${r[1]} → ${r[2].exp}`),
    });

    /* ---- Activities 6 and 7: set resolution */
    const setState = (spec, ways) => spec.init.map((w, i) => ({ way: i, ...w }));
    const stateTable = (title, spec) => ({
      k: 'table', caption: title, head: ['Vía', 'V', 'D', 'Tag', 'Orden'],
      rows: spec.init.map((w, i) => {
        const rank = spec.order.indexOf(i);
        const ord = !w.v ? '—' : spec.ways === 2 ? (rank === 0 ? 'LRU' : 'MRU') : `${rank + 1}${rank === 0 ? ' (LRU)' : rank === spec.order.length - 1 ? ' (MRU)' : ''}`;
        return [`V${i}`, String(w.v), String(w.d), w.v ? H(w.tag) : '—', ord];
      }),
    });
    const finalStateRows = (tr, spec, geoSets) => {
      const st = tr.final.find((s) => s.set === spec.set) || tr.final[0];
      return st.ways.map((w) => {
        const rank = st.order.indexOf(w.way);
        const ord = spec.ways === 2 ? cell('select', rank === 0 ? 'LRU' : 'MRU', { opts: ['LRU', 'MRU'] }) : cell('int', rank + 1, { ph: '1 = LRU' });
        return [`V${w.way}`, cell('int', w.v), cell('int', w.d), cell('hex', w.tag), ord];
      });
    };

    // activity 6
    const a6 = L.act6, a6pol = T.saPolicy(a6.ways), a6g = T.geometry(cfg, a6.ways);
    const a6addr = (a6.tag * a6g.sets + a6.set) * B + a6.offset;
    const a6tr = T.trace([{ op: a6.op, addr: a6addr }], cfg, a6pol, [{ set: a6.set, ways: a6.init, order: a6.order }]);
    const r6 = a6tr.rows[0];
    const a6WbRange = r6.wb ? [r6.victim.start, r6.victim.end] : null;
    add({
      id: 'wb', title: 'Actividad 6 · Escritura y write-back', hint: 'wb',
      intro: `Caché de ${a6.ways} vías (${a6g.sets} conjuntos). Estado inicial del conjunto S${a6.set}. Se ejecuta ${a6.op} ${H(a6addr, hexW)}.`,
      blocks: [
        stateTable(`Estado inicial de S${a6.set}`, a6),
        { k: 'qa', rows: [
          { q: '1. Determina bloque, offset, conjunto y tag.', cells: [{ label: 'Bloque', cell: cell('hex', r6.block) }, { label: 'Offset', cell: cell('int', r6.offset) }, { label: 'Conjunto', cell: cell('int', r6.set) }, { label: 'Tag', cell: cell('hex', r6.tag) }] },
          { q: '2. Indica si se produce hit o miss.', cells: [{ label: 'H/M', cell: cell('hm', r6.hit ? 'H' : 'M') }] },
          { q: '3. Indica la víctima (vía, tag y estado) y si hay write-back. Escribe — si no hay víctima.', cells: [{ label: 'Vía víctima', cell: cell('way', r6.victim ? r6.victim.way : null, { ph: 'V… / —' }) }, { label: 'Víctima', cell: cell('victimtag', r6.victim ? { tag: r6.victim.tag, dirty: r6.victim.dirty } : null, { ph: 'tag 0x… sucia' }) }, { label: 'Write-back', cell: cell('yn', r6.wb) }] },
          { q: '4. Escribe el rango de memoria principal que recibe el write-back (— si no hay).', cells: [{ label: 'Rango', cell: cell('hexrange', a6WbRange) }] },
        ] },
        { k: 'table', caption: '5. Estado final del conjunto y LRU actualizado', head: ['Vía', 'V', 'D', 'Tag', a6.ways === 2 ? 'Orden' : 'Orden (1 = LRU)'], rows: finalStateRows(a6tr, a6, a6g.sets) },
      ],
      notes: [
        `${a6.op} ${H(a6addr, hexW)}: bloque ${H(r6.block)} (dirección / ${B}), offset ${r6.offset}, conjunto ${r6.set} (bloque mod ${a6g.sets}), tag ${H(r6.tag)} (bloque div ${a6g.sets}).`,
        r6.hit ? `Hit en V${r6.way}: el tag ${H(r6.tag)} está en una vía válida. ${a6.op === 'SW' ? 'La escritura deja la línea sucia (D=1) y pasa a ser la MRU. No hay expulsión ni write-back.' : 'La lectura no cambia D; la línea pasa a ser la MRU.'}` : `Miss: ninguna vía válida de S${r6.set} contiene el tag ${H(r6.tag)}.${r6.victim ? ` Todas las vías son válidas, así que se aplica LRU: la víctima es V${r6.victim.way} (tag ${H(r6.victim.tag)}, ${stateText(r6.victim.dirty)}).` : ''}`,
        r6.wb ? `La víctima está sucia: write-back del bloque ${H(r6.victim.block)}, cuyo rango es ${H(r6.victim.start, hexW)}–${H(r6.victim.end, hexW)} (bloque × ${B} hasta inicio + ${B - 1}). Después se carga el bloque ${H(r6.block)}${a6.op === 'SW' ? ' y la escritura deja la línea sucia.' : '; al ser lectura, la línea queda limpia.'}` : 'No hay write-back.',
      ],
    });

    // activity 7
    const f = L.final, fpol = T.saPolicy(f.ways), fg = T.geometry(cfg, f.ways);
    const faccs = f.seq.map(([op, tag, off]) => ({ op, addr: (tag * fg.sets + f.set) * B + off }));
    const ftr = T.trace(faccs, cfg, fpol, [{ set: f.set, ways: f.init, order: f.order }]);
    const frows = ftr.rows.map((r) => [r.n, `${r.op} ${H(r.addr, hexW)}`, cell('hm', r.hit ? 'H' : 'M'), cell('way', r.way), cell('victimtag', r.victim ? { tag: r.victim.tag, dirty: r.victim.dirty } : null, { ph: 'tag 0x… sucia / —' }), cell('yn', r.wb)]);
    const ph1 = ['se expulsa una línea válida y sucia', 'se expulsa una línea válida, esté limpia o sucia', 'el acceso es una escritura (SW)', 'el bloque no está en la caché'];
    const ph2 = [`se asignan al mismo conjunto; pueden coexistir como máximo ${f.ways} de ellos`, 'tienen el mismo tag', 'tienen el mismo offset', 'son consecutivos en la memoria principal'];
    add({
      id: 'final', title: 'Prueba individual final', hint: 'final',
      intro: `Caché de ${f.ways} vías. Procesa la secuencia sin ayuda. Todos los accesos van al conjunto S${f.set}.`,
      blocks: [
        stateTable(`Estado inicial de S${f.set}`, f),
        { k: 'table', head: ['N.º', 'Acceso', 'H/M', 'Vía', 'Víctima', 'WB'], rows: frows },
        { k: 'table', caption: `Estado final de S${f.set}`, head: ['Vía', 'V', 'D', 'Tag', f.ways === 2 ? 'Orden' : 'Orden (1 = LRU)'], rows: finalStateRows(ftr, f, fg.sets) },
        { k: 'qa', rows: [
          { q: 'Completa: un miss provoca write-back solamente cuando…', cells: [{ label: '', cell: cell('select', ph1[0], { opts: shuffle(ph1, rnd), wide: true }) }] },
          { q: `Completa: dos bloques compiten en una caché de ${f.ways} vías cuando…`, cells: [{ label: '', cell: cell('select', ph2[0], { opts: shuffle(ph2, rnd), wide: true }) }] },
        ] },
      ],
      notes: [
        ...ftr.rows.map((r) => `${r.n}. ${r.op} ${H(r.addr, hexW)} (bloque ${H(r.block)}, tag ${H(r.tag)}): ${r.hit ? `hit en V${r.way}` : `miss en V${r.way}${r.victim ? `, víctima tag ${H(r.victim.tag)} ${stateText(r.victim.dirty)}${r.wb ? ` con write-back del bloque ${H(r.victim.start, hexW)}–${H(r.victim.end, hexW)}` : ''}` : ' (vía inválida, no hay víctima)'}`}.`),
        `Un miss provoca write-back solamente cuando ${ph1[0]}. Dos bloques compiten cuando ${ph2[0]}.`,
      ],
    });

    // flatten the cells
    const cells = [];
    const collect = (item) => { if (item && typeof item === 'object' && 't' in item) cells.push(item); };
    sections.forEach((s) => s.blocks.forEach((b) => {
      if (b.k === 'table') b.rows.forEach((row) => row.forEach(collect));
      if (b.k === 'qa') b.rows.forEach((row) => row.cells.forEach((c) => collect(c.cell)));
    }));
    const scored = cells.filter((c) => !c.given);

    return {
      id: L.id, name: L.name, level: levelId, note: levelNote, cfg, geo: { dm: g1, sa2: g2, sa4: g4, fa: gF }, sections, cells, scored,
      stats: { accesses: accesses.length, blocks: letters.size, cells: scored.length, sections: sections.length },
      traces, accesses, letters,
    };
  }

  const list = () => Object.keys(LEVELS).map((k) => ({ id: k, name: LEVELS[k].name, cfg: LEVELS[k].cfg }));
  return { LEVELS, list, build: buildExam, fmt, LABELS };
})();
if (typeof module !== 'undefined') module.exports = Exams;
