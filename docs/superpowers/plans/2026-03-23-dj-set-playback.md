# DJ Set Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing DJSetPlayer to a browsable UI so users can browse, play back, and delete recorded DJ sets from both DOM and Pixi UIs.

**Architecture:** Store-driven orchestration in `useDJSetStore` with pure-view components for DOM (`DJSetBrowser.tsx`) and Pixi (`PixiDJSetBrowser.tsx`). Tracks stored as compressed Opus blobs on the server. Original file bytes retained in `DeckAudioPlayer` for upload on recording stop.

**Tech Stack:** React, PixiJS, Zustand, Express, SQLite, ffmpeg (Opus transcoding), Web Audio API

**Spec:** `docs/superpowers/specs/2026-03-23-dj-set-playback-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/dj/DJSetBrowser.tsx` | DOM top-bar dropdown for browsing/playing sets |
| `src/pixi/views/dj/PixiDJSetBrowser.tsx` | Pixi nav-bar dropdown for browsing/playing sets |
| `server/src/utils/transcode.ts` | ffmpeg Opus transcoding helper |

### Modified Files
| File | Changes |
|------|---------|
| `src/engine/dj/DeckAudioPlayer.ts` | Add `_originalFileBytes` field + getter |
| `src/engine/dj/recording/DJSetFormat.ts` | Update `TrackSource` (add `originalSource`), make `trackName`/`bpm` optional |
| `src/engine/dj/recording/DJSetEvent.ts` | Add `originalSource` to embedded TrackSource |
| `src/stores/useDJSetStore.ts` | Add `fetchSets`, `playSet`, `stopPlayback`, `deleteSet` actions |
| `src/components/dj/DJSetRecordButton.tsx` | Upload local track bytes on stop, rewrite sources |
| `src/lib/djSetApi.ts` | Update `listDJSets` return type to include `total` |
| `server/src/routes/djsets.ts` | Increase multer limit, add ffmpeg transcoding, add `total` to list |
| `src/components/layout/NavBar.tsx` | Add DJSetBrowser button |
| `src/pixi/shell/PixiNavBar.tsx` | Add PixiDJSetBrowser button |

---

## Task 1: Retain Original File Bytes in DeckAudioPlayer

**Files:**
- Modify: `src/engine/dj/DeckAudioPlayer.ts`

- [ ] **Step 1: Add `_originalFileBytes` field and getter**

In `DeckAudioPlayer`, add after the existing private fields (around line 44):

```typescript
private _originalFileBytes: ArrayBuffer | null = null;
```

Add public getter:

```typescript
getOriginalFileBytes(): ArrayBuffer | null {
  return this._originalFileBytes;
}
```

- [ ] **Step 2: Store bytes in `loadAudioFile`**

In `loadAudioFile(buffer: ArrayBuffer, filename: string)` (line 59), add as the first line of the method body:

```typescript
this._originalFileBytes = buffer.slice(0); // defensive copy
```

- [ ] **Step 3: Clear on dispose**

In the `dispose()` method, add:

```typescript
this._originalFileBytes = null;
```

- [ ] **Step 4: Verify build**

Run: `npm run type-check`
Expected: Clean pass

- [ ] **Step 5: Commit**

```bash
git add src/engine/dj/DeckAudioPlayer.ts
git commit -m "feat(dj): retain original file bytes in DeckAudioPlayer for set embedding"
```

---

## Task 2: Update DJSetFormat Types

**Files:**
- Modify: `src/engine/dj/recording/DJSetFormat.ts`
- Modify: `src/engine/dj/recording/DJSetEvent.ts`

- [ ] **Step 1: Update `TrackSource` in `DJSetEvent.ts`**

Add `originalSource` to the embedded variant (around line 12):

```typescript
export type TrackSource =
  | { type: 'modland'; fullPath: string }
  | { type: 'hvsc'; path: string }
  | { type: 'embedded'; blobId: string; originalSource?: TrackSource }
  | { type: 'local'; fileName: string };
```

