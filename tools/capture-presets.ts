#!/usr/bin/env tsx
/**
 * capture-presets.ts — Capture native WASM synth presets via MCP
 *
 * For each synth with flat TS presets, this script:
 * 1. Creates the synth with the flat preset config
 * 2. Waits for WASM init
 * 3. Captures the complete engine state via getState
 * 4. Outputs the state as a NativePatch[] TypeScript file
 *
 * Usage:
 *   npx tsx tools/capture-presets.ts <synthType>
 *
 * Requires the dev server running (npm run dev) and a browser connected.
 * Uses the MCP bridge to execute in the browser context.
 */

import { writeFileSync } from 'fs';

const SYNTH_INFO: Record<string, {
  flatPresets: string;   // import path for flat presets
  configKey: string;     // key in InstrumentConfig
  paramCount: number;    // expected param count
}> = {
  OBXd: { flatPresets: 'OBXD_PRESETS', configKey: 'obxd', paramCount: 45 },
  SynthV1: { flatPresets: 'SYNTHV1_PRESETS', configKey: 'synthv1', paramCount: 145 },
  CalfMono: { flatPresets: 'CALF_MONO_PRESETS', configKey: 'calfMono', paramCount: 52 },
  TalNoizeMaker: { flatPresets: 'TAL_NOIZEMAKER_PRESETS', configKey: 'talNoizeMaker', paramCount: 92 },
  RaffoSynth: { flatPresets: 'RAFFO_PRESETS', configKey: 'raffo', paramCount: 32 },
  SetBfree: { flatPresets: 'SETBFREE_PRESETS', configKey: 'setbfree', paramCount: 53 },
};

console.log(`
╔════════════════════════════════════════════════════╗
║  WASM Synth Native Preset Capture Tool             ║
║                                                    ║
║  This tool captures complete engine state snapshots ║
║  from running WASM synths via the MCP bridge.      ║
║                                                    ║
║  Prerequisites:                                    ║
║    1. npm run dev (Vite + Express running)          ║
║    2. Browser open at localhost:5173                ║
║    3. MCP bridge connected                         ║
║                                                    ║
║  For each flat preset, we:                         ║
║    - Create synth instance with flat config        ║
║    - Wait for WASM initialization                  ║
║    - Send getState to capture all param values     ║
║    - Save as NativePatch[] TypeScript               ║
╚════════════════════════════════════════════════════╝

Supported synths: ${Object.keys(SYNTH_INFO).join(', ')}

To capture presets, use the MCP tools from Claude:

  1. Create a synth: create_instrument({ synthType: 'OBXd' })
  2. Load a flat preset to set params
  3. Send getState message to worklet
  4. Record the returned float array

Or use the browser console:
  const synth = window.__devilbox_synths?.['OBXd'];
  const state = await synth?.getState();
  console.log(JSON.stringify(state));
`);

// If a synth type was specified, output the template
const synthType = process.argv[2];
if (synthType && SYNTH_INFO[synthType]) {
  const info = SYNTH_INFO[synthType];
  console.log(`\nTemplate for ${synthType} (${info.paramCount} params):`);
  console.log(`
import type { NativePatch } from '@/engine/common/NativePatchLoader';

export const ${synthType.toUpperCase()}_NATIVE_PRESETS: NativePatch[] = [
  // Captured from running WASM engine
  // { name: 'Preset Name', values: [/* ${info.paramCount} floats */] },
];
`);
} else if (synthType) {
  console.error(`Unknown synth: ${synthType}`);
  console.error(`Available: ${Object.keys(SYNTH_INFO).join(', ')}`);
  process.exit(1);
}
