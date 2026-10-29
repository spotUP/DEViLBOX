---
date: 2026-10-29
topic: Per-channel insert effect (e.g. GranularFreeze) switched/ramped from pattern rows
status: research
---

# Per-channel FX from pattern rows

## 1. Effect letter clash

- Cells store NUMBERS, not letters: `TrackerCell.effTyp` "0-35" (src/types/tracker.ts:64,81-91). Letters are display only (XM base-36 via `'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'`, src/lib/export/XMExporter.ts:292).
- IT is converted to XM numbering at import: `mapITEffect` (src/lib/import/formats/ITParser.ts:494-560): IT A -> 0x0F, J -> 0x00, I -> 0x1D, V -> 0x10, W -> 0x11, IT M/N/P -> dropped to [0,0] (lines ~522-523, 509). S3M uses letter table S3M_COMMANDS (src/engine/effects/S3MHandler.ts:14-40, A..Z -> 0x01..0x1A) inside the handler; S3M cells are parsed from letters (S3MHandler.ts:127).
- Consequence: a "free letter" is really a free XM number. IT-origin numbers in use include 0x1D (T), 0x21 (X extra fine), 0x10/0x11 (G/H). Letters I(18) J(19) M(22) N(23) O(24) Q(26) U(30) V(31) as XM numbers are NOT written by ITParser. Native-format importers that write raw codes (Furnace stores Furnace codes in effTyp, readHandlers.ts:67-70 `notation==='furnace'`; Symphonie uses 0x50-0x54; ~253 files under src/lib/import/formats mention effTyp) reuse the same numbers with different meaning. So collision is per-format, not global.
- Replayer dispatch (src/engine/EffectCommands.ts:349-513 numeric cases 0x0-0x10, letter chain G H L P R T X S Z W at 517-662) is gated by format handlers. UNVERIFIED: complete list of numbers 18-31 written by all ~250 importers (I did not enumerate; needs a count from the parser builders, not grep).
- Verdict: an effect number is feasible only for a native-DEViLBOX numbering (e.g. 0x60+ like Symphonie 0x50-0x54 precedent, which avoids XM 0-35 entirely). Reusing a free letter in 0-35 risks silent triggering on imported XM/MOD/Furnace cells that happen to hold that number.

## 2. Dedicated column

- Extra effect columns are plain optional fields effTyp3..8/eff3..8 on TrackerCell (src/types/tracker.ts:85-91), "populated from Furnace imports". Referenced in: TrackerReplayer.ts:1046,1456,1594; renderer/TrackerCanvas2DRenderer.ts:194; renderer/worker-types.ts; lib/tracker/visibleChannels.ts:25; PatternAccessor.ts; lib/export/AutomationBaker.ts; channelEvidence.ts.
- Existing precedent for non-effect columns: cutoff/resonance/envMod/pan, probability (tracker.ts:97-104,115), UI `columnType` union (tracker.ts:495) and src/components/tracker/AutomationColumns.tsx.
- Persistence: CURRENT_SCHEMA = 26, MIN_LOADABLE 21 (src/lib/persistence/migrations/index.ts:27-35). New optional fields are additive: bump to 27 plus an idempotent step (or none if absent==empty). UNVERIFIED: the .dbx serializer path (did not locate; check cell serialization in useProjectPersistence / export code for a field whitelist, visibleChannels.ts:25 looks like one list).
- A new column needs: type field(s) (e.g. `fxSlot?`, `fxVal?` or reuse effTypN with a reserved range), serializer whitelist entries, schema bump, worker-types + TrackerGLRenderer/Canvas2D column layout and hit-testing, column-visibility toggle (visibleChannels), editor key input handler, replayer row-tick read (near TrackerReplayer.ts:1456 loop), PatternAccessor, MCP read/write (readHandlers.ts formatCell). Large: ~10 files.

## 3. Existing automation

- AutomationPlayer.applyAutomationParameter has targets `mixer.*` (volume, pan, mute, filterPosition, filterResonance; AutomationPlayer.ts:175-199), `dub.*` (:214), `global.*` (:262). No channel-insert-FX target (grep for fx/insert in the file: none).
- parameterRouter only has `masterFx.slotN.wet|param0` (src/midi/performance/parameterRouter.ts:639-646), master only; no channel-insert keys.
- ChannelEffectsManager has the primitives: updateEffectParams (:180, ramps wet over 20 ms), toggleEffect (:91). A `chfx.<slot>.wet|enabled|param` target would be a small addition in AutomationPlayer + router, drawn in the existing automation lane UI (curves keyed `[patternId][channel][parameter]`, AutomationPlayer.ts:49,128). UNVERIFIED: how the lane UI lists selectable params (AutomationParams.ts is chip-register oriented, SID etc.).
- GranularFreezeEffect has `freeze` (0/1) and `wet` (0-1) params (GranularFreezeEffect.ts:21,34) so on/off + wet map cleanly to a step/ramp curve.

