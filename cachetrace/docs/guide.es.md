# CacheTrace · Guía técnica

[English version](guide.en.md)

CacheTrace reproduce, acceso a acceso, la ejecución de un programa sobre cuatro organizaciones de caché. Toda la lógica está en `src/engine.js`, sin acceso al DOM, y se ejecuta en el navegador.

## Datos de entrada

| Campo | Descripción |
| --- | --- |
| Bus de direcciones | Ancho de la dirección en bits (6 a 32). Define el tamaño de la memoria principal, `2^bits` bytes. |
| Memoria principal, caché y línea | Cada uno se escribe como un número y una unidad (bytes, Kbytes, Mbytes o Gbytes; 1 Kbyte = 1024 bytes). Los tamaños deben ser potencias de 2. El bus y la memoria principal se calculan el uno al otro. |
| Tamaño de línea (B) | En bytes u otra unidad; potencia de 2, mínimo 4 bytes. El número de líneas es `caché / B` y debe ser al menos 4. |
| Reemplazo | LRU (por defecto) o FIFO. |
| Números sin prefijo | Base de los literales sin `0x` en el programa (decimal por defecto). |
| Dirección inicial | Dirección de la primera instrucción (por defecto `0x0000`). |
| Parar tras (instrucciones ejecutadas) | Número máximo de instrucciones ejecutadas (300 por defecto). Detiene los bucles sin salida, como `beq r1, r1, destino`, y sirve para reproducir enunciados que piden ejecutar un número concreto de instrucciones. |
| Terminar en `nop` | La ejecución acaba al alcanzar `nop`, tras su Fetch. Activado por defecto. |

### Reparto de bits

Con `A` bits de dirección, `B` bytes por línea, `N` líneas y `W` vías:

- offset = `log2(B)`
- index = `log2(N / W)` (0 en la totalmente asociativa)
- tag = `A − index − offset`

Mapeo directo: `W = 1`. SA2W y SA4W: `W = 2` y `W = 4`. FA: `W = N`.

## Programa

Una instrucción por línea. Cada instrucción ocupa 4 bytes y la primera se carga en la dirección inicial. Las etiquetas terminan en `:` y los comentarios empiezan por `#`, `//` o `;`.

| Instrucciones | Forma |
| --- | --- |
| `li` | `li rd, imm` |
| `mv` | `mv rd, rs` |
| `add sub mul and or xor sll srl` | `op rd, rs1, rs2` |
| `addi subi andi ori slli srli` | `op rd, rs, imm` |
| `lw`, `sw` | `lw rd, desp(rs)` · `sw rs2, desp(rs1)` (palabra, 4 bytes) |
| `lh`, `lhu`, `sh` | media palabra (2 bytes); `lh` extiende el signo y `lhu` no |
| `lb`, `lbu`, `sb` | byte; `lb` extiende el signo y `lbu` no |
| `beq bne blt bge ble bgt` | `op rs1, rs2, destino` (comparaciones con signo) |
| `beqz bnez` | `op rs, destino` |
| `j` | `j destino` |
| `nop`, `halt` | sin operandos |

- Registros `r0` a `r31`. `zero` es un alias de `r0`, que vale siempre 0.
- El destino de un salto es una etiqueta o una dirección (`0x0010`), que debe corresponder a una instrucción del programa.
- Los inmediatos admiten decimal, `0x` (hexadecimal) y `0b` (binario), con signo.
- El desplazamiento puede omitirse: `lb r10, (r1)` equivale a `lb r10, 0(r1)`.
- Las instrucciones de memoria exigen una dirección dentro de la memoria y alineada a su tamaño (4, 2 o 1 bytes). Un acceso de byte o de media palabra solo modifica esos bytes de la línea.
- Los operandos inmediatos (`addi`, `andi`…) deben ser números; para operar con registros usa `add`, `sub`, `and`…

## Dump de memoria

Una línea por bloque: dirección base y bytes en hexadecimal, en el orden D0, D1, D2… Lo que no aparece vale `00`. Las palabras de 32 bits se interpretan en **little-endian**.

