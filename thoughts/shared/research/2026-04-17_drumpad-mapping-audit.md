---
date: 2026-04-17
topic: drumpad-mapping-audit
tags: [drumpad, midi, mapping, audit]
status: draft
---

# Drumpad MIDI-Mapping Pipeline Audit

Scope: end-to-end map of how incoming MIDI notes become drumpad triggers,
with attention to the recent flurry of new DJ FX / transport / PTT actions
that may have regressed the path.

## 1. MIDI Input Surface

- Entry: `src/midi/MIDIManager.ts:310–337` — `handleMIDIMessage()` parses raw bytes at `:318` and dispatches to registered handlers.
- Parsing: `src/midi/MIDIManager.ts:442–449` — Note On/Off parsed into `{note, velocity, channel}`.
- Handler set: `src/midi/MIDIManager.ts:499–501` — `addMessageHandler()` adds callbacks to `messageHandlers` Set.
- The drumpad hook registers exactly one handler globally: `src/hooks/drumpad/useMIDIPadRouting.ts:499–580`. A `_midiRegistered` flag prevents double-registration. Inside, `triggerRef.current` / `releaseRef.current` are called — refs kept in sync each render so the closure always sees the latest function.
- Device keying: each incoming message is bucketed by `ch${channel}` string (`MIDIManager.ts:510–514`) to support per-device learn.

## 2. Pad-Routing Hook (`useMIDIPadRouting.ts`)

- Module singletons at `:188–192`: `_engine: DrumPadEngine | null`, `_noteRepeat: NoteRepeatEngine | null`, `_refCount`, `_heldPads`, `_pendingReleases`.
- Engine created on first hook mount at `:204–212` via `getOrCreateEngine()`. It also calls `useDrumPadStore.getState().loadFromIndexedDB(ctx)` to hydrate pad configs.
- Disposal at `:214–225` when `_refCount` hits zero. Clears timers, held pads, disposes both engines.
- View gating: `PAD_VIEWS = ['drumpad', 'dj', 'vj']` at `:185`. MIDI handler early-returns at `:506–507` when `activeView` is not in that set.
- State sync effects at `:258–293` push master level, mute groups, effect chains, note-repeat rate/enabled, BPM, bus levels into the engine.
- **No effect re-runs on `currentBank` change** — bank is consulted only inside the MIDI handler at trigger time to compute pad offset.

## 3. MIDI-Learn Flow

- Module-level learn state at `:66–84`: `_learningMode`, `_manualLearnIndex`, `_deviceMappings` (Map<deviceId, number[]>).
- Persistence: `saveLearning()` at `:87–98` writes `_deviceMappings` to `localStorage['devilbox_midi_pad_mappings']`; loaded at module init `:73–84`.
- Entry: `startMIDIPadManualLearn()` (`:125–134`) and `startMIDIPadAutoDetect()` (`:114–122`). Both exposed to `window` at `:178–184`.
- Collection in the MIDI handler at `:520–550`:
  - Auto mode: dedup-append to `learnedNotes`, auto-stop when length === controllerPadCount.
  - Manual mode: write note at `_manualLearnIndex`, increment, auto-stop at `maxPads`.
- There is also a `midiMappings: Record<string, MIDIMapping>` in `useDrumPadStore` (`src/stores/useDrumPadStore.ts:131`) which is **defined but never read/written anywhere**. Learn is device-scoped, not pad-scoped.

## 4. Trigger Path

- Note → pad at `:552–565`:
  - Learned notes table consulted first (`:555`).
  - Fallback: GM drum mapping — `padIndex = ((note - 36) % 16 + 16) % 16` (`:559`).
  - Bank offset applied: `padId = bankOffset + padIndex + 1` (`:565`).
- Dispatch at `:567–571`: `noteOn` → `triggerRef.current(padId, velocity)`; `noteOff` or velocity=0 → `releaseRef.current(padId)`.
- Inside the trigger path at `:337–420`: sample, synth, scratch, DJ FX, and PTT branches (see §5).

## 5. Action Dispatch

- Sample playback: `:382–385` — `_engine.triggerPad(pad, curvedVelocity)`.
- Synth trigger: `:387–420` — `getToneEngine().triggerNoteAttack()` with note; sample-only pads auto-release.
- Scratch actions: `:348–351` on trigger, `:453` on release — `SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.(bool)`.
- Vocoder PTT: `:353–356` on trigger (`setPTT(true)`), `:458` on release (`setPTT(false)`). Added 2026-04-14.
- **DJ FX dispatch** at `:359–380` — suspect zone:
  - Quantize-eligibility check at `:360–366` is a hardcoded list of `startsWith()` prefixes covering stutter / echo / ping-pong / tape-stop / brake. The newer oneshot actions (`fx_quantize_cycle`, `fx_slip_toggle`, `fx_keylock_toggle`) are NOT in this list.
  - `DJ_FX_ACTION_MAP[pad.djFxAction]?.engage()` at `:370` called with no `mode` check.
  - `_heldPads.add(padId)` at `:372` unconditionally, even for oneshot-mode actions.
- Note repeat: `:425–429` start / `:440` stop.
- `releaseAllHeld` at `:296–335`: stops repeats, disengages FX, releases PTT, stops pads, releases synth notes. For oneshot djFxAction pads this calls a no-op `disengage()` but still believes they're held.

## 6. Persistence