- [ ] **Step 2: Update `DJSetTrack` in `DJSetFormat.ts`**

Make `trackName` and `bpm` optional, add `duration`:

```typescript
export interface DJSetTrack {
  source: TrackSource;
  fileName: string;
  trackName?: string;
  bpm?: number;
  duration?: number;
  loadedAt: number;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: Clean pass (optional fields are backward-compatible)

- [ ] **Step 4: Commit**

```bash
git add src/engine/dj/recording/DJSetFormat.ts src/engine/dj/recording/DJSetEvent.ts
git commit -m "feat(dj): add originalSource to TrackSource, make trackName/bpm optional"
```

---

## Task 3: Server — Increase Multer Limit, Add Opus Transcoding, Add Total Count

**Files:**
- Create: `server/src/utils/transcode.ts`
- Modify: `server/src/routes/djsets.ts`

- [ ] **Step 1: Create `transcode.ts` helper**

```typescript
// server/src/utils/transcode.ts
import { spawn } from 'child_process';

/**
 * Transcode audio buffer to Opus/WebM via ffmpeg.
 * Returns null if ffmpeg is not available (graceful fallback).
 */
export async function transcodeToOpus(inputBuffer: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-b:a', '320k',
      '-vbr', 'on',
      '-f', 'webm',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    proc.on('error', () => {
      console.warn('[transcode] ffmpeg not available, storing uncompressed');
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        console.warn(`[transcode] ffmpeg exited with code ${code}, storing uncompressed`);
        resolve(null);
      }
    });

    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}
```

- [ ] **Step 2: Increase multer limit in `djsets.ts`**

Change line 17 from:

```typescript
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
```

To:

```typescript
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });
```

- [ ] **Step 3: Add transcoding to blob upload route**

In the `POST /api/djsets/blobs` handler (line 163), after the SHA256 dedup check but before storing the blob, add transcoding for WAV/AIFF:

```typescript
import { transcodeToOpus } from '../utils/transcode';

// ... inside the handler, after dedup check:
let fileData = req.file.buffer;
let mimeType = req.file.mimetype;

const isUncompressed = mimeType === 'audio/wav' || mimeType === 'audio/x-wav'
  || mimeType === 'audio/aiff' || mimeType === 'audio/x-aiff'
  || req.file.originalname.match(/\.(wav|aiff|aif)$/i);

if (isUncompressed) {
  const compressed = await transcodeToOpus(fileData);
  if (compressed) {
    fileData = compressed;
    mimeType = 'audio/webm;codecs=opus';
  }
}
```

Then use `fileData` and `mimeType` instead of `req.file.buffer` and `req.file.mimetype` in the INSERT statement. Recompute SHA256 on the transcoded bytes for correct dedup.

- [ ] **Step 4: Add `total` to list endpoint**

In the `GET /api/djsets` handler (around line 62), add a count query:

```typescript
const { count: total } = db.prepare('SELECT COUNT(*) as count FROM dj_sets').get() as { count: number };
```

Add `total` to the response:

```typescript
res.json({ sets: rows.map(formatRow), offset, limit, total });
```

- [ ] **Step 5: Verify server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 6: Test API**

```bash
# Test total count
curl -s http://localhost:3001/api/djsets | python3 -c "import json,sys; d=json.load(sys.stdin); print('total' in d)"

# Test blob transcode (upload a small WAV)
# Generate a 1-second test WAV
ffmpeg -f lavfi -i "sine=frequency=440:duration=1" -f wav /tmp/test-tone.wav 2>/dev/null
curl -s -X POST http://localhost:3001/api/djsets/blobs \
  -F "file=@/tmp/test-tone.wav;type=audio/wav" \
  -F "filename=test-tone.wav" | python3 -m json.tool
