'use strict';
/*
 * Build script. Produces ./dist with:
 *   index.html           landing page (Spanish)
 *   en/index.html        landing page (English)
 *   app/index.html       the simulator (a single self-contained file)
 *   assets/, robots.txt, sitemap.xml
 *
 * Environment variables (all optional):
 *   REPO_URL   repository URL, e.g. https://github.com/user/cachetrace (default: package.json)
 *   SITE_URL   public URL of the site, e.g. https://user.github.io/cachetrace (enables canonical/og/sitemap)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const write = (rel, data) => { const f = path.join(DIST, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pkg = JSON.parse(read('package.json'));
const VERSION = pkg.version;
const REPO = (process.env.REPO_URL || pkg.repository.url).replace(/\.git$/, '').replace(/\/$/, '');
const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const L = require('../src/engine.js');

/* ---------- template helpers ---------- */
function fill(tpl, dict, name) {
  let out = tpl;
  for (let i = 0; i < 4 && /\{\{\w+\}\}/.test(out); i++) {
    out = out.replace(/\{\{(\w+)\}\}/g, (m, k) => {
      if (!Object.prototype.hasOwnProperty.call(dict, k)) throw new Error(`[${name}] falta la clave "${k}"`);
      return dict[k];
    });
  }
  return out;
}

/* ---------- data for the mock-ups (computed from the real engine) ---------- */
function exampleSim() {
  const sim = L.simulate({ addrBits: 16, lineBytes: 8, cacheBytes: 128, policy: 'LRU', stopAtNop: true, program: read('examples', 'programa.txt'), dump: read('examples', 'dump.txt') });
  if (!sim.ok) throw new Error('El ejemplo no simula: ' + sim.errors.join('; '));
  return sim;
}
function buildMock(sim, lang) {
  const sa4 = sim.models.find((m) => m.model.key === 'SA4W');
  const g = sa4.geo;
  const accesses = sa4.rows.filter((r) => !r.empty);
  const target = accesses.find((r) => r.phase === 'Execute' && r.addr === 0x2080) || accesses[accesses.length - 1];
  const cls = (k) => (k >= g.off + g.idx ? 't' : k >= g.off ? 'x' : 'o');
  let ruler = '', rulerN = '';
  for (let k = 15; k >= 0; k--) { ruler += `<i class="${cls(k)}">${Math.floor(target.addr / Math.pow(2, k)) % 2}</i>`; rulerN += `<span>${k}</span>`; }
  const strip = accesses.map((r) => `<i class="${r.hit ? 'h' : 'm'}"></i>`).join('');
  const s = sa4.stats, rate = (100 * s.hits) / s.accesses;
  const rateTxt = lang === 'es' ? `${rate.toFixed(1).replace('.', ',')} %` : `${rate.toFixed(1)}%`;
  const blk = `${L.H(target.addr - target.offset, 4)}–${L.H(target.addr - target.offset + 7, 4).slice(2)}`;
  const sheetRows = accesses.slice(0, 7).map((r) => {
    let td = '';
    for (let k = 15; k >= 0; k--) td += `<td class="${cls(k)}">${Math.floor(r.addr / Math.pow(2, k)) % 2}</td>`;
    return `<tr><td class="l">${esc(r.text)}</td><td>${r.phase}</td><td>${L.H(r.addr, 4)}</td>${td}<td>0x${L.hexs(r.tag, sa4.tagHexD)}</td><td>${L.bin(r.set, g.idx)}</td><td>${L.bin(r.offset, g.off)}</td><td class="${r.hit ? 'hit' : 'miss'}">${r.hit ? 'HIT' : 'MISS'}</td></tr>`;
  }).join('');
  let head = '<tr><th>INS#</th><th>FASE</th><th>DIR#</th>';
  for (let k = 15; k >= 0; k--) head += `<th>${k}</th>`;
  head += '<th>TAG</th><th>SET#</th><th>OFFSET</th><th>MISS/HIT</th></tr>';
  const color = (src) => src.split('\n').filter(Boolean).map((line) => {
    const m = line.match(/^(\w+:)?\s*(\w+)(.*)$/);
    if (!m) return esc(line);
    const rest = esc(m[3]).replace(/0x[0-9A-Fa-f]+/g, '<span class="v">$&</span>');
    return `<span class="k">${m[2]}</span>${rest}`;
  }).join('\n');
  return {
    mock_addr: L.H(target.addr, 4), mock_ruler: ruler, mock_ruler_n: rulerN,
    mock_tag: '0x' + L.hexs(target.tag, sa4.tagHexD), mock_set: L.bin(target.set, g.idx), mock_off: L.bin(target.offset, g.off),
    mock_hm: target.hit ? 'HIT' : 'MISS', mock_result: `${blk} → ${target.lineLabel}`,
    mock_strip: strip, mock_n: String(accesses.length), mock_rate: `${rateTxt} {{mock_rate_label}}`,
    sheet_table: `<table><thead>${head}</thead><tbody>${sheetRows}</tbody></table>`,
    code_prog: color(read('examples', 'programa.txt')), code_dump: read('examples', 'dump.txt').split('\n').filter(Boolean).map((l) => { const [a, ...r] = l.split(':'); return `<span class="v">${esc(a)}</span>:${esc(r.join(':'))}`; }).join('\n'),
    bits_tag: String(g.tag), bits_idx: String(g.idx), bits_off: String(g.off),
  };
}