```
0x1000: 11 00 00 00 22 00 00 00
```

Con esa línea, `lw` en `0x1000` lee `0x00000011` y en `0x1004` lee `0x00000022`.

## Convenciones del modelo

- **Accesos.** Cada instrucción ejecutada genera un Fetch en su dirección. Las instrucciones de memoria (`lw`, `lb`, `sb`…) generan además un acceso de datos (fase Execute). El resto de instrucciones deja la fila Execute sin dirección.
- **Caché unificada** para instrucciones y datos, inicialmente vacía (V = 0).
- **Escritura.** Write-back con write-allocate. Un `sw` sobre una línea presente la marca como sucia (D = 1); en un fallo, se trae el bloque y luego se escribe. Al desalojar una línea sucia se escribe su bloque en memoria (WB = Sí).
- **Reemplazo.** Entre las vías inválidas del conjunto se elige la de menor número. Si todas son válidas, LRU elige la menos recientemente usada (un acierto actualiza el uso) y FIFO la que se cargó antes.
- **Contenido de las líneas.** Las instrucciones se anotan como `I_n`, donde `n` es el número de instrucción, ocupando sus 4 bytes. Los datos se muestran byte a byte.
- **Fin.** Termina al alcanzar `nop` (si la opción está activa), `halt`, el final del programa o el límite de instrucciones. No se vacía la caché al final.

## Salida

### En pantalla

- Reparto de bits de las cuatro organizaciones.
- Comparativa de aciertos, fallos, tasa de aciertos, desalojos y write-backs.
- Tabla de accesos por organización: dirección, bits coloreados (tag en rojo, index en azul, offset en verde), tag, set, offset, hit o miss, desalojo, write-back, línea y comentario.
- Estado de la caché y de los registros tras cada instrucción, con navegación paso a paso.

### Excel

El botón **Descargar Excel** genera un libro `.xlsx`:

| Hoja | Contenido |
| --- | --- |
| `Mapeo Directo(DM)`, `SA2W`, `SA4W`, `FA` | Tabla de accesos con los bits calculados mediante fórmulas (`HEX2DEC`, `DEC2HEX`), estado final de la caché (`LINE#`, `TAG`, `D`, `V`, `D0…`) y registros finales. |
| `… - evolución` | Línea de caché afectada tras cada acceso. Opcional. |
| `Registros` | Valor de los registros tras cada instrucción. Opcional. |
| `Enunciado` | Parámetros, reparto de bits, resultados, programa y dump. |

Puedes elegir qué organizaciones exportar. Los libros se abren con Excel y LibreOffice.

## Limitaciones

- Política de escritura fija (write-back con write-allocate) y reemplazo LRU o FIFO. No hay write-through, no-write-allocate ni reemplazo aleatorio.
- Caché única unificada; no modela cachés separadas de instrucciones y datos, niveles múltiples ni tiempos (AMAT, ciclos).
- Las escrituras a la zona del programa no modifican las instrucciones.
- La interfaz de la aplicación está en español.


## Calculadora

La página **Calculadora** resuelve los ejercicios en los que se dan datos sueltos (dirección, bloque, lugar, víctima, rango del bloque, offset…) con las mismas convenciones que el simulador. Los datos de memoria y caché se escriben con número y unidad (bytes, Kbytes, Mbytes, Gbytes), como en el simulador. Tiene tres pestañas:

| Pestaña | Entrada | Resultado |
| --- | --- | --- |
| Dirección y ubicación | Lista de direcciones y lista de bloques, en hexadecimal | Diagnóstico de la configuración (posiciones, rango, líneas, bits de tag, línea o conjunto y offset por organización), tabla A (bloque, rango y offset), tabla B (línea o conjunto y tag en directa, 2 y 4 vías, con el bloque en binario) y qué bloques compiten con el de referencia |
| Trazas de accesos | Accesos `LW`/`SW` con su dirección | Una letra por bloque (A, B, C… por orden de aparición); tabla de cada organización con H/M, lugar (`L4`, `S4/V0`, `V0`), víctima (`A limpia`, `B sucia`, `—`) y write-back con su rango; totales; estado final de la zona utilizada; comparación entre políticas; primer acceso que cambia entre organizaciones y su motivo; y el estado de la caché tras cualquier acceso |
| Conjunto y write-back | Vías, número de conjunto, estado inicial (V, D, tag y orden LRU) y accesos | Resolución acceso a acceso (bloque, offset, conjunto, tag, H/M, vía, víctima, write-back y rango escrito) y estado final con el orden LRU actualizado |

