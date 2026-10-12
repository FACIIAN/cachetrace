'use strict';
/*
 * Build script. Produces ./dist:
 *   index.html, en/index.html        landing page (Spanish and English)
 *   simulador/index.html             cache simulator with Excel export
 *   calculadora/index.html           exercise calculator
 *   practicas/index.html             practice exams
 *   practicas/soluciones/*.pdf       solutions of the three exams
 *   app/index.html                   redirect to the simulator (old address)
 *   assets/                          logo, fonts, styles, social image
 *
 * Environment variables (optional):
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
const T = require('../src/blockmodel.js');
const Exams = require('../src/exams.js');
const { examPdf } = require('../src/pdf.js');

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
/** Plain text replacement (no $-patterns), every occurrence. */
const put = (html, marker, value) => html.split(marker).join(value);

/* ---------- landing mock-ups, computed with the real engine ---------- */
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
    code_prog: color(read('examples', 'programa.txt')),
    code_dump: read('examples', 'dump.txt').split('\n').filter(Boolean).map((l) => { const [a, ...r] = l.split(':'); return `<span class="v">${esc(a)}</span>:${esc(r.join(':'))}`; }).join('\n'),
    bits_tag: String(g.tagBits), bits_idx: String(g.idxBits), bits_off: String(g.offBits),
  };
}
const BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
function toolMocks(t) {
  const cfg = { addrBits: 16, cacheBytes: 128, blockBytes: 8 };
  const g1 = T.geometry(cfg, 1), g2 = T.geometry(cfg, 2), g4 = T.geometry(cfg, 4);
  const dc = T.decompose(0x2A47, cfg), p1 = T.place(dc.block, g1), p4 = T.place(dc.block, g4);
  const calc = `<table class="minit"><tr><th>${t.ch_addr}</th><th>${t.ch_block}</th><th>${t.ch_off}</th></tr><tr><td>${T.H(0x2A47, 4)}</td><td>${T.H(dc.block)}</td><td class="c-off">${dc.offset}</td></tr></table>`
    + `<table class="minit"><tr><th>${t.ch_line}</th><th>${t.ch_tag}</th><th>${t.ch_set}</th></tr><tr><td class="c-idx">${p1.set}</td><td class="c-tag">${T.H(p1.tag)}</td><td class="c-idx">${p4.set}</td></tr></table>`;
  // Illustration only: these blocks are not part of any practice exam.
  const rows = [0x13D, 0x20E].map((b, i) => {
    const a = T.place(b, g1), c = T.place(b, g2);
    return i === 0
      ? `<tr><td>${T.H(b)}</td><td><span class="ok">${a.set}</span></td><td><span class="ok">${T.H(a.tag)}</span></td><td><span class="bd">${(c.set + 3) % g2.sets}</span></td></tr>`
      : `<tr><td>${T.H(b)}</td><td><span class="gv">${a.set}</span></td><td><span class="ok">${T.H(a.tag)}</span></td><td><span class="ok">${c.set}</span></td></tr>`;
  }).join('');
  const prac = `<div class="ph"><span>${t.pm_title}</span><span class="bulb">${BULB}</span></div><div class="hintp">${t.pm_hint}</div>`
    + `<div class="scrl"><table><tr><th>${t.pm_h1}</th><th>${t.pm_h2}</th><th>${t.pm_h3}</th><th>${t.pm_h4}</th></tr>${rows}</table></div>`
    + `<div class="foot-row"><span class="pill2">${t.pm_check}</span><span>${t.pm_score}</span><span class="pill2 ghost">${t.pm_pdf}</span></div>`;
  return { calc_mock: calc, prac_mock: prac };
}

/* ---------- fonts and shared pieces ---------- */
const FONT_FILES = {
  'bricolage-grotesque': 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  'instrument-sans': 'node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2',
  'jetbrains-mono': 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
};
const APP_FONTS = '@font-face { font-family: "Instrument Sans"; src: url(../assets/fonts/instrument-sans.woff2) format("woff2"); font-weight: 400 700; font-display: swap; }\n'
  + '@font-face { font-family: "JetBrains Mono"; src: url(../assets/fonts/jetbrains-mono.woff2) format("woff2"); font-weight: 100 800; font-display: swap; }';
const THEME_JS = read('src', 'shared', 'theme.js');
const BASE_CSS = read('src', 'shared', 'base.css');
const CHROME = read('src', 'shared', 'chrome.html').split('{{REPO_URL}}').join(REPO);
const LIBS = ['src/blockmodel.js', 'src/checker.js', 'src/hints.js', 'src/shared/hintui.js', 'src/shared/sizes.js'].map((f) => read(f)).join('\n');
const SIZES_JS = read('src', 'shared', 'sizes.js');
const EXAMS_JS = read('src', 'exams.js');
[LIBS, EXAMS_JS, THEME_JS].forEach((c) => { if (/<\/script/i.test(c)) throw new Error('Un script contiene </script'); });

