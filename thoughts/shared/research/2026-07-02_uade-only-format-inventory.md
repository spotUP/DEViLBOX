---
date: 2026-07-02
topic: uade-only-format-inventory
tags: [uade, wasm, formats, porting, editability]
status: final
---

# UADE-only format inventory + porting priority (2026-07-02)

Question: which formats still play ONLY via UADE (black-box 68k emulator), and in
what order should they be ported to native WASM engines to become editable?

Ground rule established first: **UADE traces can never yield 100%-correct editable
pattern data** — sequence loops/transposes/macros collapse into flat note events and
cannot round-trip. Editability requires the native-port pipeline (transpile replayer
→ lock-step verify vs UADE → parser reading the replayer's own structures → WASM
setters mutating player memory → serializer → round-trip proof). UADE remains the
ground-truth verifier and fallback player.

## Current state

**54 native WASM engines** registered in
`src/engine/replayer/NativeEngineRouting.ts:90-826` (+ 4 special-case: C64SID,
CheeseCutter, Symphonie, SunVox). Full table in the agent output; includes Hively,
TFMX (base), Hippel (ST/7V/CoSo/FC/MCMD), FutureComposer, SonicArranger, SidMon1/2,
DeltaMusic1/2, SoundMon, Oktalyzer, DavidWhittaker, BenDaglish, MusicLine, Cinter4…

**~60 UADE-only prefixes** remain: `src/lib/import/FormatRegistry.ts:2356-2386`
(family 'uade-only') + `src/lib/import/formats/UADEParser.ts:332-347`
(UADE_EXTENSIONS).

## Porting priority

### Tier 1 — variants of engines that already exist (routing/parser gaps)

| Prefix | Fix | Payoff |
|---|---|---|
| `tfmx1.5 / tfmx7v / tfmxpro / tfhd*` | Extend native TFMX engine (only base ported) | HUGE — Hülsbeck corpus (Turrican, Apidya…), biggest remaining body. Pro/7V = weeks of real feature work |
| `thx` | Route to Hively (AHX variant) | trivial |
| `hip / mcmd / sog` | Route to native Hippel (already claims MCMD etc.) | trivial-small |
| `sa-p / lion / sa_old` | Old-version parser in SonicArranger | small |
| `bfc / bsi / fc-bsi` | Depacker in front of FutureComposer | small |
| ~26 Prowiz-packed MOD variants | Depack → MOD → full editing for free | small, wide |

### Tier 2 — new ports, one-composer routines (JamCracker-scale each)

Tim Follin (`tf.`) — prestige pick; Mark II / Darius Zendeh (`dz`, `mkiio`);
David Hanney (`dh.`), Howie Davies (`hd.`), Ashley Hogg (`ah.`),
Thomas Hermann (`thm.`), Steve Barrett (`sb.`). Small corpora each — batch them
to amortize the transpiler pipeline.

### Tier 3 — small synth formats

Beathoeven (`bvs/bss`), SynthDream (`sdr`), Voodoo Supreme (`vss`),
Dynamic Synthesizer (`dns`), EMS, Medley (`mso`), RiffRaff, SUN-Tronic/SynTracker,
SPL/TW, Silmarils (`mok`), Forgotten Worlds (`fw`), AMOS (`abk`),
Pokeynoise (`pn.`, Atari POKEY), Sierra AGI (`agi`).

### Never portable

`cus / cust / custom` — arbitrary 68k executables, no fixed format. Permanent UADE.

## Key caveat on "editable"

Many of the 54 native engines are **playback-only wildcards** (WASM plays the file;
no pattern parser/editor/serializer). Porting off UADE ≠ editable. If the goal is
editability, the larger backlog is upgrading EXISTING native engines to full
edit+export — bigger payoff than chasing Tier 2/3 stragglers.

## Recommended order

1. TFMX Pro/7V/HD extension (biggest corpus, engine exists)
2. Tier 1 routing/depacker sweep in one pass
3. Then decide: editability push on existing engines vs new Tier 2 ports

## File references

- Native registry: `src/engine/replayer/NativeEngineRouting.ts:90-826`
- UADE-only list: `src/lib/import/FormatRegistry.ts:2356-2386`
- UADE extensions: `src/lib/import/formats/UADEParser.ts:48-348`
- UADE engine + chip-RAM reader: `src/engine/uade/UADEEngine.ts`,
  `src/engine/uade/UADEChipRAMPatternReader.ts`
- Compatibility limits: `src/lib/formatCompatibility.ts:81-190`
