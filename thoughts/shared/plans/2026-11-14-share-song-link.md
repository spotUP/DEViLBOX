---
date: 2026-11-14
status: draft
topic: Share button - link that opens DEViLBOX with the current song loaded (hybrid URL / server storage)
---

# Share song link

Owner decisions: HYBRID storage (small song compressed into the URL, large song uploaded, link holds short ID). On open: song loads, Play prompt, NO autoplay.

## 1. Existing reuse (file:line)

- URL-param precedent: `?collab=CODE` (src/lib/startup/startupSequence.ts:56-75, `startupDialog`, drops the param with `history.replaceState`); `?quiet` (src/lib/startup/startupPolicy.ts:25); `?view=` (src/App.tsx:114). No song-from-URL param exists (no `?url=`/`?song=`). Share-link copy precedent: src/components/collaboration/CollaborationModal.tsx:37 (`navigator.clipboard.writeText(link)`).
- Compression: `pako` is a runtime dep (used src/lib/export/FurnaceExporter.ts:16, CheeseCutterParser.ts:17). Use `pako.deflate`/`inflate`; no new dep. (`CompressionStream` not used anywhere; pako is sync and testable in Node/vitest.)
- Server storage: Express in server/ (server/src/index.ts:83 json 10mb, :99 raw 10mb for /api/render). multer precedent server/src/routes/djsets.ts:18 (100 MB). SQLite via better-sqlite3 (server/src/db/database). File store root `DATA_ROOT` default `/var/www/devilbox/data` (server/src/utils/fileSystem.ts:9). Per-user file routes server/src/routes/files.ts (auth required, JSON text, not suitable for anonymous share).
- Rate limit: express-rate-limit pattern at server/src/ai/limits.ts:110 (`rateLimit` per IP, `trust proxy` set at index.ts:60). Download limiter: server/src/routes/mirror.ts:15 (`createDownloadLimiter`). Auth: server/src/middleware/auth.ts (`authenticateToken`, `optionalAuth`).
- Client API base: src/lib/apiBase.ts:26 (`API_URL`); copy djSetApi.ts / modlandApi.ts style for `shareApi.ts`.

## 2. The one load path

`openSong(src, opts)` in src/lib/song/openSong.ts:386 is the door (UnifiedFileLoader.loadFile at src/lib/file/UnifiedFileLoader.ts:51 delegates to it; MCP `loadFile` at src/bridge/handlers/writeHandlers.ts:1818 also does). Source kinds incl. `{kind:'url', url, name, bytes}` (openSong.ts:80). `START_BY_ORIGIN` (openSong.ts:140) decides autoplay: `drop/filebrowser/dialog/mcp = false`. Share-open: add a new origin `'share'` to `OpenOrigin` (openSong.ts:82) and `START_BY_ORIGIN.share = false` (record is exhaustive, so tsc forces it). Not interactive (no import dialog), unless owner wants it.
Boot timing: song loads already await the startup jingle + boot restore (`whenStartupJingleDone`, `whenBootRestoreDone`, startupSequence.ts:~85, bootRestore.ts:27). A share link must override boot restore (do not restore the last session over it) - check how App.tsx boot restore runs (src/hooks/useProjectPersistence.ts) and skip it when `?s=`/`?share=` present.

## 3. Current song as bytes

- Primary: `exportNativeFile()` (src/lib/export/moduleExportService.ts:44) -> `exportNativeSong(null)` (src/lib/export/nativeExportRouter.ts:106) returns `{data: Uint8Array, filename, warnings, companions?}`; edits included. Availability check without serializing: `nativeExportAvailableForLiveSong()` (moduleExportService.ts:57).
- Last-resort inside the router: raw original bytes `useFormatStore.uadeEditableFileData` / `libopenmptFileData` (nativeExportRouter.ts:421; useFormatStore.ts:192, :240 `originalModuleData` base64).
- Fallback when native export unavailable: project `.dbx` via `exportSong({prettify:true})` (src/lib/export/exporters.ts:343; today it downloads - need a variant returning the JSON string/bytes; extract the serializer, do not duplicate). Loads back through `openSong` kind 'project'. FT2Toolbar Save shows the same native-then-.dbx fallback (src/components/tracker/FT2Toolbar/FT2Toolbar.tsx:255-295).
- Risks: `companions` (multi-file formats like Sonix) must travel with the song -> bundle as a small container (see format). `warnings`/refused notes from the exporter must be shown in a toast before copying. Cinter songs export via `cinterMode`.

## 4. Share button placement

