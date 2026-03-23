# DJ Set Playback — Design Spec

**Date**: 2026-03-23
**Status**: Draft

## Overview

Wire up the existing `DJSetPlayer` engine to a browsable UI so users can browse, play back, and delete recorded DJ sets. Both DOM and Pixi GL UIs share a single source of truth via `useDJSetStore`. All tracks are stored as compressed audio blobs in the server DB, making sets fully self-contained and fast to load.

## Architecture

### Three Changes

1. **`useDJSetStore` expansion** — Move all playback orchestration logic into store actions (`fetchSets`, `playSet`, `stopPlayback`, `deleteSet`). Components are pure views.
2. **`DJSetBrowser` UI** — Top-bar dropdown (DOM + Pixi) for browsing/playing sets.
3. **Track storage pipeline** — On recording stop, upload original file bytes for each track; server transcodes non-Opus audio to Opus via ffmpeg; on playback, download compressed blobs and decode natively.

### Data Flow

```
useDJSetStore (Zustand) — single source of truth
├── setList[], selectedSetId
├── isPlayingSet, currentSetId, playbackProgress, playbackElapsed
├── preloadProgress
├── actions: fetchSets(), playSet(id), stopPlayback(), deleteSet(id)
│
├── DJSetBrowser.tsx (DOM)   ──reads/calls──> store
└── PixiDJSetBrowser.tsx (GL) ──reads/calls──> store
```

All logic lives in store actions. Components only render state and call actions.

## Track Storage Pipeline

### Retaining Original File Bytes

`DeckAudioPlayer` does not currently retain the original `ArrayBuffer` after loading. To support track storage:

- Add `_originalFileBytes: ArrayBuffer | null` field to `DeckAudioPlayer`
- Set it in `loadAudioFile()` before decoding
- Add public getter `getOriginalFileBytes(): ArrayBuffer | null`
- This avoids the wasteful decode→WAV→upload→re-encode pipeline: we upload the original compressed file directly (MOD, XM, SID, MP3, OGG, etc.)

For modland/hvsc tracks, the original bytes are already compact (100KB–5MB). For synthesized formats (SID, tracker modules), the file bytes are tiny (<1MB). No WAV encoding needed in most cases.

### On Recording Stop (client-side, in `DJSetRecordButton.tsx`)

1. Iterate `set.metadata.trackList` entries
2. **Skip modland/hvsc tracks** — these can be re-fetched from their archives on playback. Only store tracks with `type: 'local'` or when the archive is unreliable.
3. For local tracks: get original file bytes via `DJEngine.getDeck(deckId).audioPlayer.getOriginalFileBytes()`
4. Upload as blob: `uploadBlob(new Blob([bytes], { type: mimeType }), fileName)`
5. Rewrite track source to `{ type: 'embedded', blobId: response.id, originalSource: oldSource }`
6. Rewrite matching `load` events in `set.events` to use embedded source
7. Save the set via `saveDJSet(set)`

**Note**: `uploadBlob()` takes a `File | Blob`, so wrap the ArrayBuffer in a `Blob` before uploading.

### Server-Side Transcoding (in `djsets.ts` blob upload route)

On blob upload, if mime type is `audio/wav` or file is uncompressed audio:
1. Check SHA256 dedup **first** — if blob already exists, return existing ID (skip transcoding)
2. If new blob: pipe through ffmpeg: `ffmpeg -i pipe:0 -c:a libopus -b:a 320k -vbr on -f webm pipe:1`
3. Store the resulting Opus/WebM bytes in `dj_blobs` (not the original)
4. Update the stored `mime_type` to `audio/webm;codecs=opus`
5. Return the blob ID

Non-audio uploads (tracker modules like .mod/.xm/.sid) and already-compressed audio (WebM, OGG, MP3) pass through unchanged — browsers can decode them natively via `decodeAudioData()`.

**ffmpeg graceful fallback**: If ffmpeg is not available, log a warning and store the original bytes uncompressed.

**Multer size limit**: Increase from 10MB to 100MB to handle large WAV/AIFF files that users might load locally.

### On Playback (client-side)

1. Fetch full set via `getDJSet(id)`
2. Extract required tracks via `DJSetPlayer.getRequiredTracks(set)`
3. For each track:
   - `type: 'embedded'` → `downloadBlob(blobId)` → ArrayBuffer
   - `type: 'modland'` → fetch from modland archive (existing infrastructure)
   - `type: 'hvsc'` → fetch from HVSC archive (existing infrastructure)
