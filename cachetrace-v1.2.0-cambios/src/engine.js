const CacheLab = (function () {
  'use strict';

  /* ---------- helpers ---------- */
  const isPow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
  const log2 = (n) => Math.round(Math.log2(n));
  const shr = (a, k) => Math.floor(a / Math.pow(2, k));
  const hexs = (n, min) => Math.floor(n).toString(16).toUpperCase().padStart(min || 0, '0');
  const H = (n, min) => '0x' + hexs(n >>> 0, min === undefined ? 4 : min);
  const bin = (n, w) => (w === 0 ? '' : Math.floor(n).toString(2).padStart(w, '0'));

  function parseNum(s, defBase) {
    s = String(s).trim();
    let m = s.match(/^([-+]?)0x([0-9a-f]+)$/i);
    if (m) return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 16);
    m = s.match(/^([-+]?)0b([01]+)$/i);
    if (m) return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 2);
    if (defBase === 16 && /^[-+]?[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
    if (/^[-+]?\d+$/.test(s)) return parseInt(s, 10);
    return NaN;
  }

  /* ---------- models ---------- */
  const MODELS = [
    { key: 'DM', sheet: 'Mapeo Directo(DM)', label: 'Mapeo directo', tab: 'DM', ways: () => 1 },
    { key: 'SA2W', sheet: 'SA2W', label: 'Asociativa por conjuntos, 2 vías', tab: 'SA2W', ways: () => 2 },
    { key: 'SA4W', sheet: 'SA4W', label: 'Asociativa por conjuntos, 4 vías', tab: 'SA4W', ways: () => 4 },
    { key: 'FA', sheet: 'FA', label: 'Totalmente asociativa', tab: 'FA', ways: (lines) => lines },
  ];

  function checkConfig(c) {
    const errs = [];
    if (!Number.isInteger(c.addrBits) || c.addrBits < 6 || c.addrBits > 32) errs.push('El bus de direcciones debe tener entre 6 y 32 bits.');
    if (!isPow2(c.lineBytes) || c.lineBytes < 4) errs.push('Los bytes por línea deben ser una potencia de 2 y al menos 4 (una palabra).');
    if (!isPow2(c.cacheBytes)) errs.push('El tamaño de la caché debe ser una potencia de 2.');
    if (isPow2(c.lineBytes) && isPow2(c.cacheBytes)) {
      if (c.cacheBytes < c.lineBytes * 4) errs.push('La caché necesita al menos 4 líneas para poder hacer la asociativa de 4 vías.');
      if (c.cacheBytes > Math.pow(2, c.addrBits)) errs.push(`La caché (${c.cacheBytes} bytes) no puede ser mayor que la memoria principal (${Math.pow(2, c.addrBits)} bytes, con un bus de ${c.addrBits} bits). Revisa el bus de direcciones y las unidades: 64 son 64 bytes, y 64 KB son 65536.`);
    }
    return errs;
  }

  function modelGeometry(model, c) {
    const lines = c.cacheBytes / c.lineBytes;
    const ways = model.ways(lines);
    const sets = lines / ways;
    const off = log2(c.lineBytes);
    const idx = log2(sets);
    const tag = c.addrBits - idx - off;
    return { lines, ways, sets, off, idx, tag };
  }

  /* ---------- program parser ---------- */
  const SPEC = {
    li: 'ri', mv: 'rr',
    add: 'rrr', sub: 'rrr', mul: 'rrr', and: 'rrr', or: 'rrr', xor: 'rrr', sll: 'rrr', srl: 'rrr',
    addi: 'rri', subi: 'rri', andi: 'rri', ori: 'rri', slli: 'rri', srli: 'rri',
    lw: 'rm', sw: 'rm', lb: 'rm', lbu: 'rm', lh: 'rm', lhu: 'rm', sb: 'rm', sh: 'rm',
    beq: 'rrl', bne: 'rrl', blt: 'rrl', bge: 'rrl', ble: 'rrl', bgt: 'rrl',
    beqz: 'rl', bnez: 'rl', j: 'l', nop: '', halt: '',
  };

  const MEM_SIZE = { lw: 4, sw: 4, lb: 1, lbu: 1, sb: 1, lh: 2, lhu: 2, sh: 2 };
  const SIZE_NAME = { 1: 'byte', 2: 'media palabra (2 bytes)', 4: 'palabra (4 bytes)' };

  function parseReg(s) {
    if (/^zero$/i.test(String(s).trim())) return 0;
    const m = String(s).trim().match(/^[rx](\d{1,2})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n < 32 ? n : null;
  }

  function parseProgram(text, defBase, progBase) {
    const errors = [], warnings = [], prog = [], labels = {};
    let pending = [];
    text.split(/\r?\n/).forEach((raw, ln) => {
      const lineNo = ln + 1;
      let s = raw.replace(/(#|\/\/|;).*$/, '').trim();
      if (!s) return;
      let m;
      while ((m = s.match(/^([A-Za-z_.][\w.]*)\s*:\s*(.*)$/))) { pending.push(m[1]); s = m[2].trim(); }
      if (!s) return;
      const mm = s.match(/^(\S+)\s*(.*)$/);
      const op = mm[1].toLowerCase();
      if (!SPEC.hasOwnProperty(op)) { errors.push(`Línea ${lineNo}: instrucción desconocida "${mm[1]}".`); return; }
      const args = mm[2] ? mm[2].split(',').map((x) => x.trim()) : [];
      const spec = SPEC[op];
      if (args.length !== spec.length) { errors.push(`Línea ${lineNo}: "${op}" espera ${spec.length} operando(s) y tiene ${args.length}.`); return; }
      const ins = { op, text: s.replace(/\s+/g, ' '), line: lineNo, r: [], imm: 0, target: null, labelName: null };
      let bad = false;
      spec.split('').forEach((t, k) => {
        const a = args[k];
        if (t === 'r') {
          const r = parseReg(a);
          if (r === null) { errors.push(`Línea ${lineNo}: "${a}" no es un registro válido (r0 a r31).`); bad = true; } else ins.r.push(r);
        } else if (t === 'i') {
          const v = parseNum(a, defBase);
          if (isNaN(v)) {
            errors.push(parseReg(a) !== null
              ? `Línea ${lineNo}: "${a}" es un registro, pero "${op}" espera un número como último operando (para operar con registros usa add, sub, and...).`
              : `Línea ${lineNo}: "${a}" no es un número válido.`);
            bad = true;
          } else ins.imm = v;
        } else if (t === 'm') {
          const mo = a.match(/^(.*)\(\s*(\S+?)\s*\)$/);
          const r = mo ? parseReg(mo[2]) : null;
          const off = mo ? (mo[1].trim() === '' ? 0 : parseNum(mo[1], defBase)) : NaN;
          if (r === null || isNaN(off)) { errors.push(`Línea ${lineNo}: "${a}" no tiene el formato desplazamiento(registro), por ejemplo 0(r1).`); bad = true; } else { ins.r.push(r); ins.imm = off; }
        } else if (t === 'l') {
          ins.labelName = a;
        }
      });
      if (bad) return;
      pending.forEach((l) => { labels[l] = prog.length; });
      pending = [];
      prog.push(ins);
    });
    pending.forEach((l) => { labels[l] = prog.length; });
    prog.forEach((ins) => {
      if (ins.labelName === null) return;
      const num = parseNum(ins.labelName, 16);
      if (Object.prototype.hasOwnProperty.call(labels, ins.labelName)) ins.target = labels[ins.labelName];
      else if (!isNaN(num)) {
        const k = (num - (progBase || 0)) / 4;
        if (!Number.isInteger(k) || k < 0 || k > prog.length) errors.push(`Línea ${ins.line}: la dirección de salto ${H(num)} no corresponde a ninguna instrucción del programa.`);
        else ins.target = k;
      } else errors.push(`Línea ${ins.line}: la etiqueta "${ins.labelName}" no existe.`);
    });
    if (!prog.length && !errors.length) errors.push('Escribe al menos una instrucción.');
    return { prog, labels, errors, warnings };
  }

  function parseDump(text, memSize) {
    const mem = new Map(), errors = [];
    text.split(/\r?\n/).forEach((raw, ln) => {
      const s = raw.replace(/(#|\/\/|;).*$/, '').trim();
      if (!s) return;
      const m = s.match(/^([^:=\s]+)\s*[:=]?\s*(.*)$/);
      const addr = parseNum(m[1], 16);
      if (isNaN(addr) || addr < 0) { errors.push(`Dump, línea ${ln + 1}: "${m[1]}" no es una dirección válida.`); return; }
      const vals = m[2].split(/[\s,|]+/).filter(Boolean);
      if (!vals.length) { errors.push(`Dump, línea ${ln + 1}: faltan los bytes.`); return; }
      let outside = 0;
      vals.forEach((v, k) => {
        const n = parseNum(v, 16);
        if (isNaN(n) || n < 0 || n > 255) errors.push(`Dump, línea ${ln + 1}: "${v}" no es un byte hexadecimal válido (00 a FF).`);
        else if (addr + k >= memSize) outside++;
        else mem.set(addr + k, n);
      });
      if (outside) errors.push(`Dump, línea ${ln + 1}: ${outside === 1 ? 'una dirección queda' : outside + ' direcciones quedan'} fuera de la memoria (el bus llega hasta ${H(memSize - 1)}).`);
    });
    return { mem, errors };
  }

  const leBytes = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const leWord = (mem, a) => ((mem.get(a) || 0) | ((mem.get(a + 1) || 0) << 8) | ((mem.get(a + 2) || 0) << 16) | ((mem.get(a + 3) || 0) << 24)) >>> 0;
  const hex2 = (b) => hexs(b, 2);

  /* ---------- CPU (functional run, independent of the cache) ---------- */
  function runCPU(prog, dumpMem, cfg) {
    const regs = new Array(32).fill(0);
    const mem = new Map(dumpMem);
    const memSize = Math.pow(2, cfg.addrBits);
    const steps = [];
    let i = 0, stop = 'fin';
    const codeEnd = cfg.progBase + 4 * prog.length;
    if (codeEnd > memSize) throw new Error(`El programa (${prog.length} instrucciones desde ${H(cfg.progBase)}) no cabe en la memoria de ${memSize} bytes.`);
    const S = (v) => v | 0;
    while (i >= 0 && i < prog.length) {
      if (steps.length >= cfg.maxSteps) { stop = 'limite'; break; }
      const ins = prog[i];
      const st = { i, text: ins.text, fetchAddr: cfg.progBase + 4 * i, access: null, changed: -1, note: '' };
      const [a, b, c] = ins.r;
      let next = i + 1, w = -1, val;
      switch (ins.op) {
        case 'li': w = a; val = ins.imm >>> 0; break;
        case 'mv': w = a; val = regs[b]; break;
        case 'add': w = a; val = (regs[b] + regs[c]) >>> 0; break;
        case 'sub': w = a; val = (regs[b] - regs[c]) >>> 0; break;
        case 'mul': w = a; val = Math.imul(regs[b], regs[c]) >>> 0; break;
        case 'and': w = a; val = (regs[b] & regs[c]) >>> 0; break;
        case 'or': w = a; val = (regs[b] | regs[c]) >>> 0; break;
        case 'xor': w = a; val = (regs[b] ^ regs[c]) >>> 0; break;
        case 'sll': w = a; val = (regs[b] << (regs[c] & 31)) >>> 0; break;
        case 'srl': w = a; val = regs[b] >>> (regs[c] & 31); break;
        case 'addi': w = a; val = (regs[b] + ins.imm) >>> 0; break;
        case 'subi': w = a; val = (regs[b] - ins.imm) >>> 0; break;
        case 'andi': w = a; val = (regs[b] & ins.imm) >>> 0; break;
        case 'ori': w = a; val = (regs[b] | ins.imm) >>> 0; break;
        case 'slli': w = a; val = (regs[b] << (ins.imm & 31)) >>> 0; break;
        case 'srli': w = a; val = regs[b] >>> (ins.imm & 31); break;
        case 'lw': case 'sw': case 'lb': case 'lbu': case 'lh': case 'lhu': case 'sb': case 'sh': {
          const size = MEM_SIZE[ins.op];
          const addr = (regs[b] + ins.imm) >>> 0;
          if (addr + size > memSize) throw new Error(`Instrucción "${ins.text}" (línea ${ins.line}): la dirección ${H(addr)} queda fuera de la memoria (bus de ${cfg.addrBits} bits).`);
          if (addr % size) throw new Error(`Instrucción "${ins.text}" (línea ${ins.line}): la dirección ${H(addr)} no está alineada a ${SIZE_NAME[size]}.`);
          if (ins.op[0] === 'l') {
            let raw = 0;
            for (let k = size - 1; k >= 0; k--) raw = raw * 256 + (mem.get(addr + k) || 0);
            if (ins.op === 'lb') raw = (raw << 24) >> 24;
            else if (ins.op === 'lh') raw = (raw << 16) >> 16;
            val = raw >>> 0; w = a; st.access = { kind: 'R', addr, size, value: val };
          } else {
            val = regs[a];
            for (let k = 0; k < size; k++) mem.set(addr + k, (val >>> (8 * k)) & 255);
            st.access = { kind: 'W', addr, size, value: size === 4 ? val : val & (Math.pow(2, 8 * size) - 1) };
          }
          break;
        }
        case 'beq': if (regs[a] === regs[b]) next = ins.target; break;
        case 'bne': if (regs[a] !== regs[b]) next = ins.target; break;
        case 'blt': if (S(regs[a]) < S(regs[b])) next = ins.target; break;
        case 'bge': if (S(regs[a]) >= S(regs[b])) next = ins.target; break;
        case 'ble': if (S(regs[a]) <= S(regs[b])) next = ins.target; break;
        case 'bgt': if (S(regs[a]) > S(regs[b])) next = ins.target; break;
        case 'beqz': if (regs[a] === 0) next = ins.target; break;
        case 'bnez': if (regs[a] !== 0) next = ins.target; break;
        case 'j': next = ins.target; break;
        case 'halt': stop = 'halt'; break;
        case 'nop': if (cfg.stopAtNop) stop = 'nop'; break;
        default: break;
      }
      if (w > 0) { regs[w] = val >>> 0; st.changed = w; }
      if (['beq', 'bne', 'blt', 'bge', 'ble', 'bgt', 'beqz', 'bnez', 'j'].includes(ins.op)) st.note = next === i + 1 ? 'salto no tomado' : `salta a la instrucción ${next}`;
      st.regs = regs.slice();
      steps.push(st);
      if (stop === 'halt' || stop === 'nop') break;
      i = next;
    }
    return { steps, stop };
  }

  /* ---------- cache replay ---------- */
  function lineLabel(n) { return 'L' + hexs(n); }

  function runCache(model, cfg, prog, steps, dumpMem) {
    const g = modelGeometry(model, cfg);
    const B = cfg.lineBytes, W = B / 4;
    const hexD = Math.ceil(cfg.addrBits / 4);
    const tagHexD = Math.max(1, Math.ceil(g.tag / 4));
    const memImg = new Map(dumpMem);
    const lines = [];
    for (let n = 0; n < g.lines; n++) lines.push({ valid: 0, dirty: 0, tag: 0, words: new Array(W).fill(null), stamp: 0, fill: 0 });
    const codeBase = cfg.progBase;
    let clock = 0;
    const stats = { accesses: 0, hits: 0, misses: 0, evictions: 0, writebacks: 0, fetchHits: 0, fetchMisses: 0, dataHits: 0, dataMisses: 0 };
    const rows = [];
    const snap = () => lines.map((l) => ({ valid: l.valid, dirty: l.dirty, tag: l.tag, words: l.words.slice() }));
    const wordAt = (a) => {
      const k = (a - codeBase) / 4;
      if (a >= codeBase && k < prog.length) return { t: 'i', n: k };
      return { t: 'd', b: [0, 1, 2, 3].map((k) => memImg.get(a + k) || 0) };
    };
    let lastSnap = snap();

    function access(addr, isWrite, value, size) {
      clock++;
      const offset = addr % B;
      const set = Math.floor(addr / B) % g.sets;
      const tag = shr(addr, g.off + g.idx);
      const base = set * g.ways;
      let way = -1;
      for (let k = 0; k < g.ways; k++) { const l = lines[base + k]; if (l.valid && l.tag === tag) { way = k; break; } }
      const res = { addr, tag, set, offset, hit: way >= 0, evict: null, line: 0, wb: '-' };
      if (way < 0) {
        for (let k = 0; k < g.ways; k++) if (!lines[base + k].valid) { way = k; break; }
        if (way < 0) {
          let best = Infinity;
          for (let k = 0; k < g.ways; k++) {
            const key = cfg.policy === 'FIFO' ? lines[base + k].fill : lines[base + k].stamp;
            if (key < best) { best = key; way = k; }
          }
          const v = lines[base + way];
          const vBase = (v.tag * g.sets + set) * B;
          res.evict = { line: base + way, dirty: !!v.dirty, victimTag: v.tag, victimBase: vBase };
          stats.evictions++;
          if (v.dirty) {
            stats.writebacks++;
            v.words.forEach((wd, k) => { if (wd && wd.t === 'd') wd.b.forEach((bv, q) => memImg.set(vBase + 4 * k + q, bv)); });
          }
          res.wb = v.dirty ? 'Sí' : 'No';
        }
        const l = lines[base + way];
        const blockBase = addr - offset;
        l.valid = 1; l.dirty = 0; l.tag = tag; l.fill = clock;
        l.words = [];
        for (let k = 0; k < W; k++) l.words.push(wordAt(blockBase + 4 * k));
      }
      const l = lines[base + way];
      l.stamp = clock;
      if (isWrite) {
        for (let k = 0; k < size; k++) {
          const at = offset + k, wi = Math.floor(at / 4), bi = at % 4;
          const wd = l.words[wi];
          if (wd && wd.t === 'd') { const nb = wd.b.slice(); nb[bi] = (value >>> (8 * k)) & 255; l.words[wi] = { t: 'd', b: nb }; }
        }
        l.dirty = 1;
      }
      res.line = base + way;
      res.blockBase = addr - offset;
      stats.accesses++;
      if (res.hit) stats.hits++; else stats.misses++;
      return res;
    }

    const commentFor = (r, phase, st) => {
      const parts = [];
      const rng = `${H(r.blockBase, hexD)}-${H(r.blockBase + B - 1, hexD)}`;
      if (r.hit) parts.push(phase === 'Fetch' ? 'Instrucción ya en caché' : 'Dato ya en caché');
      else parts.push(`Trae el bloque ${rng} a ${lineLabel(r.line)}`);
      if (r.evict) parts.push(`desaloja el bloque ${H(r.evict.victimBase, hexD)} de ${lineLabel(r.evict.line)}${r.evict.dirty ? ' (sucio: write-back a memoria)' : ' (limpio: no se escribe)'}`);
      if (phase === 'Execute') {
        const vd = st.access.size === 4 ? 4 : 2 * st.access.size;
        if (st.access.kind === 'R') parts.push(`r${st.changed} ← ${H(st.access.value, vd)}`);
        else parts.push(`M[${H(st.access.addr, hexD)}] ← ${H(st.access.value, vd)}, D=1`);
      }
      return parts.join('; ');
    };

    steps.forEach((st, si) => {
      const doRow = (phase, acc) => {
        if (!acc) { rows.push({ step: si, ins: st.i, text: st.text, phase, empty: true, snap: lastSnap, changedLine: -1 }); return; }
        const r = access(acc.addr, acc.kind === 'W', acc.value, acc.size || 4);
        const isF = phase === 'Fetch';
        if (isF) { r.hit ? stats.fetchHits++ : stats.fetchMisses++; } else { r.hit ? stats.dataHits++ : stats.dataMisses++; }
        lastSnap = snap();
        rows.push({
          step: si, ins: st.i, text: st.text, phase, empty: false, addr: r.addr, tag: r.tag, set: r.set, offset: r.offset,
          hit: r.hit, evict: r.evict, wb: r.wb, line: r.line, lineLabel: lineLabel(r.line),
          comment: commentFor(r, phase, st), snap: lastSnap, changedLine: r.line,
        });
      };
      doRow('Fetch', { kind: 'R', addr: st.fetchAddr, value: 0 });
      doRow('Execute', st.access);
    });

    return { model, geo: g, hexD, tagHexD, rows, stats, finalSnap: lastSnap, initSnap: null };
  }

  /* ---------- main entry ---------- */
  function simulate(input) {
    const cfg = {
      addrBits: input.addrBits, lineBytes: input.lineBytes, cacheBytes: input.cacheBytes,
      policy: input.policy || 'LRU', base: input.base === 16 ? 16 : 10,
      progBase: input.progBase || 0, maxSteps: input.maxSteps || 300, stopAtNop: input.stopAtNop !== false,
    };
    const errors = checkConfig(cfg);
    if (errors.length) return { ok: false, errors, warnings: [] }; // fix the memory and cache parameters first
    const P = parseProgram(input.program || '', cfg.base, cfg.progBase);
    const D = parseDump(input.dump || '', Math.pow(2, cfg.addrBits || 16));
    errors.push(...P.errors, ...D.errors);
    if (cfg.progBase % 4 || cfg.progBase < 0) errors.push('La dirección inicial del programa debe ser múltiplo de 4.');
    if (errors.length) return { ok: false, errors, warnings: P.warnings };
    let cpu;
    try { cpu = runCPU(P.prog, D.mem, cfg); } catch (e) { return { ok: false, errors: [e.message], warnings: P.warnings }; }
    const warnings = P.warnings.slice();
    if (cpu.stop === 'limite') warnings.push(`La ejecución se ha detenido al llegar al límite de ${cfg.maxSteps} instrucciones ejecutadas (se puede cambiar en Opciones avanzadas). Es lo esperado si el programa tiene un bucle sin salida.`);
    const models = MODELS.map((m) => runCache(m, cfg, P.prog, cpu.steps, D.mem));
    const used = new Set();
    P.prog.forEach((ins) => ins.r.forEach((r) => { if (r > 0) used.add(r); }));
    return { ok: true, errors: [], warnings, cfg, prog: P.prog, steps: cpu.steps, stop: cpu.stop, models, usedRegs: Array.from(used).sort((a, b) => a - b), dump: D.mem };
  }

  /* ---------- Excel workbook ---------- */
  const COLORS = { gray: 'FFE7E6E6', tag: 'FFEA9999', idx: 'FFC9DAF8', off: 'FFB6D7A8' };
  const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  function wordIns(w) { return w && w.t === 'i' ? 'I' + w.n : null; }
  function wordBytes(w) { return w && w.t === 'd' ? w.b.map(hex2) : null; }

  function buildWorkbook(ExcelJS, sim, opts) {
    opts = opts || {};
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CacheTrace';
    wb.lastModifiedBy = 'CacheTrace';
    const cfg = sim.cfg;
    const thin = { style: 'thin', color: { argb: 'FF000000' } };
    const med = { style: 'medium', color: { argb: 'FF000000' } };
    const hair = { style: 'hair', color: { argb: 'FF000000' } };
    const font = { name: 'Arial', size: 10 };
    const fillOf = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const B = cfg.lineBytes, W = B / 4;
    const insMode = opts.insMode || (opts.insText === false ? 'num' : 'text');

    const writeLineRow = (ws, row, col0, ln) => {
      // D0..D(B-1) start at col0. Data words use one cell per byte; instruction words are merged over their 4 bytes.
      for (let w = 0; w < W; w++) {
        const c1 = col0 + 4 * w, c2 = c1 + 3;
        const wd = ln.valid ? ln.words[w] : null;
        const ins = wordIns(wd), by = wordBytes(wd);
        if (ins) ws.mergeCells(row, c1, row, c2);
        for (let c = c1; c <= c2; c++) {
          const cell = ws.getCell(row, c);
          // In a merged range only the first cell may be assigned: writing to the others overwrites the merged value.
          if (!ins) cell.value = by ? by[c - c1] : null;
          else if (c === c1) cell.value = ins;
          cell.font = font;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = { top: hair, bottom: hair, left: hair, right: hair };
        }
      }
    };

    const chosen = sim.models.filter((m) => !opts.models || opts.models.includes(m.model.key));
    if (!chosen.length) throw new Error('Selecciona al menos un tipo de caché para exportar.');

    chosen.forEach((mr) => {
      const model = mr.model, g = mr.geo;
      const ws = wb.addWorksheet(model.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
      const hasIdx = g.idx > 0;
      const nb = cfg.addrBits;
      const bitCol = (k) => 4 + (nb - 1 - k); // column of bit k
      const cTag = 4 + nb;
      let c = cTag;
      const cSet = hasIdx ? ++c : 0;
      const cOff = ++c, cHit = ++c, cEv = ++c, cWb = ++c, cLine = ++c, cCom = ++c;

      const headers = { 1: 'INS#', 2: 'FASE', 3: 'DIR#' };
      for (let k = nb - 1; k >= 0; k--) headers[bitCol(k)] = k;
      headers[cTag] = 'TAG';
      if (hasIdx) headers[cSet] = model.key === 'SA4W' ? 'SET#' : 'SET# / Index';
      headers[cOff] = 'OFFSET'; headers[cHit] = 'MISS/HIT'; headers[cEv] = 'EVICTION'; headers[cWb] = 'WB'; headers[cLine] = 'LÍNEA'; headers[cCom] = 'COMENTARIO';
      for (let col = 1; col <= cCom; col++) {
        const cell = ws.getCell(1, col);
        cell.value = headers[col] === undefined ? null : headers[col];
        cell.font = { ...font, bold: true };
        cell.fill = fillOf(COLORS.gray);
        cell.alignment = { horizontal: col >= 4 && col <= 3 + nb ? 'center' : undefined, vertical: 'bottom' };
        cell.border = { top: thin, left: thin, right: thin };
      }
      ws.getColumn(1).width = insMode === 'text' ? 22 : 8;
      ws.getColumn(2).width = 9;
      ws.getColumn(3).width = 10;
      for (let k = 0; k < nb; k++) ws.getColumn(bitCol(k)).width = 4.3;
      ws.getColumn(cTag).width = Math.max(9.5, mr.tagHexD + 5);
      if (hasIdx) ws.getColumn(cSet).width = Math.max(9, g.idx + 3);
      ws.getColumn(cOff).width = Math.max(9, g.off + 3);
      ws.getColumn(cHit).width = 10; ws.getColumn(cEv).width = 11; ws.getColumn(cWb).width = 6; ws.getColumn(cLine).width = 8; ws.getColumn(cCom).width = 95;

      let r = 2;
      const rowsByStep = new Map();
      mr.rows.forEach((row) => { if (!rowsByStep.has(row.step)) rowsByStep.set(row.step, []); rowsByStep.get(row.step).push(row); });
      const fieldOf = (k) => (k >= g.off + g.idx ? 'tag' : k >= g.off ? 'idx' : 'off');
      rowsByStep.forEach((pair) => {
        const r1 = r, r2 = r + 1;
        ws.mergeCells(r1, 1, r2, 1);
        const a = ws.getCell(r1, 1);
        a.value = insMode === 'text' ? pair[0].text : insMode === 'seq' ? pair[0].step : pair[0].ins;
        a.font = { ...font, bold: insMode === 'text' };
        a.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        a.border = { left: med, top: med, bottom: thin, right: thin };
        ws.getCell(r2, 1).border = { left: med, bottom: thin, right: thin };
        pair.forEach((row, pi) => {
          const rr = r + pi;
          const top = pi === 0 ? med : thin;
          const b = ws.getCell(rr, 2);
          b.value = row.phase; b.font = { ...font, bold: false }; b.border = { top, left: thin, right: thin, bottom: thin };
          const cc = ws.getCell(rr, 3);
          cc.font = font; cc.border = { top, left: thin, right: med, bottom: thin };
          for (let k = 0; k < nb; k++) {
            const cell = ws.getCell(rr, bitCol(k));
            cell.fill = fillOf(COLORS[fieldOf(k)]);
            cell.alignment = { horizontal: 'center' }; cell.font = font;
            cell.border = { top, left: k === nb - 1 ? med : thin, right: thin, bottom: thin };
          }
          const styleTxt = (col) => { const cell = ws.getCell(rr, col); cell.font = font; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = { top, left: thin, right: thin, bottom: thin }; return cell; };
          [cTag, cSet, cOff, cHit, cEv, cWb, cLine].forEach((col) => { if (col) styleTxt(col); });
          const cm = ws.getCell(rr, cCom); cm.font = font; cm.alignment = { vertical: 'middle', wrapText: false }; cm.border = { top, left: thin, right: med, bottom: thin };
          if (row.empty) {
            // colored, empty row (instruction without memory access) — keeps the class layout
            return;
          }
          cc.value = H(row.addr, mr.hexD);
          const hexRef = `MID($C${rr},3,10)`;
          for (let k = 0; k < nb; k++) {
            const bit = Math.floor(row.addr / Math.pow(2, k)) % 2;
            ws.getCell(rr, bitCol(k)).value = { formula: `MOD(INT(HEX2DEC(${hexRef})/${Math.pow(2, k)}),2)`, result: bit };
          }
          ws.getCell(rr, cTag).value = { formula: `"0x"&DEC2HEX(INT(HEX2DEC(${hexRef})/${Math.pow(2, g.off + g.idx)}),${mr.tagHexD})`, result: '0x' + hexs(row.tag, mr.tagHexD) };
          const concat = (hi, lo) => { const refs = []; for (let k = hi; k >= lo; k--) refs.push(colName(bitCol(k)) + rr); return refs.join('&'); };
          if (hasIdx) ws.getCell(rr, cSet).value = { formula: concat(g.off + g.idx - 1, g.off), result: bin(row.set, g.idx) };
          ws.getCell(rr, cOff).value = { formula: concat(g.off - 1, 0), result: bin(row.offset, g.off) };
          ws.getCell(rr, cHit).value = row.hit ? 'HIT' : 'MISS';
          ws.getCell(rr, cEv).value = row.hit ? '-' : (row.evict ? `Sí (${lineLabel(row.evict.line)})` : 'No');
          ws.getCell(rr, cWb).value = row.wb;
          ws.getCell(rr, cLine).value = row.lineLabel;
          ws.getCell(rr, cCom).value = row.comment;
        });
        r += 2;
      });
      const lastTrace = r - 1;

      // final cache state
      const isSA = model.key === 'SA2W' || model.key === 'SA4W';
      let hr = lastTrace + 3;
      const col0 = isSA ? 6 : 5; // first D0 column
      const heads = isSA ? ['S#', 'LINE#', 'TAG', 'D', 'V'] : ['LINE#', 'TAG', 'D', 'V'];
      heads.forEach((h, k) => { const cell = ws.getCell(hr, 1 + k); cell.value = h; cell.font = { ...font, bold: true }; cell.alignment = { horizontal: 'center' }; cell.border = { top: med, bottom: thin }; });
      for (let b = 0; b < B; b++) { const cell = ws.getCell(hr, col0 + b); cell.value = 'D' + b; cell.font = { ...font, bold: true }; cell.alignment = { horizontal: 'center' }; cell.border = { top: med, bottom: thin }; }
      const stateTopRow = hr + 1;
      mr.finalSnap.forEach((ln, n) => {
        const rr = stateTopRow + n;
        const off = isSA ? 1 : 0;
        if (isSA && n % g.ways === 0) {
          ws.mergeCells(rr, 1, rr + g.ways - 1, 1);
          const s = ws.getCell(rr, 1); s.value = 'S' + hexs(n / g.ways); s.font = { ...font, bold: true }; s.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        const put = (col, v) => { const cell = ws.getCell(rr, col); cell.value = v; cell.font = font; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = { top: hair, bottom: hair, left: hair, right: hair }; };
        put(1 + off, n <= 9 ? n : hexs(n));
        put(2 + off, ln.valid ? '0x' + hexs(ln.tag, mr.tagHexD) : null);
        put(3 + off, ln.valid ? ln.dirty : null);
        put(4 + off, ln.valid);
        writeLineRow(ws, rr, col0, ln);
      });

      // final register file (same for every model), below the cache state table
      const regTop = stateTopRow + g.lines + 2;
      ['Registro', 'Hex', 'Dec'].forEach((h, k) => { const cell = ws.getCell(regTop, 1 + k); cell.value = h; cell.font = { ...font, bold: true }; cell.alignment = { horizontal: 'center' }; cell.border = { top: med, bottom: thin }; });
      const finalRegs = sim.steps.length ? sim.steps[sim.steps.length - 1].regs : new Array(32).fill(0);
      sim.usedRegs.forEach((rg, k) => {
        [['r' + rg, 'center'], [H(finalRegs[rg]), 'center'], [finalRegs[rg], 'center']].forEach(([v, al], q) => {
          const cell = ws.getCell(regTop + 1 + k, 1 + q); cell.value = v; cell.font = font; cell.alignment = { horizontal: al }; cell.border = { top: hair, bottom: hair, left: hair, right: hair };
        });
      });
    });

    // Evolution sheets (state of the touched line after each access)
    if (opts.evolution !== false) {
      chosen.forEach((mr) => {
        const model = mr.model;
        const ws = wb.addWorksheet(model.tab + ' - evolución', { views: [{ state: 'frozen', ySplit: 1 }] });
        const heads = ['Paso', 'Fase', 'Instrucción', 'Dirección', 'Resultado', 'Línea', 'TAG', 'D', 'V'];
        const col0 = heads.length + 1;
        heads.forEach((h, k) => { const cell = ws.getCell(1, 1 + k); cell.value = h; cell.font = { ...font, bold: true }; cell.fill = fillOf(COLORS.gray); cell.alignment = { horizontal: 'center' }; cell.border = { top: thin, bottom: thin, left: thin, right: thin }; });
        for (let b = 0; b < B; b++) { const cell = ws.getCell(1, col0 + b); cell.value = 'D' + b; cell.font = { ...font, bold: true }; cell.fill = fillOf(COLORS.gray); cell.alignment = { horizontal: 'center' }; }
        [6, 9, 22, 11, 18, 8, 9, 4, 4].forEach((w, k) => { ws.getColumn(1 + k).width = w; });
        for (let b = 0; b < B; b++) ws.getColumn(col0 + b).width = 4.3;
        let rr = 2, n = 0;
        mr.rows.forEach((row) => {
          if (row.empty) return;
          n++;
          const ln = row.snap[row.changedLine];
          const vals = [n, row.phase, row.text, H(row.addr, mr.hexD), (row.hit ? 'HIT' : 'MISS') + (row.evict ? ` + desaloja ${lineLabel(row.evict.line)}` : ''), row.lineLabel, '0x' + hexs(ln.tag, mr.tagHexD), ln.dirty, ln.valid];
          vals.forEach((v, k) => { const cell = ws.getCell(rr, 1 + k); cell.value = v; cell.font = font; cell.alignment = { horizontal: 'center' }; cell.border = { top: hair, bottom: hair, left: hair, right: hair }; });
          writeLineRow(ws, rr, col0, ln);
          rr++;
        });
      });
    }

    // Register history
    if (opts.evolution !== false) {
      const ws = wb.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 1 }] });
      const heads = ['Paso', 'Ins#', 'Instrucción'].concat(sim.usedRegs.map((r) => 'r' + r));
      heads.forEach((h, k) => { const cell = ws.getCell(1, 1 + k); cell.value = h; cell.font = { ...font, bold: true }; cell.fill = fillOf(COLORS.gray); cell.alignment = { horizontal: 'center' }; cell.border = { top: thin, bottom: thin, left: thin, right: thin }; });
      ws.getColumn(1).width = 6; ws.getColumn(2).width = 6; ws.getColumn(3).width = 24;
      sim.usedRegs.forEach((r, k) => { ws.getColumn(4 + k).width = 10; });
      const zero = new Array(32).fill(0);
      const rowVals = [{ n: 0, ins: '', text: 'Estado inicial', regs: zero, changed: -1 }].concat(sim.steps.map((st, k) => ({ n: k + 1, ins: st.i, text: st.text, regs: st.regs, changed: st.changed })));
      rowVals.forEach((rv, k) => {
        const rr = 2 + k;
        [rv.n, rv.ins, rv.text].forEach((v, c) => { const cell = ws.getCell(rr, 1 + c); cell.value = v; cell.font = font; cell.alignment = { horizontal: c === 2 ? 'left' : 'center' }; cell.border = { top: hair, bottom: hair, left: hair, right: hair }; });
        sim.usedRegs.forEach((r, c) => {
          const cell = ws.getCell(rr, 4 + c); cell.value = H(rv.regs[r]); cell.font = { ...font, bold: rv.changed === r }; cell.alignment = { horizontal: 'center' };
          cell.border = { top: hair, bottom: hair, left: hair, right: hair };
          if (rv.changed === r) cell.fill = fillOf('FFFFF0B8');
        });
      });
    }

    // Exercise data sheet
    const es = wb.addWorksheet('Enunciado');
    const put = (r, c, v, bold) => { const cell = es.getCell(r, c); cell.value = v; cell.font = { ...font, bold: !!bold }; return cell; };
    const head = (r, c, v) => { const cell = put(r, c, v, true); cell.alignment = { horizontal: 'center' }; cell.fill = fillOf(COLORS.gray); cell.border = { top: thin, bottom: thin, left: thin, right: thin }; return cell; };
    es.getColumn(1).width = 34; es.getColumn(2).width = 22;
    for (let c = 3; c <= 12; c++) es.getColumn(c).width = 13;
    let r = 1;
    put(r++, 1, 'Datos del ejercicio', true);
    [['Bus de direcciones', cfg.addrBits + ' bits'], ['Memoria principal', Math.pow(2, cfg.addrBits) + ' bytes'], ['Caché', cfg.cacheBytes + ' bytes'], ['Bytes por línea (B)', cfg.lineBytes], ['Líneas', cfg.cacheBytes / cfg.lineBytes], ['Reemplazo', cfg.policy], ['Política de escritura', 'Write-back con write-allocate'], ['Orden de bytes', 'Little-endian'], ['Programa cargado en', H(cfg.progBase)]].forEach(([k, v]) => { put(r, 1, k); put(r, 2, v); r++; });
    r++;
    put(r, 1, 'Reparto de bits', true);
    ['TAG', 'INDEX', 'OFFSET'].forEach((h, k) => { const c = put(r, 2 + k, h, true); c.fill = fillOf([COLORS.tag, COLORS.idx, COLORS.off][k]); c.alignment = { horizontal: 'center' }; });
    r++;
    sim.models.forEach((mr) => { put(r, 1, mr.model.label); [mr.geo.tag, mr.geo.idx, mr.geo.off].forEach((v, k) => { put(r, 2 + k, v).alignment = { horizontal: 'center' }; }); r++; });
    r++;
    put(r, 1, 'Resultados', true);
    ['Accesos', 'Hits', 'Misses', 'Tasa de aciertos', 'Evictions', 'Write-backs'].forEach((h, k) => { const c = put(r, 2 + k, h, true); c.alignment = { horizontal: 'center' }; });
    r++;
    sim.models.forEach((mr) => {
      const s = mr.stats; put(r, 1, mr.model.label);
      [s.accesses, s.hits, s.misses, s.hits / s.accesses, s.evictions, s.writebacks].forEach((v, k) => { const c = put(r, 2 + k, v); c.alignment = { horizontal: 'center' }; if (k === 3) c.numFmt = '0.0%'; });
      r++;
    });
    r++;
    put(r++, 1, 'Programa', true);
    ['Ins#', 'Dirección', 'Instrucción'].forEach((h, k) => head(r, 1 + k, h));
    r++;
    sim.prog.forEach((ins, k) => { [k, H(cfg.progBase + 4 * k, Math.ceil(cfg.addrBits / 4)), ins.text].forEach((v, c) => { const cell = put(r, 1 + c, v); cell.alignment = { horizontal: c === 2 ? 'left' : 'center' }; }); r++; });
    r++;
    put(r++, 1, 'Dump de datos (byte a byte, hexadecimal)', true);
    head(r, 1, 'Bloque base');
    for (let b = 0; b < B; b++) head(r, 2 + b, 'D' + b);
    r++;
    const bases = Array.from(new Set(Array.from(sim.dump.keys()).map((a) => a - (a % B)))).sort((a, b) => a - b);
    bases.forEach((base) => {
      put(r, 1, H(base, Math.ceil(cfg.addrBits / 4))).alignment = { horizontal: 'center' };
      for (let b = 0; b < B; b++) put(r, 2 + b, hex2(sim.dump.get(base + b) || 0)).alignment = { horizontal: 'center' };
      r++;
    });
    return wb;
  }

  return { simulate, buildWorkbook, checkConfig, MODELS, H, hexs, bin, lineLabel, modelGeometry, parseNum, wordIns, wordBytes, COLORS };
})();
if (typeof module !== 'undefined') module.exports = CacheLab;
