---
date: 2026-10-15
topic: Session handoff - klystrack editor finished, curves with live markers across the synth editors, CZ-101 and DX7 work, preset import, voice-to-notes plan
tags: [handoff, klystrack, curves, markers, cz101, dx7, opl3, furnace, preset-import, voice-to-notes]
status: final
---

# Handoff - 2026-10-15 (long session)

## Task(s)

1. Klystrack instrument editor (27 of 27 plan items) and everything the owner found while testing it: DONE, pushed, owner PASS (layout, knobs live, standalone instrument).
2. Realtime curves with LIVE voice markers in the synth editors (owner decision: markers required for every synth): klystrack, Tone.js family, DX7, OPL3, MdaJX10, Raffo, CalfMono, Amsynth, Tunefish, WaveSabre, Oidos pushed in `fc9d88df9`; SynthV1, TalNoizeMaker, ZynAddSubFX finished by an agent but UNCOMMITTED.
3. CZ-101: sound, release, retrigger, SysEx import, patches travel in songs, pickers on grids: pushed, owner PASS on release and import.
4. DX7: 246-bank attributed library, tuning fix (was 2 semitones sharp), full Simple UI rebuild (155 of 155 params, tabs, searchable library): library and tuning pushed; Simple UI rebuild and key/bridge fixes UNCOMMITTED.
5. Preset import: census and design done; ten pure parsers done (UNCOMMITTED, staged); the registry and UI wiring NOT started.
6. Voice-to-notes: plan written and committed, nothing built.
7. Open bug reports from the owner, being worked or waiting for details: Tone FM Synth "Bell lead" quiet after preset change, Furnace OPL ("OPL3 FM Bass" = synthType FurnaceOPL) silent on preset change, DX7 quiet after a voice change, MonoSynth "octave high" (not reproduced), DX7 "strange extra notes" (not reproduced on one key).

## Critical references

- Ledger (gitignored): `thoughts/spot/todos.md`, last ~25 lines. Trust it over this summary.
- Plans: `thoughts/shared/plans/2026-10-15-synth-ui-realtime-curves.md` (decisions D1 inside section, D2 markers required), `2026-10-15-klystrack-instrument-editor.md`, `2026-10-15-voice-to-notes.md`.
- Research: `thoughts/shared/research/2026-10-15_synth-curve-census.md`, `..._synth-preset-import-census.md`, `..._curve-coverage-after-wave1.md` (uncommitted, 30 of 49 reachable types have curves; next groups Tone leftovers, MdaDX10/MdaEPiano, CZ101).
- Shared curve code: `src/types/synthPanel.ts` (CurveDescriptor, marker.subscribe(onPosition, latestValues, instrumentId?)), `src/components/instruments/curves/*` (CurveCanvas, curveGeometry, commonCurveModels, per-synth models and marker mappers), `src/engine/voiceStatus/wasmVoiceStatus.ts` (WASM voice-status contract), `src/engine/tone/toneVoiceProbe.ts`, `DOMSynthPanel.tsx` + `synthPanelSizing.ts` (grids, widths).
- Owner policy (ledger): free community patch sets with no stated licence may be bundled WITH attribution; paid packs and manufacturer factory sets stay out of the repo.

## Recent changes (pushed up to fc9d88df9)

