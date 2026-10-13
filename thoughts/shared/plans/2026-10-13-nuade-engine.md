---
date: 2026-10-13
topic: nuade as one WASM engine - replace UADE playback format by format, dual engine for our own replayers
tags: [nuade, uade, amiga, replayers, wasm, engine-selector, reachability, dj, credits]
status: final
---

# nuade engine

Input: `thoughts/shared/research/2026-10-13_nuade-for-devilbox.md` (ad4e6c9ad), the NUADE-ENGINE entry in
`thoughts/spot/todos.md`, `docs/HARDWARE_UI_PATTERN.md`, memory rules "prefer our own WASM replayers" and "UADE is the
last resort", and the closest existing pattern: the generic eagleplayer runner
(`thoughts/shared/plans/2026-10-05-musashi-replayer-host.md`, status implemented).

## Owner decisions (2026-10-13, not re-litigated)

1. Vendor nuade (MIT, Daniel Collin / emoon) at a pinned commit as ONE WASM engine. It replaces UADE playback format by
   format (84 nuade players), each format behind its own UADE comparison test. Our parsers, encoders and engines stay.
   The engine boundary must let emoon's coming state/poke API slot in for editing later.
2. The formats with our own engine get BOTH engines, selectable per format, until measurements decide. Measurement
   tooling decides the default per format.
3. (Coordinator, 2026-10-13) Credit emoon and nuade wherever DEViLBOX credits third-party engines, ship the MIT licence
   text in the vendored tree and the notices, and credit nuade in-app for every format that plays through it.

## Done means

- `third-party/nuade` holds the pristine upstream tree at SHA `4900e597e6718d523e50bbaf6e1fc6ca41ebe683` with its
  LICENSE; `nuade-wasm/` builds `public/nuade/Nuade.{js,wasm}` from it; `.github/workflows/nuade.yml` rebuilds from
  committed sources and fails on stale artifacts (websid.yml pattern).
- One registry descriptor `Nuade` (`wasmEngineRegistry.ts`) plays every song that carries `nuadeFileData`, with per-voice
  outputs (dub sends, isolation, tracker scopes), position follow, VU, subsongs, mute mask, live module swap.
- One per-format engine choice (`'native' | 'uade' | 'nuade'`) in `useSettingsStore.formatEngine`, defaults from the
  measured table, read by ONE resolver used by the import route, the DJ render worker, the UI and the MCP.
- Every one of the 84 replace rows (R01-R84) ends DONE (default load plays on nuade, its comparison test green) or HELD
  (stays on UADE, `heldBecause` written in the table from a measured number). Every one of the 30 dual rows (AB01-AB30)
  has a measured default.
- The DJ render worker renders nuade formats through nuade with per-channel scope tracks and stems.
- nuade and emoon credited in `THIRD_PARTY_NOTICES.md`, `README.md`, the vendored LICENSE, and in-app per song.
- ONE reachability test drives `parseModuleToSong` -> `startNativeEngines` -> the real worklet + WASM, with a sentinel.

## What exists (read for this plan, with paths)

- **Generic runner pattern to copy:** `src/engine/eagleplayer/eaglePlayerFormats.ts` (format table with
  `uadeEnvelopeCorrelation`, `isDefault`, `heldBecause`), `src/engine/eagleplayer/EaglePlayerEngine.ts`
  (extends `WASMChannelOutputsEngine`, worklet `public/eagleplayer/EaglePlayer.worklet.js`, messages `init`,
  `loadModule`, `play`, `stop`, `pause`, `setSubsong`, `setMuteMask`, `writeModule`; out `ready`, `moduleLoaded`,
  `position`, `oscData`, `songEnd`, `error`), `src/lib/import/parsers/withEaglePlayer.ts` (`playOnEaglePlayer`: module
  bytes + player id onto the song, UADE fields off, UADE synths to Sampler, 'UADE' grid tag to 'MOD'),
  `tools/eagleplayer/eagleCompare.ts` (100 ms mono-sum envelope correlation vs UADE wasm), 
  `tools/eagleplayer/scaffold-format.ts`, `src/engine/__tests__/eaglePlayerPlaysFormats.test.ts` (watchdog render in a
  worker, > 0.95 vs UADE, default load proven through `parseModuleToSong` + `playingEngineFor`).
- **Registry:** `src/engine/replayer/wasmEngineRegistry.ts` - descriptors, `shouldActivate` (the file data decides),
  `playsOnDedicatedEngine`, `songFromStores`; `liveSwap` + `engineModuleSwap.ts` + `editedModuleForPlay.ts` (edits reach
  an engine by swapping the edited module in); `src/engine/replayer/NativeEngineRouting.ts:115 playingEngineFor`,
  `:290 startNativeEngines`.
- **Per-voice outputs:** `src/engine/wasm/WASMSingletonBase.ts:290 WASMChannelOutputsEngine`,
  `channelOutputNodeOptions(voices)`, `worklets/channel-outputs.js`.
- **Per-format engine preference:** `src/types/formatEngine.ts` (`FormatEngineChoice = 'native' | 'uade'`,
  `FormatEnginePreferences`, ~150 keys), `src/stores/useSettingsStore.ts:122` (defaults), `:320 setFormatEngine`,
  persist `version: 13` with migrations; consumed by `src/lib/import/parseModuleToSong.ts:27` and the route wrappers in
  `src/lib/import/parsers/withFallback.ts` (`withNativeDefault`, `withNativeThenUADE`, `injectUADEPlayback`).
  **No component and no MCP tool calls `setFormatEngine` today** (grep over `src/components`, `src/bridge`,
  `server/src` 2026-10-13: only the store and its tests). So every persisted `formatEngine` value is a default, never a
  user choice. Re-check this before NS-3 (it decides the migration).
