/**
 * The BitCrusher effect is Tone.BitCrusher. A custom WaveShaper crusher
 * stood in while Tone's worklet nodes could not be built on DEViLBOX's native
 * AudioContext; nativeContextWorklets fixed that and the stand-in is gone.
 * Saved projects keep their `bits` and wet values.
 */
import { describe, it, expect, vi } from 'vitest';

const ctor = vi.hoisted(() => vi.fn());
vi.mock('tone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tone')>();
  class BitCrusher { wet = { value: 1 }; constructor(bits: unknown) { ctor(bits); } }
  return { ...actual, BitCrusher };
});

import { createEffect } from '../EffectFactory';

const bitCrusher = (parameters: Record<string, unknown>, wet = 100) =>
  ({ id: 'b', category: 'tonejs', type: 'BitCrusher', enabled: true, wet, parameters }) as never;

describe('BitCrusher effect', () => {
  it('is built as Tone.BitCrusher with the stored bits and wet', async () => {
    const node = await createEffect(bitCrusher({ bits: 6 }, 50)) as unknown as { wet: { value: number } };
    expect(ctor).toHaveBeenCalledWith(6);
    expect(node.wet.value).toBe(0.5);
  });

  it('falls back to 4 bits when none is stored', async () => {
    ctor.mockClear();
    await createEffect(bitCrusher({}));
    expect(ctor).toHaveBeenCalledWith(4);
  });
});