4. Decode each ArrayBuffer via `audioContext.decodeAudioData()` → AudioBuffer
5. **Load tracks into decks**: Iterate `load` events in chronological order, call `DJEngine.loadToDeck(deckId, audioBuffer)` for each, wait for load to complete
6. Build `preloadedTracks` map with the decoded AudioBuffers
7. Call `player.startPlayback(set, preloadedTracks)`

### Size Estimates

- Tracker modules (.mod/.xm/.it): 100KB–5MB (stored as-is, no transcoding needed)
- Local WAV/AIFF: transcoded to ~1.5MB per 5-min track as 320kbps VBR Opus
- Typical 2-track, 60-min set with tracker modules: <10MB total
- SQLite handles this comfortably

## Store Actions (useDJSetStore)

### Player Instance Lifecycle

The `DJSetPlayer` instance is stored as a **module-level variable** (not in Zustand state, since it's not serializable), following the same pattern as `_activeRecorder` in `DJSetRecordButton.tsx`:

```typescript
let _activePlayer: DJSetPlayer | null = null;
```

Store actions create/destroy this reference. Components never access it directly.

### `fetchSets(options?)`
- Calls `listDJSets(options)` from `djSetApi`
- Updates `setList` with results
- Called on dropdown open and after recording stop

### `playSet(id: string)`
- Guard: reject if `isRecording` or already `isPlayingSet`
- Set `isPlayingSet = true`, `currentSetId = id`
- Fetch full set via `getDJSet(id)`
- Extract required tracks, set `preloadProgress = 0`
- Download/fetch each track (embedded → `downloadBlob`, modland/hvsc → archive fetch)
- Decode each to AudioBuffer, update `preloadProgress` incrementally
- **On any individual track failure**: set error state on that set, reset `isPlayingSet`, do not start playback. User can retry.
- Load tracks into decks via `DJEngine.loadToDeck()` for each `load` event
- Create `DJSetPlayer` instance, assign to `_activePlayer`:
  - `player.onProgress = (elapsed, total) =>` update `playbackElapsed`, `playbackProgress`
  - `player.onComplete = () =>` call `stopPlayback()`, increment play count
- Call `player.startPlayback(set, preloadedTracks)`
- If mic audio exists: download blob, decode to AudioBuffer, call `player.startMicAudio(audioBuffer, DJEngine.getMixerSamplerInput())`

### `stopPlayback()`
- Call `_activePlayer?.stopPlayback()`, set `_activePlayer = null`
- Reset: `isPlayingSet = false`, `currentSetId = null`, `playbackProgress = 0`, `playbackElapsed = 0`

### `deleteSet(id: string)`
- Guard: if `currentSetId === id`, call `stopPlayback()` first
- Call `deleteDJSet(id)` via API
- Remove from `setList`

## UI Components

### DOM: `DJSetBrowser.tsx`

Location: Top navigation bar, alongside Sign In, Collab, MIDI buttons.

**Button**: "Sets" label with badge showing total set count. Disabled (grayed) when `isRecording === true`.

**Dropdown panel** (absolute positioned, z-indexed above content, `pointer-events: auto` on the dropdown container since the top bar may overlay a WebGL canvas):
- Header row with title "DJ Sets" and close button
- Scrollable list of sets, each row showing:
  - Name (bold)
  - Author name
  - Duration formatted as `mm:ss`
  - Track count
  - Play count
  - Relative date (e.g., "2h ago")
  - Play button (FontAudio `play` icon)
  - Delete button (FontAudio `remove` icon) — only for own sets, with confirmation
- Empty state: "No recorded sets yet"
- Preloading state: progress bar on the selected set row
- Playback state: progress bar with elapsed/total time, stop button, replaces the play button
- Pagination: initial fetch of 50 sets. Infer "has more" from `sets.length === limit` (server does not return `total`). Show "Load more" when true.
- Closes on outside click or Escape key
- No seek/scrub in v1 — progress bar is display-only

### GL: `PixiDJSetBrowser.tsx`

Same layout and behavior as DOM version, rendered with Pixi display objects:
- Uses existing Pixi UI primitives (PixiButton, PixiText, etc.)
- Reads from `useDJSetStore` via Zustand subscription
- Calls same store actions
- Uses FontAudio icons throughout (no emoji):
  - `open` — sets button icon
  - `close` — dismiss dropdown
  - `play` / `stop` — playback controls
  - `remove` — delete set

### Mutual Exclusion

- **Recording blocks playback**: "Sets" button disabled when `isRecording === true`
- **Playback blocks recording**: REC button disabled when `isPlayingSet === true`
- Both check the other's state in `useDJSetStore`

## DJSetFormat Changes

### `TrackSource` type update

Add `originalSource` field to preserve provenance:

```typescript
type TrackSource =
  | { type: 'modland'; fullPath: string }
  | { type: 'hvsc'; path: string }
  | { type: 'embedded'; blobId: string; originalSource?: TrackSource }
  | { type: 'local'; fileName: string };
```

### `DJSetTrack` — updated interface

```typescript
interface DJSetTrack {
  source: TrackSource;
  fileName: string;
  trackName?: string;  // was required, now optional (backward-compatible: old sets still have it)
  bpm?: number;        // was required, now optional
  duration?: number;   // new field, optional
  loadedAt: number;    // microseconds from set start
}
```

**Migration note**: Making `trackName` and `bpm` optional is backward-compatible for reading (existing sets still have values). New sets may omit them if metadata is unavailable.

## Server Changes

### Blob upload route (`POST /api/djsets/blobs`)

Add ffmpeg transcoding for uncompressed audio uploads:

```typescript
// Increase multer limit from 10MB to 100MB
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });

// In the upload handler:
// 1. SHA256 dedup check FIRST (before any transcoding)
const sha256 = computeSha256(file.buffer);
const existing = db.prepare('SELECT id FROM dj_blobs WHERE sha256 = ?').get(sha256);
if (existing) return res.json({ id: existing.id, deduplicated: true });

// 2. Transcode WAV/AIFF to Opus if ffmpeg available
if (isUncompressedAudio(file.mimetype)) {
  try {
    const compressed = await transcodeToOpus(file.buffer);
    // store compressed bytes with mime_type = 'audio/webm;codecs=opus'
  } catch {
    // ffmpeg not available — store original bytes (graceful fallback)
  }
}
```

`transcodeToOpus()` implementation:
- Spawn `ffmpeg -i pipe:0 -c:a libopus -b:a 320k -vbr on -f webm pipe:1`
- Pipe input buffer to stdin, collect stdout as Buffer
- Return compressed bytes

### List endpoint — add `total` count

Add `total` to `GET /api/djsets` response for pagination:

```typescript
const total = db.prepare('SELECT COUNT(*) as count FROM dj_sets').get().count;
res.json({ sets, offset, limit, total });
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No sets exist | Empty state: "No recorded sets yet" |
| Individual track preload fails | Error shown on set row, playback not started, user can retry entire set |
| Playback while recording | "Sets" button disabled |
| Recording while playing set | REC button disabled |
| Delete during playback | Stop playback first, then delete |
| Network error on fetch | Show error toast, retry button |
| ffmpeg not available on server | Log warning, store uncompressed (graceful fallback) |
| Modland/HVSC archive down | Error on preload, suggest re-recording with local files |

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/dj/DJSetBrowser.tsx` | DOM dropdown component |
| `src/pixi/views/dj/PixiDJSetBrowser.tsx` | Pixi dropdown component |

## Files to Modify

| File | Change |
|------|--------|
| `src/stores/useDJSetStore.ts` | Add `fetchSets`, `playSet`, `stopPlayback`, `deleteSet` actions; module-level `_activePlayer` |
| `src/engine/dj/DeckAudioPlayer.ts` | Add `_originalFileBytes` field + getter to retain original file bytes |
| `src/components/dj/DJSetRecordButton.tsx` | Upload local track bytes on stop, rewrite sources to embedded |
| `src/engine/dj/recording/DJSetFormat.ts` | Add `originalSource` to `TrackSource`, make `trackName`/`bpm` optional |
| `src/engine/dj/recording/DJSetEvent.ts` | No changes needed (types already correct) |
| `server/src/routes/djsets.ts` | Increase multer limit, add ffmpeg transcoding, add `total` to list response |
| `src/components/NavBar.tsx` (or equivalent top bar) | Add DJSetBrowser button |
| `src/pixi/views/shared/PixiNavBar.tsx` (or equivalent) | Add PixiDJSetBrowser button |

## Testing

1. **Record a set** with 2 tracks loaded from modland → verify modland sources preserved (no blob upload needed)
2. **Record with local file** → verify original bytes uploaded as blob, source rewritten to embedded
3. **Browse sets** → verify list shows the recorded set with correct metadata and total count
4. **Play a set** → verify preload progress, then playback with controls animating (crossfader, EQ, volumes moving)
5. **Stop mid-playback** → verify clean stop, controls return to neutral
6. **Delete own set** → verify removed from list with confirmation
7. **Verify Opus compression** → upload a WAV, check stored blob is significantly smaller
8. **Play set with mic recording** → verify mic audio plays back in sync
9. **Cross-UI consistency** → verify DOM and Pixi browsers show same data and trigger same behavior
10. **Preload failure** → simulate missing blob, verify error shown and retry works
11. **ffmpeg fallback** → remove ffmpeg from PATH, verify WAV stored uncompressed
