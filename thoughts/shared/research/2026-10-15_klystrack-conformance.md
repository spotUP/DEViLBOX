---
date: 2026-10-15
topic: Klystrack view conformance census (KLYS-CONFORM)
tags: [klystrack, format-view, conformance, duplicated-components]
status: final
---

# Klystrack view conformance census

Counted from the JSX of `src/components/klystrack/KlysView.tsx` (357 lines at b47a2c928), its children
`KlysPositionEditor.tsx` (133 lines) and `KlysInstrumentEditor.tsx` (355 lines), plus the engine/routing code the
view depends on (`KlysEngine.ts`, `wasmEngineRegistry.ts:146-180`, `NativeEngineRouting.ts:610-735`,
`KlysParser.ts`, `public/klystrack/Klystrack.worklet.js`, `klystrack-wasm/common/*.c`).

Reference views (best conforming): `JamCrackerView.tsx` (data hook `useJamCrackerData`, no ResizeObserver, no
per-view transport), `MusicLineView.tsx` (matrix seeks via `onSeek`, per-channel rows from the engine),
`HivelyView.tsx` (SongOrderMatrix through `HivelyPositionEditor`, main transport only, export through
`nativeExportRouter`, instrument editor registered in `SynthTypeDispatcher` editor mode `hively`).

House standards: the main transport (NavBar / FT2Toolbar Play Song / Stop) is the only transport; export goes
through `src/lib/export/nativeExportRouter.ts` (it already handles `KT` at :328); instruments are edited in the
instrument panel through `UnifiedInstrumentEditor` -> `SynthTypeDispatcher`; one order matrix
(`shared/SongOrderMatrix`); `PatternEditorCanvas` format mode for the grid (shared cursor, keyboard, follow,
VU meters); Tailwind token classes from the CLAUDE.md allowlist, no inline style or raw hex; full English labels;
`Button` / `CustomSelect` / `Knob` / `Toggle`.

## Elements KlysView rendered (13)

| # | Element | Standard | Gap |
|---|---------|----------|-----|
| E1 | Root `<div ref style={{...}}>`, inline font family/colours/size | token classes (`bg-dark-bg text-text-secondary font-mono`) | inline style |
| E2 | Toolbar `<div style>` 36 px | info bar with token classes | inline style, `const`-free copy of the 9-view toolbar (audit row 6) |
| E3 | `KT` label | full format name | abbreviation |
| E4 | Info text `Speed / Rate / Pat / Len / CH / 000/000` | full words | abbreviations; `Rate` showed the wrong header field; position showed a song row padded as an order index |
| E5 | Play/Stop raw `<button>`, hex `#e95545` / `#4a7c4e` | main transport only (Hively, JamCracker, MusicLine have none) | duplicate transport, raw button, raw hex |
| E6 | `Export .kt` raw `<button>` `bg-blue-800` | Export dialog -> `nativeExportRouter` (`KT` branch) | duplicate export path, raw colour classes |
| E7 | `Inst` raw `<button>` `bg-purple-700` (opens E13) | instrument panel | duplicate instrument surface, abbreviation, raw colours |
| E8 | Matrix container `<div style>` fixed height + overflow auto | matrix sized by SongOrderMatrix | inline style; double scroll container |
| E9 | `KlysPositionEditor` -> `SongOrderMatrix` with collapse state owned by the view (`useState(isMobile)`) | one matrix, no view-owned collapse (JamCracker/MusicLine) | "SEQUENCE (collapsed)" bar when the view state says collapsed; `onPositionChange` ignored (`_onPositionChange`), so a click on the matrix did nothing (column colours and the `Pat` / `Off` headers follow the house matrix convention, HivelyPositionEditor) |
| E10 | Content `<div style>` | token classes | inline style |
| E11 | `PatternEditorCanvas` format mode, rows = each channel's pattern at the position, `formatCurrentRow` = transport row (channel 0's pattern step) | grid row = what plays on every channel | KLYS-CHANNEL-ROW-OFFSET: a channel whose sequence entry starts at another song row (Ocean Loader III channel 3 at row 32) was drawn at channel 0's row |
| E12 | "Loading pattern data" placeholder; empty state with `text-ft2-text` / `text-ft2-textDim` | allowlist tokens | non-allowlist classes |
| E13 | Side panel `<div style>` 280 px: `bg-[#1a1a1a] border-[#222]` header, `Inst:` label, `CustomSelect` with `bg-[#111] border-[#333]`, `KlysInstrumentEditor` | instrument panel through `SynthTypeDispatcher` | duplicate instrument list + editor surface, raw hex |

