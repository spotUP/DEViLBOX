/**
 * "When the pattern editor redraws a new layout it struggles and things jump
 * around" (owner, 2026-10-07, mostly on song load).
 *
 * Measured with real applySong calls (4-channel MOD, then the same song with 7
 * voices): the worker was fed `patterns` synchronously from the tracker store
 * but `channelLayout` only after React rendered the new song, so every frame the
 * worker drew in between showed the new rows at the old song's column
 * positions. The fix: patterns whose layout differs are posted with
 * awaitLayout, and the worker (LayoutHold) keeps drawing the old picture until
 * the layout arrives.
 *
 * One reachability test: the real applySong drives the real feed
 * (feedWorkerFromTracker) into a model worker that draws a frame after EVERY
 * message (the worst case for a worker whose rAF can fire at any point). Every
 * frame it draws must pair patterns and layout of the same song.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LayoutHold, layoutInputsChanged } from '@engine/renderer/layoutHold';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** The worker as the renderer sees it: its state, and a frame drawn from it. */
function modelWorker(hold: boolean) {
  const h = new LayoutHold();
  let patternChannels = 0;
  let layoutChannels = 0;
  let clock = 0;
  const frames: Array<{ patterns: number; layout: number }> = [];
  const drawIfAllowed = () => {
    clock += 16;
    if (!hold || h.canDraw(clock)) frames.push({ patterns: patternChannels, layout: layoutChannels });
  };
  return {
    frames,
    receive(msg: { type: string; patterns?: Array<{ channels: unknown[] }>; awaitLayout?: boolean; channelLayout?: { widths: number[] } }) {
      if (msg.type === 'patterns') {
        patternChannels = msg.patterns![0].channels.length;
        h.patterns(hold ? msg.awaitLayout : false, clock);
      } else if (msg.type === 'channelLayout') {
        layoutChannels = msg.channelLayout!.widths.length;
        h.layout();
      }
      drawIfAllowed(); // a frame can land after any message
    },
  };
}

async function loadSongs() {
  const { importTrackerModule } = await import('@/lib/song/songBranches');
  const { snapshotSong } = await import('../snapshotSong');
  const { savedSongToApply } = await import('../savedSong');
  const path = 'src/__tests__/fixtures/micro15-goto80.mod';
  const file = new File([readFileSync(resolve(ROOT, path))], 'a.mod');
  await importTrackerModule({
    metadata: { title: file.name, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
  const four = savedSongToApply(structuredClone(snapshotSong()));
  const seven = savedSongToApply(structuredClone(snapshotSong()));
  for (const p of seven.patterns) {
    const base = p.channels.length;
    for (let i = base; i < 7; i++) p.channels.push({ ...structuredClone(p.channels[i % base]), id: `extra-${p.id}-${i}` });
  }
  return { four, seven };
}

async function loadAndRecord(hold: boolean) {
  const { applySong } = await import('../applySong');
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { feedWorkerFromTracker } = await import('@/components/tracker/trackerWorkerFeed');
  const { four, seven } = await loadSongs();
  const worker = modelWorker(hold);
  let owed = false;
  let posts = 0;
  const post = (m: Parameters<typeof worker.receive>[0]) => { posts++; worker.receive(m); };
  const postLayout = () => {
    // What the layout effect does in the commit that renders the new song.
    const n = useTrackerStore.getState().patterns[useTrackerStore.getState().currentPatternIndex].channels.length;
    owed = false;
    post({ type: 'channelLayout', channelLayout: { widths: new Array(n).fill(120) } });
  };

  await applySong(four, 'project');
  postLayout();
  worker.frames.length = 0;
  posts = 0;

  const unsub = useTrackerStore.subscribe((s, prev) => {
    if (feedWorkerFromTracker(s, prev, (m) => post(m as never), () => s.patterns as never, () => ({}) as never)) owed = true;
  });
  await applySong(seven, 'project');
  if (owed) postLayout();
  await new Promise((r) => setTimeout(r, 20));
  unsub();
  return { frames: worker.frames, posts };
}

describe('loading a song draws the new layout once', () => {
  it('4-channel MOD -> 7-voice song: no frame shows new rows in the old layout', async () => {
    const { frames } = await loadAndRecord(true);
    const mixed = frames.filter((f) => f.patterns !== f.layout);
    expect(mixed, `frames with patterns and layout of different songs: ${JSON.stringify(frames)}`).toEqual([]);
    // Old song stays up, then the new one - and it is drawn.
    expect(frames.some((f) => f.patterns === 7 && f.layout === 7)).toBe(true);
  }, 60_000);

  it('without the hold the same load draws mixed frames (the measured defect)', async () => {
    const { frames } = await loadAndRecord(false);
    expect(frames.some((f) => f.patterns === 7 && f.layout === 4)).toBe(true);
  }, 60_000);
});

describe('which pattern changes owe the worker a layout', () => {
  const ch = (extra: object = {}) => ({ ...extra });
  it('a channel-count change does, a cell edit does not', () => {
    const four = { patterns: [{ channels: [ch(), ch(), ch(), ch()] }], currentPatternIndex: 0 };
    const seven = { patterns: [{ channels: Array.from({ length: 7 }, () => ch()) }], currentPatternIndex: 0 };
    expect(layoutInputsChanged(four, seven)).toBe(true);
    expect(layoutInputsChanged(four, { patterns: [{ channels: [ch(), ch(), ch(), ch()] }], currentPatternIndex: 0 })).toBe(false);
  });
  it('collapsing a channel or adding an effect column does', () => {
    const base = { patterns: [{ channels: [ch(), ch()] }], currentPatternIndex: 0 };
    expect(layoutInputsChanged(base, { patterns: [{ channels: [ch({ collapsed: true }), ch()] }], currentPatternIndex: 0 })).toBe(true);
    expect(layoutInputsChanged(base, { patterns: [{ channels: [ch({ channelMeta: { effectCols: 3 } }), ch()] }], currentPatternIndex: 0 })).toBe(true);
  });
  it('a layout that never arrives freezes the picture for at most half a second', () => {
    const h = new LayoutHold();
    h.patterns(true, 0);
    expect(h.canDraw(100)).toBe(false);
    expect(h.canDraw(600)).toBe(true);
  });
});