function buildPage(templateFile, extra) {
  let html = read('src', templateFile);
  const parts = {
    '<!--__HEAD_EXTRA__-->': '<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">\n<meta name="theme-color" content="#0B0D10">',
    '/*__THEME_JS__*/': THEME_JS, '/*__FONTS__*/': APP_FONTS, '/*__BASE_CSS__*/': BASE_CSS, '<!--__CHROME__-->': CHROME,
    '/*__LIBS__*/': LIBS, '/*__SIZES__*/': SIZES_JS, '/*__EXAMS__*/': EXAMS_JS, ...extra,
  };
  Object.entries(parts).forEach(([k, v]) => { html = put(html, k, v); });
  html = html.replace(/\{\{VERSION\}\}/g, VERSION).replace(/\{\{REPO_URL\}\}/g, REPO);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error(`Quedan marcadores sin sustituir en ${templateFile}`);
  if (/\/\*__[A-Z_]+__\*\//.test(html) || /<!--__[A-Z_]+__-->/.test(html)) throw new Error(`Quedan marcadores sin sustituir en ${templateFile}`);
  return html;
}

/* ---------- landing ---------- */
function buildLanding(lang, sim, examCount) {
  const es = JSON.parse(read('website/i18n/es.json'));
  const en = JSON.parse(read('website/i18n/en.json'));
  if (Object.keys(es).sort().join() !== Object.keys(en).sort().join()) throw new Error('es.json y en.json no tienen las mismas claves');
  const t = lang === 'es' ? es : en;
  const isEs = lang === 'es';
  const root = isEs ? './' : '../';
  const urlEs = SITE ? `${SITE}/` : root;
  const urlEn = SITE ? `${SITE}/en/` : (isEs ? './en/' : './');
  const self = isEs ? urlEs : urlEn;
  const dict = {
    ...t, ...buildMock(sim, lang), ...toolMocks(t),
    lang, root, version: VERSION, repo: REPO, home: './',
    sim_href: `${root}simulador/`, calc_href: `${root}calculadora/`, prac_href: `${root}practicas/`, n_exercises: String(examCount),
    other_lang: isEs ? 'en' : 'es', other_href: isEs ? 'en/' : '../',
    href_es: SITE ? `${SITE}/` : (isEs ? './' : '../'), href_en: SITE ? `${SITE}/en/` : (isEs ? './en/' : './'),
    guide_href: `${REPO}/blob/main/docs/guide.${lang}.md`,
    notices_href: `${root}assets/licenses/NOTICES.txt`,
    canonical_tag: SITE ? `<link rel="canonical" href="${self}">` : '',
    og_image_tags: SITE ? `<meta property="og:url" content="${self}">\n<meta property="og:image" content="${SITE}/assets/og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="${SITE}/assets/og.png">` : '',
  };
  const html = fill(read('website/index.template.html'), dict, `landing-${lang}`);
  return put(html, '/*__THEME_JS__*/', THEME_JS);
}

/* ---------- main ---------- */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const sim = exampleSim();
  const examCount = Exams.list().reduce((n, e) => n + Exams.build(e.id).sections.length, 0);
  write('index.html', buildLanding('es', sim, examCount));
  write('en/index.html', buildLanding('en', sim, examCount));

  // the simulator keeps its own bundle: engine and ExcelJS
  const excel = fs.readFileSync(path.join(ROOT, 'node_modules/exceljs/dist/exceljs.min.js'), 'utf8');
  const engine = read('src', 'engine.js');
  for (const [name, code] of [['exceljs', excel], ['engine', engine]]) if (/<\/script/i.test(code)) throw new Error(`${name} contiene </script`);
  write('simulador/index.html', buildPage('app.template.html', { '/*__EXCELJS__*/': excel, '/*__ENGINE__*/': engine }));
  write('calculadora/index.html', buildPage('calculadora.template.html', {}));
  write('practicas/index.html', buildPage('practicas.template.html', {}));
  write('app/index.html', '<!DOCTYPE html>\n<html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../simulador/"><link rel="canonical" href="../simulador/"><title>CacheTrace</title></head><body><a href="../simulador/">Ir al simulador</a></body></html>\n');

  copyDir(path.join(ROOT, 'website/assets'), path.join(DIST, 'assets'));
  for (const [key, f] of Object.entries(FONT_FILES)) { fs.mkdirSync(path.join(DIST, 'assets/fonts'), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(DIST, 'assets/fonts', key + '.woff2')); }
  fs.copyFileSync(path.join(ROOT, 'website/site.css'), path.join(DIST, 'assets/site.css'));
  write('.nojekyll', '');

  // licence texts of the bundled components, linked from the footer
  const lic = path.join(DIST, 'assets/licenses');
  fs.mkdirSync(lic, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(lic, 'CacheTrace-MIT.txt'));
  fs.copyFileSync(path.join(ROOT, 'node_modules/exceljs/LICENSE'), path.join(lic, 'ExcelJS-MIT.txt'));
  for (const key of Object.keys(FONT_FILES)) fs.copyFileSync(path.join(ROOT, 'node_modules/@fontsource-variable', key, 'LICENSE'), path.join(lic, `${key}-OFL.txt`));
  fs.copyFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), path.join(lic, 'NOTICES.txt'));

  for (const e of Exams.list()) write(`practicas/soluciones/examen-${e.id}.pdf`, await examPdf(e.id));

  if (SITE) {
    write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
    const urls = ['/', '/en/', '/simulador/', '/calculadora/', '/practicas/'];
    write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  }

  const size = (f) => (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0) + ' KB';
  console.log(`CacheTrace ${VERSION} · repo ${REPO}${SITE ? ' · site ' + SITE : ''}`);
  ['index.html', 'en/index.html', 'simulador/index.html', 'calculadora/index.html', 'practicas/index.html', 'practicas/soluciones/examen-facil.pdf', 'practicas/soluciones/examen-medio.pdf', 'practicas/soluciones/examen-dificil.pdf']
    .forEach((f) => console.log('  dist/' + f.padEnd(42), size(f)));
}

main().catch((e) => { console.error(e); process.exit(1); });
