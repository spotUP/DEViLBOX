import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DubSendBaselines, dubSendBaselines } from '@/lib/dub/channelSendBaseline';
import {
  beginDubTransient,
  setDubTransient,
  endDubTransient,
  releaseAllDubTransients,
  reapOrphanedDubTransients,
} from '@/lib/dub/dubChannelTransient';
import { useMixerStore } from '@/stores/useMixerStore';
import { ghostReverb } from '../moves/ghostReverb';
import { echoBuildUp } from '../moves/echoBuildUp';
import { channelMute } from '../moves/channelMute';
import type { DubMoveContext } from '../moves/_types';

/**
 * Regression, reported 2026-09-18: "auto dub pushed the master up to 100% and
 * stayed there". The Dub Deck's master fader is max-of-channel-sends, so one
 * channel pinned at 1.0 reads as a pinned master. Measured live with AutoDub
 * running: channels 0, 1 and 3 at `dubSend: 1` exactly, those same three
 * muted — ghostReverb's signature (mute dry + send 1.0), left applied.
 *
 * Cause: store-level dub moves snapshotted `channels[i].dubSend` at fire time
 * and wrote it back on release. Because AutoDub interleaves moves — and a
 * per-channel throw drives the SAME store value through the cold-path
 * activation — the snapshot was another move's transient, and the restore
 * promoted it to the resting value.
 */

/** Minimal context — these two moves only read channelId / params / bpm. */
function ctx(channelId?: number): DubMoveContext {
  return {
    bus: {} as DubMoveContext['bus'],
    params: {},
    bpm: 120,
    source: 'live',
    channelId,
  } as DubMoveContext;
}

function sends(): number[] {
  return useMixerStore.getState().channels.slice(0, 4).map(c => c.dubSend);
}

/**
 * Store writes for `dubSend` are rAF-batched (one setState per frame during a
 * fader drag). Run the frame callback inline so a test can assert the store
 * right after a write instead of racing the scheduler.
 */
function flushFramesSynchronously(): void {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
}

function resetMixer(): void {
  flushFramesSynchronously();
  dubSendBaselines.clear();
  const store = useMixerStore.getState();
  for (let i = 0; i < 4; i++) {
    store.setChannelDubSend(i, 0);
    store.setChannelMute(i, false);
  }
}

describe('DubSendBaselines — nested transients restore the user value once', () => {
  it('captures the baseline at the FIRST transient, not at a later one', () => {
    const b = new DubSendBaselines();
    b.begin(0, { dubSend: 0.2, muted: false });   // throw opens
    b.begin(0, { dubSend: 1.0, muted: true });    // ghost fires over it, sees the transient
    expect(b.end(0)).toBeNull();                  // inner close restores nothing
    expect(b.end(0)).toEqual({ dubSend: 0.2, muted: false });
  });

  it('honours a fader moved during a hold', () => {
    const b = new DubSendBaselines();
    b.begin(0, { dubSend: 0.2, muted: false });
    b.noteUserSend(0, 0.65);
    expect(b.end(0)).toEqual({ dubSend: 0.65, muted: false });
  });

  it('ignores a stray release with nothing held', () => {
    const b = new DubSendBaselines();
    expect(b.end(2)).toBeNull();
  });

  it('does not invent a baseline from a user write when nothing is held', () => {
    const b = new DubSendBaselines();
    b.noteUserSend(1, 0.4);
    expect(b.peek(1)).toBeUndefined();
  });
});

