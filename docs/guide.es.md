# CacheTrace · Guía técnica

[English version](guide.en.md)

CacheTrace reproduce, acceso a acceso, la ejecución de un programa sobre cuatro organizaciones de caché. Toda la lógica está en `src/engine.js`, sin acceso al DOM, y se ejecuta en el navegador.

## Datos de entrada

| Campo | Descripción |
| --- | --- |
| Bus de direcciones | Ancho de la dirección en bits (6 a 32). Define el tamaño de la memoria principal, `2^bits` bytes. |
| Tamaño de la caché | En bytes; acepta sufijos (`128`, `1 KB`). Debe ser potencia de 2. |
| Bytes por línea (B) | Potencia de 2, mínimo 4. El número de líneas es `caché / B` y debe ser al menos 4. |
| Reemplazo | LRU (por defecto) o FIFO. |
| Números sin prefijo | Base de los literales sin `0x` en el programa (decimal por defecto). |
| Dirección inicial | Dirección de la primera instrucción (por defecto `0x0000`). |
| Máximo de instrucciones | Límite de seguridad ante bucles infinitos (300 por defecto). |
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
| `lw`, `sw` | `lw rd, desp(rs)` · `sw rs2, desp(rs1)` |
| `beq bne blt bge ble bgt` | `op rs1, rs2, destino` (comparaciones con signo) |
| `beqz bnez` | `op rs, destino` |
| `j` | `j destino` |
| `nop`, `halt` | sin operandos |

- Registros `r0` a `r31`. `zero` es un alias de `r0`, que vale siempre 0.
- El destino de un salto es una etiqueta o una dirección (`0x0010`), que debe corresponder a una instrucción del programa.
- Los inmediatos admiten decimal, `0x` (hexadecimal) y `0b` (binario), con signo.
- `lw` y `sw` acceden a palabras de 32 bits y exigen dirección alineada a 4 y dentro de la memoria.

## Dump de memoria

Una línea por bloque: dirección base y bytes en hexadecimal, en el orden D0, D1, D2… Lo que no aparece vale `00`. Las palabras de 32 bits se interpretan en **little-endian**.

```
0x1000: 11 00 00 00 22 00 00 00
```

Con esa línea, `lw` en `0x1000` lee `0x00000011` y en `0x1004` lee `0x00000022`.

## Convenciones del modelo

- **Accesos.** Cada instrucción ejecutada genera un Fetch en su dirección. `lw` y `sw` generan además un acceso de datos (fase Execute). El resto de instrucciones deja la fila Execute sin dirección.
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

- Solo accesos de palabra de 32 bits; no hay `lb`, `sb` ni medias palabras.
- Política de escritura fija (write-back con write-allocate) y reemplazo LRU o FIFO. No hay write-through, no-write-allocate ni reemplazo aleatorio.
- Caché única unificada; no modela cachés separadas de instrucciones y datos, niveles múltiples ni tiempos (AMAT, ciclos).
- Las escrituras a la zona del programa no modifican las instrucciones.
- La interfaz de la aplicación está en español.

## Verificación

`npm test` ejecuta:

- el ejercicio de ejemplo, con los resultados esperados de las cuatro cachés;
- pruebas del parser y de los mensajes de error;
- una comparación con un modelo de referencia independiente (`tests/reference.js`) sobre programas aleatorios;
- la generación del libro de Excel.

El modelo de referencia comprueba que el motor cumple las convenciones anteriores. No sustituye la comparación con la solución de un enunciado concreto: si tu asignatura usa otras convenciones, revisa el resultado con tu enunciado.
