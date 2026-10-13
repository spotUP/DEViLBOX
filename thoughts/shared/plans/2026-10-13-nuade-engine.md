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

Running count: 149 of 162 (2026-10-13 evening). Open: 10 replace rows with no song anywhere (R06 R26 R28 R36 R37 R41 R54 R66 R76 R77), AB09 facethemusic and AB24 sonix (no reference exists), AB32 fcbsi (no headless render of its TypeScript scheduler). NV-7 and NV-8 are ticked below.

Phase 0 - Vendor and build (5)
- [x] NV-1 Fetch tarball of `4900e597e` into `third-party/nuade/` (pristine), write `UPSTREAM.md`, `update.sh`. -- dcd93a0d4, nuadeVendored.test.ts
- [x] NV-2 `nuade-wasm/CMakeLists.txt`, `nuade-wasm/build.sh`, `.gitignore` for `nuade-wasm/build/`. -- a2235f76e, nuadeWasmBuild.test.ts NV-2
- [x] NV-3 Shim `nuade-wasm/src/nuade_wasm.c` (D3 exports incl. `nw_caps`, edit stubs returning -ENOSYS). -- a2235f76e, nuadeWasmBuild.test.ts NV-3
- [x] NV-4 Build; commit `public/nuade/Nuade.{js,wasm}`; size <= 2.5 MB; node render of `antidust.bp3` byte-identical -- a2235f76e, nuadeWasmBuild.test.ts NV-4 (1.75 MB, byte-identical antidust.bp3)
      to the research's native render (`scratchpad/ab/antidust.bp3.raw` if still present, else to a fresh native build).
- [x] NV-5 `.github/workflows/nuade.yml` (websid.yml copy); `src/__tests__/buildAndCiToolchain.test.ts` extended so -- e89e80dfb, buildAndCiToolchain.test.ts NV-5
      the workflow's paths and build command are asserted.

Phase 1 - Engine adapter (10)
- [x] NE-1 `src/engine/nuade/nuadeProtocol.ts` message types (D4). -- e83f8d6b0, nuadeProtocol.test.ts
- [x] NE-2 `public/nuade/Nuade.worklet.js` (render loop, per-voice buffers to channel-outputs, mute mask, pause). -- 4ed48e051, nuadeWorklet.test.ts
- [x] NE-3 `src/engine/nuade/NuadeEngine.ts` (WASMChannelOutputsEngine; load, play, stop, pause, subsongs). -- d8a527733, nuadeEngine.test.ts
- [x] NE-4 Extract `src/engine/replayer/tickGridFollow.ts` from `EaglePlayerEngine.setGrid`; both engines use it -- 110e5103f, tickGridFollow.test.ts
      (EaglePlayer tests stay green unchanged).
- [x] NE-5 Position messages from `nw_snapshot(heardFrame)`; orderRow/tick follow. -- d8a527733, nuadePosition.test.ts
- [x] NE-6 Scopes: `oscData` into `useOscilloscopeStore`, `setChipInfo(voices, ..., 'Voice N')`. -- d8a527733, nuadeEngineFeatures.test.ts NE-6
- [x] NE-7 Isolation slots and dub sends (afterPlay), `setMuteMask` (bit set = voice audible). -- d8a527733, nuadeEngineFeatures.test.ts NE-7
- [x] NE-8 `swapModule` (liveSwap) with `swapDone.ms`; measured at 120 s on R02. -- d8a527733, nuadeEngineFeatures.test.ts NE-8
- [x] NE-9 VU into the meter store; `get_audio_level` reads non-zero while a nuade song plays (headless store test). -- d8a527733, nuadeEngineFeatures.test.ts NE-9 (meter feed; get_audio_level itself not driven headless)
- [x] NE-10 `NuadeEditPort` + `nw_caps` probe; descriptor sets `gridCellEdits` only when `CELL_WRITE`; test with a -- d8a527733, nuadeEngineFeatures.test.ts NE-10
      faked caps value proves the switch, and the real WASM reports `CELL_WRITE` off.

Phase 2 - Registry, routing, selector (12)
- [x] NS-0 Measure max `nw_voice_count` over the 84 corpus songs; set the node's declared voices. -- b4372a2d2, nuadeFormats.test.ts NS-0 (measured max 8 voices)
- [x] NS-1 `Nuade` descriptor in `wasmEngineRegistry.ts` (ahead of UADEEditable, after EaglePlayer). -- b4372a2d2, nuadeRegistry.test.ts NS-1
- [x] NS-2 Song + format-store fields, `FILE_DATA_FIELDS`, `exporters.ts` meta, `nativeExportRouter.ts` branch, -- b4372a2d2, nuadeRegistry.test.ts NS-2
      `nativeSubsongs.ts` reports nuade subsongs.
- [x] NS-3 `FormatEngineChoice` gains `'nuade'`; settings v14 migration + test (re-check no writer exists first). -- b4372a2d2, useSettingsStore.migration.test.ts v14
- [x] NS-4 `src/engine/nuade/nuadeFormats.ts` table (84 replace + 30 dual rows, `defaultEngine: 'uade'` / `'native'` -- b4372a2d2, nuadeFormats.test.ts NS-4 (84+30 rows)
      until the batch writes verdicts).
- [x] NS-5 `src/engine/nuade/nuadeRouting.ts` `effectiveFormatEngine` + `nuadePlayerFor(filename, bytes, prefs)`. -- b4372a2d2, withNuade.test.ts NS-5
- [x] NS-6 `src/lib/import/parsers/withNuade.ts` (`playOnNuade`, `withNuade`) + unit tests next to it. -- b4372a2d2, withNuade.test.ts NS-6 + reachability parseModuleToSong -> Nuade
- [x] NS-7 `src/lib/song/switchFormatEngine.ts` (store + re-open through `openSong` from `editedModuleForPlay`). -- b4372a2d2, switchFormatEngine.test.ts
- [x] NS-8 `FormatEngineSelect.tsx` mounted in `WasmInfoEditor` (loaded format). -- b4372a2d2, formatEngineSelect.test.tsx
- [x] NS-9 Settings tab "Playback Engines" listing all rows. -- b4372a2d2, playbackEnginesPanel.test.tsx
- [x] NS-10 MCP `get_format_engines` + `set_format_engine` (server tool + bridge handler, one handler each). -- b4372a2d2, formatEngineTools.test.ts NS-10
- [x] NS-11 `get_format_state` gains `nuadePlayerId`, `engineCredit`. -- b4372a2d2, formatEngineTools.test.ts NS-11

Phase 3 - Comparison tooling (5)
- [x] NC-1 `tools/nuade/nuadeCompare.ts` (reuses eagleCompare + uadeRenderCore). -- 89b866fcc, nuadeCompareTooling.test.ts (metric, ends, lag)
- [x] NC-2 `tools/nuade/compare-batch.ts` resumable batch + `npm run nuade-compare`; results file committed. -- 89b866fcc, nuadeCompareTooling.test.ts NC-2 (resume after a kill, --only, --failed, --fresh, stale sha); results file is tools/nuade/nuade-compare.json (test-data/ is git-ignored)
- [x] NC-3 Instrument check: known-good `antidust.bp3` >= 0.95, known-bad `apb.dw` < 0.95, filter-off confirmed both -- 89b866fcc, nuadeCompareTooling.test.ts NC-3 (antidust.bp3 0.974 pass, apb.dw 0.406 fail; UADE wasm keeps the A500 filter on, see Adaptations)
      sides; printed before any verdict is used.