```

- [ ] **Step 7: Commit**

```bash
git add server/src/utils/transcode.ts server/src/routes/djsets.ts
git commit -m "feat(server): Opus transcoding for DJ set blobs, 100MB upload limit, total count"
```

---

## Task 4: Update djSetApi Client

**Files:**
- Modify: `src/lib/djSetApi.ts`

- [ ] **Step 1: Update `listDJSets` return type**

Change the return type to include `total`:

```typescript
export async function listDJSets(options?: {
  mine?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ sets: (DJSetMetadata & { playCount: number; hasMic: boolean })[]; total: number }> {
```

- [ ] **Step 2: Verify build**

Run: `npm run type-check`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/djSetApi.ts
git commit -m "feat(dj): add total count to listDJSets API response type"
```

---

## Task 5: Store Orchestration — useDJSetStore Actions

**Files:**
- Modify: `src/stores/useDJSetStore.ts`

This is the core task — all playback logic lives here. Components are pure views.

- [ ] **Step 1: Add module-level player ref and imports**

At the top of the file, add:

```typescript
import { DJSetPlayer } from '../engine/dj/recording/DJSetPlayer';
import { getDJSet, listDJSets, deleteDJSet, incrementPlayCount, downloadBlob } from '../lib/djSetApi';
import type { DJSet, DJSetMetadata } from '../engine/dj/recording/DJSetFormat';

let _activePlayer: DJSetPlayer | null = null;
```

- [ ] **Step 2: Add `error` and `total` to state**

Add to the state interface:

```typescript
error: string | null;
total: number;
```

Add to the initial state:

```typescript
error: null,
total: 0,
```

- [ ] **Step 3: Add `fetchSets` action**

```typescript
fetchSets: async (options?: { mine?: boolean; limit?: number; offset?: number }) => {
  try {
    const { sets, total } = await listDJSets(options);
    set({ setList: sets as any[], total, error: null });
  } catch (err) {
    set({ error: `Failed to load sets: ${(err as Error).message}` });
  }
},
```

- [ ] **Step 4: Add `playSet` action**

```typescript
playSet: async (id: string) => {
  const state = get();
  if (state.isRecording || state.isPlayingSet) return;

  set({ isPlayingSet: true, currentSetId: id, preloadProgress: 0, error: null });

  try {
    // 1. Fetch full set
    const djSet = await getDJSet(id);

    // 2. Get required tracks
    const requiredTracks = DJSetPlayer.getRequiredTracks(djSet);

    // 3. Download and decode each track
    const preloadedTracks = new Map<string, { song: unknown; buffer?: ArrayBuffer }>();
    let loaded = 0;

    for (const [key, source] of requiredTracks) {
      let arrayBuffer: ArrayBuffer;

      if (source.type === 'embedded') {
        arrayBuffer = await downloadBlob(source.blobId);
      } else if (source.type === 'modland') {
        // Fetch from modland archive
        const resp = await fetch(`https://modland.com/pub/modules/${source.fullPath}`);
        if (!resp.ok) throw new Error(`Modland fetch failed: ${source.fullPath}`);
        arrayBuffer = await resp.arrayBuffer();
      } else if (source.type === 'hvsc') {
        const resp = await fetch(`https://hvsc.c64.org/${source.path}`);
        if (!resp.ok) throw new Error(`HVSC fetch failed: ${source.path}`);
        arrayBuffer = await resp.arrayBuffer();
      } else {
        throw new Error(`Cannot load track with source type: ${source.type}`);
      }

      preloadedTracks.set(key, { song: null, buffer: arrayBuffer });
      loaded++;
      set({ preloadProgress: loaded / requiredTracks.size });
    }

    // 4. Create player and start
    _activePlayer = new DJSetPlayer();
    _activePlayer.onProgress = (elapsed: number, total: number) => {
      set({
        playbackElapsed: elapsed,
        playbackProgress: total > 0 ? elapsed / total : 0,
      });
    };
    _activePlayer.onComplete = () => {
      get().stopSetPlayback();
      incrementPlayCount(id).catch(() => {});
    };

    await _activePlayer.startPlayback(djSet, preloadedTracks);

    // 5. Start mic audio if present
    if (djSet.micAudioId) {
      try {
        const micBytes = await downloadBlob(djSet.micAudioId);
        const audioCtx = new AudioContext();
        const micBuffer = await audioCtx.decodeAudioData(micBytes);
        const { getDJEngine } = await import('../engine/dj/DJEngine');
        const samplerInput = getDJEngine().mixer.samplerInput;
        _activePlayer.startMicAudio(micBuffer, samplerInput);
      } catch (micErr) {
        console.warn('[DJSetStore] Failed to load mic audio:', micErr);
      }
    }
  } catch (err) {
    set({
      isPlayingSet: false,
      currentSetId: null,
      preloadProgress: 0,
      error: `Failed to play set: ${(err as Error).message}`,
    });
    _activePlayer = null;
  }
},
```

- [ ] **Step 5: Add `stopSetPlayback` action**

```typescript
stopSetPlayback: () => {
  if (_activePlayer) {
    _activePlayer.stopPlayback();
    _activePlayer = null;
  }
  set({
    isPlayingSet: false,
    currentSetId: null,
    playbackProgress: 0,
    playbackElapsed: 0,
    preloadProgress: 0,
  });
},
```

- [ ] **Step 6: Add `deleteSet` action**

```typescript
deleteSet: async (id: string) => {
  const state = get();
  if (state.currentSetId === id) state.stopSetPlayback();

  try {
    await deleteDJSet(id);
    set({ setList: get().setList.filter((s: any) => s.id !== id) });
  } catch (err) {
    set({ error: `Failed to delete set: ${(err as Error).message}` });
  }
},
```

- [ ] **Step 7: Verify build**

Run: `npm run type-check`
Expected: Clean pass

- [ ] **Step 8: Commit**

```bash
git add src/stores/useDJSetStore.ts
git commit -m "feat(dj): add playSet/stopPlayback/fetchSets/deleteSet store actions"
```

---

## Task 6: Upload Track Bytes on Recording Stop

**Files:**
- Modify: `src/components/dj/DJSetRecordButton.tsx`

- [ ] **Step 1: Add track upload logic to stop handler**

After `const djSet = _activeRecorder.stopRecording(...)` (around line 42) and before `await saveDJSet(djSet)`, add:

```typescript
// Upload local tracks as blobs
const { getDJEngine } = await import('../../engine/dj/DJEngine');
const engine = getDJEngine();