- Klystrack: editor (tabs Main / Program, KlysControls), 52 presets (`src/constants/klysPresets.ts`), curves + markers (`klys_get_channel_voice`, `watchVoices`), audition fixes (channel 31 muting, live instrument edits reach sounding channels, preview no longer starts the song via `klys_set_song_running`).
- Shared panels: `DOMSynthPanel` as tall as its sections, knob cells sized by label, toggles on a uniform grid, `CurveDescriptor` rendering; instrument list sidebar sized to content; collapsed list shows a vertical label; dub deck stays collapsed at boot (only the Bus button expands it).
- `formatChannelLayout` gutter double count removed (stretched format canvases showed a scrollbar).
- CZ-101: bank reduced to Init; `cz101Sysex.ts` decoder/encoder; `CZ101PatchBrowser` (Simple UI) and Hardware UI share `useCz101Patches`; user library store `devilbox-cz101-user-patches` v2; instrument carries `_cz101Tone` + `_cz101Name` so songs travel; release/retrigger/stale-envelope fixes in worklet and `UPD933Wrapper.cpp`.
- DX7: library `public/data/sysex/dx7/` (246 banks, manifest, ATTRIBUTION.md); pitch fix in `juce-wasm/dx7/dx7_bridge.cpp`.
- Furnace chips: live keys play on the instrument's preview channel (`chipChannelFor`), fixing alternating pitch on key spam.
- Tone.js synths: dead knobs wired through one options builder (`src/engine/tone/toneSynthKnobs.ts`).
- Routing: Tunefish / WaveSabre / Oidos open their layout editor (was the XRNS info panel).

## UNCOMMITTED work in the tree (180 entries) - commit in this order, BY PATH

