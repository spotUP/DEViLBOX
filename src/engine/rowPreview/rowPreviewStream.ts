/**
 * Rendering one grid row from a player that only runs forward.
 *
 * The domain invariant: the row the user hears is the samples the engine produces for that row during playback. A row
 * rendered from a cold seek IS playback's row, sample for sample (measured on 8 nuade songs, thoughts/shared/plans/
 * 2026-10-14-engine-row-preview.md), so no player state needs saving: this class keeps ONE private instance of the
 * player as a stream from the song's start and answers a request from the cheapest of three sources.
 *
 *   - the last clip, when the same row is asked again with the same mute mask;
 *   - the tail, the audio already rendered past the previous row (stepping to the next row costs one row of rendering);
 *   - a restart: the instance runs silently to the row's first frame, which the timeline already knows.
 *
 * The timeline is the exact first frame of every player position the stream has rendered past (found by bisecting
 * inside the chunk where the position changed), so a row behind the cursor is a seek to a known frame, and a row
 * ahead is found by rendering forward until its position shows. A row the player reaches only after it loops or
 * ends is never played (D2) and answers `missed`.
 *
 * Pure: no DOM, no worker, no engine import. Engines sit behind RowRenderAdapter.
 */
import { rowTargetKey, type RowTarget } from './rowTarget';
import {
  CHUNK_ENDED, CHUNK_LOOPED, ROW_CHUNK_FRAMES, rowClipFadeFrames, rowClipMaxFrames, rowClipMinFrames,
  type PlayerPosition, type RowChunk, type RowClip, type RowResult,
} from './rowClip';

export interface RowRenderAdapter {
  readonly sampleRate: number;
  /**
   * Get ready for `open(data, args)`: fetch what it needs (an engine whose player is a separate file), or a clean player
   * instance (one whose reset leaves state of the song before). Called before every ensureOpen, which may not reopen:
   * cheap when nothing changed.
   */
  prepare?(args: unknown[], data: Uint8Array): Promise<void>;
  /** Open the module on a fresh private instance and start its subsong; frame 0. Throws with the engine's message. */
  open(data: Uint8Array, args: unknown[]): void;
  /** Back to frame 0 of the same module. */
  restart(): void;
  /**
   * From frame 0, run silently to `frame` with the voices in `mask` audible. Returns the frame reached (less than asked only at
   * the song's end). The mask is in force while running, not only afterwards: an engine that renders ahead of what it hands
   * out (UADE's pipe) would otherwise give the first frames of the row with the mask the run began with.
   */
  advanceSilent(frame: number, mask: number): number;
  /** Render the next `frames` frames with the voices in `mask` audible (bit N set = voice N). */
  renderChunk(frames: number, mask: number): RowChunk;
  /** Where the player stands at `frame`, a frame inside the chunk rendered last; null when it cannot tell. */
  positionAt(frame: number): PlayerPosition | null;
}

export interface RowRequestSignal { cancelled: boolean }

export interface RowPreviewStreamOptions {
  /** Let other work run (a newer request arriving in the worker). Defaults to a macrotask. */
  yieldNow?: () => Promise<void>;
  now?: () => number;
  /** Work this long between yields, ms. */
  sliceMs?: number;
  /** Give up looking for a row this many seconds into the song (a song that never loops or ends). */
  searchLimitSeconds?: number;
  /** Override of the minimum clip length in frames (default MIN_ROW_PREVIEW_MS); the scripted-player tests use 0 to measure a row's own length. */
  minClipFrames?: number;
}

interface Transition { frame: number; pos: PlayerPosition }
interface Tail { start: number; mask: number; chunks: RowChunk[] }

const positionKey = (p: PlayerPosition): string => `${p.order}:${p.pattern}:${p.row}:${p.tick}:${p.speed}`;

/** Whether `pos` is inside `target`. */
export function positionIsInTarget(pos: PlayerPosition, target: RowTarget): boolean {
  // A frame range is not a player position: the stream knows its first and last frame without looking.
  if (target.kind === 'frames') return false;
  if (target.kind === 'orderRow') return pos.order === target.order && pos.row === target.row;
  const t = pos.row * Math.max(1, pos.speed) + pos.tick;
  return t >= target.from && t < target.to;
}

