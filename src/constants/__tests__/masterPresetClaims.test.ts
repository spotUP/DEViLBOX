/**
 * Every master FX preset does what its description says (owner, 2026-10-08:
 * "the presets change audio but not as their description says").
 *
 * The claims are in masterPresetClaims.ts, one table per preset group; each is
 * a metric read off the real chain rendered offline (Tone.js effects on
 * node-web-audio-api, WASM effects through their real worklets) and a bound.
 * One test per group: the failing claims of a preset are listed together, with
 * the measured number next to the words of the description it came from.
 *
 * Reachability: the rig renders FX_PRESETS[n].effects - the array the Master
 * FX menu applies - so a retune of a preset moves these numbers, and a claim
 * the chain cannot meet fails here. The sentinel is the first test of each
 * group: the claim table names every preset it covers, and each name must be
 * a preset in FX_PRESETS.
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { FX_PRESETS } from '../fxPresets';
import { PRESET_CLAIMS, LIVE_CLAIMS, LIVE_UNVERIFIED, liveOnlyReason, type Claim, type ClaimGroup } from '../masterPresetClaims';
import { PresetRig, type Fx } from '@/test/audio/masterChainRig';

async function measure(rig: PresetRig, c: Claim): Promise<number> {
  const m = c.m;
  switch (m.k) {
    case 'tilt': return (await rig.bandGainDb(m.hz)) - (await rig.bandGainDb(m.ref ?? 1000));
    case 'thd': return rig.thdDb(m.hz);
    case 'gr': return rig.staticGrDb(m.hz ?? 1000, m.hi ?? -10);
    case 'crest': return rig.crestDeltaDb();
    case 'bvr': return rig.bassVsRestDb();
    case 'tail': return (await rig.tail()).ms40;
    case 'tailLevel': return (await rig.tail()).after200Db;
    case 'clarity': return (await rig.echo()).clarity;
    case 'am': return (await rig.modulation()).amDb;
    case 'fm': return (await rig.modulation()).fmHz;
    case 'pan': return rig.panSwingDb();
    case 'width': return rig.widthDb();
    case 'noise': return rig.noiseDb();
    case 'ceil': return rig.ceilingDb();
    case 'echo': return (await rig.echo()).echo;
    case 'shimmer': return rig.shimmerRatioDb();
  }
}

/** The claims of one preset that its chain does not meet, as readable lines. */
async function failures(name: string, claims: Claim[]): Promise<string[]> {
  const preset = FX_PRESETS.find((p) => p.name === name);
  if (!preset) return [`${name}: not a preset in FX_PRESETS`];
  const rig = new PresetRig(preset.effects as Fx[], preset.gainCompensationDb ?? 0);
  const bad: string[] = [];
  for (const c of claims) {
    const v = Math.round((await measure(rig, c)) * 10) / 10;
    // CLAIMS_DUMP=<file>: keep every measured number (the research doc is generated from them).
    if (process.env.CLAIMS_DUMP) appendFileSync(process.env.CLAIMS_DUMP, JSON.stringify({ preset: name, say: c.say, value: v }) + '\n');
    if ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max)) {
      bad.push(`${name} - "${c.say}": measured ${v}, wanted ${c.min !== undefined ? '>= ' + c.min : ''}${c.min !== undefined && c.max !== undefined ? ' and ' : ''}${c.max !== undefined ? '<= ' + c.max : ''}`);
    }
  }
  return bad;
}

// CLAIM_GROUP=Amiga runs one group while tuning it.
for (const group of (Object.keys(PRESET_CLAIMS) as ClaimGroup[]).filter((g) => !process.env.CLAIM_GROUP || g === process.env.CLAIM_GROUP)) {
  describe(`${group} presets do what their descriptions say`, () => {
    const table = PRESET_CLAIMS[group];
    it('every preset in the claim table exists, and says what it claims', () => {
      for (const name of Object.keys(table)) {
        const p = FX_PRESETS.find((x) => x.name === name);
        expect(p, name).toBeDefined();
        expect(table[name].length, `${name} has claims`).toBeGreaterThan(0);
      }
    });
    it('every claim measures', async () => {
      const bad: string[] = [];
      for (const [name, claims] of Object.entries(table)) bad.push(...(await failures(name, claims)));
      expect(bad).toEqual([]);
    }, 1_800_000);
  });
}

describe('every master FX preset has claims, or a stated reason it has none offline', () => {
  const claimed = new Set(Object.values(PRESET_CLAIMS).flatMap((g) => Object.keys(g)));
  it('a preset without offline claims is one the rig cannot build, and has live claims or is listed as unverified', () => {
    const bad: string[] = [];
    for (const p of FX_PRESETS) {
      if (claimed.has(p.name)) continue;
      if (!liveOnlyReason(p.effects)) bad.push(`${p.name}: no claims and nothing stops the rig from building it`);
      else if (!LIVE_CLAIMS[p.name] && !LIVE_UNVERIFIED.has(p.name)) bad.push(`${p.name}: live-only with neither live claims nor an unverified note`);
    }
    expect(bad).toEqual([]);
  });
  it('live claims are tilt or crest only (what a song-fed tap can read)', () => {
    for (const [name, claims] of Object.entries(LIVE_CLAIMS)) for (const c of claims) expect(['tilt', 'crest'], `${name}: ${c.say}`).toContain(c.m.k);
  });
});
