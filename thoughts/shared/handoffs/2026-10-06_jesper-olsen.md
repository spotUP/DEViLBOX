---
date: 2026-10-06
topic: Jesper Olsen reversal - stopped at a safe point (usage limit)
tags: [handoff, jesper-olsen, formats]
status: draft
---

# Jesper Olsen handoff

Task: reverse JO to real data (owner 2026-10-06), same acceptance as Fred / Hippel ST / DSC.
Research: thoughts/shared/research/2026-10-06_jesper-olsen-format.md.

## Done (committed)
- JesperOlsenModule.ts (structures, codec, JoPlayer = L/G driver), jesperOlsenGrid.ts,
  jesperOlsenEffectGlyphs.ts, parser rewrite (detection Format-0 scan fix), route
  `jo` -> withNativeThenUADE (decoded grid, UADE + companion plays; Format 0/1 throw -> scan).
- jesperOlsenRoundtrip.test.ts (byte-exact, grid == driver reads, in-place write).
- jesperOlsen removed from the encoder ratchet fixtures (encodeCell throws; writeCell layout).

## Next (in order)
1. CI test `jesperOlsenGridMatchesPlayer.test.ts`: port scratchpad harnesses (Paula stream
   equality + voice-record equality c / c-1, see research doc) and a mid-song
   UADEChipEditor.patchPatternCell edit whose row is first read after the edit: UADE's Paula
   stream == JoPlayer on the edited bytes. Companion: addCompanions(mod, WantedTeam.bin from
   the song's dir); load hint 'jo.<name>'.
2. Playhead for L: TickGrid `rowTicks` (row r at player tick rowTicks[r]+1), TrackerSong
   field `uadePlayerRowTicks`, UADEEngine playerGrid; set uadePlayerTickGrid for L too.
   G already sets uadePlayerTickGrid (speed 3). Then a worklet test like
   dscPlayheadFollowsUade (needs addCompanionFile before load).
3. Renderer + xmConversions: show JO_EFFECT_GLYPH (0x80..0x8E) - now '?' in the grid.
   Sound Master owns 0x74..0x78; edit the same lines as its glyph hunk.
4. Exporter (decode original, apply writeCell runs for changed cells, encode) + exporter
   ratchet + EditableFormatRegistry entry.
5. Subsongs: uadeEditableSubsongs has no `orders` (grid per subsong needs re-parse); corpus
   files have 1 subsong; Modland lollypop-subgame has 14.
6. guldkornsexpressen (Format 0): routine inside the file - disassemble
   (m68k-elf-objdump -D -b binary -m m68k) from the BRA chain; asm InitPlayer `Older` path
   finds the song via the `$40FA` lea and `Mulu`.
7. Provenance row: B -> A once 1-3 land.
8. Decide: port bbmp jo C++ (GPL-3) as our own WASM engine (recommended in research doc).
