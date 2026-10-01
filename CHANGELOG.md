# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-02

### Added
- Byte and half-word memory instructions: `lb`, `lbu`, `lh`, `lhu`, `sb`, `sh`. A sub-word store only changes the affected bytes of the cache line.
- The offset of memory instructions can be omitted (`lb r10, (r1)`).
- `INS#` can also be shown as the execution order (the dynamic instruction count) in the table and in the Excel export.
- A clearer error when a register is used where an immediate is expected (`addi r1, r1, r11`).

### Changed
- The instruction limit is described as "Stop after N executed instructions" and its notice no longer suggests an error.

## [1.0.0] - 2026-09-30

First public release.

### Added
- Simulation of four cache organizations for the same program: direct-mapped, 2-way and 4-way set-associative, and fully associative.
- Address bit split (tag, index, offset) derived from the address bus, the cache size and the bytes per line.
- Functional processor with `li`, `mv`, arithmetic/logic, `addi`-style, `lw`, `sw`, conditional branches, `j`, `nop` and `halt`; labels or addresses as jump targets; `zero` register; negative immediates.
- Memory dump input byte by byte in hexadecimal, with little-endian words.
- Fetch/Execute trace with hit/miss, eviction and write-back per access; step-by-step view of the cache state and the registers.
- Write-back with write-allocate; LRU or FIFO replacement; invalid lines are filled in order.
- Excel export: one sheet per cache with bit formulas, final cache state and registers; optional evolution and register-history sheets; statement sheet.
- Bilingual website (Spanish and English).
- Automated tests, including a cross-check against an independent reference model.
