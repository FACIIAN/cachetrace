/* Size fields made of a number and a unit selector (bytes, Kbytes, Mbytes, Gbytes). */
const Sizes = (function () {
  const UNITS = [['B', 'bytes', 1], ['KB', 'Kbytes', 1024], ['MB', 'Mbytes', 1048576], ['GB', 'Gbytes', 1073741824]];
  const MULT = Object.fromEntries(UNITS.map(([k, , m]) => [k, m]));
  const $ = (s) => document.querySelector(s);

  /** "64 KB", "64 Kbytes", "128 bytes", "64KiB" -> bytes */
  function parseSize(s) {
    const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*([kmg]?)\s*(?:i?b(?:ytes?)?)?$/i);
    if (!m) return NaN;
    return Math.round(parseFloat(m[1]) * { '': 1, k: 1024, m: 1048576, g: 1073741824 }[m[2].toLowerCase()]);
  }
  /** Fills the unit selector of every id ("mem" -> #mem and #mem_u). */
  function init(ids) {
    ids.forEach((id) => { $('#' + id + '_u').innerHTML = UNITS.map(([k, label]) => `<option value="${k}">${label}</option>`).join(''); });
  }
  /** Reads a size field: number x unit. A text that already carries a unit ("64 KB") is accepted too. */
  function sizeOf(id) {
    const raw = $('#' + id).value.trim().replace(',', '.');
    if (/[a-z]/i.test(raw)) return parseSize(raw);
    return /^\d+(\.\d+)?$/.test(raw) ? Math.round(parseFloat(raw) * MULT[$('#' + id + '_u').value]) : NaN;
  }
  /** Writes a size in bytes using the largest unit that represents it exactly. */
  function setSize(id, bytes) {
    const [unit, , mult] = UNITS.slice().reverse().find(([, , m]) => bytes >= m && bytes % m === 0) || UNITS[0];
    $('#' + id).value = String(bytes / mult); $('#' + id + '_u').value = unit;
  }
  return { UNITS, parseSize, init, sizeOf, setSize };
})();