/** The module and arguments a stream is open on, compared byte for byte (D8). */
export function sameLoad(a: { data: Uint8Array; args: unknown[] } | null, b: { data: Uint8Array; args: unknown[] }): boolean {
  return !!a && bytesEqual(a.data, b.data) && deepEqual(a.args, b.args);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) return bytesEqual(new Uint8Array(a), new Uint8Array(b));
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    return bytesEqual(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

export class RowPreviewStream {
  private load: { data: Uint8Array; args: unknown[] } | null = null;
  private cursor = 0;
  /** The timeline is complete from frame 0 up to here: a silent advance past it leaves a hole no later render fills. */
  private knownEnd = 0;
  private transitions: Transition[] = [];
  private lastPos: PlayerPosition | null = null;
  private finished: 'ended' | 'looped' | 'limit' | null = null;
  private tail: Tail | null = null;
  private last: { key: string; mask: number; clip: RowClip } | null = null;
  private readonly yieldNow: () => Promise<void>;
  private readonly now: () => number;
  private readonly sliceMs: number;
  private readonly searchLimitFrames: number;
  private readonly minFrames: number;

  private readonly adapter: RowRenderAdapter;

  constructor(adapter: RowRenderAdapter, opts: RowPreviewStreamOptions = {}) {
    this.adapter = adapter;
    this.yieldNow = opts.yieldNow ?? (() => new Promise((r) => setTimeout(r, 0)));
    this.now = opts.now ?? (() => performance.now());
    this.sliceMs = opts.sliceMs ?? 20;
    this.minFrames = opts.minClipFrames ?? rowClipMinFrames(adapter.sampleRate);
    this.searchLimitFrames = Math.round((opts.searchLimitSeconds ?? 20 * 60) * adapter.sampleRate);
  }

  get isOpen(): boolean { return this.load !== null; }

  /**
   * Make sure the stream is open on exactly this module and these arguments (D8): the same bytes keep the timeline,
   * different ones reopen the player and drop everything rendered. Returns whether it (re)opened.
   */
  ensureOpen(data: Uint8Array, args: unknown[]): boolean {
    const next = { data, args };
    if (sameLoad(this.load, next)) return false;
    this.load = null;
    this.reset();
    this.adapter.open(data, args);
    this.load = { data: data.slice(), args };
    return true;
  }

  private reset(): void {
    this.cursor = 0;
    this.knownEnd = 0;
    this.transitions = [];
    this.lastPos = null;
    this.finished = null;
    this.tail = null;
    this.last = null;
  }

  /** Back to frame 0 with an empty timeline. */
  private rewind(): void {
    this.adapter.restart();
    this.reset();
  }

  /** The audible voices changed or the clip is stale: a later request renders again. */
  invalidateClip(): void { this.last = null; }

  async request(target: RowTarget, mask: number, signal: RowRequestSignal = { cancelled: false }): Promise<RowResult> {
    if (!this.load) throw new Error('RowPreviewStream: ensureOpen first');
    const key = rowTargetKey(target);
    if (this.last && this.last.key === key && this.last.mask === mask) return { kind: 'clip', clip: this.last.clip };
    const t = { at: this.now() };
    const slice = async (): Promise<boolean> => {
      if (this.now() - t.at < this.sliceMs) return !signal.cancelled;
      await this.yieldNow();
      t.at = this.now();
      return !signal.cancelled;
    };

    let start: number;
    if (target.kind === 'frames') {
      start = target.from;
      if (start > this.searchLimitFrames) return { kind: 'missed', reason: 'limit' };
    } else {
      start = this.startOf(target);
      if (start < 0) {
        // A frames request ran silently to its row: the timeline before the cursor has a hole, and a position that is not in it
        // may lie in the hole. Render again from the song's start, which records every position on the way.
        if (this.cursor > this.knownEnd) this.rewind();
        const found = await this.searchForward(target, mask, slice);
        if (found === 'cancelled') return { kind: 'cancelled' };
        if (typeof found === 'object') return { kind: 'missed', reason: found.reason };
        start = found;
      }
    }
    if (!this.coverFrom(start, mask)) return { kind: 'missed', reason: 'ended' };

    const rate = this.adapter.sampleRate;
    const cap = rowClipMaxFrames(rate);
    // A frame range names its end; a player position is found by rendering until the player leaves the row.
    let end = target.kind === 'frames' ? Math.min(target.to, start + cap) : this.endOf(start, target);
    if (target.kind === 'frames') {
      while (this.cursor < end && !this.finished) {
        if (!(await slice())) return { kind: 'cancelled' };
        this.renderInto(mask, true);
      }
      end = Math.min(end, this.cursor);
    }
    while (end < 0 && this.cursor - start < cap) {
      if (this.finished) { end = this.cursor; break; }
      if (!(await slice())) return { kind: 'cancelled' };
      this.renderInto(mask, true);
      end = this.endOf(start, target);
    }
    if (end < 0 || end - start > cap) end = Math.min(this.cursor, start + cap);
    // A row shorter than the minimum clip plays on past its end (the song cannot give more than it has left).
    const minEnd = start + Math.min(cap, this.minFrames);
    while (end < minEnd && !this.finished) {
      if (!(await slice())) return { kind: 'cancelled' };
      this.renderInto(mask, true);
      end = Math.min(minEnd, this.cursor);
    }
    // The cap can fall before the cursor only; make sure the clip's frames are rendered.
    while (this.cursor < end) this.renderInto(mask, true);

    const clip = this.buildClip(start, end);
    this.trimTailTo(end);
    this.last = { key, mask, clip };
    return { kind: 'clip', clip };
  }

  // -- timeline ---------------------------------------------------------------------------------------------------

  /** The first frame the player stands inside `target`, or -1 when the stream has not rendered past it. */
  private startOf(target: RowTarget, fromIndex = 0): number {
    for (let i = fromIndex; i < this.transitions.length; i++) if (positionIsInTarget(this.transitions[i]!.pos, target)) return this.transitions[i]!.frame;
    return -1;
  }

  /** The first frame after `start` the player is outside `target`, or -1 while it has not been seen. */
  private endOf(start: number, target: RowTarget): number {
    // The transitions are sorted by frame: begin after `start`.
    let lo = 0, hi = this.transitions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.transitions[mid]!.frame > start) hi = mid; else lo = mid + 1;
    }
    for (let i = lo; i < this.transitions.length; i++) if (!positionIsInTarget(this.transitions[i]!.pos, target)) return this.transitions[i]!.frame;
    return -1;
  }

  private addTransition(frame: number, pos: PlayerPosition): void {
    const last = this.transitions[this.transitions.length - 1];
    if (!last || frame > last.frame) this.transitions.push({ frame, pos });
  }

  /** Record where the position changed inside the chunk [c, c + n), exactly. */
  private scanChunk(c: number, n: number): void {
    const a = this.adapter;
    const first = a.positionAt(c);
    if (!first) return;
    if (!this.lastPos || positionKey(first) !== positionKey(this.lastPos)) this.addTransition(c, first);
    let end = first;
    if (n > 1) {
      const last = a.positionAt(c + n - 1);
      if (last) {
        if (positionKey(last) !== positionKey(first)) this.bisect(c, c + n - 1, first, last);
        end = last;
      }
    }
    this.lastPos = end;
  }

  /** Exact first frames of every change between a and b, whose positions differ. */
  private bisect(a: number, b: number, pa: PlayerPosition, pb: PlayerPosition): void {
    if (b - a <= 1) { this.addTransition(b, pb); return; }
    const m = (a + b) >> 1;
    const pm = this.adapter.positionAt(m) ?? pa;
    if (positionKey(pm) !== positionKey(pa)) this.bisect(a, m, pa, pm);
    if (positionKey(pm) !== positionKey(pb)) this.bisect(m, b, pm, pb);
  }

  // -- rendering --------------------------------------------------------------------------------------------------

  /** Render one chunk at the cursor; `keep` appends it to the tail, otherwise it replaces the tail. */
  private renderInto(mask: number, keep: boolean): void {
    const c = this.cursor;
    const chunk = this.adapter.renderChunk(ROW_CHUNK_FRAMES, mask);
    if (chunk.frames > 0) this.scanChunk(c, chunk.frames);
    this.cursor = c + chunk.frames;
    if (c <= this.knownEnd) this.knownEnd = Math.max(this.knownEnd, this.cursor);
    if (chunk.flags & CHUNK_ENDED) this.finished = 'ended';
    else if (chunk.flags & CHUNK_LOOPED) this.finished = 'looped';
    else if (chunk.frames < ROW_CHUNK_FRAMES) this.finished = 'ended';
    if (chunk.frames === 0) return;
    if (keep && this.tail && this.tail.mask === mask) this.tail.chunks.push(chunk);
    else this.tail = { start: c, mask, chunks: [chunk] };
  }

  /** Render forward until a position inside `target` has been seen; its first frame, or why there is none. */
  private async searchForward(
    target: RowTarget, mask: number, slice: () => Promise<boolean>,
  ): Promise<number | 'cancelled' | { reason: 'ended' | 'looped' | 'limit' }> {
    for (;;) {
      if (this.finished) return { reason: this.finished };
      if (this.cursor > this.searchLimitFrames) { this.finished = 'limit'; return { reason: 'limit' }; }
      if (!(await slice())) return 'cancelled';
      // Only what this chunk added: the timeline of a long walk holds thousands of ticks.
      const seen = this.transitions.length;
      this.renderInto(mask, false);
      const at = this.startOf(target, seen);
      if (at >= 0) return at;
    }
  }

  /** Make the tail start at or before `start` with rendered audio under `mask`; a restart when it cannot. */
  private coverFrom(start: number, mask: number): boolean {
    const t = this.tail;
    if (t && t.mask === mask && t.start <= start && start < this.tailEnd(t)) return true;
    // A start just ahead of the cursor (a frame range after the previous row) is reached by running on, not by a restart:
    // rendering chunk by chunk costs about three silent frames each, so it pays while the gap is under a third of the start.
    if (t && t.mask === mask && !this.finished && start >= this.cursor && (start - this.cursor) * 3 <= start + this.adapter.sampleRate) {
      while (this.cursor <= start && !this.finished) this.renderInto(mask, false);
      const now = this.tail;
      return !!now && now.mask === mask && now.start <= start && start < this.tailEnd(now);
    }
    // The player is already at frame 0 when nothing has been rendered since it opened.
    if (t || this.cursor !== 0 || this.finished) this.adapter.restart();
    const reached = this.adapter.advanceSilent(start, mask);
    this.cursor = reached;
    this.lastPos = null;
    this.finished = null;
    this.tail = { start: reached, mask, chunks: [] };
    // The song ended before the row's first frame (a stream edited shorter): nothing to play.
    if (reached !== start) return false;
    // The first chunk after the seek begins exactly on `start`, the first frame of its row.
    this.renderInto(mask, true);
    return true;
  }

  private tailEnd(t: Tail): number {
    let n = t.start;
    for (const c of t.chunks) n += c.frames;
    return n;
  }

  /** Drop the chunks that end at or before `end`; what is left is the head start of the next row. */
  private trimTailTo(end: number): void {
    const t = this.tail;
    if (!t) return;
    let at = t.start;
    let drop = 0;
    for (const c of t.chunks) {
      if (at + c.frames > end) break;
      at += c.frames;
      drop++;
    }
    t.chunks = t.chunks.slice(drop);
    t.start = at;
  }

  private buildClip(start: number, end: number): RowClip {
    const t = this.tail!;
    const frames = Math.max(0, end - start);
    const stereo = new Float32Array(frames * 2);
    const voiceCount = t.chunks.find((c) => c.voices)?.voices?.length ?? 0;
    const voices = voiceCount ? Array.from({ length: voiceCount }, () => new Float32Array(frames)) : null;
    const panSteps: RowClip['panSteps'] = [];
    let at = t.start;
    for (const c of t.chunks) {
      const from = Math.max(start, at), to = Math.min(end, at + c.frames);
      if (to > from) {
        const o = from - start, i = from - at, n = to - from;
        stereo.set(c.stereo.subarray(i * 2, (i + n) * 2), o * 2);
        if (voices && c.voices) for (let v = 0; v < voiceCount; v++) voices[v]!.set(c.voices[v]!.subarray(i, i + n), o);
        if (c.pans) panSteps.push({ at: o, pans: c.pans.slice() });
      }
      at += c.frames;
    }
    if (panSteps.length) panSteps[0]!.at = 0;
    return {
      sampleRate: this.adapter.sampleRate, frames, startFrame: start, stereo, voices, panSteps,
      fadeFrames: Math.min(frames, rowClipFadeFrames(this.adapter.sampleRate)),
    };
  }
}