FT2Toolbar (src/components/tracker/FT2Toolbar/FT2Toolbar.tsx) holds Save/Export; add a `<Button variant="default">Share</Button>` (src/components/ui/Button.tsx) next to Export, plus a command in src/engine/keyboard/commands/file.ts so it is keyboard/MCP reachable. Logic in a new `src/lib/share/` service (no logic in the component): `buildShareLink()`, `openShareLink()`. Toasts: `notify.success('Link copied')`, `notify.warning` for exporter warnings/oversize, `notify.error`. Clipboard: `navigator.clipboard.writeText` (needs secure context and user gesture - the button click is both; on failure show the link in a `<Modal>` with a read-only input to copy by hand). Also check the other toolbars (DJ view, NavBar, MobileMenu) - tracker view only for v1.

## 5. Server side

- New route `server/src/routes/share.ts`, mounted in server/src/index.ts near :99 with its own `express.raw({type:'application/octet-stream', limit:'<cap>'})` BEFORE the 10mb json parser (same pattern as /api/render). `POST /api/share` (anonymous, per-IP rate limit via express-rate-limit, e.g. 10/hour, 50/day), `GET /api/share/:id` (rate limited like mirror).
- Storage: blobs at `${DATA_ROOT}/share/<id>.bin` (fileSystem.ts:9 root), metadata row in SQLite (id, filename, size, sha256, created_at, expires_at, ip hash). Dedupe by sha256 -> same song gives same ID. ID = 8 chars base62 random (crypto.randomBytes), non-guessable.
- Expiry sweep: on server start + daily setInterval, delete rows/files past expires_at. Global disk cap (e.g. 2 GB total share dir -> refuse with 507).
- Server runs as Express on :3011 behind the host's Caddy/proxy; scripts/server-setup.sh only sets up the webhook (:9000) and dist rsync, not the Express service - CONFIRM how the API process is started on the host (unverified; I did not find it in server-setup.sh) before shipping, and that `DATA_ROOT` is writable there. If the API is not deployed with the site, the large mode cannot ship.
- Security: never serve with an executable type (`Content-Type: application/octet-stream`, `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`); size check on raw body; reject empty; CORS already open to origin.

## 6. Design

### URL format
- Small: `https://devilbox.uprough.net/#share=z1.<base64url(deflate(container))>`. Use the FRAGMENT, not the query: never sent to the server/logs/proxies, no server request-line limit (Caddy/Go default 8 KB header... fragment bypasses it), no cache keying. (`?` params used elsewhere; fragment `#/_view=` exists at App.tsx:117 and `#/design-system` App.tsx:105 - parse `#share=` explicitly and strip it after load with replaceState so refresh does not reload.)
- Large: `https://devilbox.uprough.net/#share=s.<id>` (fragment too, for one parser; `?s=<id>` is the alternative if link previews/unfurlers matter - they do not see fragments).
- Container (both modes, inside the deflate for URL mode, raw bytes for server mode): tiny binary/JSON header `{v:1, name, kind:'native'|'dbx', companions:[{name,len}]}` + payload bytes. Version byte so the format can evolve.

### Cut-off
Browsers accept 64 KB+ URLs (Chrome ~2 MB, Firefox/Safari large), but chat/mail/social apps truncate or reject links beyond ~2 KB (many) to ~8 KB (some), and a 10 KB link is unusable in messaging. base64url inflates by 1.33x. Propose: URL mode when base64url length <= 6,000 chars (~4.5 KB compressed); above that upload. Unit-test measures the boundary. Typical chip-tune modules (SID/AY/Furnace/small MODs) compress to 1-4 KB and fit; sample-based MODs/XMs go to the server.

### Upload limit / lifetime
- Max 8 MB per share (covers most MOD/XM/IT; larger refused with a clear toast offering file export instead).
- Lifetime 90 days from creation, refreshed on open (sliding), hard cap 1 year; owner may choose permanent.

### Open flow
1. Boot: `src/lib/share/shareBoot.ts` reads `location.hash`, if `#share=` present: skip silent boot restore, fetch/inflate, build `File(name, bytes)` + companions, call `openSong({kind:'url'...} or file src, {origin:'share', start:false})`, then strip hash.
2. After load, show a Play prompt: small `<Modal>`/banner "Opened shared song: <name>. [Play]" - its click is the AudioContext unlock gesture (same reason as closeStartDialog, startupSequence.ts:~80), then `transport play`. Suppress the welcome dialog/jingle for share links (extend `startupPolicy`, startupPolicy.ts:30, like `?collab`), or the jingle's gesture and our Play prompt collide.
3. Errors (404/expired, bad payload, unsupported format): `notify.error` and fall through to a normal empty start.

### Files to touch
- new src/lib/share/shareContainer.ts (pack/unpack, pako), shareLink.ts (build, size routing), shareBoot.ts (open), shareApi.ts (fetch/upload)
- src/lib/song/openSong.ts (origin 'share' + START_BY_ORIGIN)
- src/lib/export/exporters.ts (extract .dbx serializer returning bytes)
- src/lib/startup/startupPolicy.ts + startupSequence.ts (no dialog/jingle for share; skip boot restore)
- src/components/tracker/FT2Toolbar/FT2Toolbar.tsx (Share button), src/engine/keyboard/commands/file.ts (command), new SharePlayPrompt component, mount in App.tsx
- server/src/routes/share.ts, server/src/index.ts, server/src/db schema/migration, deploy docs
- MCP: add `share_link` / open-by-link tool if the owner wants agents to test (extend MCP, per memory) - optional

