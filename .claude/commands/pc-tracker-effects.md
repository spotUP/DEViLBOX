---
name: pc-tracker-effects
description: "Write effect commands in MOD / XM / S3M / IT style songs: effTyp numbers, parameter ranges, volume column, per-format differences"
---

# /pc-tracker-effects — PC-tracker effect commands

## Usage

`/pc-tracker-effects` before writing effects into a MOD, XM, S3M, IT or other standard-effect-set song.

## Workflow

1. Call `get_mcp_help` with `topic: "pc-tracker-composing"`. It lists every effect with the effTyp number the tools take, its parameter range, the volume column values, and what differs per format.
2. Write cells with `set_cells` or `fill_range`: effect in `effTyp` and `eff` (second column `effTyp2` and `eff2`). E-commands are effTyp 14 with the sub-command in the high nibble of `eff`.
3. Speed and tempo: Fxx (effTyp 15), 01 to 1F speed, 20 to FF BPM.
4. Check with `validate_pattern`. Call `stop` when done.

Source of truth: `server/src/ai/pcTrackerComposing.ts` (built from `src/utils/ft2EffectDescriptions.ts`); doc `docs/formats/pc-tracker-composing.md`.
