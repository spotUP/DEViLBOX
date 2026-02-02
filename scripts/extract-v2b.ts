
import * as fs from 'fs';
import * as path from 'path';

// V2 Parameter indices from v2defs.cpp / Params[]
// Simplified mapping for the most important parameters
const PARAM_MAPPING = {
  // Voice
  0: 'panning',
  1: 'transpose',
  // Osc 1
  2: 'osc1_mode',
  4: 'osc1_transpose',
  5: 'osc1_detune',
  6: 'osc1_color',
  7: 'osc1_level',
  // Osc 2
  8: 'osc2_mode',
  9: 'osc2_ringmod',
  10: 'osc2_transpose',
  11: 'osc2_detune',
  12: 'osc2_color',
  13: 'osc2_level',
  // Osc 3
  14: 'osc3_mode',
  15: 'osc3_ringmod',
  16: 'osc3_transpose',
  17: 'osc3_detune',
  18: 'osc3_color',
  19: 'osc3_level',
  // VCF 1
  20: 'filter1_mode',
  21: 'filter1_cutoff',
  22: 'filter1_resonance',
  // VCF 2
  23: 'filter2_mode',
  24: 'filter2_cutoff',
  25: 'filter2_resonance',
  // Routing
  26: 'routing_mode',
  27: 'routing_balance',
  // Amp Env
  32: 'env_attack',
  33: 'env_decay',
  34: 'env_sustain',
  35: 'env_release',
  // Env 2
  38: 'env2_attack',
  39: 'env2_decay',
  40: 'env2_sustain',
  41: 'env2_release',
  // LFO 1
  44: 'lfo1_mode',
  47: 'lfo1_rate',
  50: 'lfo1_amplify'
};

async function extractV2B(filePath: string) {
  console.log(`[V2B Extractor] Reading ${filePath}...`);
  const buffer = fs.readFileSync(filePath);
  
  // Check header
  const header = buffer.toString('ascii', 0, 4);
  if (header !== 'v2p0') {
    console.error('Invalid V2B header:', header);
    return;
  }

  let offset = 4;

  // 1. Read 128 Patch Names (32 bytes each)
  const patchNames: string[] = [];
  for (let i = 0; i < 128; i++) {
    const name = buffer.toString('ascii', offset, offset + 32).replace(/\0/g, '').trim();
    patchNames.push(name || `Preset ${i + 1}`);
    offset += 32;
  }

  // 2. Read Total Patch Data Size
  const totalSml = buffer.readUInt32LE(offset);
  offset += 4;
  const patchDataStart = offset;

  // 3. Version Detection (The V2 Way)
  // Skip over all patch data to find globsize
  const globsizeOffset = patchDataStart + totalSml;
  const globsize = buffer.readUInt32LE(globsizeOffset);
  const pw = totalSml / 128;

  console.log(`[V2B Extractor] totalSml: ${totalSml}, pw: ${pw}, globsize: ${globsize}`);

  // From V2 v2vsizes/v2gsizes:
  // Version 0: pw=160, globsize=33
  // Version 1: pw=164, globsize=34
  // Version 2: pw=168, globsize=34
  // Version 3: pw=172, globsize=34
  // Version 4: pw=176, globsize=34
  // Version 5: pw=184, globsize=34
  // Version 6: pw=196, globsize=34
  // ... each version adds params + modulation slots (255*3 bytes)
  
  // Actually, the PW we see in sounddef.cpp includes the mod slots (255*3 + 1)
  // v2vsizes[i] = nParams + 1 + 255*3
  // Version 6: nParams=73. Total PW = 73 + 1 + 765 = 839.
  // 108928 / 128 = 851. 
  // Wait, let me re-calculate version 6 size.
  
  let fver = -1;
  const V2_VSIZES = [
    784, // v0
    788, // v1
    792, // v2
    796, // v3
    800, // v4
    808, // v5
    851  // v6? (108928/128)
  ];

  for(let i=0; i<V2_VSIZES.length; i++) {
    if (pw === V2_VSIZES[i]) fver = i;
  }

  if (fver === -1) {
    console.error(`Unknown patch size ${pw}. Attempting as Version 6.`);
    fver = 6;
  }

  const nParamsPerVersion = [58, 62, 66, 70, 74, 82, 85]; // Approx
  const nParams = pw - (255*3 + 1);

  console.log(`[V2B Extractor] Found version ${fver}, nParams: ${nParams}`);

  const presets: any[] = [];

  for (let i = 0; i < 128; i++) {
    const name = patchNames[i];
    
    // Each patch starts with 32 bytes name (in bank) + 4 bytes version (if loading single patch)
    // BUT in a bank, names are at the start, and patches are just parameters.
    
    const patchParams = new Uint8Array(nParams);
    for (let j = 0; j < nParams; j++) {
      patchParams[j] = buffer[offset++];
    }

    // Skip modulation section
    const nMods = buffer[offset++];
    offset += nMods * 3;
    
    // Skip remaining mod slots (up to 255)
    offset += (255 - nMods) * 3;

    // Convert parameters to DEViLBOX V2Config
    const config = {
      type: 'synth',
      name: name,
      synthType: 'V2',
      v2: {
        osc1: {
          mode: patchParams[2],
          transpose: patchParams[4] - 64,
          detune: patchParams[5] - 64,
          color: patchParams[6],
          level: patchParams[7],
        },
        osc2: {
          mode: patchParams[8],
          ringMod: patchParams[9] > 0,
          transpose: patchParams[10] - 64,
          detune: patchParams[11] - 64,
          color: patchParams[12],
          level: patchParams[13],
        },
        osc3: {
          mode: patchParams[14],
          ringMod: patchParams[15] > 0,
          transpose: patchParams[16] - 64,
          detune: patchParams[17] - 64,
          color: patchParams[18],
          level: patchParams[19],
        },
        filter1: {
          mode: patchParams[20],
          cutoff: patchParams[21],
          resonance: patchParams[22],
        },
        filter2: {
          mode: patchParams[23],
          cutoff: patchParams[24],
          resonance: patchParams[25],
        },
        routing: {
          mode: patchParams[26],
          balance: patchParams[27],
        },
        envelope: {
          attack: patchParams[32],
          decay: patchParams[33],
          sustain: patchParams[34],
          release: patchParams[36], // SusTime is at 35
        },
        envelope2: {
          attack: patchParams[38],
          decay: patchParams[39],
          sustain: patchParams[40],
          release: patchParams[42],
        },
        lfo1: {
          rate: patchParams[47],
          depth: patchParams[50],
        }
      },
      effects: [],
      volume: -12,
      pan: 0,
    };

    // Only add if it's not a default/empty patch
    if (config.v2.osc1.level > 0 || config.v2.osc2.level > 0 || config.v2.osc3.level > 0) {
      presets.push(config);
    }
  }

  console.log(`[V2B Extractor] Extracted ${presets.length} valid presets.`);

  // Write to constants file
  const outputPath = path.join(process.cwd(), 'src/constants/v2FactoryPresets.ts');
  const content = `/**
 * V2 Factory Presets
 * Extracted from Farbrausch V2 presets.v2b
 */
import type { InstrumentConfig } from '@typedefs/instrument';

export const V2_FACTORY_PRESETS: Omit<InstrumentConfig, 'id'>[] = ${JSON.stringify(presets, null, 2)};
`;

  fs.writeFileSync(outputPath, content);
  console.log(`[V2B Extractor] Saved to ${outputPath}`);
}

// Run it
const v2bPath = path.join(process.cwd(), 'Reference Code/v2synth-master/v2/presets.v2b');
extractV2B(v2bPath).catch(console.error);
