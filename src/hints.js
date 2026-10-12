'use strict';
/* Hints shown behind the lightbulb button. They explain the method, not the answers of the exam. */
const Hints = (function () {
  const T = typeof BlockModel !== 'undefined' ? BlockModel : require('./blockmodel.js');
  const H = T.H;

  // A fixed example block that never appears in the practice exams.
  const EXAMPLE_BLOCK = 0x13D;

  function split(block, g) {
    const full = T.bin(block, g.blockBits);
    const idx = g.idxBits ? full.slice(full.length - g.idxBits) : '';
    const tag = g.idxBits ? full.slice(0, full.length - g.idxBits) : full;
    const grp = (s) => (s ? s.replace(/(?=(\d{4})+$)/g, ' ').trim() : '');
    return { full, idx, tag, grp };
  }

  function binaryExample(cfg) {
    const g1 = T.geometry(cfg, 1), g2 = T.geometry(cfg, 2), g4 = T.geometry(cfg, 4);
    const b = EXAMPLE_BLOCK;
    const full = T.groups4(b, g1.blockBits);
    const one = (g, label, where) => {
      const s = split(b, g);
      return `<li><b>${label}</b>: ${where} ${g.idxBits === 1 ? 'es el <b>último bit</b> (el de la derecha)' : `son los <b>${g.idxBits}</b> bits de la derecha`}: <code>${s.idx}</code> = ${parseInt(s.idx, 2)}; el tag es el resto: <code>${s.tag}</code> = ${H(parseInt(s.tag, 2))}.</li>`;
    };
    return `<p>Ejemplo con el bloque ${H(b)} (no es de este examen): en binario, separado en grupos de 4 cifras, es <code>${full}</code>.</p><ul>${one(g1, 'Directa', 'la línea')}${one(g2, '2 vías', 'el conjunto')}${one(g4, '4 vías', 'el conjunto')}<li><b>Completamente asociativa</b>: no hay línea ni conjunto; el tag es el bloque entero (${H(b)}).</li></ul>`;
  }

  const last = (n) => (n === 1 ? 'el <b>último</b> bit' : `los últimos <b>${n}</b> bits`);

  const common = {
    victim: '<li><b>Víctima</b>: escribe la letra del bloque que sale y si estaba <i>limpia</i> (D=0) o <i>sucia</i> (D=1), por ejemplo <code>A limpia</code>. Si no sale nada, escribe <code>—</code>.</li>',
    wb: '<li><b>WB</b>: Sí solo cuando la víctima es válida y está sucia. Una víctima limpia se sustituye sin escribir en memoria.</li>',
    dirty: '<li>Un <b>SW</b> deja la línea sucia (D=1), tanto en hit como en miss (write-allocate). Un <b>LW</b> no cambia D.</li>',
    letters: '<li>Las letras A, B, C… identifican los bloques por orden de aparición; accesos con la misma letra están en el mismo bloque aunque cambie el offset.</li>',
  };

  const builders = {
    diag(cfg) {
      const g = T.geometry(cfg, 1);
      return `<p>Fórmulas que necesitas:</p><ul>
        <li><b>Posiciones</b> = 2<sup>bits del bus</sup> = 2<sup>${cfg.addrBits}</sup>. El rango va de 0x0 hasta posiciones − 1.</li>
        <li><b>Bloque</b> = dirección ÷ tamaño de bloque (${cfg.blockBytes}); equivale a quitar los ${T.bits(g.offBits)} de la derecha. <b>Offset</b> = el resto, es decir, esos ${T.bits(g.offBits)}.</li>
        <li><b>Rango del bloque</b>: inicio = bloque × ${cfg.blockBytes}; fin = inicio + ${cfg.blockBytes - 1}.</li>
        <li><b>Líneas</b> = tamaño de la caché ÷ tamaño de bloque.</li>
        <li><b>Offset</b> = log<sub>2</sub>(tamaño de bloque) bits. <b>Línea</b> o <b>conjunto</b> = log<sub>2</sub>(líneas o conjuntos) bits. <b>Tag</b> = bits del bus − línea − offset.</li>
        <li><b>Conjuntos</b> = líneas ÷ vías.</li></ul>
        <p>Teoría: piensa cuándo hay una línea inválida libre (no hay expulsión) y qué dos condiciones necesita la víctima para escribirse en memoria.</p>`;
    },
    ubic(cfg) {
      const g = T.geometry(cfg, 1);
      return `<p><b>Tabla A</b>: bloque = dirección ÷ ${cfg.blockBytes}; el rango empieza en bloque × ${cfg.blockBytes} y acaba ${cfg.blockBytes - 1} direcciones después; el offset es la dirección menos el inicio del bloque.</p>
        <p><b>Tabla B</b>: coge el número de bloque (no la dirección), pásalo a binario y sepáralo en grupos de 4 cifras. Después separa de derecha a izquierda:</p>
        <ul><li>Directa: línea = ${last(g.idxBits)}; tag = el resto.</li><li>2 vías: set = ${last(T.geometry(cfg, 2).idxBits)}; tag = el resto.</li><li>4 vías: set = ${last(T.geometry(cfg, 4).idxBits)}; tag = el resto.</li></ul>
        ${binaryExample(cfg)}
        <p><b>Quién compite</b>: dos bloques compiten si dan el mismo resultado en línea o conjunto (mismo resto al dividir entre ${g.sets}, ${T.geometry(cfg, 2).sets} o ${T.geometry(cfg, 4).sets}).</p>`;
    },
    'trace-DM'(cfg) {
      return `<p>Para cada acceso, en este orden:</p><ol>
        <li>Bloque = dirección ÷ ${cfg.blockBytes}. Línea = bloque mod ${T.geometry(cfg, 1).lines} (${T.lastBits(T.geometry(cfg, 1).idxBits)}).</li>
        <li>Compara el tag solo con esa línea y solo si es válida: si coincide, <b>H</b>; si no, <b>M</b>.</li>
        <li>En un miss no hay elección: la única víctima posible es lo que haya en esa línea (si está vacía no hay víctima).</li>
        <li>Anota <b>Lugar</b> como <code>L</code> + número de línea.</li></ol><ul>${common.victim}${common.wb}${common.dirty}${common.letters}</ul>
        <p>Al terminar, los totales salen de contar las columnas H/M, Víctima y WB.</p>`;
    },
    'trace-SA2'(cfg) { return setHint(cfg, 2); },
    'trace-SA4'(cfg) { return setHint(cfg, 4); },
    'trace-FA'(cfg) {
      const g = T.geometry(cfg, 'full');
      return `<p>No hay conjuntos: un bloque puede ir a <b>cualquiera</b> de las ${g.lines} líneas.</p><ol>
        <li>Busca el tag (el bloque entero) en todas las líneas válidas: si está, <b>H</b>.</li>
        <li>En un miss, usa la línea inválida de menor número (<code>V0</code>, <code>V1</code>…). Solo si todas están ocupadas se expulsa la <b>LRU</b>.</li>
        <li>Actualiza el orden LRU en cada acceso, sea hit o miss.</li></ol><ul>${common.victim}${common.wb}${common.dirty}${common.letters}</ul>
        <p><b>Lugar</b> se escribe <code>V</code> + número de línea.</p>`;
    },
    comp() {
      return `<p>Copia los totales de las variantes A–D en la tabla.</p><ul>
        <li><b>Misses obligatorios</b>: el primer acceso a cada bloque distinto. Ninguna política los evita con la caché vacía; cuenta los bloques distintos (letras).</li>
        <li><b>Misses de conflicto</b>: el bloque ya había estado en la caché pero lo expulsó otro que competía por el mismo lugar. Desaparecen al aumentar las vías.</li>
        <li><b>Misses de capacidad</b>: la caché entera está llena. Aparecen también en completamente asociativa.</li></ul>
        <p>Los misses que desaparecen entre dos políticas se calculan restando sus misses.</p>`;
    },
    error() {
      return `<p>Lee la resolución propuesta e identifica qué regla se está rompiendo:</p><ul>
        <li>¿Se confunde el número de bloque con la dirección?</li>
        <li>¿Se elige una víctima cuando existe una línea inválida libre, o en un lugar que no le corresponde al bloque?</li>
        <li>¿Se hace write-back con una víctima limpia, o se marca sucia una línea tras una lectura?</li>
        <li>¿Se actualiza LRU solo en algunos accesos?</li></ul><p>Después elige la corrección que arregla justo ese error.</p>`;
    },
    wb(cfg) {
      return `<p>Sigue el procedimiento con el estado inicial que te dan:</p><ol>
        <li>Bloque = dirección ÷ ${cfg.blockBytes}; offset = el resto. Conjunto = bloque mod nº de conjuntos; tag = bloque div nº de conjuntos.</li>
        <li>Compara el tag con las vías <b>válidas</b> del conjunto: hit o miss.</li>
        <li>Si es miss y hay una vía inválida, se usa la de menor número (sin víctima). Si todas son válidas, la víctima es la <b>LRU</b>.</li>
        <li>Write-back solo si la víctima es válida y está sucia. Su rango es <b>(tag × nº de conjuntos + conjunto) × ${cfg.blockBytes}</b> hasta inicio + ${cfg.blockBytes - 1}.</li>
        <li>Carga el bloque; un SW deja D=1, un LW no. Después actualiza el orden: el bloque accedido pasa a ser el MRU.</li></ol>
        <p>Si es un hit no hay víctima ni write-back: solo cambian D (si es un SW) y el orden LRU.</p>`;
    },
    final(cfg) {
      return `<p>Es el mismo procedimiento que en la actividad 6, repetido acceso a acceso sobre el mismo conjunto.</p><ul>
        <li>Apunta el orden LRU después de cada acceso: es la clave para saber quién es la víctima del siguiente miss.</li>
        <li>En <b>Víctima</b> escribe el tag y el estado (<code>tag 0x40 sucia</code>) o <code>—</code> si no hay.</li>
        <li><b>Vía</b> es donde queda el bloque accedido: la del hit o la que se reemplaza.</li>
        <li>El estado final es el que queda tras el último acceso, con su orden LRU.</li></ul>`;
    },
  };

  function setHint(cfg, ways) {
    const g = T.geometry(cfg, ways);
    return `<p>Cada bloque solo puede ir a <b>un conjunto</b>, con ${ways} vías.</p><ol>
      <li>Bloque = dirección ÷ ${cfg.blockBytes}. Conjunto = bloque mod ${g.sets} (${T.lastBits(g.idxBits)}); tag = bloque div ${g.sets}.</li>
      <li>Compara el tag solo con las vías válidas de ese conjunto: hit o miss.</li>
      <li>En un miss usa primero la vía inválida de menor número. Si todas están ocupadas, se expulsa la <b>LRU</b> del conjunto.</li>
      <li>Actualiza el orden LRU en cada acceso, sea hit o miss.</li>
      <li>Anota <b>Lugar</b> como <code>S</code>conjunto<code>/V</code>vía, por ejemplo <code>S${Math.min(1, g.sets - 1)}/V0</code>.</li></ol>
      <ul>${common.victim}${common.wb}${common.dirty}${common.letters}</ul>`;
  }

  function get(key, cfg) {
    const f = builders[key];
    return f ? f(cfg) : '';
  }

  return { get, keys: Object.keys(builders) };
})();
if (typeof module !== 'undefined') module.exports = Hints;