for (const track of djSet.metadata.trackList) {
  if (track.source.type === 'local') {
    const deckId = track === djSet.metadata.trackList.find(t =>
      t.source.type === 'local' && t.fileName === track.fileName
    ) ? 'A' : 'B'; // Simple deck mapping

    const deck = engine.getDeck(deckId as any);
    const bytes = deck.audioPlayer?.getOriginalFileBytes();

    if (bytes) {
      try {
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const { id: blobId } = await uploadBlob(blob, track.fileName);
        const originalSource = { ...track.source };
        track.source = { type: 'embedded', blobId, originalSource } as any;

        // Rewrite matching load events
        for (const evt of djSet.events) {
          if (evt.type === 'load' && evt.values?.fileName === track.fileName) {
            evt.values.source = track.source;
          }
        }
      } catch (err) {
        console.warn(`[DJSetRecordButton] Failed to upload track ${track.fileName}:`, err);
      }
    }
  }
}
```

Add the `uploadBlob` import at the top:

```typescript
import { saveDJSet, uploadBlob } from '../../lib/djSetApi';
```

- [ ] **Step 2: Refresh set list after save**

After `saveDJSet(djSet)`, add:

```typescript
useDJSetStore.getState().fetchSets();
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: Clean pass

- [ ] **Step 4: Commit**

```bash
git add src/components/dj/DJSetRecordButton.tsx
git commit -m "feat(dj): upload local track bytes as blobs on recording stop"
```

