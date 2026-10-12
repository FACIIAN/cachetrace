'use strict';
/* Solution PDFs for the practice exams. Used by scripts/build.js; the output is static and needs no server. */
const PDFDocument = require('pdfkit');
const BlockModel = require('./blockmodel.js');
const Exams = require('./exams.js');

const COL = { ink: '#16202B', muted: '#5B6773', head: '#1F2A35', headInk: '#FFFFFF', line: '#B9C2CC', zebra: '#F2F5F8', given: '#E3E7EB', ok: '#E4F4E7', accent: '#B26A00' };
const M = 40;
const ascii = (t) => String(t).replace(/→/g, '>').replace(/←/g, '<').replace(/−/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=');

/** Draws a table with automatic page breaks. Column widths are measured from the content. */
function drawTable(doc, head, rows, opts) {
  opts = opts || {};
  const width = doc.page.width - 2 * M, pad = 4, size = opts.size || 8.5;
  const strs = rows.map((r) => r.map((c) => ascii(c && c.text !== undefined ? c.text : String(c))));
  head = head.map(ascii);
  const natural = head.map((h, i) => {
    doc.font('Helvetica-Bold').fontSize(size);
    let w = doc.widthOfString(String(h)) + 2 * pad + 2;
    doc.font('Helvetica').fontSize(size);
    strs.forEach((r) => { w = Math.max(w, Math.min(doc.widthOfString(r[i]) + 2 * pad + 2, opts.maxCol || 300)); });
    return w;
  });
  const sum = natural.reduce((a, b) => a + b, 0);
  const widths = sum > width ? natural.map((w) => (w * width) / sum) : natural.map((w, i) => w + (opts.stretchLast && i === natural.length - 1 ? width - sum : 0));
  const x0 = M;
  const rowHeight = (cells, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    return Math.max(...cells.map((t, i) => doc.heightOfString(String(t), { width: widths[i] - 2 * pad })), size) + 2 * pad - 1;
  };
  const drawRow = (cells, y, h, o) => {
    let x = x0;
    cells.forEach((t, i) => {
      if (o.fill) doc.rect(x, y, widths[i], h).fill(typeof o.fill === 'function' ? o.fill(i) : o.fill);
      doc.rect(x, y, widths[i], h).lineWidth(0.4).strokeColor(COL.line).stroke();
      doc.fillColor(o.ink || COL.ink).font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).text(String(t), x + pad, y + pad, { width: widths[i] - 2 * pad, lineBreak: true });
      x += widths[i];
    });
  };
  const header = () => {
    const h = rowHeight(head, true);
    if (doc.y + h > doc.page.height - M) doc.addPage();
    const y0 = doc.y;
    drawRow(head, y0, h, { fill: COL.head, ink: COL.headInk, bold: true });
    doc.y = y0 + h;
  };
  header();
  rows.forEach((r, ri) => {
    const cells = strs[ri], h = rowHeight(cells, false);
    if (doc.y + h > doc.page.height - M) { doc.addPage(); header(); }
    const flags = rows[ri].map((c) => c && c.given);
    const y0 = doc.y;
    drawRow(cells, y0, h, { fill: (i) => (flags[i] ? COL.given : ri % 2 ? COL.zebra : '#FFFFFF') });
    doc.y = y0 + h;
  });
  doc.y += 8;
  doc.x = M;
}

function para(doc, text, o) {
  o = o || {};
  text = ascii(text);
  doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size || 9.5).fillColor(o.color || COL.ink);
  if (doc.y + doc.heightOfString(text, { width: doc.page.width - 2 * M }) > doc.page.height - M) doc.addPage();
  doc.text(text, M, doc.y, { width: doc.page.width - 2 * M, align: 'left' });
  doc.moveDown(o.gap === undefined ? 0.4 : o.gap);
}

function sectionTitle(doc, text) {
  if (doc.y > doc.page.height - 130) doc.addPage();
  doc.moveDown(0.6);
  doc.rect(M, doc.y, doc.page.width - 2 * M, 20).fill(COL.head);
  doc.fillColor(COL.headInk).font('Helvetica-Bold').fontSize(11).text(ascii(text), M + 8, doc.y + 5, { width: doc.page.width - 2 * M - 16 });
  doc.y += 28;
  doc.x = M;
}