describe('ghostReverb leaves the mix as it found it', () => {
  beforeEach(resetMixer);

  it('restores the user send when the OUTER ghost releases first', () => {
    // The release order that pinned sends at 1.0. A global ghost opens over a
    // channel, a per-channel ghost lands on the same channel, and the global
    // one lets go first — so the per-channel restore is the last writer. It
    // was restoring the value it sampled while the global ghost held the
    // channel at 1.0, which is 1.0.
    useMixerStore.getState().setChannelDubSend(0, 0.25);

    const outer = ghostReverb.execute(ctx());        // global
    const inner = ghostReverb.execute(ctx(0));       // per-channel, same channel
    expect(outer).not.toBeNull();
    expect(inner).not.toBeNull();
    outer?.dispose();                                // outer lets go FIRST
    inner?.dispose();                                // inner writes last

    expect(useMixerStore.getState().channels[0].dubSend).toBe(0.25);
    expect(useMixerStore.getState().channels[0].muted).toBe(false);
  });

  it('does not ratchet across repeated overlapping ghosts', () => {
    const store = useMixerStore.getState();
    store.setChannelDubSend(0, 0.2);
    store.setChannelDubSend(1, 0.3);

    for (let i = 0; i < 5; i++) {
      const outer = ghostReverb.execute(ctx());
      const inner = ghostReverb.execute(ctx(0));
      outer?.dispose();
      inner?.dispose();
    }

    expect(sends().slice(0, 2)).toEqual([0.2, 0.3]);
    expect(useMixerStore.getState().channels[0].muted).toBe(false);
    expect(useMixerStore.getState().channels[1].muted).toBe(false);
  });

  it('does not leave a channel muted when the outer ghost releases first', () => {
    useMixerStore.getState().setChannelDubSend(0, 0.2);
    const outer = ghostReverb.execute(ctx());
    const inner = ghostReverb.execute(ctx(0));
    outer?.dispose();
    inner?.dispose();
    expect(useMixerStore.getState().channels[0].muted).toBe(false);
  });

  it('restores a channel the user had muted as muted', () => {
    const store = useMixerStore.getState();
    store.setChannelDubSend(2, 0.4);
    store.setChannelMute(2, true);
    const h = ghostReverb.execute(ctx(2));
    h?.dispose();
    expect(useMixerStore.getState().channels[2].muted).toBe(true);
    expect(useMixerStore.getState().channels[2].dubSend).toBe(0.4);
  });

  it('follows a fader moved while the ghost is held', () => {
    useMixerStore.getState().setChannelDubSend(3, 0.1);
    const h = ghostReverb.execute(ctx(3));
    useMixerStore.getState().setChannelDubSend(3, 0.55);   // user drags mid-hold
    h?.dispose();
    expect(useMixerStore.getState().channels[3].dubSend).toBe(0.55);
  });

  it('restores the user send after a cold-path throw activation opened the channel', () => {
    useMixerStore.getState().setChannelDubSend(0, 0.25);

    // What DrumPadEngine's activation callback does for a throw on a cold
    // channel: open a transient, drive the send, release it later.
    beginDubTransient(0);
    setDubTransient(0, { dubSend: 1.0 });

    const ghost = ghostReverb.execute(ctx());   // global ghost sees the 1.0
    ghost?.dispose();
    endDubTransient(0);

    expect(useMixerStore.getState().channels[0].dubSend).toBe(0.25);
  });
});

describe('echoBuildUp leaves the mix as it found it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetMixer();
  });

  it('returns the send to the user value when its timeline completes', () => {
    useMixerStore.getState().setChannelDubSend(1, 0.18);
    const h = echoBuildUp.execute({ ...ctx(1), params: { buildSec: 1, muteSec: 1 } });
    vi.advanceTimersByTime(600);
    expect(useMixerStore.getState().channels[1].dubSend).toBeGreaterThan(0.18); // it ran
    vi.advanceTimersByTime(2000);
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0.18);
    expect(useMixerStore.getState().channels[1].muted).toBe(false);
    h?.dispose();
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0.18);
    vi.useRealTimers();
  });

  it('a ghost released AFTER the build finishes still hands back the user send', () => {
    useMixerStore.getState().setChannelDubSend(1, 0.18);
    const build = echoBuildUp.execute({ ...ctx(1), params: { buildSec: 1, muteSec: 1 } });
    vi.advanceTimersByTime(500);                 // mid-ramp: send is well above 0.18
    const ghost = ghostReverb.execute(ctx(1));   // snapshots the ramp value
    vi.advanceTimersByTime(3000);                // build timeline completes
    ghost?.dispose();                            // ghost writes LAST
    build?.dispose();
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0.18);
    expect(useMixerStore.getState().channels[1].muted).toBe(false);
    vi.useRealTimers();
  });
});

