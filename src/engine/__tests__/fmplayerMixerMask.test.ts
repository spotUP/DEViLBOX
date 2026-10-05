/**
 * The mixer's mask (bit N set = channel N audible) reaches the OPNA the right
 * way round in FMPlayer.
 *
 * libopna's own mask is the opposite sense (set = muted). The WASM export used
 * to pass the mixer's mask straight to opna_set_mask, so the all-channels-on
 * mask muted all ten channels (ASAP had the same fault, aeba7a72f). Drives
 * the real worklet and WASM and reads the chip's own mask back.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet } from './workletHarness';

type Core = { _fmplayer_wasm_get_chip_mute_mask(): number };

describe('FMPlayer worklet: the mixer mask (bit set = audible)', () => {
  it('leaves every channel audible for the all-on mask and mutes all for 0', async () => {
    const { proc, send } = await startWorklet('fmplayer', 'Fmplayer');
    const core = proc.module as unknown as Core;
    const chip = () => core._fmplayer_wasm_get_chip_mute_mask() >>> 0;

    await send({ type: 'setMuteMask', mask: 0xffffffff });
    expect(chip()).toBe(0);                       // nothing muted

    await send({ type: 'setMuteMask', mask: 0 });
    expect(chip()).toBe(0x81ff);                  // FM 1-6, SSG 1-3 and ADPCM muted

    // channel 0 (FM 1) and channel 9 (ADPCM) audible: every other one muted
    await send({ type: 'setMuteMask', mask: (1 << 0) | (1 << 9) });
    expect(chip()).toBe(0x01fe);
  }, 30_000);
});