- Schema version constant: `src/stores/useDrumPadStore.ts:103` → `DRUMPAD_SCHEMA_VERSION = 18`. Version mismatch on load discards old data and loads factory presets (`:482–487`).
- `saveToStorage()` at `:451–469` serializes programs (pad name/level/tune/sample id/synthConfig/scratchAction/djFxAction/pttAction/effects) but NOT sample PCM.
- IndexedDB at `src/lib/drumpad/drumpadDB.ts:17–28` stores full DrumProgram JSON and per-sample PCM (two stores: `programs`, `samples`). App-version drives migration via `clearDatabase()` on schema bump.
- New action fields `scratchAction`, `djFxAction`, `pttAction` are all persisted. Factory presets (`src/types/drumpad.ts:346–577`) hardcode some action assignments; `createDJCompleteProgram` includes scratches + deck FX but not the newly added channel-mute / key-shift / quantize / slip / keylock / hot-cue / loop / transport / sync / crossfader-cut actions.

## 7. View-Specific Behavior

- **Drumpad view**: `src/components/drumpad/PadGrid.tsx:33` calls `useMIDIPadRouting()`. All MIDI paths + DOM/touch paths share the module-level `_engine`.
- **DJ view DJSamplerPanel**: `src/components/dj/DJSamplerPanel.tsx:86–108` creates its OWN local `DrumPadEngine` (`:93`) routed to `djEngine.mixer.samplerInput`. Does NOT call `useMIDIPadRouting()`.
- DJSamplerPanel trigger/release handlers at `:161–204` handle:
  - `scratchAction` (`:168`)
  - Sample playback (`:172`)
  - Note repeat (`:177`)
  - Sustain-mode mute (`:174`) and oneshot handling.
  - **Missing: djFxAction. Missing: pttAction.** These pads will not dispatch their actions via DJSamplerPanel's local path.
- Global MIDI handler (from `useMIDIPadRouting`) runs regardless of view. If it's mounted somewhere globally while the DJ view is active, MIDI notes trigger the main engine, not DJSamplerPanel's local engine. Conversely, DOM taps on DJSamplerPanel fire the local engine, so the same pad behaves differently depending on trigger source.
- VJ view: `PAD_VIEWS` includes `'vj'` but no VJ component confirmed to mount the hook.

## 8. Recent Commits Touching Drumpad/MIDI (last ~2 weeks)

| Commit      | Summary                                                      | Mapping impact                               |
|-------------|--------------------------------------------------------------|----------------------------------------------|
| e2e225f93   | DJ panic button — ESC silences FX/drumpads                   | Adds `dj-panic` listener on DJSamplerPanel; no mapping change |
| 2816b8470   | Channel mutes, key shift, quantize, slip, keylock actions    | New DjFxActionId values + factory fns; routing hook unchanged — new oneshot modes not consulted |
| b29285f16   | Hot cues, loop, transport, sync, crossfader-cut actions      | ~30 new DjFxActionId values; routing hook unchanged |
| 5560779ae   | Vocoder PTT as mappable drumpad action                       | `pttAction?: boolean` added to `DrumPad`; trigger/release wired in `useMIDIPadRouting`, NOT in DJSamplerPanel |
| 5b5db2f07   | Joystick modulates vocoder while PTT held                    | Reads PTT state; no mapping change |
| fc7cba6cb / 190f20987 | DJ MIDI knob order fixes                             | No drumpad change |
| 47bcf37ed   | Remove blue focus ring                                        | CSS only |
| 3e523f3c1   | Oneshot pads play to completion instead of cutting on release | Engine stop logic; sample playback only |
| 970c93358 / 4e0794aa0 | Reggae FX presets for sample pads, schema v18        | `createDefaultPadFX` applied to new pads — can change tail behavior but not mapping |

## Potential Regression Sites

### (1) DJSamplerPanel doesn't dispatch `djFxAction` / `pttAction`
- Evidence: `src/components/dj/DJSamplerPanel.tsx:161–204` — handlers only cover `scratchAction`, sample, note-repeat.
- Impact: in DJ view, triggering a pad assigned to any DJ FX action (stutter / echo / brake / channel-mute / quantize / slip / keylock / hot-cue / loop / transport / sync / crossfader-cut) OR Vocoder PTT does nothing via the DJ path. If the global `useMIDIPadRouting` handler is also mounted, it fires the main engine instead — same pad, wrong engine.
- Likely what the user sees as "can't map correctly now" for the new actions specifically.

### (2) Oneshot actions tracked as held pads
- Evidence: `src/hooks/drumpad/useMIDIPadRouting.ts:370–372` unconditionally adds every `djFxAction` pad to `_heldPads`. Action mode (`'oneshot'` vs `'momentary'`) is declared in `DjFxActions.ts` (`:1555, :1573, :1592`) but never consulted.
- Impact: oneshot pads remain in `_heldPads` until their note-off arrives. Panic / releaseAllHeld iterates stale entries and calls no-op `disengage()`. Not a trigger failure but a bookkeeping leak.

### (3) Quantize not applied to new oneshot actions
- Evidence: hardcoded `startsWith()` list at `:360–366` covers stutter / echo / ping-pong / tape-stop / brake only. `fx_quantize_cycle`, `fx_slip_toggle`, `fx_keylock_toggle` not included.
- Impact: when global quantize mode is on, these new actions still fire instantly instead of snapping to the beat/bar grid.

### (4) `midiMappings` in `useDrumPadStore` is dead code
- Evidence: `src/stores/useDrumPadStore.ts:131` — declared in `DrumPadState` but no reads/writes anywhere in the project.
- Impact: none currently, but future consumers may assume pads hold per-pad MIDI mappings. Learn is device-scoped only.