Never `git add -A` / `git add .`. Excluded: `tal-noisemaker-wasm/build/**` (build output), `public/data/sysex/cz-pack-1/` (owner's PAID pack, must never be committed), `public/data/cmi-disks/SYSV19.IMD` (unknown origin, identical to tracked `data/cmi-disks/SYSV19.IMD`).

1. Curves wave 2 (SynthV1, TalNoizeMaker, ZynAddSubFX): layouts, engine classes, worklets, C++ + rebuilt WASM (`public/synthv1`, `public/tal-noisemaker`, `public/zynaddsubfx`), `*Curves.ts`, tests, the coverage research doc. Follow-ups were sent to that agent (TAL presets to normalised scale, SynthV1 delayBpm/dead keys/layout bounds widened to engine ranges, Zyn filterSustain, Monique bounds). Then the staged `src/lib/presetImport/**` parsers (their synthv1 test depends on the widened bounds; committing them first fails the pre-commit snapshot).
2. Tone FM volume fix (agent working: "FM Synth Bell lead" quiet; likely preset envelope units seconds vs ms and volume-offset tables).
3. OPL3 (standalone OPL3Synth): level inversion in RAD import, defaults, `applyConfig`, velocity attenuation, +11 dB gain; WASM rebuilt.
4. Furnace OPL silent-on-preset-change (agent working).
5. DX7: Simple UI rebuild (4 tabs, 155 of 155 params, `Dx7LibraryBrowser`, `dx7VcedEdit.ts`), key/bridge fixes (re-key releases the old voice, velocity clamp, keys outside 36..96 ignored), then the DX7 volume fix (agent working).
6. Klystrack standalone instrument (no song needed: `InstrumentConfig.klystrack`, `klys_new_song`, preview instrument path, WASM rebuilt) + the `.kt` export of standalone instruments (agent working).

## Learnings

- The pre-commit hook tests a SNAPSHOT of the staged files; a partial `git add` hides dependencies and fails tests that pass in the tree. Stage a self-consistent set. Tests that need gitignored assets (DX7 firmware ROM `public/roms/dx7/DX7-V1-8.OBJ`, vendored `third-party/*` sources) now skip when absent.
- The pre-push gate takes ~10 minutes; GitHub drops the idle SSH connection. Push over HTTPS: `git -c credential.helper='!gh auth git-credential' push https://github.com/spotUP/DEViLBOX.git main` in the background, with the machine IDLE (heavy parallel tests make `deckScopesFollowTheSongChannelCount` and `openSongEntryPoints` time out). Note `origin/main` locally goes stale after an HTTPS push; confirm with `git ls-remote origin main`.
- Disk: WASM rebuilds and test caches fill the disk (it hit 1.1 GB free and the gate died with a vitest "Startup Error"). Check `df -h /` first; I deleted a stale clone and a jest cache. Check before any rebuild (agents were told to stop under 3 GB).
- 16 `third-party/*` gitlinks are now declared in `.gitmodules` (`ignore = dirty`); local patches live in `third-party-patches/` with `scripts/third-party-patches.sh export|apply|verify`.
- Layouts can lie about engines: the curve agents found wrong index tables (Tunefish from param 26 up, WaveSabre order), inverted levels (OPL3), normalised-choice params written raw (TAL default patch was silent), LFO rate knobs setting BPM (SynthV1). Verify layout keys against engine code, not labels.
- Furnace OPL instruments use the Furnace engine (`FurnaceOPL`), not `OPL3Synth`; the owner's "OPL3" complaints may be either.
- Do not run `git stash` in the shared tree while agents edit; commits go by path.
- The MCP bridge drops when another DEViLBOX tab takes control; the owner must click "Take Control Here".

## Artifacts

Plans and research above; the CZ pack zip stays at `/Users/spot/Downloads/cz-pack-1.zip` and extracted copies in this session's scratchpad (paid, delete when done); scratch push logs in the scratchpad.

## Next steps (ordered)

1. Wait for / collect the running agents' reports (they report only into the session that spawned them): wave-2 follow-ups, Tone FM volume, Furnace OPL, DX7 volume, klystrack `.kt` export. If the session is cleared first, read each task's output file under `/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/8a1e2ada-7833-42c6-aaec-72755bdfd267/tasks/` (never `Read` the JSONL whole; grep the final report).
2. Commit the batch in the order above, run `npm run type-check` first, push over HTTPS with the machine idle, confirm `ls-remote` and the live `version.json` hash.
3. Owner test list (LOCAL `http://localhost:5174`, hard reload): curves and markers on Synth, MonoSynth, DX7, OPL3, Tunefish, WaveSabre; FM Bell lead level; Furnace OPL preset change; DX7 voice change level and key presses; fast key taps on an NES/Game Boy chip; standalone klystrack instrument and `.kt` export.
4. Preset import registry (design in the import census): registry keyed by synth type, one entry point for preset picker + `GlobalDragDropHandler` + file picker, `usePresetStore` v3 with attribution, wire the ten parsers, then Surge `.fxp`, Furnace instruments, SF2, D-50/VFX sysex.
5. Voice to notes (plan): V0 research then pure core (extract from `AudioToMidiModal`), recorder worklet, panel next to the pattern editor, rule-based beatbox then user-trained model.
6. Curve coverage: Tone leftovers (Organ, Pluck, DrumMachine, Sampler/Player), MdaDX10/MdaEPiano, CZ101; V2/WobbleBass/Monique/Odin2/Surge/Vital are not rendered by DOMSynthPanel (need a host first).
7. Small ledger items: klystrack buzz retrigger silence (C++), TAL/SynthV1 preset scale, Furnace polyphonic key preview (owner call), DOOR-SDK-TOUCH (other repo, different tab), OPL3 factory preset bank.

## Other notes

- Owner rules in force: advisor stance, short end-of-run report (Blocked on me / Changed / Found), no emoji, full English labels, tokens only, design-system components, reachability test per feature, root-cause fixes, no `--no-verify`, no AI attribution in commits, memory/feedback files (zsh arrays, one browser tab, MCP freely, no worktrees).
- The owner wants speed: up to 6 sonnet agents at once was explicitly requested (overrides the usual 2-agent cap); briefs must name disjoint file ownership and say "no commit".
- Unanswered owner questions: which exact MonoSynth preset sounds an octave high, what was played when the DX7 gave extra notes, which preset change silences Furnace OPL, whether to keep `benson-yamaha`/`benson-dx5*` DX7 banks and the 24 Yamaha ROM dumps in `public/roms/dx7/Patches`, what created `public/data/sysex/cz-pack-1/`, the Furnace chord-preview trade-off.