- [x] NC-4 `tools/nuade/apply-verdicts.ts` writes table fields from the results (pass rule D8, dual rule DN-1). -- 1122f5b89, 2534ff05c, nuadeCompareTooling.test.ts (D8 rule, DN-1 + floor, verdict file = results)
- [x] NC-5 `src/engine/__tests__/nuadePlaysFormats.test.ts`: per table row (`describe.each`) the watchdog render, the -- 89b866fcc 1122f5b89, 2534ff05c, nuadePlaysFormats.test.ts (per row: watchdog, UADE comparison, ends, verdict, default load)
      UADE comparison against the row's threshold, the end agreement, and (rows with `defaultEngine: 'nuade'`) the
      default-load route. This is "each format's own UADE comparison test"; lives in `src/engine/__tests__/` (in
      `test:ci`).

Phase 4 - Rollout (84): R01-R84 per the table above. Each row: measure (batch `--only <id>`), apply verdict, route via
`withNuade` if it passes, its `nuadePlaysFormats` row green, `playingEngineFor` proven. Pre-step:
- [x] NR-0 Re-verify the engine column of all 84 rows from the router (see Rollout order note); move mismatches. -- 89b866fcc, nuadeEngineColumn.test.ts (57 rows with a song: 54 UADE, 3 moved to dual)
- [x] R01 mmdc -- DONE: default nuade, 0.990 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R02 robhubbard -- ON NUADE since 2026-10-13 (hold lifted by owner; was held by the CI failures): 0.990 like UADE, but a typed note is written into UADE's chip RAM and heard at once; nuade has no cell write and its module swap is not proven to sound a typed note at its pitch (robHubbardTypedNotesSound). Default flips back to nuade when a test proves it (verdictRules EDIT_SOUNDS_ON_NUADE); 08242a402
- [x] R03 timfollin -- DONE: default nuade, 0.986 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R04 earache -- DONE: default nuade, 0.965 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R05 musicalenlightenment -- DONE: default nuade, 0.962 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [ ] R06 amos -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R07 dsc -- HELD on UADE: dragon'sbreath_fanfares.dsc: UADE plays on, nuade ends at 6.9 s; dragon'sbreath dbfx.dsc: UADE ends at 8.7 s, nuade ends at 1.5 s; live edit would lose its path: swap to the 120 s mark takes 244 ms > 100 ms; 89b866fcc, nuadePlaysFormats row
- [x] R08 fashiontracker -- DONE: default nuade, 0.989 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R09 gmc -- MOVED to dual AB33: plays on libopenmpt (TypeScript scheduler), not UADE (NR-0, nuadeEngineColumn.test.ts); 89b866fcc
- [x] R10 jeroentel -- DONE: default nuade, 0.968 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R11 peterverswyvelen -- DONE: default nuade, 0.978 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R12 richardjoseph -- HELD on our parser + UADE playback: cannon fodder (intro).sng: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R13 robhubbardst -- HELD on UADE: battleships.rho: correlation 0.803 < 0.9; battleships.rho: correlation 0.803 < 0.9; mean correlation 0.803 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R14 soundfx -- HELD on our parser + UADE playback: operation_stealth.sfx: UADE ends at 9.9 s, nuade ends at 19.8 s; 89b866fcc, nuadePlaysFormats row
- [x] R15 soundmaster -- HELD on UADE: live edit would lose its path: swap to the 120 s mark takes 203 ms > 100 ms; 89b866fcc, nuadePlaysFormats row
- [x] R16 zoundmonitor -- HELD on UADE: sonjavanveen.sng: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R17 gluemon -- HELD on UADE: gnu-song.glue: correlation 0.738 < 0.9; mean correlation 0.821 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R18 infogrames -- HELD on UADE: bob4e.dum: _uade_wasm_load failed (ret=-1); advantage tennis-intro.dum: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R19 paulrobotham -- HELD on UADE: dawnpatrol-sad.dat: _uade_wasm_load failed (ret=-1); dawnpatrol-sad.dat: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R20 paulshields -- DONE: default nuade, 0.993 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R21 scumm -- DONE: default nuade, 0.991 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R22 syntracker -- DONE: default nuade, 0.987 like UADE over 3 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R23 tomytracker -- DONE: default nuade, 0.981 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R24 davidhanney -- DONE: default nuade, 0.956 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R25 ems -- DONE: default nuade, 0.975 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [ ] R26 laxity -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R27 majortom -- HELD on UADE: mean correlation 0.945 < 0.95; 89b866fcc, nuadePlaysFormats row
- [ ] R28 timetracker -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R29 tronic -- DONE: default nuade, 0.985 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R30 maniacsofnoise -- DONE: default nuade, 0.982 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R31 paulsummers -- HELD on our parser + UADE playback: everton_fc_-_jingles.snk: UADE plays on, nuade ends at 4.0 s; everton fc - jingles.snk: UADE plays on, nuade ends at 4.0 s; 89b866fcc, nuadePlaysFormats row
- [x] R32 pokeynoise -- HELD on UADE: pn.tetris: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R33 soundimages -- HELD on UADE: blinkys scary school-sfx.tw: UADE ends at 9.7 s, nuade ends at 1.9 s; 89b866fcc, nuadePlaysFormats row
- [x] R34 stevebarrett -- HELD on UADE: street_fighter.sb: correlation 0.631 < 0.9; street fighter.sb: correlation 0.631 < 0.9; mean correlation 0.631 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R35 thomashermann -- HELD on UADE: thm.blueangel69: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [ ] R36 ufo -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [ ] R37 andrewparton -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R38 aprosys -- HELD on our parser + UADE playback: action.aps: correlation 0.481 < 0.9; action.aps: UADE plays on, nuade ends at 25.6 s; actionfiltersound.aps: UADE plays on, nuade ends at 25.6 s; mean correlation 0.739 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R39 artandmagic -- DONE: default nuade, 0.983 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R40 ashleyhogg -- DONE: default nuade, 1.000 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [ ] R41 cinemaware -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R42 dariuszendeh -- DONE: default nuade, 0.992 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R43 desire -- HELD on UADE: batmanreturns.dsr: peak 0.000 <= 0.05; batmanreturns.dsr: RMS 0.000 <= 0.02; batmanreturns.dsr: correlation -2.000 < 0.9; batmanreturns.dsr: peak 0.000 <= 0.05; batmanreturns.dsr: RMS 0.000 <= 0.02; batmanreturns.dsr: correlation -2.000 < 0.9; mean correlation -2.000 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R44 dynamicsynthesizer -- HELD on UADE: dns.ptc: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R45 emsv6 -- HELD on UADE: perception.ems: RMS 0.011 <= 0.02; perception.ems: correlation 0.408 < 0.9; mean correlation 0.408 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R46 fcbsi -- MOVED to dual AB32: plays on the TypeScript scheduler, not UADE (NR-0, nuadeEngineColumn.test.ts); 89b866fcc
- [x] R47 fredgray -- HELD on UADE: eco.gray: peak 0.000 <= 0.05; eco.gray: RMS 0.000 <= 0.02; eco.gray: no correlation (less than 1 s of music to compare before a song end); eco.gray: UADE plays on, nuade ends at 0.0 s; eco.gray: peak 0.000 <= 0.05; eco.gray: RMS 0.000 <= 0.02; eco.gray: no correlation (less than 1 s of music to compare before a song end); eco.gray: UADE plays on, nuade ends at 0.0 s; mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R48 hippelhip -- MOVED to dual AB31: plays on the Hippel engine, not UADE (NR-0, nuadeEngineColumn.test.ts); 89b866fcc
- [x] R49 howiedavies -- DONE: default nuade, 0.992 like UADE over 3 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R50 jankomrsicflogel -- DONE: default nuade, 0.975 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R51 jasonbrooke -- DONE: default nuade, 0.984 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R52 jasonpage -- HELD on UADE: jpn.virocop-14: _uade_wasm_load failed (ret=-1); jpn.fire and ice-1: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R53 jesperolsen -- HELD on UADE: lollypop-subgame_01.jo: _uade_wasm_load failed (ret=-1); JO.GeorgGlaxo title: _uade_wasm_load failed (ret=-1); guldkornsexpressen ingame.jo: no correlation (less than 1 s of music to compare before a song end); guldkornsexpressen ingame.jo: UADE plays on, nuade ends at 1.0 s; mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [ ] R54 kimchristensen -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R55 krishatlelid -- HELD on UADE: hatlelid_smallest.kh: nuade open failed (-2): the driver file "songplay" is missing; fiendish freddys - songs.kh: nuade open failed (-2): the driver file "songplay" is missing; mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R56 legglessmusiceditor -- HELD on UADE: the punisher gameover.lme: correlation 0.627 < 0.9; mean correlation 0.627 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R57 markcooksey -- HELD on UADE: mighty bombjack.mc: correlation 0.881 < 0.9; mighty bombjack.mc: UADE plays on, nuade ends at 26.9 s; mean correlation 0.922 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R58 markcooksey_old -- HELD on UADE: sibling markcooksey is held; 89b866fcc, nuadePlaysFormats row
- [x] R59 markii -- DONE: default nuade, 0.979 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R60 maximumeffect -- HELD on UADE: MAX.DinosaurDetective gamedat: _uade_wasm_load failed (ret=-1); MAX.DinosaurDetective jingle1: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R61 mcmd -- DONE: default nuade, 0.963 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R62 medley -- HELD on UADE: combat.mso: UADE plays on, nuade ends at 7.7 s; 89b866fcc, nuadePlaysFormats row
- [x] R63 mikedavies -- DONE: default nuade, 0.967 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R64 pierreadane -- HELD on UADE: Ivanhoe_ivanhoe - bonus.pap: _uade_wasm_load failed (ret=-1); Ivanhoe_ivanhoe - hiscore.pap: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R65 professionalsoundartists -- DONE: default nuade, 0.984 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [ ] R66 quartet -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R67 riffraff -- DONE: default nuade, 0.959 like UADE over 3 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R68 seanconnolly -- DONE: default nuade, 0.970 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R69 silmarils -- DONE: default nuade, 0.991 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R70 specialfx -- HELD on UADE: wildwheels_ingame.jd: UADE ends at 16.9 s, nuade ends at 4.3 s; striker ingame.jd: RMS 0.008 <= 0.02; striker ingame.jd: UADE plays on, nuade ends at 5.6 s; 89b866fcc, nuadePlaysFormats row
- [x] R71 speedya1system -- DONE: default nuade, 0.976 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R72 speedysystem -- DONE: default nuade, 0.987 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R73 synthdream -- HELD on UADE: sdr.monsterbusiness_5: _uade_wasm_load failed (ret=-1); sdr.nobuddiesland_jigsaw: _uade_wasm_load failed (ret=-1); sdr.monsterbusiness 1: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R74 synthpack -- HELD on UADE: centerbase_soft.osp: _uade_wasm_load failed (ret=-1); centerbase soft.osp: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R75 voodoo -- HELD on UADE: silkworm.vss: correlation 0.855 < 0.9; voo8.vss: correlation 0.514 < 0.9; mean correlation 0.685 < 0.95; 89b866fcc, nuadePlaysFormats row
- [ ] R76 ntsp -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [ ] R77 onescapee -- OPEN, UNMEASURED: no song of the format in the repo; Modland retried 2026-10-13 by extension, UADE prefix, Modland format name (Quartet: ST and PSG too) and free-text name, 4 downloads per row (the server throttles downloads), nothing nuade's own probe accepts; plays as before
- [x] R78 seanconran -- DONE: default nuade, 0.991 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R79 spl -- DONE: default nuade, 0.964 like UADE over 1 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R80 forgottenworlds -- HELD on UADE: forgotten worlds intro.fw: correlation -2.000 < 0.9; mean correlation -0.017 < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R81 amcomposer -- DONE: default nuade, 0.985 like UADE over 2 song(s), ends agree; 89b866fcc, nuadePlaysFormats row + default load reaches Nuade
- [x] R82 audiosculpture -- HELD on UADE: turtle-ready.adsc: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R83 dirkbialluch -- HELD on UADE: tpu.timelock ingame: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95; 89b866fcc, nuadePlaysFormats row
- [x] R84 protracker4 -- HELD on UADE: the drainer.ptm: correlation 0.860 < 0.9; the drainer.ptm: lag 200 ms > 100; mean correlation 0.860 < 0.95; 89b866fcc, nuadePlaysFormats row

