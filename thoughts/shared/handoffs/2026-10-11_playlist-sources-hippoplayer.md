---
date: 2026-10-11
topic: DJ seed playlists keep HippoPlayer sources; hippoplayer.se via proxy; isBad invariant
tags: [dj, playlists, hippoplayer, taws, proxy, autodj, isBad]
status: draft
---

# DJ seed playlist sources (HippoPlayer) + isBad invariant

## Task(s)
1. Committed converter for HippoPlayer `.prg` -> seed, every entry keeps its source - DONE (bc140123d).
2. hippoplayer.se modules load through the server proxy, old /data/Modules mapped - DONE (bc140123d).
3. Regression tests, revert-checked - DONE (15 tests; 10 fail on the reverted state).
4. Added mid-task: tracks that play stay flagged bad - DONE (42af5f08d), revert-checked.
Nothing pushed.

## Critical references
- src/lib/dj/hippoPlaylist.ts - .prg parse (`parsePrgEntries`), `sourceForUrl`, `playlistFromPrg`.
- tools/convert-hippo-playlists.ts - `npx tsx tools/convert-hippo-playlists.ts /Users/spot/Downloads/Playlists [--dry-run]`.
- src/lib/dj/remoteSources.ts - host allowlist `REMOTE_SOURCE_ORIGINS`, `remoteSourceProxyUrl`, `remoteUpstreamUrl` (shared client/server).
- server/src/routes/remote.ts (`/api/remote/<host>/<path>`), server/src/services/cachedRemoteDownload.ts (cache + limiter, also used by /api/modland/download).
- src/engine/dj/DJTrackLoader.ts - `remoteTrackSource` (modland: + http(s) sources), `recordLoad`.
- src/lib/dj/playlistTrackSource.ts - `repairSourcesFromSeed`, `applyLoadOutcome`.
- src/stores/useDJPlaylistStore.ts - `SEED_SOURCES_REVISION = 2`, persisted `seedSourcesRevision`, `recordTrackLoad`, `syncBundledPlaylists`.
- Tests: src/lib/dj/__tests__/hippoPlaylistKeepsEverySource.test.ts, src/lib/dj/__tests__/hippoplayerSourcesLoadThroughTheProxy.test.ts, src/engine/dj/__tests__/djLoaderOpensUrlSourcesThroughTheProxy.test.ts, src/engine/dj/__tests__/djTrackThatLoadsIsNeverLeftBad.test.ts, src/stores/__tests__/djPlaylistSeedEntriesCarrySources.test.ts (all in test:ci and test:ci:fast).

## Recent changes
- bc140123d fix(dj): seed playlist entries keep their HippoPlayer source; hippoplayer.se loads through the proxy
- 42af5f08d fix(dj): isBad means the last load attempt failed; a successful load or render clears it
- tools/resolve-bundled-playlist-sources.ts deleted (superseded by the converter).

## Uncommitted files and their state
None from this task. (Other agents' WIP in the tree untouched.)

## Learnings
- .prg format: `HiPPrg` header, one URL per line, optional `#name=<title>` and `#song=<n>` markers; decoration lines prefixed 0xF7. Files are mixed UTF-8 / ISO-8859-1 (old seed had mojibake names). Literal `#` appears inside Modland names ("superchip #2.xm") - split only on `#name=`/`#song=`.
- 74 files, 4681 URL entries: 3591 Modland, 626 HVSC, 151 hippoplayer.se, 105 uhc.amigaremix.com, 100 uhc.remix.kwed.org, 99 www.modules.pl (zips), 1 files.scene.org (404 now), 8 live radio streams. One TAWS link `https://hippoplayer.se/WB.html?playmod=<hvsc url>` unwrapped.
- Seed before: 4166 modland + 515 bare. After: 3591 modland, 627 hvsc, 463 URL, 0 bare. 112 moved Modland paths re-found by name via `resolveBareFileName`; 382 Modland paths are not in the local index (kept as-is, may 404 - the old seed had 585 such). Old seed ids kept dots (`playlist-prg-ne7s-faves-vol.-1`) - the converter preserves that.
- The old converter/resolver had wrong basename guesses (e.g. Rainbow Islands "30 Ending.vgz" -> Wonder Boy); now the playlist's own URL.
- TAWS/hippoplayer.se probe (8 requests): `/` -> meta refresh to `/WB.html`; JS/Config.js has `m_DisableWorkModules = true`, `m_HippoPlayerDefaultModulesDir = "Work:Modules"`. `https://hippoplayer.se/data/Modules/Protracker/D/DWB/quickening.mod` -> 404; `https://hippoplayer.se/webdata/Modules/Protracker/D/DWB/quickening.mod` -> 200 (186592 B, `access-control-allow-origin: *`); a `/webdata/Modules/...vgz` from the playlists -> 200. Mapping: `/data/Modules/X` -> `/webdata/Modules/X` over https.
- Other hosts: amigaremix (http) 206 audio/mpeg, kwed redirects to https 206, modules.pl 206 zip, files.scene.org -> retropc mirror 404.
- Server: `server` tsc already fails on cross-root imports (mcpServer), so the API server must run through tsx; remote.ts imports src/lib/dj/remoteSources.ts the same way. Unverified how production starts the server.
- isBad writers: only `markTrackBad` (manual UI in DJPlaylistModal/DJPlaylistPanel, DJTrackLoader pre-render/load failures, DJPlaylistPrecache failures). Root cause of "plays but red": the success clear was guarded by the caller's stale track snapshot (`if (result && track.isBad)`) and limited to the active playlist. The three Nr Seven tracks were flagged at 12:04:22Z within 70 ms ("pre-render produced no audio"), most likely while the dev server restarted. setActivePlaylist still auto-clears flags older than 1 h (left as is).

## Live verification
- Express :3011 serves `/api/remote/hippoplayer.se/webdata/...mozart%20is%20a%20fake.mod` 200; streams -> 400; /api/modland/download still 200 after refactor.
- Live browser: persisted "Anathema-Imbasille 3" repaired to revision 2 (6 hippoplayer URLs); `preRenderTrack` rendered 8/8 (no deck, no playback started).

## Next steps
1. Push when the owner batches (pre-push gate runs the full suite); then confirm live buildHash and that `/api/remote/...` works on devilbox.uprough.net (production server start method unverified).
2. Owner: the three "Anathema-Nr Seven" tracks stay red in the live browser until their next successful load/render (or Clear Bad Flag) - the new code clears them on that load.
3. Optional: carry HippoPlayer `#song=<n>` subsong markers into the source (currently dropped; 7 entries, e.g. Monkey Island subsongs 5/6).
4. Optional: url-source companions (`acquireNeighbourCompanions` on /api/remote dirs finds none; TFMX pairs from hippoplayer.se would lack smpl.*).

## Other notes
- Owner's .prg files were read only; none copied into the repo (test fixture inlines the 8-line Imbasille 3 playlist).