describe('channelMute leaves the mute as it found it', () => {
  beforeEach(resetMixer);

  it('stays muted while another move still holds the channel', () => {
    useMixerStore.getState().setChannelDubSend(0, 0.3);
    const ghost = ghostReverb.execute(ctx(0));      // mutes ch0 + sends 1.0
    const hole = channelMute.execute(ctx(0));       // mutes it again
    hole?.dispose();                                // must NOT unmute — ghost still holds
    expect(useMixerStore.getState().channels[0].muted).toBe(true);
    ghost?.dispose();
    expect(useMixerStore.getState().channels[0].muted).toBe(false);
    expect(useMixerStore.getState().channels[0].dubSend).toBe(0.3);
  });

  it('leaves a user-muted channel muted', () => {
    useMixerStore.getState().setChannelMute(1, true);
    const hole = channelMute.execute(ctx(1));
    hole?.dispose();
    expect(useMixerStore.getState().channels[1].muted).toBe(true);
  });

  it('does not strand a channel muted when the outer move releases first', () => {
    const outer = channelMute.execute(ctx(2));
    const inner = channelMute.execute(ctx(2));
    outer?.dispose();
    inner?.dispose();
    expect(useMixerStore.getState().channels[2].muted).toBe(false);
  });
});

describe('wiring contract — moves and the cold path go through the transient helpers', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8');

  it('the cold-path activation callback opens and closes a transient', () => {
    const src = read('engine/drumpad/DrumPadEngine.ts');
    expect(src).toContain('this.dubBus.setChannelActivationCallback((ch, amt) => {');
    expect(src).toContain('endDubTransient(ch);');
    expect(src).toContain('beginDubTransient(ch);');
  });

  it('openChannelTap releases the cold path with null, not with 0', () => {
    const src = read('engine/dub/DubBus.ts');
    expect(src).toContain('this.channelActivate?.(channelId, null);');
    expect(src).not.toContain('this.channelActivate?.(channelId, 0);');
  });

  it('no dub move writes the mixer store send or mute directly', () => {
    const dir = join(__dirname, '..', 'moves');
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, `${file} must use the transient helpers`).not.toMatch(
        /\.setChannelDubSend\(|\.setChannelMute\(/,
      );
    }
  });
});

describe('safety nets — nothing stays held for ever', () => {
  beforeEach(resetMixer);

  it('hands every held channel back on a transport stop', () => {
    const store = useMixerStore.getState();
    store.setChannelDubSend(0, 0.3);
    store.setChannelDubSend(1, 0.2);

    // Two gestures holding two channels, neither released.
    ghostReverb.execute(ctx(0));
    ghostReverb.execute(ctx(1));
    expect(useMixerStore.getState().channels[0].muted).toBe(true);

    expect(releaseAllDubTransients()).toBe(2);
    expect(useMixerStore.getState().channels[0].muted).toBe(false);
    expect(useMixerStore.getState().channels[0].dubSend).toBe(0.3);
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0.2);
  });

  it('reaps a transient whose closer was lost', () => {
    let now = 0;
    dubSendBaselines.setClock(() => now);
    useMixerStore.getState().setChannelDubSend(2, 0.4);

    ghostReverb.execute(ctx(2));           // holds channel 2 muted at send 1.0
    expect(reapOrphanedDubTransients()).toBe(0);   // not orphaned yet

    now = 31_000;                          // the closer never came
    expect(reapOrphanedDubTransients()).toBe(1);
    expect(useMixerStore.getState().channels[2].muted).toBe(false);
    expect(useMixerStore.getState().channels[2].dubSend).toBe(0.4);

    dubSendBaselines.setClock(() => Date.now());
  });

  it('a reaped channel is genuinely free — a later release cannot re-mute it', () => {
    let now = 0;
    dubSendBaselines.setClock(() => now);
    useMixerStore.getState().setChannelDubSend(3, 0.5);
    const handle = ghostReverb.execute(ctx(3));

    now = 31_000;
    reapOrphanedDubTransients();
    handle?.dispose();                     // the lost closer turning up late

    expect(useMixerStore.getState().channels[3].muted).toBe(false);
    expect(useMixerStore.getState().channels[3].dubSend).toBe(0.5);
    dubSendBaselines.setClock(() => Date.now());
  });
});