## Behaviours (12)

| # | Behaviour | Standard | Gap |
|---|-----------|----------|-----|
| B1 | View effect loads the song into KlysEngine on mount and `engine.output.connect(destination)` | the engine is started and routed by `startNativeEngines`; a view reads | output bypassed the master chain and doubled the routed signal while playing (live: peak 1.01, 2892 clips per million); the worklet also set `playing = true` on load, so the song sounded before Play |
| B2 | Two `klysNative` writers: KlysView `onSongData` (nests FM fields) and `wasmEngineRegistry` onStarted (flat FM fields) | one builder, one writer | the registry writer, when it ran last, left `inst.fm` undefined for `KlysInstrumentEditor` |
| B3 | ResizeObserver + `size` state | none (SongOrderMatrix fills its parent) | measurement only fed the matrix width |
| B4 | `matrixCollapsed` state | none in the reference views | see E9 |
| B5 | `editPosition` local state next to `currentPositionIndex` | one source: the tracker position | two positions |
| B6 | `handleCellChange` mutates the store's step object in place (`(step as any)[key] = value`) | immutable store write + engine write | in-place mutation, `any` |
| B7 | `handleExport` own Blob download | `nativeExportRouter` | duplicate path (E6) |
| B8 | `showInstEditor` / `selectedInstrument` state | instrument store selection | duplicate (E7, E13) |
| B9 | Play/Stop through the transport (b47a2c928) | main transport only | duplicate control (E5) |
| B10 | Position and pattern reporting | engine -> coordinator -> stores, one subscription | parser header misread (songLength 0, order list of 1: every engine position rejected, matrix and pattern frozen); NativeEngineRouting subscribed KlysEngine twice and the generic subscription wrote `row = undefined` (fixed b63dfcc23) |
| B11 | Channel scopes and VU meters | per-channel stream via `DevilboxChannelStream` + `ChannelMeterFeed` (Hively) | no per-channel stream at all; meter level tested the wrong gate bit, always 0 (fixed 28847b4db) |
| B12 | Keyboard, cursor, follow-playback | `PatternEditorCanvas` format mode | conforming (no own handlers) |

## KlysInstrumentEditor (child, 355 lines)

| Gap | Standard |
|-----|----------|
| `ParamRow` uses raw `<input type="range">` + `<input type="number">` | `Knob` (CLAUDE.md control allowlist) |
| `BitfieldGrid` raw checkboxes | `Toggle` |
| Labels `Vib Speed`, `Vib Depth`, `Vib Delay`, `Vib Shape`, `PWM`, `Sync Src`, `LFSR Type`, `Prog Period`, `YM Env Shape`, `Oscillator (CYD_CHN_*)` | full English words |
| Reached only from KlysView's side panel | registered in `SynthTypeDispatcher` (editor mode) like `hively` / `jamcracker` |

## Gap count by category

| Category | Count |
|----------|-------|
| Duplicate controls (transport, export, instrument surface) | 3 (E5, E6, E7/E13) |
| Playback reporting / data path (position, scopes + meters, double writer, engine audio bypass) | 4 (B1, B2, B10, B11) |
| Grid model (channel row offset) | 1 (E11) |
| Matrix (view-owned collapse, ignored click) | 2 (E9, B4) |
| View-local state duplicating stores / measuring for the matrix | 3 (B3, B5, B8) |
| Inline styles / raw hex / non-allowlist classes | 6 (E1, E2, E8, E10, E12, E13) |
| Abbreviated labels | 2 (E3, E4) + instrument editor labels |
| Unsafe store mutation | 1 (B6) |
| Instrument editor controls (range/checkbox instead of Knob/Toggle) | 2 |

## Resolution

See the KLYS-CONFORM ledger entry in `thoughts/spot/todos.md` for the commits that closed each row.
