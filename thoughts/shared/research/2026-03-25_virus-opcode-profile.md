---
date: 2026-03-25
topic: virus-b-opcode-profile
tags: [gearmulator, dsp56300, profiling]
status: final
---

# Virus B Firmware — Static Opcode Profile

55,679 non-zero P-memory words scanned after full boot.

## Top 20 (covers 72%)

| Rank | Instruction | Count | % | Cum% |
|------|------------|-------|---|------|
| 1 | MOVE XY (dual parallel) | 10702 | 19.2 | 19.2 |
| 2 | UNKNOWN_NP | 4588 | 8.2 | 27.5 |
| 3 | MOVE #xx (immediate) | 3981 | 7.1 | 34.6 |
| 4 | MOVE X:ea (effective addr) | 2667 | 4.8 | 39.4 |
| 5 | Tcc S2,D2 | 1631 | 2.9 | 42.3 |
| 6 | MOVE Y:aa (absolute) | 1522 | 2.7 | 45.1 |
| 7 | MACR || XY move | 1517 | 2.7 | 47.8 |
| 8 | MOVE X:aa (absolute) | 1506 | 2.7 | 50.5 |
| 9 | MOVE Y:ea | 1424 | 2.6 | 53.1 |
| 10 | MOVE X:ea + reg | 1298 | 2.3 | 55.4 |
| 11 | MOVE X:(Rn+xxx) | 1177 | 2.1 | 57.5 |
| 12 | MOVE reg + Y:ea | 1151 | 2.1 | 59.6 |
| 13 | MOVE Y:(Rn+xxx) | 1128 | 2.0 | 61.6 |
| 14 | Tcc S1,D1 | 930 | 1.7 | 63.3 |
| 15 | MOVE L:aa | 861 | 1.5 | 64.8 |
| 16 | MOVE S,D (reg) | 841 | 1.5 | 66.3 |
| 17 | BCLR #n,qq | 789 | 1.4 | 67.7 |
| 18 | RTS | 588 | 1.1 | 68.8 |
| 19 | Tcc S1,D1 S2,D2 | 565 | 1.0 | 69.8 |
| 20 | Bcc xxx | 502 | 0.9 | 70.7 |

## Key Categories

**MOVE variants: ~55%** of all instructions
- Movexy (dual XY parallel): 19.2%
- Move immediate (#xx): 7.1%
- Move X:ea / Y:ea / X:aa / Y:aa: ~15%
- Move indexed (Rn+xxx): 4%
- Move register (S,D): 1.5%
- Move L (long): 2.2%

**ALU with parallel moves: ~10%**
- MACR||XY: 2.7%, MAC||XY: 0.8%, MPY||XY: 0.6%, MPYR||XY: 0.4%
- SUB||XY: 0.6%, ADD||MOVE: 0.3%
- CMP||MOVE: 0.5%, TST||MOVE: 0.4%

**Transfer conditional: ~5.6%**
- Tcc S2,D2: 2.9%, Tcc S1,D1: 1.7%, Tcc S1,D1 S2,D2: 1.0%

**Control flow: ~7%**
- Bcc/BRA/BScc/BSR: 2.2%
- Jcc/JMP/JScc/JSR: 2.4%
- RTS: 1.1%

## Priority for JIT Implementation

1. **Movexy** — 19.2% alone
2. **Move #xx** — 7.1%
3. **Move X:ea / Y:ea** — combined ~10%
4. **Move X:aa / Y:aa** — combined 5.4%
5. **Tcc** — 5.6%
6. **MACR/MAC/MPY/MPYR || XY** — 4.5%
7. **Bcc/Jcc/JMP/RTS** — 4.4%
8. **Move indexed (Rn+xxx)** — 4%
9. **Move register (S,D)** — 1.5%
10. **BCLR/BSET** — 1.4%

Implementing #1-7 would cover ~56% of all instructions.
Implementing #1-10 would cover ~63%.
