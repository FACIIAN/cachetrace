'use strict';
/*
 * Answer normalisation and comparison for the practice exams.
 * Every parser returns a canonical value, or undefined when the text cannot be understood.
 * "0x204", "0X204", "204" and "0x0204" are the same hexadecimal number, "sí" and "SI" are the same answer, and so on.
 */
const Checker = (function () {
  const clean = (s) => String(s == null ? '' : s).trim();
  const fold = (s) => clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isEmpty = (s) => clean(s) === '';

  function parseHex(s) {
    let t = fold(s).replace(/[\s_]/g, '');
    t = t.replace(/^0x/, '').replace(/h$/, '');
    return /^[0-9a-f]+$/.test(t) ? parseInt(t, 16) : undefined;
  }

  function parseInt10(s) {
    let t = fold(s).replace(/\s/g, '');
    const pw = t.match(/^(\d+)\^(\d+)$/);
    if (pw) return Math.pow(Number(pw[1]), Number(pw[2]));
    t = t.replace(/[.,](?=\d{3}(\D|$))/g, '');
    return /^\d+$/.test(t) ? Number(t) : undefined;
  }

  function parseHexRange(s) {
    if (NONE.test(fold(s).trim())) return null;
    const tokens = fold(s).match(/0x[0-9a-f]+|[0-9a-f]+/g);
    if (!tokens || tokens.length !== 2) return undefined;
    const a = parseHex(tokens[0]), b = parseHex(tokens[1]);
    return a === undefined || b === undefined ? undefined : [a, b];
  }

  function parseHexList(s) {
    const t = fold(s);
    if (t.trim() === '') return [];
    const tokens = t.match(/0x[0-9a-f]+|[0-9a-f]+/g);
    if (!tokens) return undefined;
    const out = tokens.map(parseHex);
    return out.some((n) => n === undefined) ? undefined : Array.from(new Set(out)).sort((a, b) => a - b);
  }

  function parseHM(s) {
    const t = fold(s);
    if (/^(h|hit|acierto|a)$/.test(t)) return 'H';
    if (/^(m|miss|fallo|f)$/.test(t)) return 'M';
    return undefined;
  }

  function parseYN(s) {
    const t = fold(s);
    if (/^(si|s|yes|y|1|true|verdadero)$/.test(t)) return true;
    if (/^(no|n|0|false|falso)$/.test(t)) return false;
    return undefined;
  }

  function parsePlace(s) {
    const t = fold(s).replace(/\s+/g, '');
    let m = t.match(/^l-?(\d+)$/);
    if (m) return 'L' + Number(m[1]);
    m = t.match(/^s(\d+)[\/\-:,.]*v(\d+)$/);
    if (m) return `S${Number(m[1])}/V${Number(m[2])}`;
    m = t.match(/^v(\d+)$/);
    if (m) return 'V' + Number(m[1]);
    return undefined;
  }

  const NONE = /^(|-+|—|–|ninguna|ninguno|nada|no hay|n\/a|na|none|sin victima|no)$/;

  function stateOf(t) {
    if (/(limpi|clean|d\s*=\s*0|\bd0\b)/.test(t)) return 'limpia';
    if (/(suci|dirty|d\s*=\s*1|\bd1\b)/.test(t)) return 'sucia';
    return undefined;
  }

  /** "A limpia", "b (sucia)", "—"  ->  null | { letter, dirty } */
  function parseVictim(s) {
    const t = fold(s);
    if (NONE.test(t.trim())) return null;
    const st = stateOf(t);
    if (!st) return undefined;
    const rest = t.replace(/(limpia|limpio|clean|sucia|sucio|dirty|d\s*=\s*[01]|\bd[01]\b)/g, ' ');
    const m = rest.match(/\b([a-z])\b/);
    if (!m) return undefined;
    return { letter: m[1].toUpperCase(), dirty: st === 'sucia' };
  }

  /** "tag 0x40 sucia", "0x41 limpia", "—"  ->  null | { tag, dirty } */
  function parseVictimTag(s) {
    const t = fold(s);
    if (NONE.test(t.trim())) return null;
    const st = stateOf(t);
    if (!st) return undefined;
    const rest = t.replace(/(limpia|limpio|clean|sucia|sucio|dirty|d\s*=\s*[01]|\bd[01]\b|\btag\b|\bv\d+\b|[,;:()])/g, ' ').trim();
    const tag = parseHex(rest.split(/\s+/)[0] || '');
    return tag === undefined ? undefined : { tag, dirty: st === 'sucia' };
  }

  /** "A, C, B", "A > C > B"  ->  ['A','C','B'] */
  function parseLetters(s) {
    const t = fold(s).replace(/\b(lru|mru)\b/g, ' ');
    if (NONE.test(t.trim())) return [];
    const out = t.match(/\b[a-z]\b/g);
    return out ? out.map((c) => c.toUpperCase()) : undefined;
  }

  /** "V1, V0", "1 0"  ->  [1, 0] */
  function parseWays(s) {
    const t = fold(s).replace(/\b(lru|mru)\b/g, ' ');
    if (NONE.test(t.trim())) return [];
    const out = t.match(/\d+/g);
    return out ? out.map(Number) : undefined;
  }

  function parseWay(s) {
    const t = fold(s).replace(/\s/g, '');
    if (NONE.test(t)) return null;
    const m = t.match(/^v?(\d+)$/);
    return m ? Number(m[1]) : undefined;
  }

  function parseState(s) {
    const t = fold(s);
    if (NONE.test(t.trim())) return null;
    return stateOf(t);
  }

  const PARSERS = {
    hex: parseHex, int: parseInt10, hexrange: parseHexRange, hexlist: parseHexList, hm: parseHM, yn: parseYN, place: parsePlace,
    victim: parseVictim, victimtag: parseVictimTag, letters: parseLetters, ways: parseWays, way: parseWay, state: parseState,
    text: (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim(), select: (s) => clean(s),
  };

  function equal(type, a, b) {
    if (a === undefined || b === undefined) return false;
    if (a === null || b === null) return a === b;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
    if (typeof a === 'object') return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
    return a === b;
  }

  /** Status of one answer: 'empty' | 'ok' | 'bad' (expected is already in canonical form). */
  function check(type, raw, expected) {
    if (type === 'multi') {
      const got = (Array.isArray(raw) ? raw : []).slice().sort();
      if (!got.length) return 'empty';
      const want = expected.slice().sort();
      return got.length === want.length && got.every((x, i) => x === want[i]) ? 'ok' : 'bad';
    }
    if (isEmpty(raw) && type !== 'victim' && type !== 'victimtag' && type !== 'letters' && type !== 'ways' && type !== 'way' && type !== 'state') return 'empty';
    if (isEmpty(raw)) return 'empty';
    const parse = PARSERS[type];
    if (!parse) throw new Error('Tipo de respuesta desconocido: ' + type);
    return equal(type, parse(raw), expected) ? 'ok' : 'bad';
  }

  return { check, PARSERS, parseHex, parseInt10, parseHexRange, parseHexList, parseHM, parseYN, parsePlace, parseVictim, parseVictimTag, parseLetters, parseWays, parseWay, parseState, isEmpty };
})();
if (typeof module !== 'undefined') module.exports = Checker;
