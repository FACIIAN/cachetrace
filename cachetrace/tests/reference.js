'use strict';
// Independent, deliberately simple cache model used to cross-check the engine.
// It only sees a list of accesses ({ addr, write }) and applies the documented conventions:
// unified cache, write-back + write-allocate, LRU/FIFO, lowest-numbered invalid way first.

function referenceRun(accesses, { lineBytes, cacheBytes, ways, policy = 'LRU' }) {
  const lines = cacheBytes / lineBytes;
  const w = ways === 'full' ? lines : ways;
  const sets = lines / w;
  const cache = Array.from({ length: sets }, () => Array.from({ length: w }, () => ({ v: 0, tag: 0, d: 0, used: 0, born: 0 })));
  let clock = 0;
  return accesses.map(({ addr, write }) => {
    clock++;
    const block = Math.floor(addr / lineBytes);
    const set = block % sets;
    const tag = Math.floor(block / sets);
    const S = cache[set];
    let way = S.findIndex((l) => l.v && l.tag === tag);
    const hit = way >= 0;
    let evictedDirty = null;
    if (!hit) {
      way = S.findIndex((l) => !l.v);
      if (way < 0) {
        const key = policy === 'FIFO' ? 'born' : 'used';
        way = S.reduce((best, l, i) => (l[key] < S[best][key] ? i : best), 0);
        evictedDirty = !!S[way].d;
      }
      S[way] = { v: 1, tag, d: 0, used: clock, born: clock };
    }
    S[way].used = clock;
    if (write) S[way].d = 1;
    return { hit, evictedDirty, line: set * w + way };
  });
}

// Small deterministic PRNG so failures are reproducible.
function makeRng(seed) {
  let s = seed >>> 0;
  return (n) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % n; };
}

module.exports = { referenceRun, makeRng };