---

## Task 7: DOM Set Browser — DJSetBrowser.tsx

**Files:**
- Create: `src/components/dj/DJSetBrowser.tsx`
- Modify: `src/components/layout/NavBar.tsx`

- [ ] **Step 1: Create DJSetBrowser component**

```typescript
// src/components/dj/DJSetBrowser.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDJSetStore } from '../../stores/useDJSetStore';
import { useAuthStore } from '../../stores/useAuthStore';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export const DJSetBrowser: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    setList, total, isPlayingSet, currentSetId, isRecording,
    playbackProgress, playbackElapsed, preloadProgress, error,
    fetchSets, playSet, stopSetPlayback, deleteSet,
  } = useDJSetStore();

  const userId = useAuthStore((s) => s.user?.id);

  // Fetch sets on open
  useEffect(() => {
    if (open) fetchSets();
  }, [open, fetchSets]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handlePlay = useCallback((id: string) => {
    playSet(id);
  }, [playSet]);

  const handleDelete = useCallback((id: string) => {
    if (confirmDelete === id) {
      deleteSet(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }, [confirmDelete, deleteSet]);

  const handleLoadMore = useCallback(() => {
    fetchSets({ offset: setList.length });
  }, [fetchSets, setList.length]);

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isRecording}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', cursor: isRecording ? 'not-allowed' : 'pointer',
          opacity: isRecording ? 0.5 : 1,
          background: 'transparent', border: 'none', color: '#ccc', fontSize: 12,
        }}
      >
        <span>Sets</span>
        {total > 0 && (
          <span style={{
            background: '#555', borderRadius: 8, padding: '1px 5px',
            fontSize: 10, minWidth: 16, textAlign: 'center',
          }}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 10000,
          width: 360, maxHeight: 480, background: '#1a1a1a', border: '1px solid #333',
          borderRadius: 6, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          pointerEvents: 'auto',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px', borderBottom: '1px solid #333',
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#eee' }}>DJ Sets</span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16,
            }}>
              x
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '6px 12px', background: '#3a1111', color: '#f88', fontSize: 11 }}>
              {error}
            </div>
          )}

          {/* Set list */}
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            {setList.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#666', fontSize: 12 }}>
                No recorded sets yet
              </div>
            ) : (
              setList.map((s: any) => {
                const isActive = currentSetId === s.id;
                const isPreloading = isActive && preloadProgress > 0 && preloadProgress < 1;
                const isPlaying = isActive && isPlayingSet && preloadProgress >= 1;

                return (
                  <div key={s.id} style={{
                    padding: '8px 12px', borderBottom: '1px solid #222',
                    background: isActive ? '#222' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 12, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                          {s.authorName || 'Anonymous'} · {formatDuration(s.durationMs || s.duration_ms)} · {s.trackList?.length || 0} tracks · {s.playCount || 0} plays · {formatRelativeDate(s.createdAt || s.created_at)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                        {isPlaying ? (
                          <button onClick={() => stopSetPlayback()} style={{
                            background: '#c33', border: 'none', borderRadius: 3,
                            color: '#fff', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
                          }}>
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePlay(s.id)}
                            disabled={isPlayingSet}
                            style={{
                              background: '#2a6', border: 'none', borderRadius: 3,
                              color: '#fff', padding: '3px 8px', fontSize: 10,
                              cursor: isPlayingSet ? 'not-allowed' : 'pointer',
                              opacity: isPlayingSet && !isActive ? 0.4 : 1,
                            }}
                          >
                            Play
                          </button>
                        )}

                        {userId && userId === s.authorId && (
                          <button
                            onClick={() => handleDelete(s.id)}
                            style={{
                              background: confirmDelete === s.id ? '#c33' : '#333',
                              border: 'none', borderRadius: 3,
                              color: confirmDelete === s.id ? '#fff' : '#888',
                              padding: '3px 6px', fontSize: 10, cursor: 'pointer',
                            }}
                          >
                            {confirmDelete === s.id ? 'Sure?' : 'Del'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bars */}
                    {isPreloading && (
                      <div style={{ marginTop: 4, height: 3, background: '#333', borderRadius: 2 }}>
                        <div style={{
                          width: `${preloadProgress * 100}%`, height: '100%',
                          background: '#48f', borderRadius: 2, transition: 'width 0.2s',
                        }} />
                      </div>
                    )}

                    {isPlaying && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ height: 3, background: '#333', borderRadius: 2 }}>
                          <div style={{
                            width: `${playbackProgress * 100}%`, height: '100%',
                            background: '#2a6', borderRadius: 2, transition: 'width 0.3s',
                          }} />
                        </div>
                        <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                          {formatDuration(playbackElapsed)} / {formatDuration(s.durationMs || s.duration_ms)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Load more */}
          {setList.length < total && (
            <div style={{ padding: 8, textAlign: 'center', borderTop: '1px solid #333' }}>
              <button onClick={handleLoadMore} style={{
                background: 'none', border: 'none', color: '#48f', fontSize: 11, cursor: 'pointer',
              }}>
                Load more ({total - setList.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add DJSetBrowser to NavBar**

In `src/components/layout/NavBar.tsx`, import DJSetBrowser:

```typescript
import { DJSetBrowser } from '../dj/DJSetBrowser';
```

In the right-side nav section (around line 165, near the MIDI/Collab buttons), add:

```tsx
<DJSetBrowser />
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: Clean pass