- **Song/format store:** `src/stores/useFormatStore.ts:146-154` (eaglePlayer fields), `src/engine/formatFileDataFields.ts`
  (`FILE_DATA_FIELDS`, guarded by `src/lib/export/__tests__/fileDataFieldsComplete.test.ts`),
  `src/lib/export/nativeExportRouter.ts`, `src/lib/export/exporters.ts`.
- **DJ:** `src/workers/dj-render.worker.ts:1504` dispatch (Amiga -> `renderWithUADE`, per-channel scope tracks and
  monoStem stems), `src/engine/dj/DJPipeline.ts`, `src/engine/dj/channelScopeTrack.ts`.
- **Comparison batch pattern:** `tools/uade-audit/corpus-sweep.ts` (resumable, `--only`, row written on completion,
  `--fresh`), `tools/uade-audit/uadeRenderCore.ts renderFileToSamples`.
- **MCP:** `server/src/mcp/mcpServer.ts` (`server.tool(...)`), `src/bridge/MCPBridge.ts` dispatch table,
  `src/bridge/handlers/readHandlers.ts:1540 getFormatState` (reports `playingEngine`).
- **Credits surfaces:** `THIRD_PARTY_NOTICES.md` (sections per engine, `### UADE` at :189), `README.md:42-52`
  (third-party paragraph), in-app per-engine text in `src/components/instruments/controls/WasmInfoEditor.tsx:17
  FORMAT_INFO` (shown for `wasm-info` synth types, `UnifiedInstrumentEditor.tsx:191-202`). The Settings About tab
  (`SettingsModal.tsx:793`) has no credits list, so none is invented there.
- **Tests in CI:** `test:ci` includes the whole `src/engine/__tests__/` directory and `src/stores/__tests__/`; new tests
  go there or get added to the `test:ci` list explicitly.

### nuade today (pinned SHA, read from the research copy in this session's scratchpad and GitHub API)

- Upstream `emoon/nuade`: 5 commits, all 2026-10-13, HEAD = `4900e597e` = the pin. **0 issues, 0 PRs** (GitHub API,
  2026-10-13). No write/poke API is published or announced in the repo.
- Host API (`include/nuade/nuade.h`): `nuade_open_ex` (memory + custom `NuadeIo` for companion files + forced player),
  `nuade_start`, `nuade_render(stereo, voices[], frames)` (per-voice mono buffers), `nuade_position`, `nuade_seek`
  (restart + silent render), `nuade_duration`, `nuade_scan`, `nuade_snapshot` (ring of 64 tick snapshots: position
  order/pattern/row/tick/speed/tempo + per-voice note/instrument/volume/pan/pitch), `nuade_tracker_info/cells`,
  `nuade_events`, `nuade_vu`, `nuade_scope` (4096 frames), `nuade_set_repeat_count`, `nuade_set_stereo_separation`,
  `nuade_meta`, `nuade_instrument_name`.
- **State exposure today:** `nuade_player_data(song)` + a typed accessor in **all 121 players** (`<id>_from_nuade`, e.g.
  `sonix_from_nuade`, counted from the source); `dump_state` hook in 3 players (sonix, deltamusic2, instereo2). The
  display hooks are read-only by contract (`player.h:128`). `NUADE_PLAYER_API_VERSION 2`.
  -> The boundary below exposes the typed state through a capability probe; writes slot in when upstream adds them.

## Design

### D1 Vendoring (pristine, pinned)
- `third-party/nuade/` = upstream tree at the pin, unmodified, including `LICENSE`, `THIRD_PARTY_NOTICES.md`,
  `docs/players.md`. Fetched with `gh api repos/emoon/nuade/tarball/<sha>` (no clone; ~11 MB unpacked, disk has ~1.5 GB).
- `third-party/nuade/UPSTREAM.md` records repo URL, SHA, date, tarball sha256, and "DEViLBOX changes: none; our code is
  in nuade-wasm/". Any needed fix goes upstream as a PR and, until merged, as a patch file in
  `nuade-wasm/patches/NNNN-*.patch` applied by `build.sh` (never edits in `third-party/nuade`).
- `third-party/nuade/update.sh <sha>` re-fetches, rewrites UPSTREAM.md, and prints the `players/<id>` dirs that changed
  (`git diff --stat`), so a bump re-runs only those formats' comparisons (§6a).

### D2 Build
- `nuade-wasm/CMakeLists.txt`: `add_subdirectory(../third-party/nuade nuade)` with `NUADE_PLAYERS=all`, adds
  `nuade-wasm/src/nuade_wasm.c` (our shim), output `public/nuade/Nuade.js` + `Nuade.wasm`, MODULARIZE
  `createNuade`, `ENVIRONMENT=web,worker`, `FILESYSTEM=0`, `ALLOW_MEMORY_GROWTH=1`, `-O2`, exported runtime
  `HEAPU8,HEAPF32,UTF8ToString,stringToUTF8,lengthBytesUTF8` (EaglePlayer CMake as template).
- `nuade-wasm/build.sh`: `emcmake cmake -S nuade-wasm -B nuade-wasm/build && cmake --build nuade-wasm/build`; applies
  patches if any. Build dir is gitignored.