Phase 5 - Dual A/B (33 + 2)
- [x] NAB-1 Batch renders our engine AND nuade for AB01-AB30 (up to 3 songs each) into the same results file. -- 1122f5b89, 2534ff05c, nuadeCompareTooling.test.ts NAB-1 (26 of 33 dual rows render their own engine headless)
- [x] NAB-2 SA 0x4EFA variant: `ownRefuses` on the sonicarranger row sends it to nuade whatever the row's default, unless UADE is chosen; SOARV1.0 stays on our engine. -- 08242a402, withNuade.test.ts NAB-2 (reverted: fails)
- [x] AB01 actionamics -- nuade 0.993 vs ours 0.993 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB02 activisionpro -- nuade 0.925 vs ours 0.881 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB03 bendaglish -- nuade 0.993 vs ours 0.992 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB04 davidwhittaker -- nuade 0.904 vs ours 0.907 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB05 deltamusic1 -- nuade 0.912 vs ours 0.902 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB06 deltamusic2 -- nuade 0.974 vs ours 0.610 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB07 digmug -- nuade 0.847 vs ours 0.650 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB08 dss -- nuade 0.976 vs ours 0.974 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [ ] AB09 facethemusic -- OPEN, no reference: UADE has no Face The Music player (uade123 native: "Unknown format"), so neither engine can be scored against it; default stays ours
- [x] AB10 fred_np -- measured: ours 0.855 like UADE (2 songs; fuzzball-title.fred dropped, UADE itself refuses it: module check failed); nuade fails its floor (bomb jack.fred renders silent, mean -0.538): default ours; 08242a402, nuadeCompareTooling.test.ts (ownRender), nuadeFormats.test.ts
- [x] AB11 futurecomposer -- nuade 0.966 vs ours 0.945 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB12 hippel -- nuade 0.983 vs ours 0.972 like UADE beats ours by DN-1, but HELD on our engine: it takes grid edits cell by cell and nuade has none at the pin (owner rule: no lost edit path); 08242a402, nuadeFormats.test.ts (no lost edit path)
- [x] AB13 hippel7v -- nuade 0.880 vs ours 0.565 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB14 instereo1 -- nuade 0.973 vs ours 0.944 like UADE beats ours by DN-1, but HELD on our engine: it takes grid edits cell by cell and nuade has none at the pin (owner rule: no lost edit path); 08242a402, nuadeFormats.test.ts (no lost edit path)
- [x] AB15 instereo2 -- nuade 0.306 vs ours 0.035 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB16 jamcracker -- nuade 0.970 vs ours 0.987 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB17 musicassembler -- nuade 0.834 vs ours 0.749 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB18 musicmaker -- measured with UADE given the .ip companion: nuade 0.949 vs ours 0.858; nuade is under the 0.95 floor, so default ours; 08242a402, nuadeCompareTooling.test.ts (ownRender), nuadeFormats.test.ts
- [x] AB19 oktalyzer -- nuade 0.561 vs ours 0.781 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB20 pumatracker -- nuade 0.992 vs ours 0.996 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB21 quadracomposer -- nuade 0.373 vs ours 0.374 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB22 ronklaren -- nuade 0.368 vs ours 0.364 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB23 sidmon2 -- nuade 0.981 vs ours 0.944 like UADE beats ours by DN-1, but HELD on our engine: it takes grid edits cell by cell and nuade has none at the pin (owner rule: no lost edit path); 08242a402, nuadeFormats.test.ts (no lost edit path)
- [ ] AB24 sonix -- OPEN, no reference: UADE.wasm and native uade123 both fail on all three corpus songs (score died: the instrument files are not in the corpus); default stays ours
- [x] AB25 soundcontrol -- nuade 0.995 vs ours 0.995 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB26 soundfactory -- nuade 0.925 vs ours 0.890 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB27 soundmon -- nuade 0.966 vs ours 0.934 like UADE beats ours by DN-1, but HELD on our engine: it takes grid edits cell by cell and nuade has none at the pin (owner rule: no lost edit path); 08242a402, nuadeFormats.test.ts (no lost edit path)
- [x] AB28 suntronic -- measured: our engine plays V1.3 score modules and refuses all three corpus songs (compiled .sun), nothing to compare: default ours (nuade 0.969 like UADE); 08242a402, nuadeCompareTooling.test.ts (ownRender), nuadeFormats.test.ts
- [x] AB29 synthesis -- nuade 0.815 vs ours 0.939 like UADE: default ours (DN-1); 1122f5b89, 2534ff05c, selector offers all three
- [x] AB30 sonicarranger -- measured on the one song ours plays (mega end.sa): nuade 0.958 vs ours 0.951, under the 0.01 margin: default ours; almighty.sa (0x4EFA, ours refuses) plays on nuade by NAB-2; 08242a402, nuadeCompareTooling.test.ts (ownRender), nuadeFormats.test.ts
- [x] AB31 hippelhip -- added by NR-0
- [ ] AB32 fcbsi -- OPEN: nuade 0.784 like UADE; our engine is the TypeScript scheduler through Tone instruments (no headless render); default stays ours
- [x] AB33 gmc -- added by NR-0

