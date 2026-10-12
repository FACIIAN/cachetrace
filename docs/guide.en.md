# CacheTrace · Technical guide

[Versión en español](guide.es.md)

CacheTrace replays, access by access, the execution of a program on four cache organizations. All the logic lives in `src/engine.js`, has no DOM access, and runs in the browser.

## Input data

| Field | Description |
| --- | --- |
| Address bus | Address width in bits (6 to 32). Sets the main memory size, `2^bits` bytes. |
| Main memory, cache and line size | Each one is a number and a unit (bytes, Kbytes, Mbytes or Gbytes; 1 Kbyte = 1024 bytes). Sizes must be powers of two. The address bus and the main memory are computed from each other. |
| Line size (B) | In bytes or another unit; power of two, at least 4 bytes. The number of lines is `cache / B` and must be at least 4. |
| Replacement | LRU (default) or FIFO. |
| Unprefixed numbers | Base of literals without `0x` in the program (decimal by default). |
| Start address | Address of the first instruction (default `0x0000`). |
| Stop after (executed instructions) | Maximum number of executed instructions (300 by default). It stops loops without an exit, such as `beq r1, r1, target`, and lets you reproduce statements that ask for a specific number of instructions. |
| Stop at `nop` | Execution ends on reaching `nop`, after its Fetch. Enabled by default. |

### Bit split

With `A` address bits, `B` bytes per line, `N` lines and `W` ways:

- offset = `log2(B)`
- index = `log2(N / W)` (0 for fully associative)
- tag = `A − index − offset`

Direct-mapped: `W = 1`. SA2W and SA4W: `W = 2` and `W = 4`. FA: `W = N`.

## Program

One instruction per line. Every instruction takes 4 bytes and the first one is loaded at the start address. Labels end with `:`, and comments start with `#`, `//` or `;`.

| Instructions | Form |
| --- | --- |
| `li` | `li rd, imm` |
| `mv` | `mv rd, rs` |
| `add sub mul and or xor sll srl` | `op rd, rs1, rs2` |
| `addi subi andi ori slli srli` | `op rd, rs, imm` |
| `lw`, `sw` | `lw rd, off(rs)` · `sw rs2, off(rs1)` (word, 4 bytes) |
| `lh`, `lhu`, `sh` | half-word (2 bytes); `lh` sign-extends, `lhu` does not |
| `lb`, `lbu`, `sb` | byte; `lb` sign-extends, `lbu` does not |
| `beq bne blt bge ble bgt` | `op rs1, rs2, target` (signed comparisons) |
| `beqz bnez` | `op rs, target` |
| `j` | `j target` |
| `nop`, `halt` | no operands |

- Registers `r0` to `r31`. `zero` is an alias of `r0`, which is always 0.
- A jump target is a label or an address (`0x0010`) that must match an instruction of the program.
- Immediates accept decimal, `0x` (hexadecimal) and `0b` (binary), signed.
- The offset may be omitted: `lb r10, (r1)` is the same as `lb r10, 0(r1)`.
- Memory instructions require an address inside the memory and aligned to their size (4, 2 or 1 bytes). A byte or half-word access only changes those bytes of the line.
- Immediate operands (`addi`, `andi`…) must be numbers; to operate on registers use `add`, `sub`, `and`…

## Memory dump

One line per block: base address and bytes in hexadecimal, in the order D0, D1, D2… Anything not listed is `00`. 32-bit words are interpreted as **little-endian**.

```
0x1000: 11 00 00 00 22 00 00 00
```

With that line, `lw` at `0x1000` reads `0x00000011` and at `0x1004` reads `0x00000022`.

## Model conventions

- **Accesses.** Every executed instruction produces a Fetch at its address. Memory instructions (`lw`, `lb`, `sb`…) also produce a data access (Execute phase). Other instructions leave the Execute row without an address.
- **Unified cache** for instructions and data, initially empty (V = 0).
- **Writes.** Write-back with write-allocate. A `sw` to a present line marks it dirty (D = 1); on a miss the block is fetched first and then written. Evicting a dirty line writes its block back to memory (WB = Yes).
- **Replacement.** Among the invalid ways of the set, the lowest-numbered one is chosen. If all are valid, LRU picks the least recently used (a hit updates the usage) and FIFO the one loaded earliest.
- **Line contents.** Instructions are annotated as `I_n`, where `n` is the instruction number, spanning their 4 bytes. Data is shown byte by byte.
- **End.** Execution ends on reaching `nop` (if enabled), `halt`, the end of the program or the instruction limit. The cache is not flushed at the end.

## Output

### On screen

- Bit split of the four organizations.
- Comparison of hits, misses, hit rate, evictions and write-backs.
- Access table per organization: address, coloured bits (tag in red, index in blue, offset in green), tag, set, offset, hit or miss, eviction, write-back, line and comment.
- Cache and register state after every instruction, with step-by-step navigation.

### Excel

The **Download Excel** button generates an `.xlsx` workbook:

| Sheet | Contents |
| --- | --- |
| `Mapeo Directo(DM)`, `SA2W`, `SA4W`, `FA` | Access table with the bits computed by formulas (`HEX2DEC`, `DEC2HEX`), final cache state (`LINE#`, `TAG`, `D`, `V`, `D0…`) and final registers. |
| `… - evolución` | Cache line touched after each access. Optional. |
| `Registros` | Register values after each instruction. Optional. |
| `Enunciado` | Parameters, bit split, results, program and dump. |

You can choose which organizations to export. The workbooks open in Excel and LibreOffice. Sheet names and column headers are in Spanish.

## Limitations

- Fixed write policy (write-back with write-allocate) and LRU or FIFO replacement. No write-through, no-write-allocate or random replacement.
- A single unified cache; no split instruction/data caches, multiple levels or timing (AMAT, cycles).
- Writes into the program area do not modify the instructions.
- The application interface is currently in Spanish.


## Calculator

The **Calculator** page solves exercises where loose data are given (address, block, place, victim, block range, offset…) using the same conventions as the simulator. Memory and cache sizes are entered as a number and a unit (bytes, Kbytes, Mbytes, Gbytes), as in the simulator. It has three tabs:

| Tab | Input | Result |
| --- | --- | --- |
| Address and placement | A list of addresses and a list of blocks, in hexadecimal | Configuration diagnostics (positions, range, lines, tag/line-or-set/offset bits per organization), table A (block, range and offset), table B (line or set and tag for direct, 2-way and 4-way, with the block in binary) and which blocks compete with the reference one |
| Access traces | `LW`/`SW` accesses with their address | One letter per block (A, B, C… by order of appearance); a table per organization with H/M, place (`L4`, `S4/V0`, `V0`), victim (`A limpia`, `B sucia`, `—`) and write-back with its range; totals; final state of the used zone; comparison between policies; first access that changes between organizations and why; and the cache state after any access |
| Set and write-back | Ways, set number, initial state (V, D, tag and LRU order) and accesses | Access-by-access resolution (block, offset, set, tag, H/M, way, victim, write-back and range written) and the final state with the updated LRU order |

Every result has a lightbulb button that explains the method. The interface is in Spanish.

## Practice

The **Practice** page offers three exams (**Easy**, **Intermediate** and **Hard**). All of them have the same ten activities:

1. Diagnostics: positions and range, bus bits, block and offset, lines, tag/line/offset bits, sets and three theory questions.
2. From address to placement: table A, table B and competing blocks.
3. Variants A to D: access trace on direct-mapped, 2-way, 4-way and fully associative, with final state, totals and the first access that changes against another organization.
4. Comparison between policies.
5. Find the error.
6. Write and write-back on a set with an initial state.
7. Final test: a sequence of accesses on one set and sentences to complete.

| Level | What changes |
| --- | --- |
| Easy | Usual configuration (16-bit bus, 128 B cache, 8 B block), 8 accesses and many given cells |
| Intermediate | Same configuration, 12 accesses, fewer given cells, 5 competing blocks and a set with a write *hit* |
| Hard | 15-bit bus and 16 B blocks, 16 accesses, 9 blocks (fully associative also evicts), 4-way sets with an invalid way and almost nothing given |

**Grading.** The *Check* button (per activity or for the whole exam) marks each cell green, red, or with “?” when unanswered. It never shows the solution. Answers are compared by value, not by spelling: `0x204`, `0X204`, `204` and `0x0204` are the same; so are `Sí`, `si` and `S`; `L4` and `l4`; `S4/V0` and `s4 - v0`; `A limpia` and `a (limpia)`; ranges accept `-`, `–` and `—`. Answers are stored in the browser.

**Hints.** The lightbulb in each activity explains the method with the parameters of the exam, for example: write the block in binary in groups of 4 digits and split the line or set bits off from the right; the rest is the tag.

**Solution.** At the end of every exam you can download a PDF with all the solved tables and an explanation of how each result is obtained. The PDFs are generated when the site is built (`npm run build`) from the same data and engine used for grading.

The exercises are original. Their data live in `src/exams.js` and their solutions are computed with `src/blockmodel.js`, which is covered by tests and an independent reference model. The interface is in Spanish.

## Light and dark theme

The sun and moon button (top left) switches the whole website between dark (default) and light, with a smooth half-second transition. The choice is remembered in the browser. With “reduce motion” enabled in the system, the change is instant.

## Verification

`npm test` runs:

- the sample exercise, with the expected results for the four caches;
- parser and error-message tests;
- a comparison against an independent reference model (`tests/reference.js`) on random programs;
- Excel workbook generation;
- the exercise model (`src/blockmodel.js`) against the same independent reference model;
- the three practice exams: unique cells, increasing difficulty, variety of cases, solution accepted by the checker and PDF generation.

The reference model checks that the engine follows the conventions above. It does not replace comparing against the official solution of a specific exercise: if your course uses other conventions, check the result against your problem statement.
