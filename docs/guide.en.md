# CacheTrace · Technical guide

[Versión en español](guide.es.md)

CacheTrace replays, access by access, the execution of a program on four cache organizations. All the logic lives in `src/engine.js`, has no DOM access, and runs in the browser.

## Input data

| Field | Description |
| --- | --- |
| Address bus | Address width in bits (6 to 32). Sets the main memory size, `2^bits` bytes. |
| Cache size | In bytes; suffixes are accepted (`128`, `1 KB`). Must be a power of two. |
| Bytes per line (B) | Power of two, at least 4. The number of lines is `cache / B` and must be at least 4. |
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

## Verification

`npm test` runs:

- the sample exercise, with the expected results for the four caches;
- parser and error-message tests;
- a comparison against an independent reference model (`tests/reference.js`) on random programs;
- Excel workbook generation.

The reference model checks that the engine follows the conventions above. It does not replace comparing against the official solution of a specific exercise: if your course uses other conventions, check the result against your problem statement.