Cada resultado lleva un botón con una bombilla que explica el método.

## Prácticas

La página **Prácticas** ofrece tres exámenes (**Fácil**, **Intermedio** y **Difícil**). Todos tienen las mismas diez actividades:

1. Diagnóstico: posiciones y rango, bits del bus, bloque y offset, líneas, bits de tag/línea/offset, conjuntos y tres preguntas de teoría.
2. De la dirección a la ubicación: tabla A, tabla B y bloques que compiten.
3. Variantes A a D: traza de accesos en directa, 2 vías, 4 vías y completamente asociativa, con estado final, totales y primer acceso que cambia frente a otra organización.
4. Comparación entre políticas.
5. Encuentra el error.
6. Escritura y write-back sobre un conjunto con estado inicial.
7. Prueba final: secuencia de accesos sobre un conjunto y frases a completar.

| Nivel | Qué cambia |
| --- | --- |
| Fácil | Configuración habitual (bus de 16 bits, caché de 128 B, bloque de 8 B), 8 accesos y muchas celdas dadas |
| Intermedio | La misma configuración, 12 accesos, menos celdas dadas, 5 bloques que compiten y un conjunto con *hit* de escritura |
| Difícil | Bus de 15 bits y bloques de 16 B, 16 accesos, 9 bloques (la completamente asociativa también expulsa), conjuntos de 4 vías con una vía inválida y casi nada dado |

**Corrección.** El botón *Comprobar* (por actividad o de todo el examen) marca cada celda en verde, en rojo o con «?» si está sin responder. No muestra la solución. Las respuestas se comparan por su valor, no por su escritura: `0x204`, `0X204`, `204` y `0x0204` son lo mismo; `Sí`, `si` y `S` también; `L4` y `l4`; `S4/V0` y `s4 - v0`; `A limpia` y `a (limpia)`; los rangos admiten `-`, `–` y `—`. Las respuestas se guardan en el navegador.

**Pistas.** La bombilla de cada actividad explica el método con los parámetros del examen, por ejemplo: pasar el bloque a binario en grupos de 4 cifras y separar de derecha a izquierda los bits de línea o conjunto; el resto es el tag.

**Solución.** Al final de cada examen se descarga un PDF con todas las tablas resueltas y una explicación de cómo se obtiene cada resultado. Los PDF se generan al compilar la web (`npm run build`) con los mismos datos y el mismo motor que la corrección.

Los ejercicios son originales. Sus datos están en `src/exams.js` y sus soluciones se calculan con `src/blockmodel.js`, que se comprueba con tests y con un modelo de referencia independiente.

## Tema claro y oscuro

El botón del sol y la luna (arriba a la izquierda) cambia toda la web entre tema oscuro (por defecto) y claro, con una transición suave de medio segundo. La elección se recuerda en el navegador. Con «reducir movimiento» activado en el sistema, el cambio es instantáneo.

## Verificación

`npm test` ejecuta:

- el ejercicio de ejemplo, con los resultados esperados de las cuatro cachés;
- pruebas del parser y de los mensajes de error;
- una comparación con un modelo de referencia independiente (`tests/reference.js`) sobre programas aleatorios;
- la generación del libro de Excel;
- el modelo de ejercicios (`src/blockmodel.js`) frente al mismo modelo de referencia independiente;
- los tres exámenes de práctica: celdas únicas, dificultad creciente, variedad de casos, solución aceptada por el corrector y generación de los PDF.

El modelo de referencia comprueba que el motor cumple las convenciones anteriores. No sustituye la comparación con la solución de un enunciado concreto: si tu asignatura usa otras convenciones, revisa el resultado con tu enunciado.