- `.github/workflows/nuade.yml`: copy of `websid.yml` - paths `third-party/nuade/**`, `nuade-wasm/**`,
  `public/nuade/Nuade.wasm`, `public/nuade/Nuade.js`, the workflow; staleness check (sources changed but
  `public/nuade/Nuade.wasm` not); install emsdk; run `nuade-wasm/build.sh`; report byte drift without failing.
- Size budget: research measured 1.76 MB uncompressed for all 121 players; the engine is lazy (`dynamicResolver`), so
  no startup cost. Gate: Nuade.wasm <= 2.5 MB.

### D3 Shim `nuade-wasm/src/nuade_wasm.c` (C exports, one song at a time per instance)
- `nw_init(sampleRate)`, `nw_add_file(name, ptr, len)` / `nw_clear_files()` (memory `NuadeIo` for companions, same
  role as `ep_wasm_add_file`), `nw_open(ptr, len, name, playerId)` (forced player via `nuade_player_find`; returns
  error text via `nw_last_error()`), `nw_start(subsong)`, `nw_render(framesPtr, voicesPtr, frames)` -> flags,
  `nw_voice_count()`, `nw_subsong_count()`, `nw_default_subsong()`, `nw_position()`, `nw_seek(frame)`,
  `nw_snapshot(frame, outPtr)` (packed struct: order, pattern, row, tick, speed, tempo + per voice note, instrument,
  volume, pan, active), `nw_vu(outPtr, cap)`, `nw_set_repeat(n)`, `nw_set_mute_mask(mask)` (zeros the voice in the
  mix in the shim, keeps the voice buffer for isolation), `nw_set_separation(x)`, `nw_meta(key)`,
  `nw_instrument_name(n)`, `nw_player_id()`, `nw_player_name()`.
- **Edit slot (owner decision 1):** `nw_caps()` returns a bitmask: bit0 `STATE_READ` (typed `<id>_from_nuade` state
  readable via `nw_state_read(offset, len)`), bit1 `CELL_WRITE`, bit2 `INSTRUMENT_WRITE`, bit3 `MODULE_WRITE`. At the pin
  only bit0 can be set. `nw_cell_write(...)`, `nw_instrument_write(...)` exist and return `-ENOSYS` until upstream
  publishes a write API; when it does, they forward to it and set the bit. No DEViLBOX-side pokes into player structs
  (they are upstream-private and would break on every bump).

### D4 TypeScript engine `src/engine/nuade/NuadeEngine.ts`
- `class NuadeEngine extends WASMChannelOutputsEngine implements SubsongPlayer`, singleton like EaglePlayerEngine;
  worklet `public/nuade/Nuade.worklet.js`, node `channelOutputNodeOptions(voices)` with `voices = 8` max declared (the
  largest nuade voice count in the 84 rows; NS-0 measures the real max from `nw_voice_count` over the corpus and sets
  it), output 0 to `this.output`, voice buffers handed to `DevilboxChannelOutputs` (dub sends 5.., isolation 1..4).
- Methods: `loadTune(bytes, playerId, fileName, subsong, companions)`, `play`, `stop`, `pause` (true pause, render
  skipped), `setSubsong(i)` via `subsongRequests` (EaglePlayer pattern), `setMuteMask(mask)`, `swapModule(bytes)`
  (liveSwap: open the edited bytes, `nw_seek` to the current frame, continue), `onPosition(cb)`, `setGrid(song)`,
  `capabilities` (from `nw_caps`), `editPort: NuadeEditPort | null`.
- `NuadeEditPort` (in `src/engine/nuade/nuadeEditPort.ts`): `{ caps; setCell?(p,r,c,cell); setInstrumentParam?(...) }`;
  `null` while `CELL_WRITE` is off. The registry descriptor sets `gridCellEdits` only for players whose caps have
  `CELL_WRITE` - evaluated at load, so the future API turns on per player with no routing change.
- **Message protocol** (worklet port, all typed in `src/engine/nuade/nuadeProtocol.ts`):
  - in: `init {wasmBinary, jsCode, sampleRate}`, `loadModule {bytes, playerId, fileName, subsong, companions[]}`,
    `play`, `stop`, `pause`, `setSubsong {index}`, `setMuteMask {mask}`, `addIsolation`/`removeIsolation` (base),
    `swapModule {bytes}`, `seek {frame}`, `setStereoSeparation {value}`, `requestState {offset, len}`.
  - out: `ready`, `moduleLoaded {voices, subsongs, defaultSubsong, playerId, playerName, meta, instruments, caps}`,
    `subsongStarted {index}`, `position {frame, order, pattern, row, tick, speed, tempo}` (once per tick snapshot that
    changed row, read with `nw_snapshot(heardFrame)` so the display never runs ahead), `vu {levels[]}` (every 2nd
    quantum batch, ~20 Hz), `oscData {channels, frame, sampleRate}` (same shape EaglePlayer posts to
    `useOscilloscopeStore.updateChannelData`), `songEnd`, `swapDone {ms}`, `error {message}`.
- **Position follow:** extract the tick-to-grid mapping now inside `EaglePlayerEngine.setGrid` into
  `src/engine/replayer/tickGridFollow.ts` and use it from both engines (no copy). Rows players whose `order/row` match
  our DIRECT grid (verified per format in the rollout gate) follow by order/row; all others by tick.
- **VU:** `vu` messages feed the same store the EaglePlayer/UADE meters read (`get_audio_level` must see it: the
  SunTronic native-meter blind spot is a known trap; NE-9 proves it through the MCP getter).

