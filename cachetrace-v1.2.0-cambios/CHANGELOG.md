# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-10-04

### Added
- The main memory, cache and line sizes are entered as a number plus a unit selector (bytes, Kbytes, Mbytes, Gbytes), so "64" can no longer be mistaken for 64 bytes. The address bus and the memory size update each other.

## [1.1.2] - 2026-10-04

### Changed
- The "cache larger than main memory" notice now shows the values it read (cache size, memory size and address bus) and reminds the units.
- Sizes accept more spellings: `64 Kbytes`, `64KiB`, `128 bytes`.

## [1.1.1] - 2026-10-03

### Fixed
- Excel export: the instruction labels (`I_n`) were missing from the cache state tables and from the evolution sheets, so lines holding program code appeared empty. Merged cells were being overwritten when written. A test now saves the workbook, reads it back and checks the labels.
- The solved example workbook in `examples/` was regenerated.

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
