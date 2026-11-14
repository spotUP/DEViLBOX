/**
 * The author's inbox: replies waiting on shares this browser owns, and the three-way review that
 * merges one into the open song. Logic only; the toolbar button and ShareReview are glue.
 */
import { create } from 'zustand';
import { notify } from '@stores/useNotificationStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import type { InstrumentChange } from '@stores/useHistoryStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { unpackShare, type ShareSong } from './shareContainer';
import { downloadShare, downloadReply, dismissReply, listReplies } from './shareApi';
import { currentSong, ownerKeys } from './shareService';
import { mergeSongs, same, type MergeConflict, type MergeSong, type Side } from './shareMerge';

export interface WaitingReply { shareId: string; replyId: string; ownerKey: string; createdAt: number }

interface Review {
  reply: WaitingReply;
  base: MergeSong;
  theirs: MergeSong;
  conflicts: MergeConflict[];
  picks: Map<string, Side>;
  appliedFromTheirs: number;
}

interface InboxState {
  waiting: WaitingReply[];
  review: Review | null;
  busy: boolean;
}

export const useShareInboxStore = create<InboxState>(() => ({ waiting: [], review: null, busy: false }));

/**
 * The open song as the merge sees it: exported and parsed through the same path as base and theirs,
 * so load-time transforms show up on all three sides alike and never as false changes.
 */
async function mineNow(): Promise<MergeSong> {
  return parseShared((await currentSong()).song);
}

/** Parse a shared song without opening it: no store changes. */
async function parseShared(song: ShareSong): Promise<MergeSong> {
  if (song.name.toLowerCase().endsWith('.dbx')) {
    const { decompressProject } = await import('@/lib/projectCompression');
    const { savedSongToApply } = await import('@/lib/song/savedSong');
    const copy = song.bytes.slice().buffer as ArrayBuffer;
    const applied = savedSongToApply(JSON.parse(decompressProject(copy)));
    return { patterns: applied.patterns, order: applied.order, instruments: applied.instruments };
  }
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const { UADEEngine } = await import('@engine/uade/UADEEngine');
  const companions = new Map(song.companions.map((c) => [c.name, c.bytes.slice().buffer as ArrayBuffer]));
  const file = new File([song.bytes.slice().buffer as ArrayBuffer], song.name);
  const parsed = await parseModuleToSong(file, 0, undefined, undefined, companions, UADEEngine.getDeckInstance());
  return { patterns: parsed.patterns, order: parsed.songPositions, instruments: parsed.instruments };
}

/** Ask the server which owned shares have replies waiting. Quiet when offline. */
export async function refreshShareInbox(): Promise<void> {
  const found: WaitingReply[] = [];
  for (const [shareId, ownerKey] of Object.entries(ownerKeys())) {
    try {
      for (const r of await listReplies(shareId, ownerKey)) found.push({ shareId, replyId: r.id, ownerKey, createdAt: r.createdAt });
    } catch { /* offline or server down: the inbox stays as it was */ }
  }
  useShareInboxStore.setState({ waiting: found });
}

/** Download the base and one reply, merge against the open song, and open the review. */
export async function startReview(reply: WaitingReply): Promise<void> {
  useShareInboxStore.setState({ busy: true });
  try {
    const [baseSong, replySong] = await Promise.all([
      downloadShare(reply.shareId).then(unpackShare),
      downloadReply(reply.shareId, reply.replyId, reply.ownerKey).then(unpackShare),
    ]);
    const base = await parseShared(baseSong);
    const theirs = await parseShared(replySong);
    const { conflicts, appliedFromTheirs } = mergeSongs(base, await mineNow(), theirs);
    useShareInboxStore.setState({ review: { reply, base, theirs, conflicts, picks: new Map(), appliedFromTheirs } });
  } catch (e) {
    notify.error(e instanceof Error ? e.message : 'Could not open the reply.');
  } finally {
    useShareInboxStore.setState({ busy: false });
  }
}

export function pickSide(key: string, side: Side): void {
  const review = useShareInboxStore.getState().review;
  if (!review) return;
  const picks = new Map(review.picks).set(key, side);
  useShareInboxStore.setState({ review: { ...review, picks } });
}

export function pickAll(side: Side): void {
  const review = useShareInboxStore.getState().review;
  if (!review) return;
  useShareInboxStore.setState({ review: { ...review, picks: new Map(review.conflicts.map((c) => [c.key, side])) } });
}

export const closeReview = (): void => useShareInboxStore.setState({ review: null });

/** Write the merge into the stores as one undo step (patterns, order and instruments), then dismiss the reply. */
export async function applyReview(): Promise<void> {
  const review = useShareInboxStore.getState().review;
  if (!review) return;
  const mine = await mineNow();
  const { merged } = mergeSongs(review.base, mine, review.theirs, review.picks);
  const instruments: InstrumentChange[] = [];
  for (const i of merged.instruments) {
    const m = mine.instruments.find((x) => x.id === i.id);
    if (m && same(m, i)) continue;
    const current = useInstrumentStore.getState().instruments.find((x) => x.id === i.id);
    instruments.push({ id: i.id, before: current ? structuredClone(current) : null, after: i });
  }
  // Write only what the merge changed against the parsed open song; everything else in the stores stays as loaded.
  useTrackerStore.getState().multiPatternEdit('Merge changes from a share reply', (song) => {
    merged.patterns.forEach((p, pi) => {
      const mp = mine.patterns[pi];
      const sp = song.patterns[pi];
      if (!mp || !sp) { song.patterns[pi] = p; return; }
      if (p === mp) return;
      sp.length = p.length;
      p.channels.forEach((c, ci) => {
        const sc = sp.channels[ci];
        if (!sc || c === mp.channels[ci]) return;
        c.rows.forEach((cell, r) => { if (!same(cell, mp.channels[ci]?.rows[r])) sc.rows[r] = cell; });
        sc.rows.length = c.rows.length;
      });
    });
    if (!same(merged.order, mine.order)) song.patternOrder.splice(0, song.patternOrder.length, ...merged.order);
  }, instruments);
  try {
    await dismissReply(review.reply.shareId, review.reply.replyId, review.reply.ownerKey);
  } catch { /* the merge is applied; the reply just stays listed */ }
  notify.success('Changes merged. Undo reverts the patterns, order and instruments.');
  closeReview();
  await refreshShareInbox();
}