### D5 Registry descriptor, song fields, persistence
- `WASM_ENGINES` entry `Nuade` (synthType `NuadeSynth`, `fileDataKey: 'nuadeFileData'`, `loadMethod: 'loadTune'`,
  `getLoadArgs: s => [s.nuadePlayerId, s.nuadeFileName ?? s.name, s.nuadeSubsong, s.uadeCompanionFiles]`,
  `supportsPause/Resume: true`, `needsDirectRouting: true`, `liveSwap: true`, `onStarted: setGrid`), placed **ahead of
  `UADEEditable` and after `EaglePlayer`**.
- `TrackerSong.nuadeFileData`, `nuadePlayerId`, `nuadeFileName`, `nuadeSubsong`; same fields on `useFormatStore`;
  `'nuadeFileData'` in `FILE_DATA_FIELDS`; `nuadePlayerId` saved with project meta in `exporters.ts`;
  `nativeExportRouter.ts` exports the edited module (encoder) or the original bytes for a nuade song, as it does for
  `eaglePlayerFileData`.
- Projects keep the engine they were saved with (the file data decides at restore, `shouldActivate`); switching engine
  is the selector's job (D7), not a restore migration.

### D6 Format table `src/engine/nuade/nuadeFormats.ts` (data, single source)
```ts
export interface NuadeFormat {
  id: string;              // nuade player id, e.g. 'mmdc' (the forced player)
  label: string;           // 'OctaMED MMDC'
  prefKey: keyof FormatEnginePreferences; // the per-format choice it shares (two players may share one key: markcooksey/_old, speedysystem/speedya1system)
  registryKeys: string[];  // our FormatRegistry / gridProvenance keys ('-' rows get new keys, R81-R84)
  role: 'replace' | 'dual';
  corpus: string[];        // 1..3 songs under public/data/songs
  companions?: Record<string, string[]>;
  uadeEnvelopeCorrelation: number | null;  // nuade vs UADE, mean over corpus, from the batch
  ownEnvelopeCorrelation?: number | null;  // dual rows: our engine vs UADE
  endAgrees: boolean | null;
  defaultEngine: FormatEngineChoice;       // decided by the batch rule (D8), never by hand
  heldBecause?: string;                    // measured reason when defaultEngine is not 'nuade' on a replace row
  followBy: 'orderRow' | 'tick';
}
export const NUADE_FORMATS: Readonly<Record<string, NuadeFormat>>;
```
`tools/nuade/apply-verdicts.ts` writes `uadeEnvelopeCorrelation`, `ownEnvelopeCorrelation`, `endAgrees`,
`defaultEngine`, `heldBecause` from the batch results file; nobody edits those fields by hand.