/** Text of an item of a table row: plain values stay as they are, answer cells show their expected value. */
function cellOf(item) {
  if (item && typeof item === 'object' && 't' in item) return { text: Exams.fmt(item), given: item.given };
  return { text: String(item) };
}

function renderExam(doc, exam) {
  // title block
  doc.rect(0, 0, doc.page.width, 92).fill(COL.head);
  doc.fillColor(COL.headInk).font('Helvetica-Bold').fontSize(20).text('Solucionario del examen de práctica', M, 26);
  doc.font('Helvetica').fontSize(12).text(`Nivel ${exam.name} · CacheTrace`, M, 54);
  doc.y = 110; doc.x = M;
  const g = exam.geo.dm;
  para(doc, `Configuración: memoria principal de ${g.memBytes} bytes direccionable por bytes, direcciones de ${exam.cfg.addrBits} bits (${BlockModel.H(0, g.hexW)} a ${BlockModel.H(g.memBytes - 1, g.hexW)}), caché de ${exam.cfg.cacheBytes} B con ${g.lines} líneas, bloque de ${exam.cfg.blockBytes} B (offset de ${g.offBits} bits). Escritura write-back y write-allocate. Reemplazo LRU en los conjuntos asociativos; primero la vía inválida de menor número. Estado inicial: todas las líneas inválidas, salvo que el enunciado indique otro.`, { color: COL.muted });
  para(doc, 'Las celdas en gris eran datos del enunciado; el resto son las respuestas.', { color: COL.muted, gap: 0.2 });

  exam.sections.forEach((s) => {
    sectionTitle(doc, s.title);
    s.blocks.forEach((b) => {
      if (b.k === 'p') para(doc, b.text, { bold: b.strong, size: 9 });
      if (b.k === 'table') {
        if (b.caption) para(doc, b.caption, { bold: true, size: 9, gap: 0.2 });
        drawTable(doc, b.head, b.rows.map((r) => r.map(cellOf)), { stretchLast: b.wideLast });
      }
      if (b.k === 'qa') {
        const rows = b.rows.map((r) => [r.q, r.cells.map((c) => `${c.label ? c.label + ': ' : ''}${Exams.fmt(c.cell)}`).join('   ')].map((t, i) => (i === 1 ? { text: t, given: r.cells.every((c) => c.cell.given) } : { text: t })));
        drawTable(doc, ['Pregunta', 'Respuesta'], rows, { maxCol: 260 });
      }
    });
    if (s.notes && s.notes.length) {
      para(doc, 'Cómo se resuelve', { bold: true, size: 9.5, color: COL.accent, gap: 0.2 });
      s.notes.forEach((n) => para(doc, '• ' + n, { size: 8.8, gap: 0.25 }));
    }
  });

  sectionTitle(doc, 'Resumen del procedimiento');
  drawTable(doc, ['Paso', 'Pregunta', 'Acción'], [
    [1, 'Bloque y offset', 'Dividir la dirección entre el tamaño de bloque (quitar los bits de offset).'],
    [2, 'Lugar permitido', 'Aplicar módulo sobre las líneas (directa) o los conjuntos (asociativa por conjuntos).'],
    [3, 'Búsqueda', 'Comparar el tag solo dentro del lugar permitido y solo con líneas válidas.'],
    [4, 'Miss', 'Usar primero una línea inválida (la de menor número). Si no hay, seleccionar víctima.'],
    [5, 'Write-back', 'Escribir la víctima en memoria solo si V=1 y D=1.'],
    [6, 'Instalar y acceder', 'Cargar el bloque; un SW deja D=1 y un LW no lo activa.'],
    [7, 'Reemplazo', 'Actualizar LRU después de cada acceso, tanto hit como miss.'],
  ].map((r) => r.map((c) => ({ text: String(c) }))), { stretchLast: true });
}

/** Returns a Promise with the PDF as a Buffer. */
function examPdf(levelId) {
  const exam = Exams.build(levelId);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `Solucionario ${exam.name} · CacheTrace`, Author: 'CacheTrace', Subject: 'Memoria caché' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    renderExam(doc, exam);
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(COL.muted).font('Helvetica').fontSize(8).text(`CacheTrace · Examen ${exam.name} · Página ${i + 1} de ${range.count}`, M, doc.page.height - 28, { width: doc.page.width - 2 * M, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

module.exports = { examPdf };