- [ ] **Step 4: Visual test in browser**

1. Open http://localhost:5173
2. Verify "Sets" button appears in top nav bar
3. Click it — dropdown opens showing "No recorded sets yet" or existing sets
4. Click outside — dropdown closes
5. Press Escape — dropdown closes

- [ ] **Step 5: Commit**

```bash
git add src/components/dj/DJSetBrowser.tsx src/components/layout/NavBar.tsx
git commit -m "feat(dj): add DJ set browser dropdown to DOM nav bar"
```

---

## Task 8: Pixi Set Browser — PixiDJSetBrowser.tsx

**Files:**
- Create: `src/pixi/views/dj/PixiDJSetBrowser.tsx`
- Modify: `src/pixi/shell/PixiNavBar.tsx`

The Pixi version uses the existing `usePixiDropdownStore` with `kind: 'menu'` to render a dropdown. The dropdown items call the same store actions.

- [ ] **Step 1: Create PixiDJSetBrowser component**

This component renders a "Sets" button in the Pixi nav bar. On click, it opens a menu dropdown via `usePixiDropdownStore`. Each set is a menu item with a play/stop action. Delete is a submenu action.

Since the Pixi dropdown system uses `MenuAction` items (text label + onClick), we render set info as formatted labels.

```typescript
// src/pixi/views/dj/PixiDJSetBrowser.tsx
import { useCallback, useRef, useEffect } from 'react';
import { Container } from '@pixi/react';
import { useDJSetStore } from '../../../stores/useDJSetStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { usePixiDropdownStore } from '../../stores/usePixiDropdownStore';
import { PixiButton } from '../../components';
import type { Container as PixiContainer } from 'pixi.js';

const DROPDOWN_ID = 'dj-sets-browser';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export const PixiDJSetBrowser: React.FC<{ y?: number }> = ({ y = 0 }) => {
  const containerRef = useRef<PixiContainer>(null);

  const {
    setList, total, isPlayingSet, currentSetId, isRecording,
    fetchSets, playSet, stopSetPlayback, deleteSet,
  } = useDJSetStore();
  const userId = useAuthStore((s) => s.user?.id);

  const handleClick = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    fetchSets();

    const pos = el.toGlobal({ x: 0, y: 40 });

    requestAnimationFrame(() => {
      const items = setList.length === 0
        ? [{ label: 'No recorded sets yet', action: () => {} }]
        : setList.map((s: any) => {
            const isActive = currentSetId === s.id;
            const label = `${isActive ? '>> ' : ''}${s.name} (${formatDuration(s.durationMs || s.duration_ms)})`;

            return {
              label,
              action: () => {
                if (isActive && isPlayingSet) {
                  stopSetPlayback();
                } else if (!isPlayingSet) {
                  playSet(s.id);
                }
              },
            };
          });

      usePixiDropdownStore.getState().openDropdown({
        kind: 'menu' as const,
        id: DROPDOWN_ID,
        x: pos.x,
        y: pos.y,
        width: 280,
        items,
        onClose: () => usePixiDropdownStore.getState().closeDropdown(DROPDOWN_ID),
      });
    });
  }, [setList, currentSetId, isPlayingSet, fetchSets, playSet, stopSetPlayback]);

  return (
    <Container ref={containerRef} y={y}>
      <PixiButton
        label={total > 0 ? `Sets (${total})` : 'Sets'}
        variant="ghost"
        size="sm"
        disabled={isRecording}
        onPress={handleClick}
        layout={{ width: 64, height: 28 }}
      />
    </Container>
  );
};
```

