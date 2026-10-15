---
date: 2026-10-06
topic: Row preview (play row / play row and advance) for every tracker keymap and every engine
tags: [keyboard, playback, engines, ux]
status: draft
---

# Row preview

Owner, 2026-10-06: "we have keymaps for all popular trackers implement hotkeys that
match all trackers for this do it properly". Goal: navigate a pattern and preview
it row by row.

## Done means
- Every scheme in `public/keyboard-schemes/` (fasttracker2, impulse-tracker, octamed,
  openmpt, protracker, renoise) binds the row/note preview commands on the keys that
  tracker really uses, verified against that tracker's own documentation (cite it in
  the scheme commit). A tracker with no such command gets the closest documented
  equivalent or a written exemption here.
- Preview sounds exactly like playback for the song's real player: on an engine-played
  song (UADE, the WASM engines in `WASM_ENGINES`, Musashi eagleplayer runner) the row
  is rendered by that engine (seek to the row, run that row's ticks, stop), not by
  DEViLBOX's own instruments. TS-replayer songs keep the instrument path.
- One reachability test through the keyboard handler entry point proving the engine
  path ran for an engine-played song, plus unit tests where the logic lives.
- `npm run type-check` clean; only affected tests run.

## Existing pieces
- `src/engine/keyboard/commands/playRow.ts` - triggers row notes on ToneEngine
  instruments; skips cells with instrument 0; wrong for engine-played songs.
- `src/hooks/useGlobalKeyboardHandler.ts:192` play_row, `:652` play_line,
  `:653` play_row_and_advance (unbound anywhere).
- Bindings today: impulse-tracker NumpadEnter, renoise Return, openmpt Ctrl/Cmd+Enter.

## Checklist
- [x] R1 Research each tracker's real keys (row play, note play, step) - table below
- [ ] R2 Design the engine row-render path (seek + run N ticks + stop), per engine family
- [ ] R3 Implement for UADE
- [ ] R4 Implement for WASM engines / eagleplayer runner
- [ ] R5 Bind keys in all six schemes
- [ ] R6 Reachability test + unit tests
- [ ] R7 Owner listening check (manual)

## R1 - each tracker's real keys (researched 2026-10-06)

| Tracker | Play row, cursor stays | Play row and advance | Play note under cursor | Source |
|---|---|---|---|---|
| Impulse Tracker (Schism Tracker, which mirrors IT) | Shift+8 | 8 (note column only) | 4 and advance; Shift+4 stays | Schism `helptext/pattern-editor`: "4 Play note under cursor", "8 Play row"; `schism/page_patedit.c` `case 0: /* note */` -> `song_single_step(...); advance_cursor(!(k->mod & SCHISM_KEYMOD_SHIFT), 0)`. Original IT.TXT copy (herrnst/impulsetracker) has no keypad lines, so IT behaviour is taken from Schism. |
| ProTracker 2.3 (pt2-clone) | none | Enter (step play: plays the row, `song->currRow = song->row` after the row increase, so the cursor lands on the next row) | none | 8bitbubsy/pt2-clone `src/pt2_keyboard.c` Enter -> `editor.stepPlayEnabled = true; ... playPattern(song->currRow)`; `src/pt2_replayer.c` step-play handling after `song->row++` |
| OpenMPT | none | Ctrl+Enter "Play Row" (`kcPatternPlayRow` -> `OnPatternStep` -> `SetCurrentRow(GetCurrentRow() + 1)`) | none (typing a note key auditions it) | wiki.openmpt.org/Manual:_Keyboard_Actions "Play Row Ctrl + Enter Process and play only the events in the current row"; OpenMPT `mptrack/View_pat.cpp` `case kcPatternPlayRow: OnPatternStep()`, `PatternStep` |
| Renoise | none | Enter "Only play the line that the cursor is on (play step by step)" - advancing is inferred from "step by step", the manual does not state it | none | tutorials.renoise.com/wiki/Keyboard_Shortcuts |
| FastTracker 2 | none | none | none | 8bitbubsy/ft2-clone `src/ft2_keyboard.c`: playback keys are Right Shift (record), Right Ctrl (play song), Right Alt (play pattern); no step/row play. EXEMPT: left unbound (no FT2 key to match); owner decides whether FT2 gets a non-FT2 key. |
| OctaMED SoundStudio | none | none | closest "F Insert / play note at default pitch" (not a row preview) | OctaMED SoundStudio manual Appendix C (retro.pasz.nl mirror). EXEMPT: left unbound, same reason as FT2. |

Key-name facts found on the way (src/engine/keyboard): combos are built from `e.key`, so
every scheme binding spelt `Numpad*` or `Return` never matched (numpad Enter gives
`Enter`, numpad 8 gives `8`). Fixed at the formatter/loader level (R5).

## Status 2026-10-06
Implementing agent stopped mid-edit (weekly usage limit). Its half-finished change
(start-row request, rowSeek, engine seek methods in UADE/EaglePlayer worklets) broke
playback in the dev tab (every song started at row 20, frozen patterns). Removed from
the working tree; full copy on branch `backup-2026-10-06-row-preview-wip` (e3b3dd2fa).
Resume from that branch; R1 research table was not written yet.
