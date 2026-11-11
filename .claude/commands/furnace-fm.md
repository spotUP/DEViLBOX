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
5. Check with `validate_pattern`. Call `stop` when done.

Source of truth: `server/src/ai/neoGeoComposing.ts`; doc `docs/formats/neo-geo-composing.md`.