Phase 6 - DJ (3)
- [x] ND-1 `renderWithNuade` in dj-render.worker.ts: one nw_render pass gives the mix and every voice (scopes + mono stems), dispatched on `engine: 'nuade'`. -- 73107dffb, djNuadeRenderHasChannelScopes.test.ts
- [x] ND-2 DJPipeline resolves the engine on the main thread (nuadePlayerFor via djRenderEngine.ts) and passes engine + playerId; the engine is part of the cache key (`#nuade=<id>`), scope re-renders use the entry's own key. -- 73107dffb, djNuadeRenderHasChannelScopes.test.ts (switch = other cache entry)
- [x] ND-3 `djNuadeRenderHasChannelScopes.test.ts`: loadOrEnqueue on the MMDC song -> real worker in-process -> 4 voice scopes carrying signal, 4 mono stems; in test:ci. -- 73107dffb (reverted dispatch: fails)

Phase 7 - Credits (4)
- [x] CR-1 `third-party/nuade/LICENSE` (MIT, Copyright (c) 2026 Daniel Collin) and upstream `THIRD_PARTY_NOTICES.md` kept verbatim. -- b3f582c8d, nuadeCredits.test.ts CR-1
- [x] CR-2 `THIRD_PARTY_NOTICES.md` `### nuade` next to `### UADE`: author, source at the pin, MIT text in full, format list generated from the table (`tools/nuade/write-notices.ts`, regenerate after apply-verdicts). -- b3f582c8d, 08242a402 (list regenerated), nuadeCredits.test.ts CR-2
- [x] CR-3 README licence paragraph names nuade and emoon beside UADE. -- b3f582c8d, nuadeCredits.test.ts CR-3
- [x] CR-4 In-app: the instrument panel shows the credit, the row label and the nuade player id for a nuade-played song (and nothing for another song); `get_format_state.engineCredit` is the same constant. -- b3f582c8d, formatEngineSelect.test.tsx CR-4 + formatEngineTools.test.ts NS-11

Phase 8 - Reachability and close (3)
- [x] NV-6 ONE reachability test: parseModuleToSong -> applied to the stores -> startNativeEngines -> real NuadeEngine -> worklet + WASM; sentinel loadTune (count 1, player id), moduleLoaded, 30 s audible, 0.95 like UADE, positions advance; choice pinned. -- b3f582c8d, nuadeReachability.test.ts (reverted wiring: fails)
- [x] NV-7 Type-check clean (`npm run type-check`), eslint clean on the touched nuade files (the 2 errors left in dj-render.worker.ts are old `any`s in the UADE path), the touched tests green, progress file reconciled to the ticks below. -- 08242a402
- [x] NV-8 Handoff `thoughts/shared/handoffs/2026-10-13_nuade-engine-close.md`; the NUADE-ENGINE entry in `thoughts/spot/todos.md` and the memory note updated with the final counts.

**Totals:** 9 phases (0-8), 162 items (159 planned + AB31-AB33 added by NR-0): Phase 0 5, Phase 1 10, Phase 2 12, Phase 3 5, Phase 4 85 (NR-0 + R01-R84),
Phase 5 35 (NAB-1, NAB-2, AB01-AB33), Phase 6 3, Phase 7 4, Phase 8 3, plus DN decisions (not items).

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

## Adaptations while implementing Phases 0-2 (2026-10-13)

