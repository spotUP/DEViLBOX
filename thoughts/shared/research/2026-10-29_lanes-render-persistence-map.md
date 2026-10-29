---
date: 2026-10-29
topic: Map of reusable pieces for automation lanes with full curve editing and a native 0x60+ per-channel effect toggle command
status: research
documentary: true
---
Paths are under src/ unless noted. Line numbers measured 2026-10-29. UNVERIFIED = not confirmed by reading.

## KEY COLLISION
effTyp 0x60+ is NOT free. Occupied native blocks (TrackerGLRenderer.ts:919-933): SunTronic 0x40-0x4F, SNX 0x60-0x62, Sound Player 0x63-0x69, Fred 0x70-0x73, Sound Master 0x74-0x78, Actionamics 0xA0-0xAF, Activision Pro 0xB0-0xB9, DW 0xC0-0xD4, Ben Daglish 0xD8-0xEC, Rob Hubbard 0xED-0xF2, Future Player 0xF3-0xFA, Music Assembler 0xFB-0xFE. Free gaps (by the glyph tables named in those comments; UNVERIFIED against the tables themselves): 0x79-0x9F, 0xFF, 0x3x is OPL, 0x50-0x54 Symphonie DSP. Glyph tables: lib/import/formats/*EffectGlyphs.ts.

## 1. Automation lanes UI
- components/tracker/AutomationLane.tsx (365 lines): `isExpanded` useState L73 (init `!compact`); collapsed render L242-256; expanded canvas L330-347 with onClick=handleCanvasClick, onPointerDown/Up/Move (L218 handlePointerMove) = pencil-style draw gestures; param menu L276-291; clear L319. Param list via hook `useChannelAutomationParams(channelIndex)` (hooks/useChannelAutomationParams, imported L9); type AutomatableParamInfo.
- components/tracker/AutomationLanes.tsx (620): overlay SVG per channel. Props channelWidths L58. Per channel: chOffset = channelOffsets[ch]-rowNumWidth, chWidth = channelWidths[ch] (L441-442, also L302); lane count from channelCurveGroups / channelReservedLanes, width reserve via automationLaneReserve(laneCount) (L449-452); svg width lw L529; container width calc(100% - rowNumWidth) L582. Lanes reserve right-edge area inside the channel column (not a separate view).
- components/tracker/MacroLanes.tsx (228): drawing overlay for macro values (cutoff, resonance...), activeLane state L71, uses TRACKER_COLUMN_PARAMS.
- components/tracker/AutomationColumns.tsx (247) + AutomationColumn.tsx (197): per-row value columns in the grid.
- Also: GlobalAutomationLane.tsx, GlobalLaneCurves.tsx, GlobalLaneHeader.tsx, useLaneEditing.tsx (shared editing hook, UNVERIFIED contents).
- Param catalogue: engine/automation/AutomationParams.ts (AutomationParamDef L1, groups L13, getParamsForFormat L295, per-chip getters L66-232). Synth param maps: midi/performance/synthParameterMaps.ts.
- Data model: types/automation.ts. AutomationCurve L27 {id, patternId, channelIndex, parameter:string, mode, interpolation, points[], enabled}. AutomationMode L5 = 'steps'|'curve'|'keyframes'. InterpolationType L7 = 'linear'|'exponential'|'easeIn'|'easeOut'|'easeBoth'; AutomationPoint L19 has per-point `curveType?` override. interpolateAutomationValue L73. AUTOMATION_PRESETS L133. No bezier handles exist.
- Store: stores/useAutomationStore.ts: `automation[patternId][channel][parameter]` index (AutomationData L65, rebuilt by rebuildAutomationIndex L172) over flat `curves[]`. API L81-165: addCurve/removeCurve/updateCurve, addPoint/removePoint/updatePoint/clearPoints, setPointCurveType, applyPreset, getAutomation, getValueAtRow, load/getCurves, global curves (addGlobalCurve L132), copyCurve/pasteCurve L149-151 (own curve clipboard, not tracker clipboard), flip/reverse/scale/offset/smooth/thin/humanize, editMode 'pencil'|'line'|'curve'|'select' L85, recordMode L163 (flag; consumers unverified). Live-bake of curve into cells at ~L182 (syncCurve... UNVERIFIED name).

## 2. Playback
- engine/AutomationPlayer.ts: class L63; processRow L431 / processPatternRow L465 (accepts fractional rows); applyParameter L158 (0-1 normalised; skips params under manual override via getManualOverrideManager; `mixer.*` targets L172+: volume -40..0 dB, pan, mute, filterPosition, filterResonance; then synth params); getCurrentValue L533; exportAutomation L551; singleton getAutomationPlayer L575.
- Ticked from engine/TrackerReplayer.ts applyAutomationForRow ~L1198-1210 (setPattern, setAutomationData(useAutomationStore.buildAutomationData()), processPatternRow(pattPos)); also engine/PatternScheduler.ts L75 (TS scheduler path, sub-row via processTick).

## 3. View swapping
- components/tracker/TrackerView.tsx: `viewMode` ('tracker'|'matrix'|'grid'|'pianoroll') from tracker/UI store (L160-161, setViewMode); render switch L498 (tracker) / L644 matrix / L646 `<GridSequencer channelIndex={gridChannelIndex}/>` / L648 `<PianoRollView channelIndex={gridChannelIndex}/>` / `: null`. A per-channel full-area lane editor plugs in as a new viewMode branch beside L646-648, reusing gridChannelIndex (effect L321 reacts to cursorChannelIndex in grid mode). View-mode toolbar L458-470.

## 4. Clipboard / history
- stores/useTrackerStore.ts: clipboard L317, trackClipboard L318, patternClipboard L319, cmdsClipboard L320; copySelection L348, paste L350, pasteMix L353, copyTrack L358. All TrackerCell[] only; grep "automation" in useTrackerStore.ts found nothing -> automation points do NOT participate.
- stores/useHistoryStore.ts: pushAction L87/125, pushMultiAction L95/128 with PatternChange{patternIndex,before,after}; undo/redo stacks L145-193. Pattern-snapshot based; no automation curves (grep "automation" empty).
- lib/tracker/clipboardSelectionScope.ts exists (UNVERIFIED role).

## 5. Knob / router / formatters
- components/controls/Knob.tsx: props displayValue L37, formatValue L43 (customFormatValue L89); paramKey prop (see docs/CONTROL_PATTERNS.md).
- midi/performance/parameterRouter.ts: routeParameterToEngine L881, routeCCToEngine L1011, hasRoute L1037, registerRoute L1051, subscribeToParamLiveValue L1336, fireParamLiveSubscribers L1356.
- "Record knob into automation": no code found. recordMode in useAutomationStore L163 is a flag; grep outside the store found only unrelated editor recordMode uses (useMIDIStore L547-553 is note recording). engine/automation/AutomationCapture.ts is a ring buffer of register-driven values for display (not knob recording). Manual-override manager (getManualOverrideManager) is the knob-vs-automation arbiter.
- Unit formatters: no central formatHz/formatDb found by grep of names (only test-runner.ts, BeatSyncDialog.tsx, ImportAudioDialog.tsx hit). Knobs format via per-use formatValue. UNVERIFIED: search for a shared formatter elsewhere (e.g. utils/*).

## 6. Effect column render paths (effTyp -> text)
- engine/renderer/TrackerGLRenderer.ts L894-955: loops effect columns 0-4 (effTyp..effTyp5). Chain: furnace notation (furnaceEffectText, lib/tracker/effectNotation.ts L50) -> 0x50-0x54 DSP letters D,E,C,L,X -> 0x30-0x3F OPL "~F/C/M/V" -> *_EFFECT_GLYPH lookups (SUN, SNX, SPL, FRED, SM, AST, AVP, DW, BD, RH, FP, MA) -> fallback `EFFECT_CHARS[effTyp] ?? '?'` + hex param. A value >= 0x60 not in any glyph table shows '?' + 2 hex digits.
- engine/renderer/TrackerCanvas2DRenderer.ts L407: same glyph chain (?? chained) then EFFECT_CHARS_2D, then '?'.
- workers/tracker-render.worker.ts and workers/readonly-pattern.worker.ts: no effTyp-to-text code found by grep (tracker-render.worker.ts L393-394 only hit-test columns); they drive the renderers above. engine/renderer/worker-types.ts: no effTyp field (grep empty). components/tracker/ReadOnlyPatternCanvas.tsx and PatternEditorCanvas.tsx reference effTyp (UNVERIFIED how). components/tracker/EffectCell.tsx, EffectPicker.tsx, CellContextMenu.tsx are DOM-side.
- Other formatters that need the new code: bridge/handlers/readHandlers.ts effectToString L66-75 (only knows 0x50-0x54; else `formatHex(effTyp,1)+formatHex(eff)` which prints 3+ chars for effTyp>=0x10, so a 0x60 command reads "60xx" ambiguously) and lib/xmConversions.ts L223-226 (DSP letters). Hit-test/caret: lib/tracker/cellHitTest.ts, caretGeometry.ts.
- Pattern: add NEW_EFFECT_GLYPH table in lib/import/formats/<name>EffectGlyphs.ts, then add a branch in GL renderer, 2D renderer, readHandlers, xmConversions (a renderer-parity test would be wise; sonix/fred glyph tests may be a model, UNVERIFIED).

## 7. Replayer dispatch
- engine/TrackerReplayer.ts: per-row `effect = row.effTyp ?? parse(row.effect)` L1380; Cxx handled L1449-1460 across effTyp + effTyp2..8 via array loop (L1453-1457 and again L1591-1595 for the tick path); L1537 effect read for later tick processing. Note effTyp2..8 exist (8 columns) while GL renderer draws 5.
- engine/EffectCommands.ts: EffectProcessor class L223, EffectState L89, EffectResult L170, EFFECT_REFERENCE L1202. Takes string commands ("A0F"), so a 0x60 native number has no mapping there (UNVERIFIED how processed effect strings are built from effTyp>=0x10).
- Symphonie 0x50-0x54 precedent: no replayer handling in TrackerReplayer (grep empty); they are display-only in TS (GL L909-912, readHandlers L71, xmConversions L223) and consumed by the native SymphonieEngine. So the TS replayer has no native-range precedent; closest precedent for native codes handled in the TS row loop is the Cxx multi-column loop above.

## 8. Save / load
- hooks/useProjectPersistence.ts: buildSavedProject L350 -> `{version, schemaVersion: SCHEMA_VERSION, savedAt, ...snapshotSong()}`; load gate L464-473 (MIN_LOADABLE_SCHEMA, migrateSavedProject). SavedProject has `automation?: AutomationCurve[]` L136.
- lib/song/snapshotSong.ts: `patterns: trackerState.patterns` L46 (whole pattern objects, no per-cell field whitelist seen -> new cell fields/effTyp values persist as-is; UNVERIFIED for IndexedDB path), `automation: automationState.curves` L87. Per-channel new data (e.g. effect-toggle state) would need a field on channel/pattern objects or a new snapshot key.
- lib/persistence/migrations/index.ts: MIN_LOADABLE_SCHEMA=21 L27, CURRENT_SCHEMA=26 L34, migrateSavedProject L44, steps are `if (fromVersion < N) {...}` blocks L44-80 (e.g. <26 runs migrateSunVoxModularInstruments L77-79); stamp L89. Additive changes may skip a bump (comment L82-87). Tests in lib/persistence/migrations/__tests__.
- .dbx import UI: components/dialogs/ImportDBXDialog.tsx (UNVERIFIED if separate from project format).

## 9. MCP
- Browser side: bridge/handlers/readHandlers.ts (formatCell L78, effectToString L66; used L163, L212, L643), bridge/handlers/writeHandlers.ts setCell L64-92 (effTyp/eff/effTyp2/eff2 only; effTyp3+ not accepted), setCells L94; dispatch table bridge/MCPBridge.ts L289-290 (`set_cell: setCell`).
- Server side: server/src/mcp/mcpServer.ts `server.tool('set_cell', ..., (p)=>call('set_cell', p))` L230-247; set_cells L251-267; ~163 tools registered at startup (server/src/mcp/index.ts L32). A new tool needs both: handler + MCPBridge.ts entry, and server.tool(...) in mcpServer.ts.

## 10. Channel colour
- types/tracker.ts L176 channel `color: string | null` (background colour field on channel), palette CHANNEL_COLORS L199 (null first). Separate local copies: components/tracker/PianoRollView.tsx L49, components/visualization/ChannelOscilloscope.tsx L17. Renderer side: engine/renderer/channelOverlayStyle.ts (UNVERIFIED).

## 11. Test hosts
- Reachability-style replayer tests exist under engine/__tests__: fredEditReachesReplayer.test.ts, actionamicsEditsReachPlayer.test.ts, futurePlayerGridEdits.test.ts etc. (format-specific; native-engine). Generic TS-replayer: __tests__/export-roundtrip.test.ts references TrackerReplayer; stores/__tests__/cellEditsHeadless.test.ts shows the mock pattern (vi.mock('@engine/TrackerReplayer'), store setCell asserts). Renderer reach tests: components/tracker/__tests__/*ReachesTheRenderer.test.tsx (dubDeckHeight..., fitAllChannels...) and hooks/__tests__/trackerPatternViewMainThreadReadsTheHeardRow.test.tsx. No test found that plays a row through the TS TrackerReplayer and asserts an effect state (UNVERIFIED; the plan likely adds one, modelled on fredEditReachesReplayer.test.ts).
