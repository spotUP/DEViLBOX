/**
 * The DJ mixer's master FX chain failed to build whenever it held a native
 * effect: "[DJMixerEngine] FX chain connection failed, keeping old chain:
 * TypeError: Failed to execute 'connect' on 'AudioNode': parameter 1 is not
 * of type 'AudioNode'" (seen 2026-09-27 on a DJ deck load). It connected
 * nodes with `.connect()`, which only works between Tone.js nodes. The
 * tracker's chains had a bridge for native (.input/.output) effects, in two
 * private copies; it is now one function every chain uses.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as Tone from 'tone';
import { connectAudio } from '../connectAudio';

vi.mock('@utils/audio-context', () => ({
  getNativeAudioNode: (n: { __native?: unknown }) => n.__native ?? null,
}));

const nativeEffect = () => ({ input: { connect: vi.fn() }, output: { connect: vi.fn() }, dispose: vi.fn() });
/** A Tone node as far as connectAudio can tell: an instance, with its native node. */
function toneNode() {
  const n = Object.create(Tone.ToneAudioNode.prototype) as { connect: ReturnType<typeof vi.fn>; __native: { connect: ReturnType<typeof vi.fn> } };
  n.connect = vi.fn();
  n.__native = { connect: vi.fn() };
  return n;
}

describe('connecting an effect chain', () => {
  it('feeds a native effect\'s input from a Tone node', () => {
    const src = toneNode();
    const fx = nativeEffect();
    connectAudio(src, fx);
    expect(src.__native.connect).toHaveBeenCalledWith(fx.input);
    expect(src.connect).not.toHaveBeenCalled();
  });

  it('feeds a Tone node from a native effect\'s output', () => {
    const fx = nativeEffect();
    const dst = toneNode();
    connectAudio(fx, dst);
    expect(fx.output.connect).toHaveBeenCalledWith(dst.__native);
  });

  it('uses Tone\'s own connect between two Tone nodes', () => {
    const a = toneNode(), b = toneNode();
    connectAudio(a, b);
    expect(a.connect).toHaveBeenCalledWith(b);
  });

  it('is what the DJ mixer\'s master chain uses', () => {
    const src = readFileSync(resolve(__dirname, '../../dj/DJMixerEngine.ts'), 'utf8');
    const chain = src.slice(src.indexOf('async rebuildMasterEffects'), src.indexOf('FX chain connection failed'));
    expect(chain).not.toMatch(/nodes\[[^\]]*\]\.connect\(/);
    expect(chain).toMatch(/connectAudio\(/);
  });
});