### D7 Engine selector - one path (store + resolver + UI + MCP)
- `FormatEngineChoice = 'native' | 'uade' | 'nuade'` (`src/types/formatEngine.ts`). Semantics for a key in
  `NUADE_FORMATS`: `native` = our parser + our engine (dual rows) or our parser + UADE playback (replace rows have no
  engine of ours - `native` is not offered there); `uade` = UADE parse + play (today's path); `nuade` = our parser for
  the grid (UADE scan if the parser refuses or finds 0 notes, as `withEaglePlayer` does) + nuade playback.
- Store: `formatEngine` keeps only explicit choices for nuade keys; `effectiveFormatEngine(prefs, key)` in
  `src/engine/nuade/nuadeRouting.ts` returns `prefs[key] ?? NUADE_FORMATS-by-prefKey.defaultEngine ?? legacy default`.
  This is the ONE resolver: `parseModuleToSong`/route wrappers, `DJPipeline` (passes the result to the worker),
  the UI and the MCP all call it.
- Settings persist version 13 -> 14: delete persisted `formatEngine[k]` for every `k` that is a `prefKey` in
  `NUADE_FORMATS` (safe: no UI or tool ever wrote them, see "What exists"); migration in
  `src/lib/persistence/migrations/` per the localStorage rule, test in
  `src/stores/__tests__/useSettingsStore.migration.test.ts`.
- Route: `src/lib/import/parsers/withNuade.ts` - `playOnNuade(song, playerId, module, fileName, companions)` (mirror of
  `playOnEaglePlayer`: sets nuade fields, deletes UADE fields and `uadeEditableSubsongs`, UADE synths -> Sampler,
  'UADE' grid tag -> 'MOD') and `withNuade(prefKey, ctx, nativeParse)`. Existing routes in `AmigaFormatParsers.ts` /
  `UADEPrefixParsers.ts` for a rolled-out format call `withNuade` when `effectiveFormatEngine === 'nuade'`, else their
  current wrapper. Dual rows: `withNuade` keeps the native parse and replaces our engine's file data with
  `nuadeFileData` (the descriptor order alone would otherwise pick our engine).
- `switchFormatEngine(prefKey, choice)` in `src/lib/song/switchFormatEngine.ts`: sets the store, and when the loaded
  song's format has that key, re-opens it through `openSong` (the one load path) from `editedModuleForPlay(song)` bytes
  (edits survive) and seeks to the current order/row.
- UI (one component, two mounts): `src/components/common/FormatEngineSelect.tsx` - `<CustomSelect>` with full labels
  "Our Engine", "nuade", "UADE", showing each option's measured correlation; mounted (a) in `WasmInfoEditor` for the
  loaded song's format, (b) in a new Settings tab "Playback Engines" (`SettingsModal.tsx`) listing every
  `NUADE_FORMATS` row (label, measured scores, select). Tokens from the Tailwind allowlist only.
- MCP: tools `get_format_engines` (rows: id, label, prefKey, role, choices, effective, default, scores, heldBecause)
  and `set_format_engine {format, engine}` in `server/src/mcp/mcpServer.ts`; bridge handlers in
  `src/bridge/handlers/readHandlers.ts` / `writeHandlers.ts` that call `effectiveFormatEngine` / `switchFormatEngine`;
  `get_format_state` gains `nuadePlayerId` and `engineCredit`.

### D8 Comparison batch and pass rule
- `tools/nuade/nuadeCompare.ts`: renders a song through `public/nuade/Nuade.wasm` headless (node, like eagleCompare)
  and reuses `monoEnvelope`, `correlation`, `comparedWindows` from `tools/eagleplayer/eagleCompare.ts` and
  `renderFileToSamples` from `tools/uade-audit/uadeRenderCore.ts` (no new metric). For dual rows it also renders our
  engine's worklet through `src/engine/__tests__/workletHarness.ts`.
- `tools/nuade/compare-batch.ts` (`npm run nuade-compare`): resumable; one row per (format, song) written to
  `test-data/nuade-compare.json` the moment it completes; skips recorded rows; `--only <id,...>`, `--failed`,
  `--fresh <id>` (one format only; no global fresh), `--secs` (default 30), `--jobs` (default 2, owner CPU cap). Row:
  `{format, song, nuade, own?, uadeEndAt, nuadeEndAt, ownEndAt?, peak, rms, verdict, ms, sha}`. Default selection =
  formats with no row; a full run requires `--all` and prints why it is needed. Corpus: up to 3 songs per format from
  `public/data/songs/formats/<dir>` (table `corpus`).
- **Instrument check first (protocol §3):** before any verdict is quoted, the batch must reproduce two known answers
  from the research: `antidust.bp3` nuade >= 0.95 (research 0.987) and `apb.dw` nuade < 0.95 (research 0.852, early
  end). It also records whether UADE wasm renders with the A500 filter (the research saw 0.81-0.97 with it on); the
  comparison must run filter-off on both sides.
- **Replace pass rule (per format, all must hold):** (a) 30 s watchdog render, no errors, peak > 0.05, RMS > 0.02;
  (b) mean correlation vs UADE >= 0.95 over the corpus songs, no song < 0.90; (c) end agreement: UADE ends within the
  window -> nuade ends within +-1.0 s of it; UADE runs on -> nuade runs on; (d) no capability loss: a format whose
  `LIVE_EDIT` (gridProvenance.ts) is `pass` today keeps an edit path - encoder present and `swapDone.ms <= 100` at the
  120 s mark, else held; (e) default load proven (`parseModuleToSong` -> `playingEngineFor === 'Nuade'`). Fail ->
  `defaultEngine: 'uade'`, `heldBecause` = the failing measurement.
- **Dual rule:** see Decisions needed DN-1 (recommended rule pre-filled; the batch applies whichever is chosen).

## Rollout order (84 replace rows)

Rule: waves in this order; inside a wave, descending batch score. Each row is one ID; a row is DONE when its gate
(D8) passes and its route lands, or HELD with a measured reason. Wave 1 is ordered by the research's measured scores.

| Wave | Why this order | Rows |
|---|---|---|
| 1 measured | already measured >= 0.95 | R01 mmdc (0.996, pilot: Rows, no encoder, no edit to lose), R02 robhubbard (0.996, WALK + RT pass: proves liveSwap), R03 timfollin (0.993; nuade ends 11.8 s - gate (c) decides), R04 earache (0.984), R05 musicalenlightenment (0.967) |
| 2 replace engine, keep our parser/encoder | DIRECT/WALK grids, our parser untouched, lowest risk | R06 amos, R07 dsc, R08 fashiontracker, R09 gmc, R10 jeroentel, R11 peterverswyvelen, R12 richardjoseph, R13 robhubbardst, R14 soundfx, R15 soundmaster, R16 zoundmonitor |
| 3 replace, byte-exact encoder | edit path via liveSwap must hold (gate d) | R17 gluemon, R18 infogrames, R19 paulrobotham, R20 paulshields, R21 scumm, R22 syntracker, R23 tomytracker |
| 4 Rows / Voices display | nuade reports real position per voice | R24 davidhanney, R25 ems, R26 laxity, R27 majortom, R28 timetracker, R29 tronic, R30 maniacsofnoise, R31 paulsummers, R32 pokeynoise, R33 soundimages, R34 stevebarrett, R35 thomashermann, R36 ufo |
| 5 Grid(scan) over RECONSTRUCTED | follow by tick | R37 andrewparton, R38 aprosys, R39 artandmagic, R40 ashleyhogg, R41 cinemaware, R42 dariuszendeh, R43 desire, R44 dynamicsynthesizer, R45 emsv6, R46 fcbsi, R47 fredgray, R48 hippelhip, R49 howiedavies, R50 jankomrsicflogel, R51 jasonbrooke, R52 jasonpage, R53 jesperolsen, R54 kimchristensen, R55 krishatlelid, R56 legglessmusiceditor, R57 markcooksey, R58 markcooksey_old, R59 markii, R60 maximumeffect, R61 mcmd, R62 medley, R63 mikedavies, R64 pierreadane, R65 professionalsoundartists, R66 quartet, R67 riffraff, R68 seanconnolly, R69 silmarils, R70 specialfx, R71 speedya1system, R72 speedysystem, R73 synthdream, R74 synthpack, R75 voodoo |
| 6 no display / SCOPE | audio only; position from tick count | R76 ntsp, R77 onescapee, R78 seanconran, R79 spl, R80 forgottenworlds |
| 7 no registry key yet | need detection first; `protracker4` routes by nuade probe of the magic only, never by `.ptm` (PolyTracker collision) | R81 amcomposer, R82 audiosculpture, R83 dirkbialluch, R84 protracker4 |

Before wave 2 starts, the engine column of every row is re-verified from the router (`playingEngineFor` on its corpus
song through `parseModuleToSong`), not from the research table or a grep: several of these parsers are under another
agent's uncommitted edits today (JasonPage, MarkCooksey, JeroenTel, RichardJoseph, WallyBeben tests in `git status`).
A row found already on EaglePlayer or our own engine moves to the dual list as a new ID (protocol §8.5).

## Dual-engine A/B (30 rows)

The 29 own-engine rows plus Sonic Arranger (research verdict "Merge"; its 0x4EFA binary variant, which ours refuses and
UADE plays today, goes to nuade under decision 1 regardless of the A/B):
AB01 actionamics, AB02 activisionpro, AB03 bendaglish, AB04 davidwhittaker, AB05 deltamusic1, AB06 deltamusic2,
AB07 digmug, AB08 dss, AB09 facethemusic, AB10 fred_np, AB11 futurecomposer, AB12 hippel, AB13 hippel7v,
AB14 instereo1, AB15 instereo2, AB16 jamcracker, AB17 musicassembler, AB18 musicmaker, AB19 oktalyzer,
AB20 pumatracker, AB21 quadracomposer, AB22 ronklaren, AB23 sidmon2, AB24 sonix, AB25 soundcontrol, AB26 soundfactory,
AB27 soundmon, AB28 suntronic, AB29 synthesis, AB30 sonicarranger.
The 7 EaglePlayer (Musashi) rows stay on EaglePlayer: they run UADE's own player, exact by construction; out of scope.

## Checklist

Phase 0 - Vendor and build (5)
- [ ] NV-1 Fetch tarball of `4900e597e` into `third-party/nuade/` (pristine), write `UPSTREAM.md`, `update.sh`.
- [ ] NV-2 `nuade-wasm/CMakeLists.txt`, `nuade-wasm/build.sh`, `.gitignore` for `nuade-wasm/build/`.
- [ ] NV-3 Shim `nuade-wasm/src/nuade_wasm.c` (D3 exports incl. `nw_caps`, edit stubs returning -ENOSYS).
- [ ] NV-4 Build; commit `public/nuade/Nuade.{js,wasm}`; size <= 2.5 MB; node render of `antidust.bp3` byte-identical
      to the research's native render (`scratchpad/ab/antidust.bp3.raw` if still present, else to a fresh native build).
- [ ] NV-5 `.github/workflows/nuade.yml` (websid.yml copy); `src/__tests__/buildAndCiToolchain.test.ts` extended so
      the workflow's paths and build command are asserted.

Phase 1 - Engine adapter (10)
- [ ] NE-1 `src/engine/nuade/nuadeProtocol.ts` message types (D4).
- [ ] NE-2 `public/nuade/Nuade.worklet.js` (render loop, per-voice buffers to channel-outputs, mute mask, pause).
- [ ] NE-3 `src/engine/nuade/NuadeEngine.ts` (WASMChannelOutputsEngine; load, play, stop, pause, subsongs).
- [ ] NE-4 Extract `src/engine/replayer/tickGridFollow.ts` from `EaglePlayerEngine.setGrid`; both engines use it
      (EaglePlayer tests stay green unchanged).
- [ ] NE-5 Position messages from `nw_snapshot(heardFrame)`; orderRow/tick follow.
- [ ] NE-6 Scopes: `oscData` into `useOscilloscopeStore`, `setChipInfo(voices, ..., 'Voice N')`.
- [ ] NE-7 Isolation slots and dub sends (afterPlay), `setMuteMask` (bit set = voice audible).
- [ ] NE-8 `swapModule` (liveSwap) with `swapDone.ms`; measured at 120 s on R02.
- [ ] NE-9 VU into the meter store; `get_audio_level` reads non-zero while a nuade song plays (headless store test).
- [ ] NE-10 `NuadeEditPort` + `nw_caps` probe; descriptor sets `gridCellEdits` only when `CELL_WRITE`; test with a
      faked caps value proves the switch, and the real WASM reports `CELL_WRITE` off.

Phase 2 - Registry, routing, selector (12)
- [ ] NS-0 Measure max `nw_voice_count` over the 84 corpus songs; set the node's declared voices.
- [ ] NS-1 `Nuade` descriptor in `wasmEngineRegistry.ts` (ahead of UADEEditable, after EaglePlayer).
- [ ] NS-2 Song + format-store fields, `FILE_DATA_FIELDS`, `exporters.ts` meta, `nativeExportRouter.ts` branch,
      `nativeSubsongs.ts` reports nuade subsongs.
- [ ] NS-3 `FormatEngineChoice` gains `'nuade'`; settings v14 migration + test (re-check no writer exists first).
- [ ] NS-4 `src/engine/nuade/nuadeFormats.ts` table (84 replace + 30 dual rows, `defaultEngine: 'uade'` / `'native'`
      until the batch writes verdicts).
- [ ] NS-5 `src/engine/nuade/nuadeRouting.ts` `effectiveFormatEngine` + `nuadePlayerFor(filename, bytes, prefs)`.
- [ ] NS-6 `src/lib/import/parsers/withNuade.ts` (`playOnNuade`, `withNuade`) + unit tests next to it.
- [ ] NS-7 `src/lib/song/switchFormatEngine.ts` (store + re-open through `openSong` from `editedModuleForPlay`).
- [ ] NS-8 `FormatEngineSelect.tsx` mounted in `WasmInfoEditor` (loaded format).
- [ ] NS-9 Settings tab "Playback Engines" listing all rows.
- [ ] NS-10 MCP `get_format_engines` + `set_format_engine` (server tool + bridge handler, one handler each).
- [ ] NS-11 `get_format_state` gains `nuadePlayerId`, `engineCredit`.

Phase 3 - Comparison tooling (5)
- [ ] NC-1 `tools/nuade/nuadeCompare.ts` (reuses eagleCompare + uadeRenderCore).
- [ ] NC-2 `tools/nuade/compare-batch.ts` resumable batch + `npm run nuade-compare`; results file committed.
- [ ] NC-3 Instrument check: known-good `antidust.bp3` >= 0.95, known-bad `apb.dw` < 0.95, filter-off confirmed both
      sides; printed before any verdict is used.
- [ ] NC-4 `tools/nuade/apply-verdicts.ts` writes table fields from the results (pass rule D8, dual rule DN-1).
- [ ] NC-5 `src/engine/__tests__/nuadePlaysFormats.test.ts`: per table row (`describe.each`) the watchdog render, the
      UADE comparison against the row's threshold, the end agreement, and (rows with `defaultEngine: 'nuade'`) the
      default-load route. This is "each format's own UADE comparison test"; lives in `src/engine/__tests__/` (in
      `test:ci`).

Phase 4 - Rollout (84): R01-R84 per the table above. Each row: measure (batch `--only <id>`), apply verdict, route via
`withNuade` if it passes, its `nuadePlaysFormats` row green, `playingEngineFor` proven. Pre-step:
- [ ] NR-0 Re-verify the engine column of all 84 rows from the router (see Rollout order note); move mismatches.
- [ ] R01 ... [ ] R84 (one checkbox per row, ticked in `thoughts/shared/plans/2026-10-13-nuade-engine-progress.md`).

Phase 5 - Dual A/B (30 + 2)
- [ ] NAB-1 Batch renders our engine AND nuade for AB01-AB30 (up to 3 songs each) into the same results file.
- [ ] NAB-2 SA 0x4EFA variant: `SonicArrangerParser.ts:1006` (`useOffsetTable`) routes that variant to `withNuade`
      instead of UADE; `almighty.sa` plays on nuade (research 0.997).
- [ ] AB01 ... [ ] AB30 (one checkbox per row: default written by `apply-verdicts`, selector offers both, switching
      re-opens and plays on the other engine).

Phase 6 - DJ (3)
- [ ] ND-1 `dj-render.worker.ts` `renderWithNuade` (stereo + per-voice -> `channelScopes` + monoStem stems), dispatched
      when the render message carries `engine: 'nuade'`.
- [ ] ND-2 `DJPipeline` resolves the engine with `nuadePlayerFor` on the main thread and passes `engine` + `playerId`
      (no resolver copy in the worker); the cache key includes the engine so a switch re-renders.
- [ ] ND-3 Test in `src/engine/dj/__tests__/djNuadeRenderHasChannelScopes.test.ts`: `DJPipeline.loadOrEnqueue` on the
      MMDC corpus song -> real worker in-process -> `DeckEngine.getChannelWaveforms` returns one signal per nuade voice.

Phase 7 - Credits (4)
- [ ] CR-1 `third-party/nuade/LICENSE` present (upstream MIT text, "Copyright (c) 2026 Daniel Collin"), plus upstream
      `THIRD_PARTY_NOTICES.md` (NostalgicPlayer MIT, the 3 unlicensed eagleplayer data files) kept verbatim.
- [ ] CR-2 `THIRD_PARTY_NOTICES.md`: `### nuade` section next to `### UADE` - author Daniel Collin (emoon), source
      `https://github.com/emoon/nuade` at the pinned SHA, MIT with the full licence text, used for: native C ports of
      UADE players compiled to `public/nuade/Nuade.wasm`, the list of formats it plays (generated from
      `NUADE_FORMATS` rows with `defaultEngine: 'nuade'`), and the NostalgicPlayer and eagleplayer-data notes.
- [ ] CR-3 `README.md` third-party paragraph names nuade (emoon) beside UADE.
- [ ] CR-4 In-app: `WasmInfoEditor` `FORMAT_INFO.NuadeSynth` text "Played by nuade (Daniel Collin / emoon), native C
      ports of the UADE players, MIT" plus the row's label and nuade player name from `moduleLoaded`; `get_format_state.
      engineCredit` returns the same string from one constant in `nuadeFormats.ts`. Test asserts the panel text for a
      nuade-played song.

Phase 8 - Reachability and close (3)
- [ ] NV-6 ONE reachability test `src/engine/__tests__/nuadeReachability.test.ts` (below).
- [ ] NV-7 Type-check (`npm run type-check`), lint, the touched tests; progress file reconciled (ticked = total -
      open).
- [ ] NV-8 Handoff + memory note; NUADE-ENGINE entry in `thoughts/spot/todos.md` updated with the final counts.

**Totals:** 9 phases (0-8), 159 items: Phase 0 5, Phase 1 10, Phase 2 12, Phase 3 5, Phase 4 85 (NR-0 + R01-R84),
Phase 5 32 (NAB-1, NAB-2, AB01-AB30), Phase 6 3, Phase 7 4, Phase 8 3, plus DN decisions (not items).

## The one reachability test (NV-6)

`src/engine/__tests__/nuadeReachability.test.ts`:
1. `parseModuleToSong(new File([mmdc corpus bytes], name))` - the real song-load entry point, default settings.
2. Assert `song.nuadeFileData` byteLength = file size, `song.nuadePlayerId === 'mmdc'`, `playingEngineFor(song) ===
   'Nuade'`, no `uadeEditableFileData`.
3. Apply to the stores as the app does and call `startNativeEngines`; `NuadeEngine.loadTune` is spied (sentinel: call
   count 1, args `[ArrayBuffer, 'mmdc', name, 0, undefined]`), and the worklet (real `public/nuade/Nuade.worklet.js`
   + `Nuade.wasm` through `workletHarness`) posts `moduleLoaded` with `playerId 'mmdc'` - a value only the nuade path
   can produce.
4. Render 30 s: peak > 0.05, RMS > 0.02, mono-envelope correlation vs UADE >= 0.95 (research: 0.996), `position`
   messages advance `row`.
All other behaviour is tested where it lives (table rows, resolver, migration, selector, worker), per the global rule.

## Automated verification (per phase)

- Phase 0: `nuade-wasm/build.sh` exits 0; `ls -l public/nuade/Nuade.wasm` <= 2.5 MB; byte-identical render check;
  `nuade.yml` green on the push that adds it.
- Phase 1-2: `npm run type-check`; `npx vitest run src/engine/nuade src/lib/import/parsers/__tests__/withNuade*
  src/stores/__tests__/useSettingsStore.migration.test.ts src/engine/__tests__/eaglePlayerPlaysFormats.test.ts`
  (tickGridFollow extraction must not move EaglePlayer).
- Phase 3: `npm run nuade-compare -- --only bp3,dw` prints the instrument check; rows recorded in
  `test-data/nuade-compare.json`.
- Phase 4-5 per row: `npm run nuade-compare -- --only <id>`, `npx tsx tools/nuade/apply-verdicts.ts`,
  `npx vitest run src/engine/__tests__/nuadePlaysFormats.test.ts -t <label>`.
- Phase 6: `npx vitest run src/engine/dj/__tests__/djNuadeRenderHasChannelScopes.test.ts`.
- Phase 8: the reachability test; `npm run type-check`; `npm run lint` on touched files. No full suite by hand (the
  hooks run it).

## Manual checks (owner; collected, never ticked by the agent)

LOCAL `http://localhost:5174` (`npm run dev:fullstack` for MCP):
1. Load the MMDC corpus song (R01): plays, grid follows, scopes move per voice, Settings > Playback Engines shows
   "nuade" with its score; the instrument panel credits nuade (emoon). PASS = sounds like before, no UADE in
   `get_format_state.playingEngine`.
2. Rob Hubbard (R02): edit a note while playing; it is heard within a row (liveSwap). PASS = edit audible, no restart
   from the top.
3. SoundMon (AB27): switch "Our Engine" <-> "nuade" in the instrument panel while playing; position kept, both play.
4. DJ view: load a nuade-format song on a deck; deck channel scopes move. 
LIVE `https://devilbox.uprough.net` after the push: confirm `version.json` buildHash equals the pushed commit, then
repeat check 1.

## Non-goals (pointers, not dropped work)

- nuade's `tracker_cells` decoders as DIRECT parsers for the 14 Rows-over-RECONSTRUCTED formats (research option 3) -
  see DN-2.
- `apb.dw` stopping at 4.2 s in both nuade and our engine (UADE 8.5 s): affects AB04 only through its measurement;
  root cause belongs to a separate investigation.
- Moving the 7 EaglePlayer formats.

## Decisions taken (owner, 2026-10-13)

- DN-1: (b) nuade becomes the default for a dual row only if its mean correlation beats ours by >= 0.01 AND no song is worse than ours by more than 0.01; otherwise ours stays default. Both stay selectable.
- DN-2: (a) the 14 Rows decoders get a separate plan after wave 1 lands.
- DN-3: the owner contacts emoon personally (write/poke API, shared lineage). No GitHub issue from us.

## Decisions needed (owner)

- **DN-1 Default rule for the 30 dual rows.** (a) higher mean correlation wins outright; (b) nuade becomes default only
  when its mean beats ours by >= 0.01 and no corpus song is worse than ours by > 0.01, else ours stays (keeps the live
  edit API on ties); (c) ours stays default unless ours < 0.95. **Recommended: (b)** - it moves SoundMon (0.987 vs
  0.949) and SidMon II (0.989 vs 0.968) on today's single-song numbers, and does not trade the live edit API for noise
  (FC 0.990 vs 0.976 also moves). The batch applies the chosen rule; nothing else changes.
- **DN-2 The 14 Rows decoders (option 3).** (a) separate plan after wave 1 lands; (b) fold into this plan as Phase 9;
  (c) not now. **Recommended: (a)** - it is parser work in 14 formats, a different review unit from the engine.
- **DN-3 Shared lineage and upstream contact.** 27 of our replayers share 39-67 % of lines with nuade players (not raised
  with you before). Options: (a) open an issue on emoon/nuade crediting the shared ports, asking for the write API
  shape so `NuadeEditPort` matches it, and offering our edit API; (b) only credit, no contact; (c) wait until he
  publishes the poke API. **Recommended: (a)** - the edit slot is designed blind until his API shape is known, and the
  issue tracker is empty, so this would be the first contact on record.