/* ---------- fonts and app ---------- */
const FONT_FILES = {
  'bricolage-grotesque': 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  'instrument-sans': 'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2',
  'jetbrains-mono': 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
};
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64');
const inlineFonts = () => [['Instrument Sans', 'instrument-sans', '400 700'], ['JetBrains Mono', 'jetbrains-mono', '100 800']]
  .map(([fam, key, w]) => `@font-face { font-family: "${fam}"; src: url(data:font/woff2;base64,${b64(FONT_FILES[key])}) format("woff2"); font-weight: ${w}; font-display: swap; }`).join('\n');
const FAVICON = fs.readFileSync(path.join(ROOT, 'website/assets/favicon.svg'), 'utf8');
const faviconData = 'data:image/svg+xml,' + encodeURIComponent(FAVICON.replace(/\s+/g, ' ').trim());

function buildApp() {
  const excel = fs.readFileSync(path.join(ROOT, 'node_modules/exceljs/dist/exceljs.min.js'), 'utf8');
  const engine = read('src', 'engine.js');
  for (const [name, code] of [['exceljs', excel], ['engine', engine]]) if (/<\/script/i.test(code)) throw new Error(`${name} contiene </script`);
  const head = `<link rel="icon" href="${faviconData}">\n<meta name="theme-color" content="#0B0D10">`;
  let html = read('src', 'app.template.html');
  const parts = { '<!--__HEAD_EXTRA__-->': head, '/*__FONTS__*/': inlineFonts(), '/*__EXCELJS__*/': excel, '/*__ENGINE__*/': engine };
  for (const [k, v] of Object.entries(parts)) { if (!html.includes(k)) throw new Error('Marcador ausente: ' + k); html = html.split(k).join('\u0000' + k); }
  for (const [k, v] of Object.entries(parts)) html = html.replace('\u0000' + k, () => v);
  html = html.replace(/\{\{VERSION\}\}/g, VERSION).replace(/\{\{REPO_URL\}\}/g, REPO);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Quedan marcadores sin sustituir en la aplicación');
  return html;
}

/* ---------- landing ---------- */
function buildLanding(lang, sim) {
  const es = JSON.parse(read('website/i18n/es.json'));
  const en = JSON.parse(read('website/i18n/en.json'));
  const kEs = Object.keys(es).sort().join(), kEn = Object.keys(en).sort().join();
  if (kEs !== kEn) throw new Error('es.json y en.json no tienen las mismas claves');
  const t = lang === 'es' ? es : en;
  const isEs = lang === 'es';
  const root = isEs ? './' : '../';
  const urlEs = SITE ? `${SITE}/` : `${root}`;
  const urlEn = SITE ? `${SITE}/en/` : (isEs ? './en/' : './');
  const self = isEs ? urlEs : urlEn;
  const dict = {
    ...t, ...buildMock(sim, lang),
    lang, root, version: VERSION, repo: REPO,
    home: './', app_href: `${root}app/`,
    other_lang: isEs ? 'en' : 'es', other_href: isEs ? 'en/' : '../',
    href_es: SITE ? `${SITE}/` : (isEs ? './' : '../'), href_en: SITE ? `${SITE}/en/` : (isEs ? './en/' : './'),
    guide_href: `${REPO}/blob/main/docs/guide.${lang}.md`,
    canonical_tag: SITE ? `<link rel="canonical" href="${self}">` : '',
    og_image_tags: SITE ? `<meta property="og:url" content="${self}">\n<meta property="og:image" content="${SITE}/assets/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="${SITE}/assets/og.png">` : '',
  };
  return fill(read('website/index.template.html'), dict, `landing-${lang}`);
}

/* ---------- main ---------- */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const sim = exampleSim();
write('index.html', buildLanding('es', sim));
write('en/index.html', buildLanding('en', sim));
write('app/index.html', buildApp());
copyDir(path.join(ROOT, 'website/assets'), path.join(DIST, 'assets'));
for (const [key, f] of Object.entries(FONT_FILES)) { fs.mkdirSync(path.join(DIST, 'assets/fonts'), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(DIST, 'assets/fonts', key + '.woff2')); }
fs.copyFileSync(path.join(ROOT, 'website/site.css'), path.join(DIST, 'assets/site.css'));
write('.nojekyll', '');

if (SITE) {
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.w3.org/2000/schemas/sitemap/0.9">\n  <url><loc>${SITE}/</loc></url>\n  <url><loc>${SITE}/en/</loc></url>\n</urlset>\n`.replace('http://www.w3.org/2000/schemas/sitemap/0.9', 'http://www.sitemaps.org/schemas/sitemap/0.9'));
}

const size = (f) => (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0) + ' KB';
console.log(`CacheTrace ${VERSION} · repo ${REPO}${SITE ? ' · site ' + SITE : ''}`);
for (const f of ['index.html', 'en/index.html', 'app/index.html']) console.log('  dist/' + f.padEnd(28), size(f));