## 4. Per-channel audio paths

- Chain input wiring: ChannelRouting.getChannelOutput (src/engine/tone/ChannelRouting.ts:274-300): input -> voiceDelay -> join -> `mgr.getChainInput(ch)` -> effects -> chainOutput -> HPF/LPF -> Tone.Channel (vol/pan) -> scope + masterInput (or the channel's strip destination / dub tap). Chain: ChannelEffectsManager.ts:121-164, MAX_CHANNEL_FX_SLOTS=4 (:19).
- Tone path (ToneEngine synths/samples, any engine whose voices feed ctx.channelOutputs[ch].input): inserts work natively.
- WASM engines: only those implementing IsolationCapableEngine get per-channel inserts, via ChannelRoutedEffectsManager (ChannelRoutedEffects.ts:149, 1030-1100): implementers found = LibOpenMPT (secondary module instances), FurnaceDispatch (:753), Hively (:56), UADE (:205). Shared pool of DEFAULT_ISOLATION_SLOTS = 4 worklet outputs total (ChannelRoutedEffects.ts:62,361,1036), minus sidechain consumers; channels beyond capacity are dropped with a warning (:1040) and their effects "stay on master chain" (:1014). So at most 4 channels get inserts on those engines.
- All other WASM replayers (any format engine not in the list above) mix to stereo with no per-channel tap: a pattern FX command would do nothing there. UNVERIFIED: whether other engines implement the interface via duck-typing (ChannelRoutedEffects.ts:1430 helper) - only the 4 explicit `implements` were counted.

## Recommendation

Automation lane first (`chfx.<slot>.wet|enabled|<param>` target in AutomationPlayer + parameterRouter), not an effect letter. Decisive trade-off: an effect letter is the only option that edits inline "on this row" Crystal Castles style, but it has no free number that is safe across ~250 importers (XM 0-35 collides per format) and would need a reserved native range (0x60+, Symphonie precedent) plus handler plumbing; a dedicated column gives clean semantics but costs ~10 files, a schema bump and renderer work. The automation lane reuses ChannelEffectsManager.updateEffectParams/toggleEffect, needs no cell/schema change, and matches the "freeze at chosen moments" use (step curve on `freeze`/`wet`). Limitation either way: only Tone-path channels and the 4 isolation-capable WASM engines (max 4 channels) can honour it. If inline-row editing is a hard requirement, build the reserved-range effect (0x60 'channel FX slot/param', param = value) as phase 2 feeding the same chfx router target.

## Decisions (2026-10-29, owner)

- **Effect picking: song effect table.** A numbered list of effect presets per song (00-FF), shown beside the instrument list and stored in .dbx. A channel uses a preset by number; the effect node is created on that channel's insert chain on first use. This replaces the per-channel 4-slot picking as the user-facing model.
- **Automation lanes are in scope.** The owner wants lanes to drive these effects (wet, freeze, other params over time), alongside row-exact switching.
- Consequence for the recommendation above: the lane target addresses a song-table preset on a channel (for example `chfx.<channel>.<preset>.<param>`), not a raw slot index. Any later pattern command feeds the same router target.
- Still open: whether a pattern command is needed at all once lanes exist, and if so, reserved native effect range (0x60+) vs dedicated column.
- Constraint carried forward: inserts only reach Tone-path channels and at most 4 isolated channels of LibOpenMPT / FurnaceDispatch / Hively / UADE. Other WASM engines have no per-channel tap.
- **Driver: lanes + pattern command together** (owner, 2026-10-29). Build both in one plan: automation-lane target per channel + song-table preset, and a pattern command in a reserved native effect range (0x60+) feeding the same router target. The command must render in all pattern render paths and survive .dbx save/load.
- **Lane expand/collapse** (owner, 2026-10-29): lanes expanded while editing, collapsed while playing. Extend the existing per-lane `isExpanded` state in src/components/tracker/AutomationLane.tsx:73 (local useState today) rather than adding a second mechanism.
- **Lane display refined** (owner, 2026-10-29): compact read-only lanes when not editing; editing one lane takes over the whole pattern editor area for that one channel, rows aligned to pattern rows. Same lane component at a larger size, not a second editor.
- **Lane editing/display scope** (owner, 2026-10-29): first build includes direct point editing (curve bend, auto step for on/off params, row snap, keyboard), shape stamps, knob recording, selection + clipboard via tracker history; real-unit readouts, channel colour fill + sparkline compact view, pattern command markers, ghost lanes. Full list in thoughts/spot/next-session-channel-fx.md.
- **Master FX overhaul in scope** (owner, 2026-10-29): one effect model (master = master channel in the song effect table, migrate existing master FX), send buses (reuse dub bus send pattern), macros + scenes, browser + reorderable cards + per-effect meters + level-matched bypass + tempo sync. Plan must be phased. Details in thoughts/spot/next-session-channel-fx.md.
