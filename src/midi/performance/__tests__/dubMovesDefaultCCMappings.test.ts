/**
 * Default CC → dub-move mapping contract (task #37).
 *
 * Locks three invariants about the out-of-the-box MIDI CC routing
 * declared in `src/stores/useMIDIStore.ts` (`DEFAULT_CC_MAPPINGS`):
 *
 *   1. Every move in DubRouter.MOVES + every bus param in DUB_BUS_PARAMS
 *      has a default CC entry. Adding a new move without a CC default
 *      fails here instead of surfacing as "my new move can't be
 *      controlled by MIDI Learn until I rescue-assign a CC by hand".
 *
 *   2. No CC collisions inside DEFAULT_CC_MAPPINGS. The TD-3 legacy
 *      block (CCs 10/16/71/74/75) is free to coexist but no two
 *      entries can share a CC.
 *
 *   3. No dub-mapping CC lands on a MIDI-reserved CC (1 mod wheel,
 *      7 channel volume, 64 sustain, 120-127 channel-mode). Controllers
 *      and DAWs treat those specially; binding a dub move there would
 *      conflict with piano sustain etc.
 *
 * Static source parse — same happy-dom-friendly pattern used by the
 * other dub contract tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DUB_ROUTER_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'engine', 'dub', 'DubRouter.ts'),
  'utf8',
);
const PARAM_ROUTER_SRC = readFileSync(
  resolve(__dirname, '..', 'parameterRouter.ts'),
  'utf8',
);
const MIDI_STORE_SRC = readFileSync(
  resolve(__dirname, '..', '..', '..', 'stores', 'useMIDIStore.ts'),
  'utf8',
);

function extractMovesRegistry(): string[] {
  const m = DUB_ROUTER_SRC.match(/const\s+MOVES\s*:\s*Record<string,\s*DubMove>\s*=\s*\{([\s\S]*?)\};/);
  if (!m) throw new Error('MOVES registry not found');
  const body = m[1];
  const ids: string[] = [];
  for (const match of body.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*,/gm)) {
    ids.push(match[1]);
  }
  return ids;
}

function extractBusParams(): string[] {
  // The DUB_BUS_PARAMS declaration spans multiple lines with `=>` inside
  // the type annotation — can't use `[^=]*` to skip past the type. Walk
  // from the identifier to the first `{` on a following line and balance
  // braces to find the matching close.
  const declIdx = PARAM_ROUTER_SRC.indexOf('const DUB_BUS_PARAMS');
  if (declIdx === -1) throw new Error('DUB_BUS_PARAMS declaration not found');
  const eqIdx = PARAM_ROUTER_SRC.indexOf('= {', declIdx);
  if (eqIdx === -1) throw new Error('DUB_BUS_PARAMS assignment not found');
  const openIdx = eqIdx + 2;
  let depth = 1;
  let i = openIdx + 1;
  while (i < PARAM_ROUTER_SRC.length && depth > 0) {
    const ch = PARAM_ROUTER_SRC[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) throw new Error('DUB_BUS_PARAMS braces unbalanced');
  const body = PARAM_ROUTER_SRC.slice(openIdx + 1, i - 1);
  const params: string[] = [];
  for (const match of body.matchAll(/'(dub\.[a-zA-Z]+)'\s*:/g)) {
    params.push(match[1]);
  }
  return params;
}

function extractDefaultCCMappings(): Array<{ cc: number; param: string }> {
  const block = MIDI_STORE_SRC.match(/DEFAULT_CC_MAPPINGS\s*:\s*CCMapping\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (!block) throw new Error('DEFAULT_CC_MAPPINGS not found');
  const out: Array<{ cc: number; param: string }> = [];
  for (const match of block[1].matchAll(/ccNumber:\s*(\d+),\s*parameter:\s*'([^']+)'/g)) {
    out.push({ cc: parseInt(match[1], 10), param: match[2] });
  }
  return out;
}

const MIDI_RESERVED_CC = new Set([
  1,    // Modulation wheel
  2,    // Breath controller
  7,    // Channel volume
  11,   // Expression
  64,   // Sustain pedal
  // 120-127 are channel-mode messages
  120, 121, 122, 123, 124, 125, 126, 127,
]);

describe('DEFAULT_CC_MAPPINGS — dub moves + bus params (task #37)', () => {
  const mappings = extractDefaultCCMappings();
  const mappingParams = new Set(mappings.map((m) => m.param));

  it('every DubRouter.MOVES id has a default CC mapping', () => {
    const moves = extractMovesRegistry();
    const missing = moves.filter((id) => !mappingParams.has(`dub.${id}`));
    expect(missing, `missing default CC for moves: ${missing.join(', ')}`).toEqual([]);
  });

  it('every DUB_BUS_PARAMS entry has a default CC mapping', () => {
    const params = extractBusParams();
    const missing = params.filter((p) => !mappingParams.has(p));
    expect(missing, `missing default CC for bus params: ${missing.join(', ')}`).toEqual([]);
  });

  it('bus toggles (dub.enabled + dub.armed) have default CC mappings', () => {
    // Not in DUB_BUS_PARAMS but are reachable via routeDubParameter.
    // Missing these means the user can't toggle the bus / arm recording
    // from MIDI without MIDI Learn.
    expect(mappingParams.has('dub.enabled')).toBe(true);
    expect(mappingParams.has('dub.armed')).toBe(true);
  });

  it('no CC number collisions within DEFAULT_CC_MAPPINGS', () => {
    const seen = new Map<number, string[]>();
    for (const { cc, param } of mappings) {
      if (!seen.has(cc)) seen.set(cc, []);
      seen.get(cc)!.push(param);
    }
    const dupes = Array.from(seen.entries()).filter(([, params]) => params.length > 1);
    const diag = dupes.map(([cc, params]) => `CC${cc}=[${params.join(', ')}]`).join('; ');
    expect(dupes.length, `CC collisions: ${diag}`).toBe(0);
  });

  it('no dub mapping lands on a MIDI-reserved CC', () => {
    const offenders = mappings
      .filter((m) => m.param.startsWith('dub.') && MIDI_RESERVED_CC.has(m.cc))
      .map((m) => `${m.param} @ CC${m.cc}`);
    expect(offenders, `dub mappings on reserved CCs: ${offenders.join(', ')}`).toEqual([]);
  });

  it('ratchet — total mapping count stays above the floor', () => {
    // Intentional floor: 5 TD-3 defaults + 27 moves + 7 bus params
    // + 2 toggles = 41 minimum. Catches accidental deletion.
    expect(mappings.length).toBeGreaterThanOrEqual(41);
  });
});
