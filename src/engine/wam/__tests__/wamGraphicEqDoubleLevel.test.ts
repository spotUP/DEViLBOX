/**
 * WAM Graphic Equalizer was +6.02 dB louder at defaults with all bands flat
 * (tools/master-fx-response-audit.json). Upstream Node.js starts with
 * dryGainNode = 1, wetGainNode = 1, isEnabled = true, and its status setter
 * returns early when the value is unchanged, so dry was never set to 0 and
 * dry + flat wet summed to double.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engageWamPluginStatus } from '../wamPluginStatus';

class FakeParam {
  value: number;
  constructor(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; } // resolved ramp end value
}

class FakeGraphicEqNode {
  dryGainNode = { gain: new FakeParam(1) };
  wetGainNode = { gain: new FakeParam(1) };
  isEnabled = true;
  set status(sig: boolean) {
    if (this.isEnabled === sig) return;
    this.isEnabled = sig;
    this.wetGainNode.gain.linearRampToValueAtTime(sig ? 1 : 0);
    this.dryGainNode.gain.linearRampToValueAtTime(sig ? 0 : 1);
  }
}

describe('WAM Graphic EQ double level at defaults', () => {
  it('fake reproduces the upstream bug when never engaged', () => {
    const n = new FakeGraphicEqNode();
    n.status = true;
    expect(n.dryGainNode.gain.value + n.wetGainNode.gain.value).toBe(2);
  });

  it('silences the plugin internal dry path while enabled', () => {
    const n = new FakeGraphicEqNode();
    expect(engageWamPluginStatus(n)).toBe(true);
    expect(n.isEnabled).toBe(true);
    expect(n.dryGainNode.gain.value).toBe(0);
    expect(n.wetGainNode.gain.value).toBe(1);
  });

  it('bypass still passes dry afterwards', () => {
    const n = new FakeGraphicEqNode();
    engageWamPluginStatus(n);
    n.status = false;
    expect(n.dryGainNode.gain.value).toBe(1);
    expect(n.wetGainNode.gain.value).toBe(0);
  });

  it('ignores plugins without a status/enabled path', () => {
    expect(engageWamPluginStatus({})).toBe(false);
    expect(engageWamPluginStatus(null)).toBe(false);
  });

  it('the effect wrapper engages the plugin after init, before connecting its input', () => {
    const src = readFileSync(join(process.cwd(), 'src/engine/wam/WAMEffectNode.ts'), 'utf8');
    const engage = src.indexOf('engageWamPluginStatus(this._wamNode)');
    expect(engage).toBeGreaterThan(0);
    expect(engage).toBeLessThan(src.indexOf('inputRaw.connect(this._wamNode)'));
  });
});