- [ ] **Step 2: Add PixiDJSetBrowser to PixiNavBar**

In `src/pixi/shell/PixiNavBar.tsx`, import the component:

```typescript
import { PixiDJSetBrowser } from '../views/dj/PixiDJSetBrowser';
```

Add it in the right zone (around line 282, near the existing buttons):

```tsx
<PixiDJSetBrowser y={12} />
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check`
Expected: Clean pass

- [ ] **Step 4: Visual test in browser**

1. Switch to Pixi UI mode
2. Verify "Sets" button appears in top nav bar
3. Click it — dropdown opens with set list
4. Click a set — playback starts

- [ ] **Step 5: Commit**

```bash
git add src/pixi/views/dj/PixiDJSetBrowser.tsx src/pixi/shell/PixiNavBar.tsx
git commit -m "feat(dj): add DJ set browser to Pixi nav bar"
```

---

## Task 9: Mutual Exclusion — Disable REC During Playback

**Files:**
- Modify: `src/components/dj/DJSetRecordButton.tsx`

- [ ] **Step 1: Add playback guard to REC button**

In `DJSetRecordButton`, read `isPlayingSet` from the store:

```typescript
const isPlayingSet = useDJSetStore((s) => s.isPlayingSet);
```

Add `disabled={isPlayingSet}` to the button element and gray it out when a set is playing.

- [ ] **Step 2: Verify build**

Run: `npm run type-check`
Expected: Clean pass

- [ ] **Step 3: Commit**

```bash
git add src/components/dj/DJSetRecordButton.tsx
git commit -m "feat(dj): disable REC button during set playback"
```

---

## Task 10: End-to-End Integration Test

- [ ] **Step 1: Test recording → save → browse**

1. Switch to DJ view in browser
2. Load a track from modland onto deck A via the file browser
3. Click REC, perform some actions (play, crossfade, EQ changes)
4. Click REC again, enter a name
5. Click "Sets" in nav bar — verify the set appears

- [ ] **Step 2: Test playback**

1. Click Play on the saved set
2. Watch controls animate (crossfader, EQ knobs should move)
3. Verify audio plays
4. Click Stop — verify clean stop

- [ ] **Step 3: Test delete**

1. Click Del on own set, confirm
2. Verify set removed from list

- [ ] **Step 4: Test mutual exclusion**

1. Start recording — verify "Sets" button is disabled
2. Stop recording
3. Start set playback — verify REC button is disabled

- [ ] **Step 5: Test Pixi UI**

1. Switch to Pixi mode
2. Verify "Sets" button in nav bar
3. Click — verify same data shows
4. Play a set — verify it works identically

- [ ] **Step 6: Final commit if any tweaks**

```bash
git add -A  # careful: review staged files
git commit -m "fix(dj): integration test tweaks for DJ set playback"
```
