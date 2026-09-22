import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useAudioStore } from '@stores/useAudioStore';

/**
 * "very low volume now for some reason" (2026-09-22).
 *
 * The engine's master channel sat at -29.763779527559056 dB while the mixer
 * store — and the fader on screen — read 0 dB. That number is exactly
 * `-60 + (64/127) * 60`: a controller knob at its centre detent. A Maschine
 * announces every knob position when the HID bridge connects, all eight
 * reporting 64, and one of those CCs was mapped to `masterFx.masterVolume`.
 *
 * The hardware sync is legitimate. The defect is that the router wrote
 * `engine.masterChannel.volume` directly, so the store never learned about it:
 * the two could not be reconciled, and no amount of moving the on-screen
 * fader (already at 0 dB) would fix the sound.
 */
describe('master volume has one owner', () => {
  it('the parameter router writes the store, not the engine channel', () => {
    const src = readFileSync(join(process.cwd(), 'src/midi/performance/parameterRouter.ts'), 'utf-8');
    const start = src.indexOf("if (param === 'masterFx.masterVolume')");
    expect(start).toBeGreaterThan(-1);
    const branch = src
      .slice(start, src.indexOf('}', src.indexOf('return;', start)))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))  // the comment names the old call on purpose
      .join('\n');

    expect(branch).toContain('audioStore.setMasterVolume(dB)');
    expect(
      branch,
      'a direct engine write cannot be seen by the store, so the fader and the ' +
        'audio drift apart with no way back'
    ).not.toContain('engine.masterChannel');
  });

  it('the store setter moves the store, and clamps to the fader range', async () => {
    const { setMasterVolume } = useAudioStore.getState();
    // Store writes are rAF-batched, so each assertion waits for the flush.
    const settled = (expected: number) =>
      vi.waitFor(() => expect(useAudioStore.getState().masterVolume).toBeCloseTo(expected, 5));

    // The value a centre-detent knob produces through the router's mapping —
    // the one that arrived eight times over as the Maschine announced itself.
    setMasterVolume(-60 + (64 / 127) * 60);
    await settled(-29.7637795);

    setMasterVolume(0);
    await settled(0);

    // Out of range in both directions.
    setMasterVolume(12);
    await settled(0);
    setMasterVolume(-200);
    await settled(-60);
  });
});