### Tests
- shareContainer round-trip (with companions, empty, corrupt, version mismatch) - vitest, node.
- shareLink: size routing at the cut-off boundary; fragment parse incl. other `#/_view=` hashes.
- Round trip with real songs (memory: real songs for tests): export native -> pack -> unpack -> openSong -> same pattern data, for one MOD, one chip format, one multi-file format; assert `started === false` and origin 'share'.
- START_BY_ORIGIN exhaustive (tsc) + startupPolicy test for share links.
- server/src/routes/share.test.ts (supertest-style as existing *.test.ts): upload, fetch, dedupe, over-limit 413, rate limit 429, expiry sweep, bad id.
- Human test: localhost:5174 (LOCAL) then LIVE after deploy: load song, Share, paste link in a fresh tab; PASS = song loaded, Play prompt shown, no sound until Play.

## Open decisions for owner (recommended default first)
1. URL cut-off: 6,000 chars (recommended) vs 2,000 (safest for chat apps) vs 20,000.
2. Max upload size: 8 MB (recommended) vs 2 MB vs 25 MB.
3. Lifetime: 90 days sliding (recommended) vs 30 days vs permanent.
4. Anonymous upload with IP rate limit (recommended) vs login required (needs account UI).
5. Share unexportable formats as .dbx (recommended) vs disable button for them.
6. Edits: share the song as currently edited (recommended) vs original file.
7. Fragment `#share=` (recommended) vs query `?s=` (needed only for link-preview unfurling, which would then require server-rendered meta).
8. Open flow: Play-prompt modal (recommended) vs banner/toast with Play button.
9. Does a share link replace the user's restored previous session silently (recommended, matches "no restore prompt" memory) or ask?
10. Add an MCP tool for share/open (recommended yes, small).

## Unverified
- How the Express API process is launched/proxied on the production host (not in scripts/server-setup.sh); DB migration location (server/src/db not read); whether boot restore can be cleanly skipped (not read); DJ view needs its own Share (out of scope v1).

## Owner answers (2026-11-14, via AskUserQuestion)
1. URL cut-off: **6,000 chars**.
2. Max upload size: **8 MB**.
3. Lifetime: **5 days, sliding** (each open resets the 5 days). Not 90.
4-10. **Accept all defaults** (anonymous upload + per-IP rate limit; unexportable formats share as .dbx; share song as currently edited; `#share=` fragment; Play-prompt modal; share link replaces restored session silently; add MCP tool).
- Added by owner: **the opener may edit the shared song, but edits never change the shared original.** The uploaded blob (and the URL payload) is immutable; the opener works on a local copy. Saving/sharing again makes a new link/ID, never overwrites the old one. No PUT/overwrite route on the server.

## Phase 2: merge back (owner request 2026-11-14, answers via AskUserQuestion)
Goal: async co-op. Opener edits a shared song and sends the changes back; the original author merges them.
- Delivery: **inbox on the share**. Opener presses "Send Changes Back"; server stores the edited song as a reply attached to the share. Author's browser holds the secret owner key (returned at upload, server keeps sha256 only). DEViLBOX shows the author "N changes waiting" and opens a review. No accounts.
- Merge: **cell-level three-way merge** against the shared base (the base is the immutable shared blob). Non-clashing changes apply automatically: pattern cells, instruments, order list. Same-cell clashes are shown and the author picks per conflict. Undo available.
- Timing: **after v1**. v1 already stores parent_id and owner-key hash (told to build agent).
- Open questions for the phase 2 plan:
  - 5-day sliding lifetime vs a waiting inbox: does a reply keep the base alive?
  - URL-mode shares have no server row: a send-back needs to upload the base first.
  - Instrument and sample merge rules for native formats.
  - Losing browser data loses the owner key (owner accepted).
  - Possible reuse: src/lib/collaboration/SongSyncLayer.ts (live co-op) and the MCP diff_patterns tool.
- Phase 2 answers (second round, AskUserQuestion):
  - Lifetime: a reply resets the 5 days for the share and its replies. A reply stays until the author merges it, dismisses it, or 5 days pass with no open.
  - Small songs: **every share uploads**, link-sized ones too. The link carries the inline data plus the server ID (v1 change, sent to build agent). Every share has an inbox.
  - Instruments: whole-instrument merge. One side changed it: take that side. Both sides changed it: conflict, author picks. Samples go with their instrument.
  - Access: anyone with the link can send back, under the per-IP rate limit. The author can copy an "author link" that holds the owner key, to open the inbox on another device.
