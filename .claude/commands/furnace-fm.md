---
name: furnace-fm
description: "Compose on Furnace FM chips (Neo Geo YM2610): channels, patches, and which effects reach the chip"
---

# /furnace-fm — Furnace FM chip composing

## Usage

`/furnace-fm` before writing a Neo Geo or other Furnace FM song.

## Workflow

1. Call `get_mcp_help` with `topic: "neo-geo-composing"`. It lists the effect commands that reach the chip (every code except Fxx, Bxx, Dxx, E6x) and those that do not.
2. Shape patches with `get_synth_config` and `update_synth_config` (configKey "furnace").
3. Keep each instrument on a channel of its voice kind: FM 0-3, SSG 4-6, ADPCM-A 7-12, ADPCM-B 13.
4. Write cells with `set_cells`; Cxx goes in effTyp 12 and eff, on a row with a note.
   For expression use the topic sections "Effects for expression" and "What the chip cannot do, and the trick that replaces it": the chip has no filter, echo or reverb, so echo is a second quieter delayed voice, a filter sweep is operator 1 level per row (12xx, effTyp 18), movement is LFO (10xy, effTyp 16) and feedback (11xx, effTyp 17), a chord on one SSG channel is arpeggio 0xy.
5. Check with `validate_pattern`. Call `stop` when done.

Source of truth: `server/src/ai/neoGeoComposing.ts`; doc `docs/formats/neo-geo-composing.md`.
