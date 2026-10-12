---
date: 2026-10-12
topic: PT-1210 (h0ffman's Amiga ProTracker DJ app) versus the DEViLBOX DJ view - keyboard map, features, what a PT-1210 user would need
tags: [dj, keyboard, pt1210, research, tracker-decks, ledger-PT1210-RESEARCH]
status: final
---

# PT-1210 for DEViLBOX

Research only. Ledger item PT1210-RESEARCH (`thoughts/spot/todos.md:399`). No code changed.

Sources read:
- PT-1210 at commit `98555b225bc35b961b5c18510a9ffe659acd6a94` (shallow clone, nothing built or run): `README.md`, `src/keyboard.c`, `src/action.c`, `src/input.c`, `src/gameport.c`, `src/cia.c`, `src/filesystem.c`, `src/pt1210.c`, `include/{input,state,cia,filesystem}.h`, and the 68k replayer `legacy/player.asm`, `legacy/vblank_int.asm`.
- DEViLBOX at `d0ceba30c`: `src/components/dj/DJKeyboardHandler.tsx`, `src/engine/keyboard/{KeyboardRouter,globalKeys}.ts`, `src/engine/dj/{DJActions,DeckEngine,DJBeatJump,DJBeatDetector}.ts`, `src/components/dj/Deck{Nudge,PitchSlider,LoopControls,PatternDisplay,TrackInfo}.tsx`, `src/engine/TrackerReplayer.ts`.

Permalink base: `https://github.com/djh0ffman/PT1210/blob/98555b225bc35b961b5c18510a9ffe659acd6a94/`. Not covered: the other `legacy/*.asm` files except where cited (UI, scopes, pattern renderer), which I did not read line by line.

---

## 0. Where the real key map lives

The README key tables are a summary and two entries are wrong against the source:
- README says "SHIFT LEFT = Hard nudge forward, SHIFT RIGHT = hard nudge back". The source binds Shift+Right to `nudge_forward_hard` (+6) and Shift+Left to `nudge_backward_hard` (-6) (`src/keyboard.c:31-32`). The README text is swapped.
- README lists `+`/`-`. The code binds `KEYCODE_EQUALS` and `KEYCODE_MINUS` (`src/keyboard.c:75-76`), i.e. the `=` and `-` keys. Shift+`=` is what produces `+` on a US layout, so on an Amiga keyboard "+" and "=" are the same physical key and the README is loose. This matters for a PC key map.

Everything below is from `src/keyboard.c` (binding table at lines 22-77 for DJ mode, 80-101 for file selector) and `src/action.c`.

### How PT-1210 input works (affects the preset design)
- Keys are polled once per vertical blank (50 Hz PAL) from a raw key state array, not as events (`src/keyboard.c:182-229`). Modifier bindings must precede unmodified bindings in the table so the longer combo wins (`src/keyboard.c:24`).
- Four press types (`src/input.c:30-72`): `ONESHOT` fires once; `REPEAT` fires every frame while held; `HOLD_ONESHOT` fires once after about 30 frames held; `HOLD_REPEAT` fires on press, waits about 32 frames, then fires every frame.
- Nudge works as a per-frame force: the VBlank handler zeroes the nudge, then keyboard processing sets it to +/-1 (or +/-6) while a nudge key is held, then recomputes the CIA tempo (`legacy/vblank_int.asm:36-47`, `src/cia.c:195-198, 240-263`). So nudge is "tempo bent by N BPM for as long as the key is down", and it stops the frame the key is released.
- Pitch (Up/Down) is `HOLD_REPEAT`: one 1-BPM step on press, then continuous stepping after about 0.6 s held (`src/keyboard.c:55-56`).
- Both Shift keys are bound separately (a FIXME at `src/keyboard.c:38` notes the duplication).
- A CD32 pad / joystick binding set exists as well (`src/gameport.c:30-59`), covered at the end of section 1.

---

## 1. PT-1210 complete keyboard map, with the DEViLBOX equivalent

Legend for the DEViLBOX column: Deck A key / Deck B key. "Missing" means no binding and no equivalent action reachable from the DJ keyboard handler (`DJKeyboardHandler.tsx`). "Conflict" means the PT-1210 key is already bound to something else in the DEViLBOX DJ view.

DEViLBOX DJ binding recap (`DJKeyboardHandler.tsx:97-433`; Ctrl combos at 66-95):
- Deck A: `Q` play/pause, `W` cue (Shift+`W` pitch +1 semitone), `E` cue to `songPos+1`, `R` set cue point, `A`/`D` nudge -2/+2 (Shift: -5/+5), `S` pitch reset (Shift+`S` pitch -1 semitone), `Z` line loop on/off, `X`/`C` loop size halve/double, `1`-`4` channel toggle (Shift: solo), `5` all channels on, `Tab` repitch lock.
- Deck B: `P`, `O`, `I`, `U`, `J`/`L`, `K`, `M`, `,`/`.`, `7`-`0`, `-` (all channels on), `\` repitch lock.
- Global: `Space` crossfader to centre, `F`/`G` crossfader, `T`/`Y` sync B-to-A / A-to-B, `` ` `` kill all decks, `F1`/`F2` headphone cue A/B, `F4` slip toggle (deck A only), `V B N` and `/ ; '` EQ kills, `H` quantize mode, `F5`-`F8` deck A hot cues 1-4 (Shift: 5-8), `F9`-`F12` deck B hot cues, `Ctrl+Z/X/C/V` and `Ctrl+M , . /` beat jumps (-16/-4/+4/+16), `Ctrl+1-4` and `Ctrl+7-0` Serato loops, `Esc` panic.

### 1a. DJ screen

| PT-1210 key | PT-1210 action (source) | DEViLBOX DJ equivalent | Conflict / note |
|---|---|---|---|
| `Help` (`KEYCODE_HELP` 0x5F) | `switch_screen`: toggles file selector vs DJ screen (`action.c:31-37`) | Missing. DEViLBOX has one DJ view with browser panels; view switching is `Ctrl+Shift+D/T` (`globalKeys.ts:56-59`) | PC/Mac keyboards have no Help key (Insert on PC, not present on Mac). |
| `Left` (held) | `nudge_backward`: -1 BPM while held (`action.c:69`, repeat every frame) | `A` / `J` = `nudgeDeck(-2, 8 ticks)`: a fixed 8-tick burst per keydown (`DJKeyboardHandler.tsx:132-138`) | Arrow keys are unbound in the DJ handler. DEViLBOX has a true held nudge (`holdNudgeDeck` / `releaseNudgeDeck`, `DJActions.ts:839-850`, used by the on-screen buttons in `DeckNudge.tsx:24`) but the keyboard does not use it: the router's keyup path is a no-op (`KeyboardRouter.ts:127-143`). |
| `Right` (held) | `nudge_forward`: +1 BPM while held (`action.c:64`) | `D` / `L` = `nudgeDeck(+2, 8)` | same as above |
| `Shift+Left` | `nudge_backward_hard`: -6 BPM (`action.c:79`) | `Shift+A` / `Shift+J` = -5, 16 ticks | magnitude differs (5 vs 6); not held |
| `Shift+Right` | `nudge_forward_hard`: +6 BPM (`action.c:74`) | `Shift+D` / `Shift+L` = +5, 16 ticks | same |
| `Up` (hold-repeat) | `pitch_up`: base-relative tempo +1 BPM, clamped 32..300 (`cia.c:200-204`, `CIA_MAX_BPM` 300 `cia.h:21`) | `Shift+W` / `Shift+O` = pitch +1 semitone (`DJKeyboardHandler.tsx:114-118`) | Unit mismatch: 1 BPM at 125 BPM is 0.8 percent; 1 semitone is 5.9 percent, about 7 times coarser. DEViLBOX range is +/-16 semitones (`DJActions.ts:1105`, `DeckEngine.ts:956-959`). |
| `Down` (hold-repeat) | `pitch_down` -1 BPM, min 32 (`cia.c:206-210`) | `Shift+S` / `Shift+K` = -1 semitone | same |
| `Shift+Up` (hold-repeat) | `pitch_up_fine`: +1/16 BPM; 16 fine steps roll into one coarse step (`cia.c:212-221`) | Missing. Slider resolution is 0.1 semitone by mouse only (`DeckPitchSlider.tsx:66`); keyboard has no fine step | |
| `Shift+Down` (hold-repeat) | `pitch_down_fine` (`cia.c:223-232`) | Missing | |
| `Space` | `play_pause`: kills DMA when pausing, stops/starts the CIA timer (`action.c:84-98`) | `Q` (A) / `P` (B) `togglePlay` (`DJKeyboardHandler.tsx:110, 175`) | Conflict: `Space` in DEViLBOX DJ = crossfader to centre (`:229-232`). Highest-cost conflict for muscle memory. |
| `Tab` | `toggle_repitch`: sample periods follow tempo on/off (`action.c:295`; `mt_tuneup` in `legacy/player.asm:1349-1368` scales each channel period by `base_bpm*16 / repitch_bpm`) | Nearest: key lock (`setDeckKeyLock`), reachable from `DeckTransport.tsx:56` and MCP only; no key bound | Conflict in meaning: DEViLBOX `Tab` = repitch LOCK (`:186-189`), which is PT-1210's `Backspace` function. Repitch ON with no lock equals DEViLBOX key lock OFF; repitch OFF equals key lock ON (tempo-only). See section 2 note on terminology. |
| `Delete` | `pitch_reset`: offset and fine to 0 (`action.c:59`, `cia.c:234-238`) | `S` / `K` = `setDeckPitch(0)` (`:140-148`); right-click on slider (`DeckPitchSlider.tsx:169`) | none |
| `Backspace` | `toggle_repitch_lock`: freeze repitch basis while tempo moves further (`action.c:301`, `cia.c:245-247`) | `Tab` (A) / `\` (B) `setDeckRepitchLock` (`DeckEngine.ts:1133-1142`) | Same behaviour, different key. DEViLBOX lock freezes the audible rate while the slider moves (SL-1200 style); PT-1210 lock freezes only the pitch basis while the tempo continues to move. Not identical: confirm in `DeckEngine.setRepitchLock` (`:1133`) which returns early from `setPitch` and so holds tempo too. |
| `` ` `` (grave) | `kill_sound_dma`: `mt_end()` silences DMA, player keeps running (`action.c:307`) | `` ` `` = `killAllDecks()` (`:244-246`, `DJActions.ts:921`) | Same key. DEViLBOX kills ALL decks; PT-1210 has one deck per machine. |
| `1` `2` `3` `4` | toggle channel 1-4 (`action.c:270-288`) | `1`-`4` deck A, `7`-`0` deck B (`:162-173, 238-250`) | Match for deck A. DEViLBOX channels are per deck, so the key must pick a deck. |
| `Shift+1..4` | solo channel (`action.c:250-268`: mask = that channel only) | `Shift+1..4` solo (`:164-168`) | Unconfirmed: the handler switches on `e.key.toLowerCase()`; on a US layout `Shift+1` reports `e.key === '!'`, so these branches may never match. I did not run it in a browser. The `normalized` event parameter is ignored (`:43`). |
| `5` | `unmute_all_channels` (mask 0x0F, `action.c:290`) | `5` (A) / `-` (B) (`:176-178, 252-254`) | Deck B's `-` collides with PT-1210 `-` (pattern back). |
| `F1` | `restart`: song position = cue pattern, row 0, reset delays, timer reset (`action.c:100-109`) | `W` / `O` = `cueDeck(cuePoint)` (`:120, 227`) | Conflict: DEViLBOX `F1` = headphone cue A (`:260-263`). Behaviour near-equivalent: DEViLBOX goes through `quantizeAction` so it may wait for a beat boundary (`DJActions.ts:247-278`, not traced to the end). |
| `F2` | `slip_restart`: arms "when the current pattern ends, go to the cue pattern instead of the next one"; second press disarms (`action.c:111-115`; consumed at `legacy/player.asm:495-498`) | Nearest `E` / `I` = `cueDeck(songPos + 1)` (`:124-126`). This jumps to the NEXT pattern immediately, not to the cue pattern at the boundary | Missing as a real feature. Conflict: `F2` = headphone cue B. |
| `F3` | `pattern_cue_set`: cue = current song position (pattern only, no row) (`action.c:117`) | `R` / `U` set cue point (`:128, 229`) | Conflict: none in the DJ handler (`F3` global combo exists in `globalKeys.ts:42` but no global handler is registered, see section 1c). |
| `F4` | `toggle_slip`: arms/disarms the slip ghost position (`action.c:229-248`) | `F4` toggles slip, deck A only (`:278-285`) | Same key, same purpose. Deck B has no slip key. |
| `F5` | `toggle_line_loop` (`action.c:194-227`) | `Z` / `M` (`:150-158, 262-270`) | Conflict: `F5` = deck A hot cue 1. |
| `F6` | `loop_decrease` (halve, min 1) (`action.c:171`) | `X` / `,` | Conflict: `F6` = hot cue 2. |
| `F7` | `loop_increase` (double, max 32) (`action.c:160`) | `C` / `.` | Conflict: `F7` = hot cue 3. |
| `F10` | `pattern_loop`: 3-state cycle start, end, off over song positions (`action.c:135-158`) | Missing. Engine support exists (`DeckEngine.setPatternLoop`, `:2183`; `TrackerReplayer.setPatternLoop`, `:1052`) but no DJ code calls it and the store fields `patternLoopStart/End` are never written (only default 0, `useDJStore.ts:241-242`, read by `DeckTrackOverview.tsx:43` and `workers/dj-waveform.worker.ts:211`) | Conflict: `F10` = deck B hot cue 2. |
| `=` | `move_forward_pattern`: song position +1 (clamped to song length) (`action.c:326-331`) | Missing as a key. Engine call is `cueDeck(songPos+1)` which `E`/`I` already use after a different semantic | No conflict for `=` itself. |
| `-` | `move_backward_pattern` (`action.c:345-349`) | Missing | Conflict: deck B all-channels-on (`:252`). |
| `Shift+=` | `move_forward_line_loop`: move the play position forward by loop_size rows, carrying into the next pattern (`action.c:312-324`) | Missing. Nearest `Ctrl+C` / `Ctrl+.` = beat jump +4 beats (`DJBeatJump.ts:21`) | In tracker mode without a beat grid, `beatJump` moves whole SONG POSITIONS by `round(beats)` (`DJBeatJump.ts:37-42`), i.e. +4 patterns, not rows. With a grid, tracker-mode behaviour is not traced (unconfirmed). |
| `Shift+-` | `move_backward_line_loop` (`action.c:333-343`) | Missing; nearest `Ctrl+X` / `Ctrl+,` | |
| `Ctrl+=` | `pattern_cue_move_forward`: move the cue pattern +1 (`action.c:122-127`) | Missing (cue point is only settable to the current position) | |
| `Ctrl+-` | `pattern_cue_move_backward` (`action.c:129-133`) | Missing | |
| `Esc` (hold ~30 frames) | `quit`, only allowed when the tune is not playing (`action.c:351-356`, `input.c:41-52`) | `Esc` = `djPanic()` (`:103-105`) | Different semantics; no quit concept in a web app. |

Not bound but defined: `pt1210_action_loop_cycle` (`action.c:182`, `action.h:37`) exists with no key (dead).

### 1b. File selector screen

| PT-1210 key | Action (source `keyboard.c:80-101`, `action.c:358-404`) | DEViLBOX equivalent |
|---|---|---|
| `Up` / `Down` (hold-repeat) | move selection 1 row | Arrow keys inside `DJPlaylistPanel` (`:1604` onKeyDown) and `DJModlandBrowser` (`:644-647`) when focused; not global to the DJ view |
| `Shift+Up/Down` | page up/down | not checked |
| `Left` | parent directory | Folder navigation in `DJFileBrowser.tsx` by mouse; keyboard unconfirmed |
| `Right` / `Return` | select (load tune and switch to DJ screen) | Load buttons / double-click; no "load into this deck" key (unconfirmed: no such binding in `DJKeyboardHandler.tsx`) |
| `F5` | rescan folder | Not applicable (browser file model) |
| `F9` | sort by filename, toggles asc/desc | `DJFileBrowser.tsx:42, 167` sort name/bpm/format by button; no keys |
| `F10` | sort by BPM, toggles asc/desc | `DJPlaylistSort.ts:173 sortByBPM(desc)` |
| `A-Z`, `0-9` | jump to first entry starting with that character (`fileselector.c:451-464`, `pt1210_fs_find_next`) | Not found in `DJFileBrowser`/`DJPlaylistPanel` (grep for type-ahead found nothing; unconfirmed beyond that) |
| `Esc` hold | quit | n/a |

Note the file list shows each module's estimated BPM next to its name (`fileselector.c:127`), computed from the file header without loading it (section 2).

### 1c. Other DEViLBOX key facts that affect a preset

- `KeyboardRouter` dispatches to a "global handler" first for keys in `GLOBAL_KEY_COMBOS` (includes `1`-`9`, `Space`, `Tab`, `F1`-`F12`, `Escape`, `globalKeys.ts:15-61`). `registerGlobalHandler` is defined (`KeyboardRouter.ts:183`) but has no caller anywhere in `src` (grep), so the global handler is null and these keys fall through to the view handler. Confirmed by grep for `registerGlobalHandler`; if a caller is added later, those keys would be taken before the DJ view sees them.
- Arrow Up/Down key repeats are swallowed by the router for performance (`KeyboardRouter.ts:72-76`). A PT-1210 style hold-to-repeat pitch step on `Up`/`Down` would get one event per physical press unless the preset reads key state (keydown/keyup) itself, or the router exception is widened for the DJ view.
- A separate `window` `keydown` listener in `App.tsx` handles `L` (live mode) and `1`-`9` (queue pattern in live mode). The router calls `stopPropagation` when a view handler consumed the key (`KeyboardRouter.ts:118-121`), so DJ keys `L` and digits should shadow these; not verified in a browser.
- The keyboard handler only knows Deck A and Deck B (`DJKeyboardHandler.tsx`), while the store, panels and engine have a Deck C (`DeckPatternDisplay.tsx:23` `'A' | 'B' | 'C'`).
- `useHistoryStore.ts:322` also listens for `Ctrl+Z` (undo); the DJ handler maps `Ctrl+Z` to beat jump. Same shadowing caveat as above.

### 1d. CD32 pad / joystick bindings (not keyboard)

`src/gameport.c:30-59`, port 1 only. DJ mode: D-pad Up/Down pitch, Left/Right nudge; Fast-Forward held = Up/Down change pattern, Left/Right hard nudge, Play+FF sets cue; Rewind held = Play restarts, Yellow toggles repitch, Blue halves loop, Up switches screen; Green slip; Button 1 line loop; Button 2 loop size up; Yellow pattern loop; Play/Pause play. This shows the designer's intended two-handed hierarchy: pitch/nudge on the D-pad, "shift layers" for pattern navigation.

---

## 2. Features and workflow: PT-1210 versus DEViLBOX

### 2a. How PT-1210 works (source facts)

- **One deck, real replayer.** It runs the original ProTracker replay routine (`legacy/player.asm`) driven by a CIA B timer; tempo is the CIA reload value `(1773447 << 4) / actual_bpm` (`src/cia.c:262`). BPM range 32..300 (`cia.h:20-21`). BPM display is 12.4 fixed point: coarse BPM in the high bits, fine in the low 4 bits (`cia.c:242-243`).
- **Pitch = tempo offset, in BPM, relative to the module's own tempo.** `offset_bpm` (signed coarse) + `fine_offset` (0..15, 1/16 BPM) + `nudge_bpm` (`cia.c:49-51, 242`). The display shows the new BPM and the percent difference (`legacy/ui.asm:261-330`, "+%" text at `:548`).
- **Repitch.** With repitch ON, every channel's Paula period is rescaled each tick so sample pitch follows tempo like vinyl: `period * base_bpm*16 / repitch_bpm` (`legacy/player.asm:1349-1368`), applied after `mt_music` (`cia.c:86-89`). It also handles arpeggio/vibrato via `n_altperiod` (changelog 2013-02-28, README). The README's own sentence "re-pitch the samples ... other instruments will still be in key" reads as the opposite of what the code does (the code shifts pitch with tempo); I trust the code and mark the README wording as ambiguous. Repitch OFF = tempo-only change, samples untouched.
- **Repitch lock** (Backspace): `repitch_bpm` stops following `actual_bpm` (`cia.c:245-247`), so the pitch is held while the tempo keeps moving. Net effect is a master-tempo-like mode with a chosen pitch.
- **Nudge** as described in section 0: transient, held, per frame, no position change.
- **BPM detection from the file header** (`src/filesystem.c:85-128`): reads row 0 of the first pattern, takes the first channel whose effect is `Fxx` with xx >= 0x20 as the BPM; default 125. A frames-per-beat override: if sample 31's name starts with `!FRM` followed by two digits (magic `0x2146524D`, `filesystem.h:47`), the displayed BPM is rescaled by `24 / frames` (`filesystem.c:127`, `cia.c:250-254`). This lets a mod with speed 6 and non-4-rows-per-beat patterns display a musical BPM.
- **Positions.** `mt_SongPos` (order index), `mt_PatternPos` (row*16). Cue = one song position (`mt_PatternCue`). F1 restarts at cue, F2 arms a jump to cue at the next pattern boundary ("pattern slip", `player.asm:495-498`).
- **Pattern loop.** Three-state over song positions; inclusive end; the replayer wraps `SongPos` from end+1 back to start (`player.asm:502-507`). While it is set, `Bxx` position-jump commands are ignored (`player.asm:1012-1014`).
- **Line loop.** Size 1,2,4,8,16,32 rows (default 4, `pt1210.c:71`); start snaps down to a multiple of 4 rows (`action.c:221`: `(PatternPos >> 4) & 0xFC`); the replayer resets the row to loop start when it reaches loop end (`player.asm:468-479`).
- **Slip.** On by default (`pt1210.c:73`). While slip is on, a ghost song position advances alongside real playback (`player.asm:433-447`, including honouring the pattern loop). When the line loop is deactivated with slip on, playback jumps to the ghost position (`action.c:198-212`); with slip off it carries on from the loop. Pattern loop interaction: ghost obeys pattern loop bounds.
- **Display.** Track-bar overview with pattern splits and a flashing near-end warning, 4-channel scopes (off when paused), pattern view, channel toggle indicators, pattern loop sprites, cue marker flash, large digital BPM with fine digit and percent difference, repitch / repitch-lock / slip lights (changelog; `legacy/ui.asm`). I read the changelog and grep'd `ui.asm`, not the whole renderer.
- **Robustness patches.** Samples with zero REPLEN get a patch on load (README FAQ); empty samples play a blank sample; `$F00` divide-by-zero fixed (changelog 2013-09-04).
- **File selector.** Scans a folder for `M.K.` / `M!K!` modules (`filesystem.h:35-36`, header magic at 1080), 200 tunes max (changelog 2013-09-23), shows BPM and file size, sorts by name or BPM.
- **Scope limits.** 4-channel PT mods only; no pre-listen / cue output, no mixer, no EQ, no sync button. It is a transport and a pitch fader; the mixer is the DJ's hardware mixer, one Amiga per deck.

### 2b. Gap table

"Have" = present in DEViLBOX DJ. "Partial" = exists with a different shape. "Missing" = no equivalent found. Where I did not trace to the end it says so.

| PT-1210 feature | DEViLBOX status | Evidence |
|---|---|---|
| Tempo-relative pitch in BPM with 1/16 BPM fine step | Partial: pitch is a semitone offset +/-16, 0.1 semitone slider resolution, effective BPM shown with percent | `DJActions.ts:1103-1114`, `DeckPitchSlider.tsx:66, 135-138`, `DeckTrackInfo.tsx:80-85`, `DJAutoSync.ts:415` |
| Repitch on/off (tempo-only vs pitch follows tempo) | Partial: key lock (master tempo) on/off exists in the engine and transport button; no key | `DeckEngine.ts:1062-1070`, `DeckTransport.tsx:56` |
| Repitch lock | Have (key + button); semantic nuance, see 1a | `DeckEngine.ts:1133-1142` |
| Held nudge by keyboard | Partial: held nudge exists for on-screen buttons; keyboard is fixed-burst per keydown | `DeckNudge.tsx:24`, `DJKeyboardHandler.tsx:132-138` |
| Hard nudge | Have (Shift), 5 vs 6 | `DJKeyboardHandler.tsx:133` |
| Cue pattern + restart at cue (F1) | Have: cue point + `W`/`O` | `DJKeyboardHandler.tsx:120, 128`, `DeckEngine.cue` `:936` |
| Set cue to current position | Have: `R`/`U`. Stores song position only (not row) | `:128-130` |
| Move the cue pattern +/- without playing there | Missing | no setter other than "current position" |
| Pattern slip: jump to cue at next pattern boundary (F2) | Missing | `E`/`I` jumps to next pattern immediately; no armed state |
| Pattern loop over song positions (F10) | Missing in DJ (engine + overview rendering exist, nothing sets it) | `DeckEngine.ts:2183`, `useDJStore.ts:104-105, 241-242` |
| Move pattern +/- | Missing as keys; `cueDeck(songPos+/-1)` available | `DJActions.ts:247` |
| Line loop 1-32 rows, quantised start | Have: sizes 1-32, start quantised down to a multiple of the loop size (PT-1210 quantises to multiples of 4 regardless of size) | `DeckEngine.ts:2169-2178`, `DJKeyboardHandler.tsx:40` |
| Move play position by loop-size rows | Missing | `Shift+=`/`Shift+-` have no analogue |
| Slip (ghost position, loop and scratch) | Have, tracker and audio; key `F4` for deck A only; default off (PT-1210 default on) | `DeckEngine.ts:2228-2262`, `TrackerReplayer.ts:1101` |
| Channel mute / solo / all-on for 4 channels | Have (see Shift-digit caveat, section 1a) | `DJKeyboardHandler.tsx:162-179` |
| Kill DMA / silence key | Have: `` ` `` | `:244` |
| Per-file BPM from header without loading | Partial: `detectBPM` runs on a loaded song and is more elaborate (time-ordered tempo walk, dominant speed/tempo, rows per beat); playlist analyser gives lists a BPM after analysis. No header-only scan, no `!FRM` tag | `DJBeatDetector.ts:29-44`; grep for `FRM` in `src` found nothing |
| `!FRM`nn frames-per-beat override in sample 31 name | Missing (rows-per-beat is derived automatically instead) | `DJBeatDetector.ts:33` |
| File selector with BPM column, sort by name/BPM, A-Z jump | Partial: browser and playlist with sort by name/bpm/format; no type-ahead found | `DJFileBrowser.tsx:42, 167`, `DJPlaylistSort.ts:173` |
| 200 tune folder in one list | n/a: playlists and Modland/HVSC browsers | `DJPlaylistPanel`, `DJModlandBrowser` |
| BPM display with fine digit + percent diff | Partial: BPM to 0.1 and percent offset are shown | `DeckTrackInfo.tsx:37, 80-85` |
| Track overview bar with pattern splits, loop sprites, cue flash, end warning | Partial: `DeckTrackOverview` and `DeckAudioWaveform` draw overview, cue and (never-set) pattern loop bounds. End-of-track warning flash: not checked | `DeckTrackOverview.tsx:43`, `dj-waveform.worker.ts:211` |
| 4-channel scopes | Have: `DeckScopes` and per-channel scopes on the pattern view | `DeckScopes.tsx`, commit `d0ceba30c` |
| Pattern view | Have (shared read-only canvas, follows heard row) | `DeckPatternDisplay.tsx:1-40` |
| Zero-replen / empty-sample load patches | Not checked; the loader goes through the normal module path | unconfirmed |
| Joystick / CD32 pad control | Partial: DEViLBOX has MIDI controller and Gamepad infrastructure elsewhere; not checked for the DJ view | `DJControllerSelector.tsx` exists, not read |
| Two physical decks = two machines | Have more: 3 decks, crossfader, EQ, key lock, sync, Auto DJ | store / panels |

### 2c. MOD-specific tricks to note (from the source, not the README)

1. **Cue is a pattern, not a time.** Everything (cue, slip, loop bounds) is song-order based; jumps always land on row 0 of an order slot (`action.c:100-109`). The DJ thinks in 64-row patterns. DEViLBOX's tracker-deck cue also stores a song position (`DeckEngine.ts:936-948`), consistent.
2. **Pattern slip as a mix tool.** F2 is the "drop on the one at the next phrase boundary" button: no quantise setting, the module's own pattern boundary is the quantise.
3. **Pattern loop disables `Bxx`.** While the loop is set, position jumps are ignored so a module's internal pattern jump cannot break the loop (`player.asm:1012-1014`). In DEViLBOX `setPatternLoop` is implemented in the TS replayer; whether `Bxx`/`Dxx` honour it was not checked.
4. **Slip default on.** Loops never lose phase; PT-1210 behaviour is "loops are free".
5. **Nudge is a tempo force not a position jump**, so it matches a phase drift while keeping the module's internal timing (DEViLBOX does the same, `DeckEngine.nudge` -> `replayer.setNudge`, `:1011-1019`).
6. **Fine BPM resolution matters** at the top end: at 125 BPM, 1/16 BPM is 0.05 percent, enough to beat-match a full 5-minute mix with no drift; a 0.1-semitone step is 0.58 percent, 12 times coarser.

---

## 3. What a PT-1210 user would need to feel at home (options only, no decisions)

Cost estimates are rough: S = under half a day, M = 1-2 days, L = several days. They assume the existing `registerViewHandler('dj', ...)` router.

| # | Option | What it covers | Cost | Risk / dependency |
|---|---|---|---|---|
| O1 | **"PT-1210" keymap preset** for the DJ view, chosen in settings: Up/Down pitch, Shift fine pitch, Left/Right held nudge, Space play/pause, Tab repitch, Backspace repitch lock, Delete pitch reset, F1-F7/F10 and `=` `-` as in section 1a, `` ` `` kill. Active deck selected by a focus key or by "the deck last touched" | Most of the 1a table | M, plus L if it must be user-editable | Needs a keymap data table instead of the hard-coded `switch` in `DJKeyboardHandler.tsx`. Conflicts with hot cues on F5-F12, PFL on F1/F2, crossfader on Space. The preset would have to replace those, and the existing layout would need an equivalent home for them. |
| O2 | **Single-deck focus model** (which deck do the PT-1210 keys control: A, B or the selected one) | Prerequisite for O1; PT-1210 has no deck concept | S-M | Design call on a deck-select key and a visible "selected deck" indicator |
| O3 | **Held-key nudge from the keyboard** (use `holdNudgeDeck` on keydown, `releaseNudgeDeck` on keyup) | Left/Right behaviour; also useful in the current layout (`A`/`D`) | S | Router keyup is a no-op (`KeyboardRouter.ts:127-143`); the preset or DJ handler must add its own keyup path and release on blur |
| O4 | **Fine pitch step and hold-repeat on keyboard** (BPM-denominated step, 1/16 BPM) | Up/Down, Shift+Up/Down | S-M | Router drops repeated Up/Down events (`KeyboardRouter.ts:72-76`); needs either key-state polling in the DJ view or an exception. Also a unit decision: BPM steps versus semitone steps. |
| O5 | **Pattern loop (start/end/off)** wired to a key and the overview (state already drawn but never written) | F10 | M | Engine `setPatternLoop` exists; need a store setter, a UI indicator and end-inclusive semantics; check `Bxx`/`Dxx` handling inside the loop (unconfirmed) |
| O6 | **Pattern slip (armed jump to cue at the next pattern boundary)** | F2 | M | New engine state in `TrackerReplayer` (equivalent of `pattern_slip_pending`) and a visible "armed" flash; consumed at order advance |
| O7 | **Cue pattern move +/-, pattern move +/-, move by loop size** | `Ctrl+=`/`Ctrl+-`, `=`/`-`, `Shift+=`/`Shift+-` | S-M | `cueDeck` already seeks; the cue setter and indicators need adding |
| O8 | **Slip default on and per-deck F4** | Matches PT-1210's "loops are free" feel | S | Changes default behaviour for every user unless gated by the preset |
| O9 | **Terminology preset / labels**: "Repitch", "Repitch Lock", "Pattern Cue", "Slip", "Pattern Loop", "Line Loop", "Nudge", "Hard Nudge", "Kill DMA" in tooltips and the on-screen help when the preset is active. The current UI says "key lock", "repitch lock", "cue", "loop" | Onboarding | S | Project rule: full English labels. Note PT-1210 "repitch" and DEViLBOX "key lock" are inverse concepts, so a naming mismatch could mislead; "Repitch" ON equals "Key lock" OFF. |
| O10 | **BPM display in BPM + fine digit + percent difference** | Display parity | S | Data exists (`effectiveBPM`, pitch percent); layout work in `DeckTrackInfo.tsx` |
| O11 | **`!FRM`nn frames-per-beat tag support** in `detectBPM` / the file header scan, so PT-1210-prepared modules show the same BPM | Crate compatibility with PT-1210 users' existing libraries | S | Only relevant if users have such tagged modules (the tag is part of this community's workflow per source, not per README). Not verified whether the DEViLBOX module loader preserves sample-31 names (likely). |
| O12 | **File list keyboard**: type-ahead A-Z/0-9, sort by BPM / name keys, Return loads into the selected deck | File selector parity | M | DJFileBrowser/Playlist panel keyboard handling is separate component code today |
| O13 | **Header-only BPM scan** of a folder so lists show BPM before loading | The PT-1210 file selector's BPM column | M | DEViLBOX's playlist analyser already produces BPM after analysis; a cheaper header scan would only cover the "first row Fxx" case and disagree with `detectBPM`; decide whether the two should be reconciled |
| O14 | **On-screen key help sheet for the active preset** | Discoverability | S | `KeyboardShortcutSheet.tsx` exists for the tracker; a DJ variant would reuse it (not read) |
| O15 | **Fix before any preset: `Shift+1..4` solo** if `e.key` is `!@#$` on US layouts, and the key bug where `-` is used for deck B all-channels | Prerequisite hygiene | S | Verify in a real browser first; this report only reasoned from the code |

Dependency order, if pursued: O2 -> O3/O4 -> O1; O5, O6, O7 are independent engine/UI items that each unlock one PT-1210 key; O9-O14 are optional polish.

---

## Open questions and unverified items
- Whether `Shift+1..4` solo works at all in the current DJ handler (US-layout `e.key` for `Shift+digit`). Not tested in a browser.
- Whether `quantizeAction` delays the `W`/`O` cue (compared to PT-1210's immediate F1): only the call site was read, not the scheduler (`DJQuantizedFX.ts:140+`).
- `beatJump` behaviour for tracker decks that have a beat grid (the no-grid branch was read; the grid branch beyond line 46 was not).
- Whether the replayer's pattern-loop path ignores `Bxx` while looping (PT-1210 does).
- Exact PT-1210 `legacy/ui.asm` display layout and the repitch behaviour with E-command/finetune edge cases; read at the grep level only.
- Where the Amiga keycode values map to PC keys: `Help` (0x5F), `Delete` (0x46), `Backspace` (0x41), `Tab` (0x42), `Esc` (0x45), `` ` `` (0x00), `=` (0x0C), `-` (0x0B) are from `include/keyboard.h`; PC equivalents are my mapping.
- The README is the project's only prose docs; it was read in full. No web search was done (not needed; the source is the authority).
