/**
 * Owner 2026-10-20: "geonkick sounds weirdly high pitched". Every bundled
 * preset sweeps its oscillator frequency on a logarithmic curve
 * (freq_env.apply_type 1); the loader never passed that on, so the core
 * swept linearly and sat far above the intended pitch mid-envelope. The
 * pitch shift envelope was also written to index 3, which the core reads as
 * the oscillator's distortion drive envelope (pitch shift is 5).
 *
 * Drives a real bundled preset through loadGeonkickPresetText and records the
 * messages the engine posts to the worklet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GeonkickEngine } from '../GeonkickEngine';
import { loadGeonkickPresetText } from '../GeonkickPresetLoader';

type Msg = { type: string; oscIndex?: number; envIndex?: number; envType?: number; applyType?: number };

function recordingEngine(): { engine: GeonkickEngine; posted: Msg[] } {
  const posted: Msg[] = [];
  const engine = Object.create(GeonkickEngine.prototype) as GeonkickEngine;
  (engine as unknown as { workletNode: unknown }).workletNode = {
    port: { postMessage: (m: Msg) => { posted.push(m); } },
  };
  return { engine, posted };
}

const PRESET = resolve(__dirname, '../../../../public/geonkick/presets/HaraldReveryKicks/B-Kick.gkick');

describe('a Geonkick preset keeps its envelope curves', () => {
  it('sends each logarithmic frequency and filter cutoff curve, and pitch shift lands on envelope 5', () => {
    const text = readFileSync(PRESET, 'utf8');
    const preset = JSON.parse(text) as Record<string, { freq_env?: { apply_type?: number }; filter?: { apply_type?: number } }>;
    const { engine, posted } = recordingEngine();
    loadGeonkickPresetText(engine, text);

    const applied = (osc: number, env: number) =>
      posted.filter((m) => m.type === 'setOscEnvApplyType' && m.oscIndex === osc && m.envIndex === env).pop()?.applyType;

    let logarithmic = 0;
    for (let i = 0; i < 9; i++) {
      const osc = preset[`osc${i}`];
      if (!osc) continue;
      expect(applied(i, 1)).toBe(osc.freq_env?.apply_type ?? 0);
      if (osc.filter) expect(applied(i, 2)).toBe(osc.filter.apply_type ?? 0);
      if (osc.freq_env?.apply_type === 1) logarithmic++;
    }
    expect(logarithmic).toBeGreaterThan(0);

    const envIndices = posted.filter((m) => m.type === 'setOscEnvelope').map((m) => m.envIndex);
    expect(envIndices).toContain(5);
    expect(envIndices).not.toContain(3);
  });
});