- Choice is applied once, after the route: `parseModuleToSong` calls `applyNuadeChoice` (withNuade.ts) on the routed song, so
  the ~190 route call sites stay untouched; the table's keys reach the routes through `resolvedFormatEngines` (nuade reads
  as native there). Identification is by the registry key or the player's extension/prefix, confirmed by nuade's own
  probe (`nuadeProbe.ts`, Nuade.wasm loaded on the main thread only when some format's choice is nuade). FormatRegistry
  keys alone did not work: MMDC files detect as `med`.
- The table has `legacyEngine` (what the key defaulted to before): defaultEngine starts as it, a held row returns to it,
  and a replace row's "UADE" option is stored as it (earAche legacy 'native' = our parser + UADE playback).
- 112 preference keys belong to the table (23 new, optional); the store no longer holds their defaults; settings v14.
- 27 table rows have no corpus song in public/data/songs (listed by `corpus: []`); Phase 3 can only measure the other 87.
- Mute and the main mix: nuade's voice buffers are mono L+R sums, so the shim takes muted/isolated voices out of the
  stereo mix using the mixer's pan per voice (`nw_pans`); worklet isolation/dub sends use side = (1+pan)/2, gain 1.
- `followBy 'tick'` = row * speed + tick of the position snapshot (exact only for grid_ticks players, where nuade reports
  one pattern of all scanned ticks); players with real orders follow by order/row.
- NE-9: VU reaches the channel meter feed (what the meters read); `get_audio_level` itself reads the master analyser and
  is not drivable headless, so the MCP getter is left to the manual check.
- NV-5: the workflow could not be run (no push yet); its paths/commands are asserted by test.
- Dual rows with an own engine keep the other engines' file data except those ahead of Nuade in the registry.
- Settings tab and instrument panel mount the same `FormatEngineSelect`; the panel mount shows for songs carrying
  `nuadePlayerId` (nuade-played). A dual-row song on its own engine is switched from the Settings tab.

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


## Phase 3-4 results and adaptations (2026-10-13)

Commits: 89b866fcc (tooling, verdicts, NR-0, 17 Modland rows), 1122f5b89 (dual rows measured), 2534ff05c (Hippel dual rows); fixes found on the way
657554f73 (selector, edit path, defaults audit) and 48e104450 (node voice count).

### Wave 1 verdicts (replace rule D8, 30 s, 20 ms envelope at best lag, vs the UADE wasm)

| Row | Songs | Mean correlation | Ends | Live edit swap | Verdict |
|---|---|---|---|---|---|
| mmdc | 2 | 0.990 | agree | no edit path today | DONE, default nuade |
| robhubbard | 3 | 0.990 | agree | 88 ms (gate d, <= 100) | DONE, default nuade |
| timfollin | 2 | 0.986 | agree | no edit path today | DONE, default nuade |
| earache | 2 | 0.965 | agree | no edit path today | DONE, default nuade |
| musicalenlightenment | 2 | 0.962 | agree | no edit path today | DONE, default nuade |

Rob Hubbard: the first run (nuade at its default repeat count 0, which plays on through loop points) disagreed with UADE's
song end on centurion_battle.rh (UADE 5.7 s, nuade never ended) and on mmdc knightmare (3.7 s); UADE is rendered with
looping off, so nuade is rendered with its matching setting (end at the first loop point, nw_set_repeat(1)). Both then end
within 0.1 s of UADE and pass. Tim Follin: UADE ends 11.4 s, nuade 11.8 s, agree.

### Whole table (owner asked for every format on 2026-10-13)

114 rows: 38 default to nuade (34 replace, 4 dual by DN-1),
37 replace rows are HELD on their current engine with the failing measurement, 10 have no song anywhere (unmeasured).

Held replace rows (the measured reason is also in `heldBecause` and shown in the selector):

| Row | Reason |
|---|---|
| aprosys | action.aps: correlation 0.481 < 0.9; action.aps: UADE plays on, nuade ends at 25.6 s; actionfiltersound.aps: UADE plays on, nuade ends at 25.6 s; mean correlation 0.739 < |
| audiosculpture | turtle-ready.adsc: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| desire | batmanreturns.dsr: peak 0.000 <= 0.05; batmanreturns.dsr: RMS 0.000 <= 0.02; batmanreturns.dsr: correlation -2.000 < 0.9; batmanreturns.dsr: peak 0.000 <= 0.05; batmanret |
| dirkbialluch | tpu.timelock ingame: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| dsc | dragon'sbreath_fanfares.dsc: UADE plays on, nuade ends at 6.9 s; dragon'sbreath dbfx.dsc: UADE ends at 8.7 s, nuade ends at 1.5 s; live edit would lose its path: swap to  |
| dynamicsynthesizer | dns.ptc: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| emsv6 | perception.ems: RMS 0.011 <= 0.02; perception.ems: correlation 0.408 < 0.9; mean correlation 0.408 < 0.95 |
| forgottenworlds | forgotten worlds intro.fw: correlation -2.000 < 0.9; mean correlation -0.017 < 0.95 |
| fredgray | eco.gray: peak 0.000 <= 0.05; eco.gray: RMS 0.000 <= 0.02; eco.gray: no correlation (less than 1 s of music to compare before a song end); eco.gray: UADE plays on, nuade  |
| gluemon | gnu-song.glue: correlation 0.738 < 0.9; mean correlation 0.821 < 0.95 |
| infogrames | bob4e.dum: _uade_wasm_load failed (ret=-1); advantage tennis-intro.dum: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| jasonpage | jpn.virocop-14: _uade_wasm_load failed (ret=-1); jpn.fire and ice-1: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| jesperolsen | lollypop-subgame_01.jo: _uade_wasm_load failed (ret=-1); JO.GeorgGlaxo title: _uade_wasm_load failed (ret=-1); guldkornsexpressen ingame.jo: no correlation (less than 1 s |
| krishatlelid | hatlelid_smallest.kh: nuade open failed (-2): the driver file "songplay" is missing; fiendish freddys - songs.kh: nuade open failed (-2): the driver file "songplay" is mi |
| legglessmusiceditor | the punisher gameover.lme: correlation 0.627 < 0.9; mean correlation 0.627 < 0.95 |
| majortom | mean correlation 0.945 < 0.95 |
| markcooksey | mighty bombjack.mc: correlation 0.881 < 0.9; mighty bombjack.mc: UADE plays on, nuade ends at 26.9 s; mean correlation 0.922 < 0.95 |
| markcooksey_old | sibling markcooksey is held |
| maximumeffect | MAX.DinosaurDetective gamedat: _uade_wasm_load failed (ret=-1); MAX.DinosaurDetective jingle1: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| medley | combat.mso: UADE plays on, nuade ends at 7.7 s |
| paulrobotham | dawnpatrol-sad.dat: _uade_wasm_load failed (ret=-1); dawnpatrol-sad.dat: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| paulsummers | everton_fc_-_jingles.snk: UADE plays on, nuade ends at 4.0 s; everton fc - jingles.snk: UADE plays on, nuade ends at 4.0 s |
| pierreadane | Ivanhoe_ivanhoe - bonus.pap: _uade_wasm_load failed (ret=-1); Ivanhoe_ivanhoe - hiscore.pap: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| pokeynoise | pn.tetris: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| protracker4 | the drainer.ptm: correlation 0.860 < 0.9; the drainer.ptm: lag 200 ms > 100; mean correlation 0.860 < 0.95 |
| richardjoseph | cannon fodder (intro).sng: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| robhubbardst | battleships.rho: correlation 0.803 < 0.9; battleships.rho: correlation 0.803 < 0.9; mean correlation 0.803 < 0.95 |
| soundfx | operation_stealth.sfx: UADE ends at 9.9 s, nuade ends at 19.8 s |
| soundimages | blinkys scary school-sfx.tw: UADE ends at 9.7 s, nuade ends at 1.9 s |
| soundmaster | live edit would lose its path: swap to the 120 s mark takes 203 ms > 100 ms |
| specialfx | wildwheels_ingame.jd: UADE ends at 16.9 s, nuade ends at 4.3 s; striker ingame.jd: RMS 0.008 <= 0.02; striker ingame.jd: UADE plays on, nuade ends at 5.6 s |
| stevebarrett | street_fighter.sb: correlation 0.631 < 0.9; street fighter.sb: correlation 0.631 < 0.9; mean correlation 0.631 < 0.95 |
| synthdream | sdr.monsterbusiness_5: _uade_wasm_load failed (ret=-1); sdr.nobuddiesland_jigsaw: _uade_wasm_load failed (ret=-1); sdr.monsterbusiness 1: _uade_wasm_load failed (ret=-1); |
| synthpack | centerbase_soft.osp: _uade_wasm_load failed (ret=-1); centerbase soft.osp: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| thomashermann | thm.blueangel69: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |
| voodoo | silkworm.vss: correlation 0.855 < 0.9; voo8.vss: correlation 0.514 < 0.9; mean correlation 0.685 < 0.95 |
| zoundmonitor | sonjavanveen.sng: _uade_wasm_load failed (ret=-1); mean correlation n/a < 0.95 |

Unmeasured (no song of the format in public/data/songs, none found on Modland by extension or Modland format name; they play as before):
amos, andrewparton, cinemaware, kimchristensen, laxity, ntsp, onescapee, quartet, timetracker, ufo.

Dual rows, DN-1 (nuade beats ours by >= 0.01 on the mean, no song worse by more than 0.01, plus the floor below):
actionamics 0.993/0.993; activisionpro 0.925/0.881; bendaglish 0.993/0.992; davidwhittaker 0.904/0.907; deltamusic1 0.912/0.902; deltamusic2 0.974/0.610; digmug 0.847/0.650; dss 0.976/0.974; facethemusic 0.000/ours n/a; fcbsi 0.784/ours n/a; fred_np -0.538/ours n/a; futurecomposer 0.966/0.945; gmc 0.928/0.929; hippel 0.983/0.972 NUADE; hippel7v 0.880/0.565; hippelhip 0.984/0.991; instereo1 0.973/0.944 NUADE; instereo2 0.306/0.035; jamcracker 0.970/0.987; musicassembler 0.834/0.749; musicmaker 0.947/ours n/a; oktalyzer 0.561/0.781; pumatracker 0.992/0.996; quadracomposer 0.373/0.374; ronklaren 0.368/0.364; sidmon2 0.981/0.944 NUADE; sonicarranger 0.975/ours n/a; sonix 0.000/ours n/a; soundcontrol 0.995/0.995; soundfactory 0.925/0.890; soundmon 0.966/0.934 NUADE; suntronic 0.969/ours n/a; synthesis 0.815/0.939.
Our engine could not be measured for: facethemusic, fcbsi, fred_np, musicmaker, sonicarranger, sonix, suntronic (reasons in `ownNote`): their default stays ours and their AB items are open.

### Adaptations

- **Metric.** The 100 ms eagleCompare metric scored the known-good pair antidust.bp3 at 0.896: the UADE wasm render starts about 20 ms
  after nuade's, which 100 ms windows turn into a miss. The research's metric (20 ms envelope, best lag) gives 0.974. The lag is
  in every row (-20 ms for all passing songs) and a lag above 100 ms fails the song. Instrument check: antidust.bp3 0.974 passes,
  apb.dw 0.406 fails; the batch refuses to run its verdicts if either answer changes.
- **A500 filter.** The shipped UADE.wasm renders with the A500 filter on and exports no switch (entry.c sends no filter command, libuade
  defaults to A500), so "filter off on both sides" is not possible without rebuilding the shipped binary. Measured instead: the wasm
  against native uade123 --filter=NONE is 0.992 and against --filter=A500 0.996 (antidust, 100 ms), so the filter moves a score by about 0.005.
- **Results file** is tools/nuade/nuade-compare.json (tracked): test-data/ is git-ignored. No --jobs: one process, a row takes about a second.
- **Song end** of a side: its flagged end, else the start of a silent tail of 2 s or more (apb.dw stops sounding without a flag).
- **UADE cannot be the reference** for some corpus songs: UADE.wasm refuses them (ret=-1: module check failed, a missing .info companion,
  FTM is not a UADE format at all). Those rows record the UADE error as the reason and stay held / on ours.
- **DN-1 floor** (not in the decision, on the safe side): nuade must itself pass the per-song rule (audible, correlation >= 0.90 per song,
  lag, song end) and reach a 0.95 mean before it can beat ours. Without it instereo2 (nuade 0.31, ours 0.03) and deltamusic2 / futurecomposer
  (nuade's song end differs from UADE's) would move on noise. The owner can drop the clause in verdictRules.dualDefault.
- **A dual verdict's "ours stays"** maps to the row's legacy engine (bendaglish defaulted to UADE before the table).
- **NR-0**: 57 replace rows have a corpus song; 54 play on UADE (UADEEditable), hippelhip on the Hippel engine (libtfmxaudiodecoder in the TFMX
  worklet), fcbsi on the TypeScript scheduler, gmc on libopenmpt. The three moved to dual as AB31-AB33 (the total is 162 items). A fresh user's
  pre-nuade default is held by a test against the settings defaults of 57e7803be (all 91 pre-existing keys match).
- **Accidental full run**: `--fresh <id>` ran every format once (a selection bug, fixed: --fresh now implies --only). It cost about three minutes and
  its rows are the recorded data of the later waves. The owner then asked for a full run anyway.
- **Modland**: 17 of the 27 rows without a song got 1-2 real songs from the server's /api/modland route (kept only when the row's own nuade player
  accepts them); 10 have none anywhere: amos, andrewparton, cinemaware, kimchristensen, laxity, ntsp, onescapee, quartet, timetracker, ufo.
- **Live bugs fixed in between** (coordinator, localhost MCP): (1) an edit on a nuade Rob Hubbard song swapped in a 2080-byte MOD: the export router
  dispatched on `uadeEditableFileData`, which a nuade song does not carry, and Rob Hubbard's exporter fell back to a ProTracker serializer; the router
  now hands exporters the engine's module (nativeExportRouter.ts, nuadeEditReachesThePlayingSong.test.ts). (2) The selector reported a legacy
  'native' as effective/default for a row whose choices were uade|nuade and refused the way back: values are now reported in the vocabulary of the
  choices, an unhonourable stored value is ignored, and a stored choice can be reset (store, "Reset to Default" in the selector, engine 'default' in
  set_format_engine). Rob Hubbard's old 'native' was RobHubbardParser with UADEEditable playback, not an engine of ours: it stays a replace row.
- **Node voice count (not done as asked)**: the coordinator asked for the AudioWorkletNode to be sized from the loaded player's channel count.
  channelOutputsSizedByVoices.test.ts reads a numeric literal from every channelOutputNodeOptions(...) call and the voice count is known only inside
  the worklet after nw_open, so NuadeEngine declares the literal 8 (corpus maximum, and FTM_MAX_CHANNELS 8 the largest constant in the player
  sources; paulrobotham and musicmaker read theirs from the module). Per-song sizing needs the node recreated on load and the literal rule relaxed.

### What is next

1. NAB-2: route the Sonic Arranger 0x4EFA variant (SonicArrangerParser.ts useOffsetTable) to withNuade; sonicarranger's AB30 stays open until then.
2. Dual rows with no own-engine score: facethemusic, fred_np, musicmaker, sonix (UADE cannot render the corpus song, so no reference), suntronic (engine not on the
   shared worklet protocol), sonicarranger (refuses the 0x4EFA variant). Each needs a reference or a harness.
3. The 10 unmeasured replace rows need a real song of the format (none on Modland); the owner may know where to find one.
4. Held rows whose only failure is the reference (UADE.wasm refused the song, ret=-1): audiosculpture, dirkbialluch, dynamicsynthesizer, infogrames, jasonpage, jesperolsen, maximumeffect, paulrobotham, pierreadane, pokeynoise, richardjoseph, synthdream, synthpack, thomashermann, zoundmonitor.
   nuade may play them; there is no comparison. A different reference (uade123 native, or the Musashi runner) would settle them.
5. Phases 6-8 (DJ render, credits, the reachability test, close) are untouched.

## Phases 6-8, the CI failures and what is left (2026-10-13 evening)

Commits: b3f582c8d (CR-1..4, NV-6), 73107dffb (ND-1..3), 08242a402 (CI fix, NAB-2, 4 dual rows measured, node sizing).

- **DJ (ND)**: nuade formats render through nuade on a deck: one `nw_render` pass gives the mix and each voice (scopes, mono stems, pans from `nw_pans`).
  The engine is resolved once on the main thread (`djRenderEngine.resolveRenderPlayer`, the one resolver `nuadePlayerFor`) and is part of the cache key
  (`#nuade=<id>`), so a switch re-renders. `NuadeDriver` (node-free) is shared by the worker, the tooling and the voice counter.
- **Node sizing**: `NuadeEngine.loadTune` asks the main-thread Nuade.wasm for the player's voice count and recreates the node when it differs
  (`resizeNode`, mute mask kept; isolation and dub sends are re-posted by afterPlay). No other engine did this. `channelOutputsSizedByVoices` accepts an
  engine listed with its proving test (`nuadeNodeVoices.test.ts`: 4, 6, 7, 4 voices, outputs = 1 + 4 + voices).
- **The 17 CI failures** (Live stuck on ad4e6c9a): (1) 12 tests import songs through `parseModuleToSong`; nuade's probe fetched `/nuade/Nuade.js`, which no test serves:
  `src/test/nuadeNodeProbe.setup.ts` (vitest setupFiles) answers the probe and the voice count from the Node loader. (2) Owner rule "no lost edit path":
  Rob Hubbard (replace row) goes back to UADE until a test proves a typed note is audible through nuade's module swap (`EDIT_SOUNDS_ON_NUADE`, empty);
  hippel, instereo1, sidmon2 and soundmon (dual rows) stay on our engine whatever nuade scores, because nuade has no cell write (CELL_WRITE off at the pin).
  `ownEditPath` in apply-verdicts, guard in nuadeFormats.test.ts. (3) The registry imported `nuadeFormats`; `NuadeEngine.setGrid` now reads `followBy`.
  Why the local gate missed them: the pre-push gate selects tests by file proximity, and the flipped defaults live in `nuadeVerdicts.ts`, whose only importers
  are table readers; the 17 suites reach it through `parseModuleToSong`. pre-push now runs `test:ci` when `nuadeVerdicts.ts`, `useSettingsStore.ts` or
  `parseModuleToSong.ts` changes.
- **Found**: table extensions `SUN_EXTENSION` and `SBR_EXTENSION` were unexpanded C macro names (SUN-Tronic and Steve Barrett could never route by name); fixed, guarded.
  MMDC and Tim Follin open in the scope view because their grid is a UADE scan (`gridEstimated`), before and after nuade (owner confirmed live): they belong to the DN-2 decoder plan.

### What is left

1. Ten replace rows have no song (amos, andrewparton, cinemaware, kimchristensen, laxity, ntsp, onescapee, quartet, timetracker, ufo): Modland has none that nuade accepts. They play as before.
2. facethemusic and sonix: no reference exists (UADE lacks the player / dies on the corpus), so neither engine can be scored; fcbsi: no headless render of the TypeScript scheduler.
3. Edit-path hold LIFTED (owner, 2026-10-13: "audio quality/playback first; editability is ported to all formats later"): the five rows below moved to nuade on their playback numbers; see NUADE-EDIT-PATH.
4. Held rows whose only failure is the reference (UADE.wasm refused the song, ret=-1): audiosculpture, dirkbialluch, dynamicsynthesizer, infogrames, jasonpage, jesperolsen, maximumeffect, paulrobotham, pierreadane, pokeynoise, richardjoseph, synthdream, synthpack, thomashermann, zoundmonitor.
   nuade may play them; there is no comparison. A different reference (uade123 native, or the Musashi runner) would settle them.
5. Phases 6-8 (DJ render, credits, the reachability test, close) are untouched.

## Phases 6-8, the CI failures and what is left (2026-10-13 evening)

Commits: b3f582c8d (CR-1..4, NV-6), 73107dffb (ND-1..3), 08242a402 (CI fix, NAB-2, 4 dual rows measured, node sizing).

- **DJ (ND)**: nuade formats render through nuade on a deck: one `nw_render` pass gives the mix and each voice (scopes, mono stems, pans from `nw_pans`).
  The engine is resolved once on the main thread (`djRenderEngine.resolveRenderPlayer`, the one resolver `nuadePlayerFor`) and is part of the cache key
  (`#nuade=<id>`), so a switch re-renders. `NuadeDriver` (node-free) is shared by the worker, the tooling and the voice counter.
- **Node sizing**: `NuadeEngine.loadTune` asks the main-thread Nuade.wasm for the player's voice count and recreates the node when it differs
  (`resizeNode`, mute mask kept; isolation and dub sends are re-posted by afterPlay). No other engine did this. `channelOutputsSizedByVoices` accepts an
  engine listed with its proving test (`nuadeNodeVoices.test.ts`: 4, 6, 7, 4 voices, outputs = 1 + 4 + voices).
- **The 17 CI failures** (Live stuck on ad4e6c9a): (1) 12 tests import songs through `parseModuleToSong`; nuade's probe fetched `/nuade/Nuade.js`, which no test serves:
  `src/test/nuadeNodeProbe.setup.ts` (vitest setupFiles) answers the probe and the voice count from the Node loader. (2) Owner rule "no lost edit path":
  Rob Hubbard (replace row) goes back to UADE until a test proves a typed note is audible through nuade's module swap (`EDIT_SOUNDS_ON_NUADE`, empty);
  hippel, instereo1, sidmon2 and soundmon (dual rows) stay on our engine whatever nuade scores, because nuade has no cell write (CELL_WRITE off at the pin).
  `ownEditPath` in apply-verdicts, guard in nuadeFormats.test.ts. (3) The registry imported `nuadeFormats`; `NuadeEngine.setGrid` now reads `followBy`.
  Why the local gate missed them: the pre-push gate selects tests by file proximity, and the flipped defaults live in `nuadeVerdicts.ts`, whose only importers
  are table readers; the 17 suites reach it through `parseModuleToSong`. pre-push now runs `test:ci` when `nuadeVerdicts.ts`, `useSettingsStore.ts` or
  `parseModuleToSong.ts` changes.
- **Found**: table extensions `SUN_EXTENSION` and `SBR_EXTENSION` were unexpanded C macro names (SUN-Tronic and Steve Barrett could never route by name); fixed, guarded.
  MMDC and Tim Follin open in the scope view because their grid is a UADE scan (`gridEstimated`), before and after nuade (owner confirmed live): they belong to the DN-2 decoder plan.

### What is left

1. Ten replace rows have no song (amos, andrewparton, cinemaware, kimchristensen, laxity, ntsp, onescapee, quartet, timetracker, ufo): Modland has none that nuade accepts. They play as before.
2. facethemusic and sonix: no reference exists (UADE lacks the player / dies on the corpus), so neither engine can be scored; fcbsi: no headless render of the TypeScript scheduler.
3. Rob Hubbard back to nuade, and the four held dual rows: when a nuade player publishes a cell write (DN-3, the owner contacts emoon) or a test proves typed notes audible through the module swap
   (add the row to `EDIT_SOUNDS_ON_NUADE`, rerun apply-verdicts).
4. Held rows whose only failure is a reference UADE refuses (list under "What is next" 4); the DN-2 decoder plan; the rows of `nuadePlaysFormats` are the standing test for all of them.
5. Not pushed. Owner checks: LOCAL http://localhost:5174, `npm run dev:fullstack`: load `captain planet and the planeteers - title.mmdc`, Settings > Playback Engines shows nuade; instrument panel names Daniel Collin / emoon;
   a DJ deck loads it and shows 4 moving scopes; load `almighty.sa` (plays on nuade) and `mega end.sa` (our engine); `get_format_engines` shows hippel/instereo1/sidmon2/soundmon/robhubbard held with the reason.

## NUADE-EDIT-PATH (owner decision 2026-10-13: playback quality first, editability ported later)

The hold (`EDIT_SOUNDS_ON_NUADE`, the `liveEditToday`/`swapMs` gate of `replaceVerdict`, `ownEditPath`/`editHeld` of `dualDefault`) is removed from
`tools/nuade/verdictRules.ts` and `apply-verdicts.ts`; verdicts regenerated from the recorded results (no re-measuring). Rob Hubbard follows D8, the four
dual rows follow DN-1 with the KEPT floor. Edit-path tests pin the row's legacy engine (`src/engine/__tests__/helpers/pinEditPathEngine.ts`), so they guard
the old edit path independent of the default.

Moved to nuade (playback mean correlation against UADE): robhubbard 0.9896 (replace), soundmaster 0.9805 (replace, also live-edit; it was held by the same
gate), hippel 0.9827 (ours 0.9722), instereo1 0.9728 (ours 0.9438), sidmon2 0.9809 (ours 0.9443), soundmon 0.9656 (ours 0.9338).

- [x] NUADE-EDIT-PATH live edits (typed notes into the grid, cell edits) audible on nuade, 6 of 6, by module swap
  (2026-10-14). Proof: `src/engine/__tests__/nuadeEditsAreHeard.test.ts` (in test:ci via src/engine/__tests__/): engine
  pinned to nuade, song opened by importTrackerModule, started by startNativeEngines on the real NuadeEngine + worklet +
  WASM (nuadeEngineRig), note raised +2 through useTrackerStore.setCell while it plays. Asserted per format: swapModule
  called once, swapDone, no worklet error, nuade's probe opens the handed bytes; output identical to the unedited run
  from the swap to the edited row (|first diff - heardAt| < 0.1 s); the edited voice +2 semitones, every other voice 0.
  - [x] robhubbard: centurion_battle.rh p0 v1 r48, heard 2.88 s (expected 2.86), 1-byte module diff. Fixed earlier by
    657554f73 (exporter read uadeEditableFileData only); also covered by nuadeModuleFields (565e0616e).
  - [x] soundmaster: rackney'sisland_4.sm p12 v2 r0, heard 7.68 s (7.66); layout patch already 1 byte; no fix needed.
  - [x] hippel: prehistoric_tale.hipc p3 v4 r1, heard 6.88 s (6.84). Fix 565e0616e: playOnNuade removed hippelFileData,
    export fell to the from-scratch CoSo writer (2489 of 24340 bytes, nuade refused it); now nuadeModuleFields restores
    the field for the exporter. Revert-checked: no swap.
  - [x] instereo1: fantasi8.is p8 v2 r0, heard 7.68 s. Fix 0a64251e9: exporter was a lossy rebuild (45656 -> 117928 bytes,
    render error 0.45); now in-module, copy on write for shared runs, transposes honoured; ratchet byte-exact.
    Revert-checked: output left run A at the swap (6.50 s).
  - [x] sidmon2: bruno_time.sid2 p2 v2 r2, heard 15.70 s; SidMon2 exporter already wrote note edits in place; no fix.
  - [x] soundmon: antidust.bp3 p4 v1 r0 (a block other steps share), heard 7.68 s. Fix a2e295e36: V.3 written as lossy
    V.2 (13684 -> 13028 bytes, render error 1.42); now in-module, copy on write, transposes honoured; ratchet
    byte-exact. Revert-checked: output left run A at the swap.
  Pitch across positions (nuade snapshot, +2 expected on the edited voice): rh 10 sites, sm 9, hipc 7, is 10, sd2 10,
  bp3 8: all +2 on the right voice.
  Swap latency: main thread edit -> swapDone 36-96 ms (first edit of a session ~2 s, lazy imports); the worklet swap
  (reopen + silent seek) is ~1 ms per second already played: measured headless 8-23 ms at 10 s, 49-67 ms at 60 s,
  93-135 ms at 120 s, 130-230 ms at 180 s, all inside one audio-thread call -> see NUADE-SWAP-DROPOUT.
  EDIT_SOUNDS_ON_NUADE no longer exists in tools/nuade/verdictRules.ts (removed with the hold, c20c5c8ba): recorded here only.
- [ ] NUADE-SWAP-DROPOUT (found 2026-10-14): the swap reopens the module and renders silently to the played frame inside
  one worklet process() call; late in a song that blocks the audio thread for 100-230 ms (a dropout per edit). Fix
  level: the worklet (catch-up on a second nuade instance spread over quanta while the old one keeps playing, then
  switch), or emoon's cell write (DN-3) which removes the swap. Owner hears it at: a song played past 2 minutes, type a note.
- [ ] NUADE-PREVIEW keyboard preview on nuade songs. Legacy: preview never ran on the song engine except for two formats.
  Runs on the instrument's own synth through ToneEngine (unaffected by nuade): robhubbard (RobHubbardSynth), hippel
  (HippelCoSoSynth), soundmaster (Sampler), instereo1 (InStereo1Synth loads its own keyboard copy of
  useFormatStore.inStereo1FileData: previewLoad + preview handle). Depends on the song replayer holding the module:
  soundmon (SoundMonSynth -> SoundMonEngine.previewNoteOn needs the song handle from loadTune; output = engine.output)
  and sidmon2 (SidMonSynth song slot -> Sd2Engine.noteOn -> sd2_note_on on the loaded song; Sd2Engine.output routed only
  when Sd2 plays the song). On nuade neither replayer is loaded: preview of song instruments is expected silent (not
  measured in a browser). Right level: the InStereo1 keyboard-copy pattern in SoundMonSynth / SidMonSynth (load the song's
  module into the idle replayer for preview, from the format store, nuadeModuleFields-aware), plus Sd2 output routing
  when Sd2 is not the song engine. Not built: the audio-graph routing (Sd2 output into the synth vs NativeEngineRouting's
  route when Sd2 plays the song) needs a browser check before it can be done without doubling legacy playback.
  Other nuade-default rows have no LIVE_EDIT 'pass' entry, so they lose nothing they had.

## NUADE-EAGLEPLAYER-7: the seven EaglePlayer formats as dual rows (AE01-AE07, owner 2026-10-14)

Owner: nuade's C players are the future (more editable), so the seven formats that stayed on the Musashi runner get nuade
too; research doc line ~152 ("Keep ours") is superseded for them. Procedure = the other dual rows (D8 + DN-1 floor,
`tools/nuade` batch, apply-verdicts writes the defaults). All seven players are in the committed Nuade.wasm (121 players
= 81 replace + 40 dual rows). Legacy engine = the EaglePlayer runner, stored as `native` ("Our Engine"); `eagleRunner: true`
on the row removes UADE from its choices (the routes never hand playback to UADE, so that option would do nothing).
Measured 2026-10-14, 30 s, 20 ms envelope, best lag, against UADE (nuade / EaglePlayer -> default):

- [x] AE01 andersoland -- 0.985 / 0.993 -> ours (EaglePlayer)
- [x] AE02 beathoven -- 0.884 / 0.976 -> ours; nuade fails the floor (tristar cracktro.bss 0.883 < 0.90)
- [x] AE03 bendaglishsid -- 0.915 / 0.948 -> ours; nuade mean 0.915 < 0.95 floor
- [x] AE04 coredesign -- 0.984 / 0.9995 -> ours; nuade ends at 23.1 s where UADE plays on (end agreement fails)
- [x] AE05 davelowe -- 0.985 / 0.997 -> ours (corpus: incredibleshrinkingsphere.dl and m-bison.dln, the player lists dln too)
- [x] AE06 scottjohnston -- 0.892 / 0.990 -> ours; nuade fails the floor (sjs.tune1 0.854 < 0.90)
- [x] AE07 wallybeben -- 0.956 / 0.991 -> ours
- [x] AE-1 `ownRender.ts` renders the EaglePlayer runner headless (`load: 'eagle'`, player picked by the song's prefix) so DN-1 has both numbers.
- [x] AE-2 Settings v15 drops the stored old defaults of the seven keys (a stored `native` would pin the measured default); keys made optional in `FormatEnginePreferences`, store defaults removed. Test: useSettingsStore.migration.test.ts v15.
- [x] AE-3 Reachability: src/engine/__tests__/nuadeEaglePlayerRows.test.ts (parseModuleToSong -> EaglePlayer on `native`, Nuade on `nuade`, live scores = recorded, DN-1 = table default; 16 tests); DJ deck through nuade: src/engine/dj/__tests__/djNuadeEaglePlayerRowRenders.test.ts (wallybeben, 4 voice scopes). Both in test:ci.
- [x] AE-4 Settings > Playback Engines (121 rows) and get_format_engines list the rows; set_format_engine refuses UADE for them (playbackEnginesPanel.test.tsx, formatEngineTools.test.ts).
- [x] AE-5 nuadeFormats.test.ts: 40 dual rows; the pre-nuade default test knows an EaglePlayer row's old stored default was never read.
