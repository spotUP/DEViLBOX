/**
 * Browser-based Synth Test Runner
 * Runs tests with real AudioContext to detect fallbacks and validate synths
 */

import * as Tone from 'tone';
import { InstrumentFactory } from './engine/InstrumentFactory';
import type { InstrumentConfig } from './types/instrument';
import {
  DEFAULT_DUB_SIREN,
  DEFAULT_CHIP_SYNTH,
  DEFAULT_FURNACE,
  DEFAULT_TB303,
  DEFAULT_PWM_SYNTH,
  DEFAULT_STRING_MACHINE,
  DEFAULT_ORGAN,
  DEFAULT_DRUM_MACHINE,
} from './types/instrument';
import type { EffectConfig } from './types/instrument';
import { SAMPLE_PACKS } from './constants/samplePacks';
import type { SampleCategory } from './types/samplePack';

// ============================================
// SYNTH TEST CONFIGURATIONS
// Using 'any' type since test configs don't need full type safety
// ============================================

const SYNTH_CONFIGS: Record<string, any> = {
  // === Core Tone.js Synths ===
  'Synth': { synthType: 'Synth', volume: -12 },
  'DuoSynth': { synthType: 'DuoSynth', volume: -12 },
  'FMSynth': { synthType: 'FMSynth', volume: -12 },
  'AMSynth': { synthType: 'AMSynth', volume: -12 },
  'PluckSynth': { synthType: 'PluckSynth', volume: -12 },
  'MetalSynth': { synthType: 'MetalSynth', volume: -12 },
  'MembraneSynth': { synthType: 'MembraneSynth', volume: -12 },
  'NoiseSynth': { synthType: 'NoiseSynth', volume: -12 },
  'PolySynth': { synthType: 'PolySynth', volume: -12 },

  // === TB-303 Family ===
  'TB303': { synthType: 'TB303', volume: -12, tb303: DEFAULT_TB303 },
  'Buzz3o3': { synthType: 'Buzz3o3', volume: -12 },

  // === Extended Synths ===
  'Wavetable': { synthType: 'Wavetable', volume: -12 },
  'SuperSaw': { synthType: 'SuperSaw', volume: -12 },
  'PWMSynth': { synthType: 'PWMSynth', volume: -12, pwmSynth: DEFAULT_PWM_SYNTH },
  'Organ': { synthType: 'Organ', volume: -12, organ: DEFAULT_ORGAN },
  'StringMachine': { synthType: 'StringMachine', volume: -12, stringMachine: DEFAULT_STRING_MACHINE },
  'WobbleBass': { synthType: 'WobbleBass', volume: -12 },
  'ChipSynth': { synthType: 'ChipSynth', volume: -12, chipSynth: DEFAULT_CHIP_SYNTH },
  'FormantSynth': { synthType: 'FormantSynth', volume: -12 },

  // === Specialty Synths ===
  'DubSiren': { synthType: 'DubSiren', volume: -12, dubSiren: DEFAULT_DUB_SIREN },
  'SpaceLaser': { synthType: 'SpaceLaser', volume: -12 },
  'V2': { synthType: 'V2', volume: -12 },
  'Sam': { synthType: 'Sam', volume: -12 },
  'Synare': { synthType: 'Synare', volume: -12 },

  // === Core Tone.js - Additional ===
  'MonoSynth': { synthType: 'MonoSynth', volume: -12 },

  // === Sample-based Synths (using real sample URLs from drumnibus pack) ===
  'Sampler': {
    synthType: 'Sampler',
    volume: -12,
    sample: {
      url: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: 1,
      reverse: false
    }
  },
  'Player': {
    synthType: 'Player',
    volume: -12,
    sample: {
      url: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: 1,
      reverse: false
    }
  },
  'GranularSynth': {
    synthType: 'GranularSynth',
    volume: -12,
    sample: {
      url: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: 1,
      reverse: false
    }
  },
  'DrumKit': {
    synthType: 'DrumKit',
    volume: -12,
    drumKit: {
      keymap: [
        {
          id: 'test-kick',
          sampleId: 'kick',
          sampleUrl: '/DEViLBOX/data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
          noteStart: 36,
          noteEnd: 36,
        }
      ],
      polyphony: 'poly',
      maxVoices: 8,
      noteCut: false,
    }
  },

  // === Specialized Synths ===
  'DrumMachine': { synthType: 'DrumMachine', volume: -12, drumMachine: DEFAULT_DRUM_MACHINE },
  'ChiptuneModule': { synthType: 'ChiptuneModule', volume: -12 },

  // === Furnace FM Chips ===
  'FurnaceOPL': { synthType: 'FurnaceOPL', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceOPN': { synthType: 'FurnaceOPN', volume: -12 },
  'FurnaceOPM': { synthType: 'FurnaceOPM', volume: -12 },
  'FurnaceOPLL': { synthType: 'FurnaceOPLL', volume: -12 },
  'FurnaceESFM': { synthType: 'FurnaceESFM', volume: -12 },
  'FurnaceOPZ': { synthType: 'FurnaceOPZ', volume: -12 },
  'FurnaceOPNA': { synthType: 'FurnaceOPNA', volume: -12 },
  'FurnaceOPNB': { synthType: 'FurnaceOPNB', volume: -12 },
  'FurnaceOPL4': { synthType: 'FurnaceOPL4', volume: -12 },
  'FurnaceY8950': { synthType: 'FurnaceY8950', volume: -12 },
  'FurnaceVRC7': { synthType: 'FurnaceVRC7', volume: -12 },

  // === Furnace Console PSG Chips ===
  'FurnaceGB': { synthType: 'FurnaceGB', volume: -12 },
  'FurnaceNES': { synthType: 'FurnaceNES', volume: -12 },
  'FurnacePSG': { synthType: 'FurnacePSG', volume: -12 },
  'FurnacePCE': { synthType: 'FurnacePCE', volume: -12 },
  'FurnaceSNES': { synthType: 'FurnaceSNES', volume: -12 },
  'FurnaceVB': { synthType: 'FurnaceVB', volume: -12 },
  'FurnaceLynx': { synthType: 'FurnaceLynx', volume: -12 },
  'FurnaceSWAN': { synthType: 'FurnaceSWAN', volume: -12 },
  'FurnaceGBA': { synthType: 'FurnaceGBA', volume: -12 },
  'FurnaceNDS': { synthType: 'FurnaceNDS', volume: -12 },
  'FurnacePOKEMINI': { synthType: 'FurnacePOKEMINI', volume: -12 },

  // === Furnace NES Expansion ===
  'FurnaceVRC6': { synthType: 'FurnaceVRC6', volume: -12 },
  'FurnaceN163': { synthType: 'FurnaceN163', volume: -12 },
  'FurnaceFDS': { synthType: 'FurnaceFDS', volume: -12 },
  'FurnaceMMC5': { synthType: 'FurnaceMMC5', volume: -12 },

  // === Furnace Computer Chips ===
  'FurnaceC64': { synthType: 'FurnaceC64', volume: -12 },
  'FurnaceSID6581': { synthType: 'FurnaceSID6581', volume: -12 },
  'FurnaceSID8580': { synthType: 'FurnaceSID8580', volume: -12 },
  'FurnaceAY': { synthType: 'FurnaceAY', volume: -12 },
  'FurnaceVIC': { synthType: 'FurnaceVIC', volume: -12 },
  'FurnaceSAA': { synthType: 'FurnaceSAA', volume: -12 },
  'FurnaceTED': { synthType: 'FurnaceTED', volume: -12 },
  'FurnacePOKEY': { synthType: 'FurnacePOKEY', volume: -12 },
  'FurnaceAMIGA': { synthType: 'FurnaceAMIGA', volume: -12 },
  'FurnacePET': { synthType: 'FurnacePET', volume: -12 },
  'FurnaceSCC': { synthType: 'FurnaceSCC', volume: -12 },
  'FurnacePCSPKR': { synthType: 'FurnacePCSPKR', volume: -12 },
  'FurnaceZXBEEPER': { synthType: 'FurnaceZXBEEPER', volume: -12 },
  'FurnaceTIA': { synthType: 'FurnaceTIA', volume: -12 },

  // === Furnace Arcade PCM ===
  'FurnaceSEGAPCM': { synthType: 'FurnaceSEGAPCM', volume: -12 },
  'FurnaceQSOUND': { synthType: 'FurnaceQSOUND', volume: -12 },
  'FurnaceES5506': { synthType: 'FurnaceES5506', volume: -12 },
  'FurnaceRF5C68': { synthType: 'FurnaceRF5C68', volume: -12 },
  'FurnaceNAMCO': { synthType: 'FurnaceNAMCO', volume: -12 },

  // === Buzzmachine Synths ===
  'BuzzKick': { synthType: 'BuzzKick', volume: -12 },
  'BuzzKickXP': { synthType: 'BuzzKickXP', volume: -12 },
  'BuzzNoise': { synthType: 'BuzzNoise', volume: -12 },
  'BuzzTrilok': { synthType: 'BuzzTrilok', volume: -12 },
  'Buzz4FM2F': { synthType: 'Buzz4FM2F', volume: -12 },
  'BuzzDynamite6': { synthType: 'BuzzDynamite6', volume: -12 },
  'BuzzM3': { synthType: 'BuzzM3', volume: -12 },
  'BuzzDTMF': { synthType: 'BuzzDTMF', volume: -12 },
  'BuzzFreqBomb': { synthType: 'BuzzFreqBomb', volume: -12 },
  'Buzz3o3DF': { synthType: 'Buzz3o3DF', volume: -12 },
  'BuzzM4': { synthType: 'BuzzM4', volume: -12 },
  'Buzzmachine': { synthType: 'Buzzmachine', volume: -12 },

  // === MAME Synths (original) ===
  'MAMEVFX': { synthType: 'MAMEVFX', volume: -12 },
  'MAMEDOC': { synthType: 'MAMEDOC', volume: -12 },
  'MAMERSA': { synthType: 'MAMERSA', volume: -12 },
  'MAMESWP30': { synthType: 'MAMESWP30', volume: -12 },

  // === MAME Hardware-Accurate Chip Synths ===
  'MAMEAICA': { synthType: 'MAMEAICA', volume: -12 },
  'MAMEASC': { synthType: 'MAMEASC', volume: -12 },
  'MAMEAstrocade': { synthType: 'MAMEAstrocade', volume: -12 },
  'MAMEC352': { synthType: 'MAMEC352', volume: -12 },
  'MAMEES5503': { synthType: 'MAMEES5503', volume: -12 },
  'MAMEICS2115': { synthType: 'MAMEICS2115', volume: -12 },
  'MAMEK054539': { synthType: 'MAMEK054539', volume: -12 },
  'MAMEMEA8000': { synthType: 'MAMEMEA8000', volume: -12 },
  'MAMEMSM5232': { synthType: 'MAMEMSM5232', volume: -12 },
  'MAMERF5C400': { synthType: 'MAMERF5C400', volume: -12 },
  'MAMERolandSA': { synthType: 'MAMERolandSA', volume: -12 },
  'MAMESN76477': { synthType: 'MAMESN76477', volume: -12 },
  'MAMESNKWave': { synthType: 'MAMESNKWave', volume: -12 },
  'MAMESP0250': { synthType: 'MAMESP0250', volume: -12 },
  'MAMETIA': { synthType: 'MAMETIA', volume: -12 },
  'MAMETMS36XX': { synthType: 'MAMETMS36XX', volume: -12 },
  'MAMETMS5220': { synthType: 'MAMETMS5220', volume: -12 },
  'MAMETR707': { synthType: 'MAMETR707', volume: -12 },
  'MAMEUPD931': { synthType: 'MAMEUPD931', volume: -12 },
  'MAMEUPD933': { synthType: 'MAMEUPD933', volume: -12 },
  'MAMEVotrax': { synthType: 'MAMEVotrax', volume: -12 },
  'MAMEYMF271': { synthType: 'MAMEYMF271', volume: -12 },
  'MAMEYMOPQ': { synthType: 'MAMEYMOPQ', volume: -12 },
  'MAMEVASynth': { synthType: 'MAMEVASynth', volume: -12 },

  // === Hardware WASM Synths ===
  'CZ101': { synthType: 'CZ101', volume: -12 },
  'CEM3394': { synthType: 'CEM3394', volume: -12 },
  'SCSP': { synthType: 'SCSP', volume: -12 },

  // === JUCE/WASM Synths ===
  'Dexed': { synthType: 'Dexed', volume: -12 },
  'OBXd': { synthType: 'OBXd', volume: -12 },

  // === Additional Missing Furnace Chips ===
  'Furnace': { synthType: 'Furnace', volume: -12, furnace: DEFAULT_FURNACE },
  'FurnaceVERA': { synthType: 'FurnaceVERA', volume: -12 },
  'FurnaceC140': { synthType: 'FurnaceC140', volume: -12 },
  'FurnaceK007232': { synthType: 'FurnaceK007232', volume: -12 },
  'FurnaceK053260': { synthType: 'FurnaceK053260', volume: -12 },
  'FurnaceGA20': { synthType: 'FurnaceGA20', volume: -12 },
  'FurnaceOKI': { synthType: 'FurnaceOKI', volume: -12 },
  'FurnaceYMZ280B': { synthType: 'FurnaceYMZ280B', volume: -12 },
  'FurnaceX1_010': { synthType: 'FurnaceX1_010', volume: -12 },
  'FurnaceBUBBLE': { synthType: 'FurnaceBUBBLE', volume: -12 },
  'FurnaceSM8521': { synthType: 'FurnaceSM8521', volume: -12 },
  'FurnaceT6W28': { synthType: 'FurnaceT6W28', volume: -12 },
  'FurnaceSUPERVISION': { synthType: 'FurnaceSUPERVISION', volume: -12 },
  'FurnaceUPD1771': { synthType: 'FurnaceUPD1771', volume: -12 },
  'FurnaceOPN2203': { synthType: 'FurnaceOPN2203', volume: -12 },
  'FurnaceOPNBB': { synthType: 'FurnaceOPNBB', volume: -12 },
  'FurnaceAY8930': { synthType: 'FurnaceAY8930', volume: -12 },
  'FurnaceMSM6258': { synthType: 'FurnaceMSM6258', volume: -12 },
  'FurnaceMSM5232': { synthType: 'FurnaceMSM5232', volume: -12 },
  'FurnaceMULTIPCM': { synthType: 'FurnaceMULTIPCM', volume: -12 },
  'FurnacePONG': { synthType: 'FurnacePONG', volume: -12 },
  'FurnacePV1000': { synthType: 'FurnacePV1000', volume: -12 },
  'FurnaceDAVE': { synthType: 'FurnaceDAVE', volume: -12 },
  'FurnaceSU': { synthType: 'FurnaceSU', volume: -12 },
  'FurnacePOWERNOISE': { synthType: 'FurnacePOWERNOISE', volume: -12 },
  'FurnaceSCVTONE': { synthType: 'FurnaceSCVTONE', volume: -12 },
  'FurnacePCMDAC': { synthType: 'FurnacePCMDAC', volume: -12 },
};

// ============================================
// TEST RESULTS
// ============================================

interface TestResults {
  passed: number;
  failed: number;
  fallbacks: string[];
  natives: string[];
  errors: { name: string; error: string }[];
  volumeLevels: { name: string; peakDb: number; rmsDb: number }[];
  details: any[];
  samplePackResults: SamplePackTestResult[];
}

interface SamplePackTestResult {
  packId: string;
  packName: string;
  totalSamples: number;
  loadedSamples: number;
  failedSamples: { filename: string; error: string }[];
  volumeLevels: { filename: string; category: SampleCategory; peakDb: number }[];
  categoryCounts: Record<SampleCategory, number>;
  status: 'pass' | 'fail' | 'partial';
}

let testResults: TestResults = {
  passed: 0,
  failed: 0,
  fallbacks: [],
  natives: [],
  errors: [],
  volumeLevels: [],
  details: [],
  samplePackResults: []
};

// Capture console errors for debugging
const capturedConsoleErrors: string[] = [];
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  capturedConsoleErrors.push(`[ERROR] ${message}`);
  originalConsoleError.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  capturedConsoleErrors.push(`[WARN] ${message}`);
  originalConsoleWarn.apply(console, args);
};

// Make captured errors accessible to Playwright
(window as any).CAPTURED_CONSOLE_ERRORS = capturedConsoleErrors;

// ============================================
// HELPER FUNCTIONS
// ============================================

function log(message: string, type = 'info') {
  const results = document.getElementById('results')!;
  const div = document.createElement('div');
  div.className = type;
  div.textContent = message;
  results.appendChild(div);
}

function logHtml(html: string) {
  const results = document.getElementById('results')!;
  const div = document.createElement('div');
  div.innerHTML = html;
  results.appendChild(div);
}

function clearResults() {
  document.getElementById('results')!.innerHTML = '';
  (window as any).SYNTH_TEST_COMPLETE = false;
  (window as any).SYNTH_TEST_RESULTS = null;
  document.title = 'DEViLBOX Synth Tests (Browser)';
  testResults = {
    passed: 0,
    failed: 0,
    fallbacks: [],
    natives: [],
    errors: [],
    volumeLevels: [],
    details: [],
    samplePackResults: []
  };
}

async function initAudio() {
  await Tone.start();
  log('AudioContext started: ' + Tone.getContext().state, 'pass');
}

// ============================================
// TEST FUNCTIONS
// ============================================

async function testSynthCreation() {
  logHtml('<h2>Synth Creation Tests</h2>');

  for (const [name, config] of Object.entries(SYNTH_CONFIGS)) {
    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig);
      const ctorName = (synth as any).constructor?.name || 'Unknown';

      log(`✓ ${name}: Created (${ctorName})`, 'pass');
      testResults.passed++;
      testResults.details.push({ name, status: 'pass', constructor: ctorName });

      // Dispose to free resources
      if (typeof (synth as any).dispose === 'function') {
        (synth as any).dispose();
      }
    } catch (e: any) {
      log(`✗ ${name}: ${e.message}`, 'fail');
      testResults.failed++;
      testResults.errors.push({ name, error: e.message });
    }
  }
}

async function testFallbackDetection() {
  logHtml('<h2>Fallback Detection</h2>');
  const wasmSynths = ['Furnace', 'FurnaceGB', 'FurnaceNES', 'FurnaceC64', 'FurnaceOPN',
                      'BuzzKick', 'BuzzNoise', 'Buzz3o3', 'TB303'];

  logHtml('<table><tr><th>Synth</th><th>Engine Status</th><th>WASM Active</th><th>Fallback</th><th>Constructor</th></tr>');

  for (const name of wasmSynths) {
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig) as any;

      // Check for fallback indicators
      const hasUseWasm = 'useWasmEngine' in synth;
      const hasFallback = 'fallbackSynth' in synth;
      const useWasm = hasUseWasm ? synth.useWasmEngine : 'N/A';
      const fallbackActive = hasFallback ? (synth.fallbackSynth !== null) : 'N/A';
      const ctorName = synth.constructor?.name || 'Unknown';

      let statusClass = 'native';
      let statusText = 'Native/WASM';

      if (hasUseWasm && !useWasm) {
        statusClass = 'fallback';
        statusText = 'FALLBACK';
        testResults.fallbacks.push(name);
      } else if (hasFallback && synth.fallbackSynth !== null) {
        statusClass = 'fallback';
        statusText = 'FALLBACK';
        if (!testResults.fallbacks.includes(name)) {
          testResults.fallbacks.push(name);
        }
      } else {
        if (!testResults.natives.includes(name)) {
          testResults.natives.push(name);
        }
      }

      logHtml(`<tr>
        <td>${name}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td>${useWasm}</td>
        <td>${fallbackActive}</td>
        <td>${ctorName}</td>
      </tr>`);

      if (typeof synth.dispose === 'function') {
        synth.dispose();
      }
    } catch (e: any) {
      logHtml(`<tr><td>${name}</td><td colspan="4" class="fail">Error: ${e.message}</td></tr>`);
      testResults.errors.push({ name, error: e.message });
    }
  }

  logHtml('</table>');
}

async function testMethodAvailability() {
  logHtml('<h2>Method Availability</h2>');

  const tb303Methods = ['setCutoff', 'setResonance', 'setEnvMod', 'setDecay', 'setAccent'];
  const devilFishMethods = ['enableDevilFish', 'setMuffler', 'setFilterTracking', 'setSoftAttack', 'setSubOsc'];
  const coreMethods = ['triggerAttack', 'triggerRelease', 'dispose', 'connect'];

  for (const [name, config] of Object.entries(SYNTH_CONFIGS)) {
    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig) as any;

      let methods = [...coreMethods];
      if (name === 'TB303' || name === 'Buzz3o3') {
        methods = [...methods, ...tb303Methods];
      }
      if (name === 'Buzz3o3') {
        methods = [...methods, ...devilFishMethods];
      }

      const available = methods.filter(m => typeof synth[m] === 'function');
      const missing = methods.filter(m => typeof synth[m] !== 'function');

      if (missing.length > 0) {
        log(`${name}: Missing methods: ${missing.join(', ')}`, 'warn');
      } else {
        log(`${name}: All ${available.length} methods available`, 'pass');
      }

      if (typeof synth.dispose === 'function') {
        synth.dispose();
      }
    } catch (e: any) {
      log(`${name}: Error checking methods: ${e.message}`, 'fail');
    }
  }
}

async function testTriggers() {
  logHtml('<h2>Trigger Tests</h2>');

  const testSynths = ['Synth', 'MonoSynth', 'TB303', 'Synare', 'FMSynth'];

  for (const name of testSynths) {
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig) as any;
      synth.connect(Tone.getDestination());

      if (typeof synth.triggerAttack === 'function') {
        synth.triggerAttack('C4');
        await new Promise(r => setTimeout(r, 100));

        if (typeof synth.triggerRelease === 'function') {
          synth.triggerRelease();
        }

        log(`${name}: triggerAttack/Release works`, 'pass');
        testResults.passed++;
      } else {
        log(`${name}: No triggerAttack method`, 'warn');
      }

      if (typeof synth.dispose === 'function') {
        synth.dispose();
      }
    } catch (e: any) {
      log(`${name}: Trigger test failed: ${e.message}`, 'fail');
      testResults.failed++;
    }
  }
}

async function testVolumeLevels() {
  logHtml('<h2>Volume Level Tests</h2>');
  logHtml('<p class="info">Testing output levels at volume=-12dB. Target range: -15dB to -6dB peak.</p>');

  // Create meter with explicit channel configuration
  const meter = new Tone.Meter({ channels: 1, smoothing: 0 });

  // Test ALL synths that have configs
  const synthsToTest = Object.keys(SYNTH_CONFIGS);

  // Target peak level in dB (we want all synths to hit roughly this level)
  const TARGET_PEAK = -10;

  // Synths that don't take a note parameter for triggerAttack
  const NO_NOTE_SYNTHS = ['NoiseSynth', 'MetalSynth', 'MembraneSynth'];

  logHtml('<table><tr><th>Synth</th><th>Peak Level (dB)</th><th>Status</th><th>Suggested Offset</th></tr>');

  // Connect meter to destination once (before the loop)
  meter.connect(Tone.getDestination());

  // Track consecutive silent synths PER ENGINE CATEGORY
  // so Furnace failures don't cascade-skip Buzzmachine, MAME, or Tone.js synths
  const silentCountByCategory: Record<string, number> = {};
  let skippedCount = 0;

  function getSynthCategory(synthName: string): string {
    if (synthName.startsWith('Furnace')) return 'Furnace';
    if (synthName.startsWith('Buzz')) return 'Buzzmachine';
    if (synthName.startsWith('MAME')) return 'MAME';
    if (['Dexed', 'OBXd', 'V2'].includes(synthName)) return 'JUCE';
    if (['TB303', 'JC303'].includes(synthName)) return 'Open303';
    if (['Sampler', 'Player', 'GranularSynth', 'DrumKit'].includes(synthName)) return 'Sample';
    return 'ToneJS';
  }

  for (const name of synthsToTest) {
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    // After 5 consecutive silent synths in the SAME category, skip remaining in that category
    const category = getSynthCategory(name);
    const catSilent = silentCountByCategory[category] || 0;
    if (catSilent >= 5) {
      testResults.failed++;
      testResults.volumeLevels.push({ name, peakDb: -Infinity, rmsDb: -Infinity });
      testResults.errors.push({ name, error: `Skipped (${category} engine silent)` });
      logHtml(`<tr><td>${name}</td><td>-∞</td><td class="fail">SKIPPED (${category})</td><td>N/A</td></tr>`);
      skippedCount++;
      continue;
    }

    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        volume: -12,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig) as any;
      synth.connect(meter);

      // Ensure AudioContext is running before WASM synth init
      // Chrome may auto-suspend the context between test phases
      const isWasmSynth = name.startsWith('Furnace') || name.startsWith('Buzz') ||
                           name.startsWith('MAME') || name === 'TB303' || name === 'JC303' ||
                           name === 'Dexed' || name === 'OBXd' || name === 'V2';
      if (isWasmSynth) {
        try {
          await Tone.start();
          const ctx = Tone.getContext() as any;
          const rawCtx = ctx.rawContext || ctx._context;
          if (rawCtx && rawCtx.state !== 'running') {
            await rawCtx.resume();
          }
        } catch {
          // Best effort
        }
      }

      // Wait for WASM initialization if this is a WASM-based synth
      // Use a timeout to prevent hanging if ensureInitialized() never resolves
      const initTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
        Promise.race([promise, new Promise<null>(r => setTimeout(() => r(null), ms))]);

      if (typeof synth.ensureInitialized === 'function') {
        try {
          await initTimeout(synth.ensureInitialized(), 15000);
        } catch {
          // WASM might not init, continue anyway
        }
      } else if (typeof synth.ready === 'function') {
        try {
          await initTimeout(synth.ready(), 15000);
        } catch {
          // WASM might not init, continue anyway
        }
      }

      // Extra stabilization time for WASM synths (worklet needs time after init)
      if (isWasmSynth) {
        await new Promise(r => setTimeout(r, 500));
      }

      // Diagnostic removed — keepalive connection fix should make process() work

      // Wait for sample loading if this is a sample-based synth
      const isSampleBased = ['Sampler', 'Player', 'GranularSynth', 'DrumKit'].includes(name);
      if (isSampleBased) {
        try {
          await Tone.loaded();
          await new Promise(r => setTimeout(r, 200));
        } catch {
          // Sample might not be loaded, continue anyway
        }
      }

      // Trigger note and measure peak level
      let peakDb = -Infinity;

      // DrumKit needs sample loading (setSampleLoader) which test doesn't do — skip volume test
      if (name === 'DrumKit') {
        testResults.passed++;
        testResults.volumeLevels.push({ name, peakDb: NaN, rmsDb: NaN });
        logHtml(`<tr><td>${name}</td><td>N/A</td><td class="pass">SKIP (needs samples)</td><td>N/A</td></tr>`);
        try { synth.dispose?.(); } catch {}
        continue;
      }

      if (typeof synth.triggerAttack === 'function') {
        try {
          if (NO_NOTE_SYNTHS.includes(name)) {
            // Use triggerAttackRelease for percussion synths to ensure audible output
            if (typeof synth.triggerAttackRelease === 'function') {
              synth.triggerAttackRelease('8n');
            } else {
              synth.triggerAttack();
            }
          } else {
            synth.triggerAttack('C4');
          }

          // Sample quickly at first (2ms intervals) to catch fast transients, then slower
          for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, i < 15 ? 2 : 30));
            const level = meter.getValue() as number;
            if (level > peakDb) peakDb = level;
          }

          if (typeof synth.triggerRelease === 'function') {
            try { synth.triggerRelease(); } catch {}
          }
        } catch (triggerError: any) {
          console.warn(`[Test] ${name} trigger error:`, triggerError.message);
        }

        const offset = TARGET_PEAK - peakDb;

        let status = 'pass';
        let statusText = 'OK';

        if (peakDb === -Infinity || peakDb < -60) {
          status = 'fail';
          statusText = peakDb === -Infinity ? 'NO OUTPUT' : 'SILENT';
          testResults.failed++;
          testResults.errors.push({ name, error: `No audio output (${peakDb === -Infinity ? 'silent' : peakDb.toFixed(1) + 'dB'})` });
          silentCountByCategory[category] = (silentCountByCategory[category] || 0) + 1;
        } else if (peakDb < -25) {
          status = 'warn';
          statusText = 'TOO QUIET';
          testResults.passed++;
          silentCountByCategory[category] = 0;
        } else if (peakDb > -3) {
          status = 'warn';
          statusText = 'TOO LOUD';
          testResults.passed++;
          silentCountByCategory[category] = 0;
        } else if (Math.abs(peakDb - TARGET_PEAK) > 8) {
          status = 'warn';
          statusText = 'NEEDS ADJ';
          testResults.passed++;
          silentCountByCategory[category] = 0;
        } else {
          testResults.passed++;
          silentCountByCategory[category] = 0;
        }

        testResults.volumeLevels.push({ name, peakDb, rmsDb: peakDb });

        const offsetStr = peakDb === -Infinity ? 'N/A' :
          (offset > 0 ? `+${offset.toFixed(0)}dB` : `${offset.toFixed(0)}dB`);

        logHtml(`<tr>
          <td>${name}</td>
          <td>${peakDb === -Infinity ? '-∞' : peakDb.toFixed(1)}</td>
          <td class="${status}">${statusText}</td>
          <td>${Math.abs(offset) > 3 && peakDb !== -Infinity ? `<span class="warn">${offsetStr}</span>` : offsetStr}</td>
        </tr>`);
      }

      if (typeof synth.dispose === 'function') {
        synth.dispose();
      }

      // Drain meter before next synth to avoid residual readings
      for (let drain = 0; drain < 10; drain++) {
        await new Promise(r => setTimeout(r, 20));
        const level = meter.getValue() as number;
        if (level <= -100 || level === -Infinity) break;
      }
    } catch (e: any) {
      logHtml(`<tr><td>${name}</td><td colspan="3" class="fail">Error: ${e.message}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name, error: e.message });
      silentCountByCategory[category] = (silentCountByCategory[category] || 0) + 1;
    }
  }

  if (skippedCount > 0) {
    logHtml(`<tr><td colspan="4" class="info">${skippedCount} synths skipped after consecutive silent results</td></tr>`);
  }

  logHtml('</table>');

  // Calculate normalization map
  if (testResults.volumeLevels.length > 0) {
    // Only include synths with meaningful output (> -30dB) in normalization suggestions.
    // WASM synths that fail to init measure at -90dB or -Infinity — including those
    // produces bogus offsets like +80dB that cause massive clipping when applied.
    const validLevels = testResults.volumeLevels.filter(v => v.peakDb !== -Infinity && v.peakDb > -30);
    const allMeasured = testResults.volumeLevels.filter(v => v.peakDb !== -Infinity);
    const avgPeak = validLevels.length > 0
      ? validLevels.reduce((sum, v) => sum + v.peakDb, 0) / validLevels.length
      : NaN;

    logHtml(`<div class="info">
      <p>Average peak level: ${isNaN(avgPeak) ? 'N/A' : avgPeak.toFixed(1) + 'dB'}</p>
      <p>Synths tested: ${testResults.volumeLevels.length}, Producing audio (> -30dB): ${validLevels.length}, Silent/near-silent: ${allMeasured.length - validLevels.length + (testResults.volumeLevels.length - allMeasured.length)}</p>
    </div>`);

    // Generate normalization code suggestion — only for synths with reliable measurements
    const normMap: Record<string, number> = {};
    validLevels.forEach(v => {
      const offset = Math.round(TARGET_PEAK - v.peakDb);
      if (Math.abs(offset) >= 3) {
        normMap[v.name] = offset;
      }
    });

    if (Object.keys(normMap).length > 0) {
      logHtml(`<pre>// Suggested VOLUME_NORMALIZATION_OFFSETS (only synths with reliable output > -30dB):\nconst VOLUME_NORMALIZATION_OFFSETS: Record&lt;string, number&gt; = ${JSON.stringify(normMap, null, 2)};</pre>`);
    }
  }
  meter.dispose();
}

function displaySummary() {
  const { passed, failed, fallbacks, natives, errors } = testResults;

  logHtml(`
    <div class="summary">
      <h2>Test Summary</h2>
      <p class="pass">Passed: ${passed}</p>
      <p class="fail">Failed: ${failed}</p>
      <p><span class="fallback">FALLBACK</span> Using Tone.js fallback: ${fallbacks.length}</p>
      ${fallbacks.length > 0 ? `<ul>${fallbacks.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
      <p><span class="native">NATIVE</span> Using native/WASM: ${natives.length}</p>
      ${natives.length > 0 ? `<ul>${natives.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${errors.length > 0 ? `<p class="fail">Errors: ${errors.map(e => e.name).join(', ')}</p>` : ''}
      <p>Console errors captured: ${capturedConsoleErrors.length}</p>
      <button onclick="downloadConsoleErrors()">Download Console Log</button>
    </div>
  `);

  // Store results for Playwright to read
  (window as any).SYNTH_TEST_RESULTS = testResults;
  (window as any).SYNTH_TEST_COMPLETE = true;

  // Update document title so automation can detect completion
  document.title = `DONE ${passed}p ${failed}f`;
}

// Download captured console errors as a text file
function downloadConsoleErrors() {
  const content = capturedConsoleErrors.join('\n\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `synth-test-errors-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Make downloadConsoleErrors available globally
(window as any).downloadConsoleErrors = downloadConsoleErrors;

// ============================================
// MAIN TEST RUNNERS
// ============================================

async function runAllTests() {
  clearResults();
  logHtml('<h2>Running All Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testSynthCreation();
    await testFallbackDetection();
    await testMethodAvailability();
    await testTriggers();
    await testVolumeLevels();
    displaySummary();
  } catch (e: any) {
    log('Test error: ' + e.message, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

async function runFallbackTests() {
  clearResults();
  logHtml('<h2>Running Fallback Detection...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testFallbackDetection();
    displaySummary();
  } catch (e: any) {
    log('Test error: ' + e.message, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

async function runVolumeTests() {
  clearResults();
  logHtml('<h2>Running Volume Level Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testVolumeLevels();

    // Display volume summary
    const { volumeLevels, errors } = testResults;
    const TARGET_PEAK = -10;
    const silentSynths = volumeLevels.filter(v => v.peakDb === -Infinity || v.peakDb < -60);
    const quietSynths = volumeLevels.filter(v => v.peakDb >= -60 && v.peakDb < -25);
    const loudSynths = volumeLevels.filter(v => v.peakDb > -3);
    const needsAdjustment = volumeLevels.filter(v => v.peakDb !== -Infinity && Math.abs(v.peakDb - TARGET_PEAK) > 8);

    logHtml(`
      <div class="summary">
        <h2>Volume Summary</h2>
        <p>Target peak level: ${TARGET_PEAK}dB (tolerance: ±8dB)</p>
        <p class="${testResults.passed > 0 ? 'pass' : ''}">${testResults.passed} synths producing audio</p>
        ${silentSynths.length > 0 ? `<p class="fail">SILENT (no output): ${silentSynths.map(s => s.name).join(', ')}</p>` : ''}
        ${quietSynths.length > 0 ? `<p class="warn">Too Quiet (< -25dB): ${quietSynths.map(s => `${s.name} (${s.peakDb.toFixed(1)})`).join(', ')}</p>` : ''}
        ${loudSynths.length > 0 ? `<p class="warn">Too Loud (> -3dB): ${loudSynths.map(s => `${s.name} (${s.peakDb.toFixed(1)})`).join(', ')}</p>` : ''}
        ${needsAdjustment.length > 0 ? `<p class="warn">Needs volume adjustment: ${needsAdjustment.length} synths</p>` : ''}
        ${errors.length > 0 ? `<p class="fail">Errors: ${errors.map(e => `${e.name}: ${e.error}`).join(', ')}</p>` : ''}
        ${silentSynths.length === 0 && quietSynths.length === 0 && loudSynths.length === 0 ? '<p class="pass">All synths have balanced output levels!</p>' : ''}
      </div>
    `);

    (window as any).SYNTH_TEST_RESULTS = testResults;
    (window as any).SYNTH_TEST_COMPLETE = true;
  } catch (e: any) {
    log('Test error: ' + e.message, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

/**
 * Test for sustain/release behavior issues:
 * 1. Synths that go silent during sustain (bug)
 * 2. Synths that play forever after release (bug)
 */
async function testSustainReleaseBehavior() {
  logHtml('<h2>Sustain/Release Behavior Tests</h2>');
  logHtml('<p class="info">Testing that synths maintain level during sustain and properly stop after release.</p>');

  const meter = new Tone.Meter();
  meter.toDestination();

  // Synths to test (exclude noise/percussion which behave differently)
  const synthsToTest = ['Synth', 'MonoSynth', 'FMSynth', 'AMSynth', 'TB303', 'Buzz3o3',
    'SuperSaw', 'WobbleBass', 'FormantSynth', 'V2', 'Furnace', 'PolySynth', 'Organ'];

  interface BehaviorResult {
    name: string;
    sustainLevel: number;
    afterReleaseLevel: number;
    goesSilent: boolean;
    playsForever: boolean;
    status: 'pass' | 'fail' | 'warn' | 'error';
    error?: string;
  }

  const results: BehaviorResult[] = [];

  logHtml('<table><tr><th>Synth</th><th>Sustain Level</th><th>After Release</th><th>Status</th><th>Issue</th></tr>');

  for (const name of synthsToTest) {
    const config = SYNTH_CONFIGS[name];
    if (!config) continue;

    try {
      const fullConfig: InstrumentConfig = {
        id: 999,
        name: `Test ${name}`,
        volume: -12,
        ...config
      } as InstrumentConfig;

      const synth = InstrumentFactory.createInstrument(fullConfig) as any;
      synth.connect(meter);

      let sustainLevel = -Infinity;
      let afterReleaseLevel = -Infinity;

      if (typeof synth.triggerAttack === 'function') {
        // Trigger and hold for sustain measurement
        synth.triggerAttack('C4');

        // Wait for attack/decay to complete, measure sustain
        await new Promise(r => setTimeout(r, 500));
        sustainLevel = meter.getValue() as number;

        // Release the note
        if (typeof synth.triggerRelease === 'function') {
          synth.triggerRelease();
        } else if (typeof synth.releaseAll === 'function') {
          synth.releaseAll();
        }

        // Wait for release to complete
        await new Promise(r => setTimeout(r, 1500));
        afterReleaseLevel = meter.getValue() as number;
      }

      // Analyze behavior
      const goesSilent = sustainLevel < -40; // Should maintain level during sustain
      const playsForever = afterReleaseLevel > -50; // Should be silent after release

      let status: 'pass' | 'fail' | 'warn' = 'pass';
      let issue = '';

      if (goesSilent && playsForever) {
        status = 'fail';
        issue = 'SILENT SUSTAIN + PLAYS FOREVER';
      } else if (goesSilent) {
        status = 'fail';
        issue = 'GOES SILENT DURING SUSTAIN';
      } else if (playsForever) {
        status = 'fail';
        issue = 'PLAYS FOREVER (no release)';
      }

      results.push({
        name,
        sustainLevel,
        afterReleaseLevel,
        goesSilent,
        playsForever,
        status,
      });

      logHtml(`<tr>
        <td>${name}</td>
        <td>${sustainLevel === -Infinity ? '-∞' : sustainLevel.toFixed(1)}dB</td>
        <td>${afterReleaseLevel === -Infinity ? '-∞' : afterReleaseLevel.toFixed(1)}dB</td>
        <td class="${status}">${status.toUpperCase()}</td>
        <td class="${status === 'pass' ? '' : 'fail'}">${issue || 'OK'}</td>
      </tr>`);

      if (typeof synth.dispose === 'function') {
        synth.dispose();
      }
    } catch (e: any) {
      results.push({
        name,
        sustainLevel: -Infinity,
        afterReleaseLevel: -Infinity,
        goesSilent: true,
        playsForever: false,
        status: 'error',
        error: e.message,
      });
      logHtml(`<tr><td>${name}</td><td colspan="4" class="fail">Error: ${e.message}</td></tr>`);
    }
  }

  logHtml('</table>');

  // Summary
  const silentSynths = results.filter(r => r.goesSilent && r.status !== 'error');
  const foreverSynths = results.filter(r => r.playsForever && r.status !== 'error');
  const errorSynths = results.filter(r => r.status === 'error');

  logHtml(`
    <div class="summary">
      <h2>Behavior Summary</h2>
      ${silentSynths.length > 0 ? `<p class="fail">Goes silent during sustain: ${silentSynths.map(s => s.name).join(', ')}</p>` : ''}
      ${foreverSynths.length > 0 ? `<p class="fail">Plays forever (no release): ${foreverSynths.map(s => s.name).join(', ')}</p>` : ''}
      ${errorSynths.length > 0 ? `<p class="fail">Creation errors: ${errorSynths.map(s => s.name).join(', ')}</p>` : ''}
      ${silentSynths.length === 0 && foreverSynths.length === 0 && errorSynths.length === 0 ? '<p class="pass">All synths have correct sustain/release behavior!</p>' : ''}
    </div>
  `);

  meter.dispose();
}

async function runBehaviorTests() {
  clearResults();
  logHtml('<h2>Running Sustain/Release Behavior Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testSustainReleaseBehavior();
    (window as any).SYNTH_TEST_COMPLETE = true;
  } catch (e: any) {
    log('Test error: ' + e.message, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

// ============================================
// SAMPLE PACK TEST FUNCTIONS
// ============================================

/**
 * Test that sample packs are properly configured
 */
async function testSamplePackConfiguration() {
  logHtml('<h2>Sample Pack Configuration Tests</h2>');
  logHtml('<p class="info">Verifying sample pack metadata and structure.</p>');

  logHtml('<table><tr><th>Pack</th><th>Author</th><th>Samples</th><th>Categories</th><th>Status</th></tr>');

  for (const pack of SAMPLE_PACKS) {
    const categoryList = pack.categories.join(', ');
    const actualCount = Object.values(pack.samples).reduce((sum, arr) => sum + arr.length, 0);

    let status = 'pass';
    let statusText = 'OK';

    // Check that declared count matches actual
    if (actualCount !== pack.sampleCount) {
      status = 'warn';
      statusText = `Count mismatch: ${actualCount} vs ${pack.sampleCount}`;
    }

    // Check that all declared categories have samples
    const emptyCategories = pack.categories.filter(cat => pack.samples[cat].length === 0);
    if (emptyCategories.length > 0) {
      status = 'warn';
      statusText = `Empty categories: ${emptyCategories.join(', ')}`;
    }

    logHtml(`<tr>
      <td><strong>${pack.name}</strong><br><small>${pack.id}</small></td>
      <td>${pack.author}</td>
      <td>${actualCount}</td>
      <td>${categoryList}</td>
      <td class="${status}">${statusText}</td>
    </tr>`);

    if (status === 'pass') {
      testResults.passed++;
    } else {
      testResults.failed++;
    }
  }

  logHtml('</table>');
}

/**
 * Test that all sample URLs can be fetched
 */
async function testSamplePackLoading() {
  logHtml('<h2>Sample Pack Loading Tests</h2>');
  logHtml('<p class="info">Testing that all sample URLs are accessible.</p>');

  for (const pack of SAMPLE_PACKS) {
    logHtml(`<h3>${pack.name} (${pack.sampleCount} samples)</h3>`);

    const result: SamplePackTestResult = {
      packId: pack.id,
      packName: pack.name,
      totalSamples: pack.sampleCount,
      loadedSamples: 0,
      failedSamples: [],
      volumeLevels: [],
      categoryCounts: {} as Record<SampleCategory, number>,
      status: 'pass'
    };

    // Test a subset of samples from each category (max 3 per category for speed)
    const MAX_SAMPLES_PER_CATEGORY = 3;

    logHtml('<table><tr><th>Category</th><th>Total</th><th>Tested</th><th>Loaded</th><th>Failed</th></tr>');

    for (const category of pack.categories) {
      const samples = pack.samples[category];
      if (!samples || samples.length === 0) continue;

      result.categoryCounts[category] = samples.length;

      // Test subset of samples
      const samplesToTest = samples.slice(0, MAX_SAMPLES_PER_CATEGORY);
      let loaded = 0;
      let failed = 0;

      for (const sample of samplesToTest) {
        try {
          const response = await fetch(sample.url, { method: 'HEAD' });
          if (response.ok) {
            loaded++;
            result.loadedSamples++;
          } else {
            failed++;
            result.failedSamples.push({
              filename: sample.filename,
              error: `HTTP ${response.status}`
            });
          }
        } catch (e: any) {
          failed++;
          result.failedSamples.push({
            filename: sample.filename,
            error: e.message
          });
        }
      }

      logHtml(`<tr class="${failed === 0 ? '' : (loaded > 0 ? 'warn' : 'fail')}">
        <td>${category}</td>
        <td>${samples.length}</td>
        <td>${samplesToTest.length}</td>
        <td class="pass">${loaded}</td>
        <td class="${failed > 0 ? 'fail' : ''}">${failed}</td>
      </tr>`);
    }

    logHtml('</table>');

    // Determine overall status
    if (result.failedSamples.length > 0) {
      result.status = result.loadedSamples > 0 ? 'partial' : 'fail';
    }

    testResults.samplePackResults.push(result);

    if (result.failedSamples.length > 0) {
      logHtml(`<details><summary class="fail">Failed samples (${result.failedSamples.length})</summary><ul>`);
      for (const f of result.failedSamples) {
        logHtml(`<li>${f.filename}: ${f.error}</li>`);
      }
      logHtml('</ul></details>');
    }
  }
}

/**
 * Test sample playback with volume measurement
 */
async function testSamplePlayback() {
  logHtml('<h2>Sample Playback & Volume Tests</h2>');
  logHtml('<p class="info">Playing samples and measuring output levels. Target: -15dB to -6dB.</p>');

  const meter = new Tone.Meter();
  meter.toDestination();

  for (const pack of SAMPLE_PACKS) {
    logHtml(`<h3>${pack.name}</h3>`);

    const packResult = testResults.samplePackResults.find(r => r.packId === pack.id);

    logHtml('<table><tr><th>Sample</th><th>Category</th><th>Peak (dB)</th><th>Status</th></tr>');

    // Test one sample from each category
    for (const category of pack.categories) {
      const samples = pack.samples[category];
      if (!samples || samples.length === 0) continue;

      // Pick first sample from category
      const sample = samples[0];

      try {
        // Create a player for the sample
        const player = new Tone.Player(sample.url);
        player.connect(meter);

        // Wait for it to load
        await Tone.loaded();

        // Play and measure
        player.start();
        await new Promise(r => setTimeout(r, 300)); // Let it play briefly

        const peakDb = meter.getValue() as number;

        player.stop();
        player.dispose();

        // Determine status
        let status = 'pass';
        let statusText = 'OK';

        if (peakDb === -Infinity) {
          status = 'warn';
          statusText = 'SILENT';
        } else if (peakDb < -25) {
          status = 'warn';
          statusText = 'QUIET';
        } else if (peakDb > -3) {
          status = 'warn';
          statusText = 'LOUD';
        }

        if (packResult) {
          packResult.volumeLevels.push({
            filename: sample.filename,
            category,
            peakDb
          });
        }

        logHtml(`<tr>
          <td>${sample.name}</td>
          <td>${category}</td>
          <td>${peakDb === -Infinity ? '-∞' : peakDb.toFixed(1)}</td>
          <td class="${status}">${statusText}</td>
        </tr>`);

        // Small delay between samples
        await new Promise(r => setTimeout(r, 100));

      } catch (e: any) {
        logHtml(`<tr>
          <td>${sample.name}</td>
          <td>${category}</td>
          <td colspan="2" class="fail">Error: ${e.message}</td>
        </tr>`);
      }
    }

    logHtml('</table>');
  }

  meter.dispose();
}

/**
 * Test that sample categories are correctly organized
 */
async function testSampleCategories() {
  logHtml('<h2>Sample Category Organization</h2>');
  logHtml('<p class="info">Checking that samples are organized into appropriate categories.</p>');

  // Category keywords for validation
  const CATEGORY_KEYWORDS: Record<SampleCategory, string[]> = {
    kicks: ['kick', 'bd', 'bass drum', 'bassdrum'],
    snares: ['snare', 'sd', 'snr'],
    hihats: ['hihat', 'hi-hat', 'hh', 'hat', 'cymbal', 'oh', 'ch', 'ride', 'crash'],
    claps: ['clap', 'cp'],
    percussion: ['perc', 'tom', 'conga', 'bongo', 'bell', 'shaker', 'tambourine', 'rim', 'clave', 'tabla'],
    fx: ['fx', 'effect', 'sfx', 'laser', 'sweep', 'riser', 'impact'],
    bass: ['bass', 'sub'],
    leads: ['lead', 'synth', 'pluck', 'arp'],
    pads: ['pad', 'ambient', 'drone'],
    loops: ['loop', 'break', 'beat'],
    vocals: ['vocal', 'vox', 'voice', 'speak'],
    other: []
  };

  for (const pack of SAMPLE_PACKS) {
    logHtml(`<h3>${pack.name}</h3>`);

    let misplacements = 0;
    const issues: string[] = [];

    for (const category of pack.categories) {
      const samples = pack.samples[category];
      if (!samples) continue;

      for (const sample of samples) {
        const lowerName = sample.filename.toLowerCase();

        // Check if filename suggests a different category
        for (const [otherCat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
          if (otherCat === category || otherCat === 'other') continue;

          for (const keyword of keywords) {
            if (lowerName.includes(keyword)) {
              // Filename contains keyword for different category
              // This might be a misplacement OR the filename is just descriptive
              // Only flag obvious mismatches
              const isObviousMismatch =
                (category === 'kicks' && (lowerName.startsWith('sd_') || lowerName.startsWith('snare'))) ||
                (category === 'snares' && (lowerName.startsWith('bd_') || lowerName.startsWith('kick'))) ||
                (category === 'hihats' && (lowerName.startsWith('bd_') || lowerName.startsWith('sd_')));

              if (isObviousMismatch) {
                misplacements++;
                issues.push(`${sample.filename} in ${category} might belong in ${otherCat}`);
              }
              break;
            }
          }
        }
      }
    }

    if (misplacements === 0) {
      log(`${pack.name}: All samples appear correctly categorized`, 'pass');
    } else {
      log(`${pack.name}: ${misplacements} potential misplacements`, 'warn');
      for (const issue of issues.slice(0, 5)) {
        log(`  - ${issue}`, 'warn');
      }
      if (issues.length > 5) {
        log(`  ... and ${issues.length - 5} more`, 'info');
      }
    }
  }
}

/**
 * Run all sample pack tests
 */
async function runSamplePackTests() {
  clearResults();
  logHtml('<h2>Running Sample Pack Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testSamplePackConfiguration();
    await testSamplePackLoading();
    await testSamplePlayback();
    await testSampleCategories();
    displaySamplePackSummary();
  } catch (e: any) {
    log('Test error: ' + e.message, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

/**
 * Display sample pack test summary
 */
function displaySamplePackSummary() {
  const { samplePackResults } = testResults;

  const totalPacks = samplePackResults.length;
  const passedPacks = samplePackResults.filter(r => r.status === 'pass').length;
  const totalSamples = samplePackResults.reduce((sum, r) => sum + r.totalSamples, 0);
  const totalFailed = samplePackResults.reduce((sum, r) => sum + r.failedSamples.length, 0);

  logHtml(`
    <div class="summary">
      <h2>Sample Pack Test Summary</h2>
      <p>Packs Tested: ${totalPacks}</p>
      <p class="${passedPacks === totalPacks ? 'pass' : 'warn'}">Packs Passed: ${passedPacks}/${totalPacks}</p>
      <p>Total Samples: ${totalSamples}</p>
      ${totalFailed > 0 ? `<p class="fail">Failed to Load: ${totalFailed} samples</p>` : '<p class="pass">All tested samples loaded successfully</p>'}
    </div>
  `);

  (window as any).SYNTH_TEST_RESULTS = testResults;
  (window as any).SYNTH_TEST_COMPLETE = true;
}

// ============================================
// EFFECT TEST CONFIGURATIONS
// ============================================

const EFFECT_CONFIGS: Record<string, EffectConfig> = {
  // === Dynamics ===
  'Compressor': {
    id: 'test-compressor', category: 'tonejs', type: 'Compressor', enabled: true, wet: 100,
    parameters: { threshold: -24, ratio: 12, attack: 0.003, release: 0.25 },
  },
  'EQ3': {
    id: 'test-eq3', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100,
    parameters: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 },
  },

  // === Distortion ===
  'Distortion': {
    id: 'test-distortion', category: 'tonejs', type: 'Distortion', enabled: true, wet: 50,
    parameters: { drive: 50 },
  },
  'BitCrusher': {
    id: 'test-bitcrusher', category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 50,
    parameters: { bits: 4 },
  },
  'Chebyshev': {
    id: 'test-chebyshev', category: 'tonejs', type: 'Chebyshev', enabled: true, wet: 50,
    parameters: { order: 50 },
  },

  // === Reverb & Delay ===
  'Reverb': {
    id: 'test-reverb', category: 'tonejs', type: 'Reverb', enabled: true, wet: 30,
    parameters: { decay: 1.5, preDelay: 0.01 },
  },
  'JCReverb': {
    id: 'test-jcreverb', category: 'tonejs', type: 'JCReverb', enabled: true, wet: 30,
    parameters: { roomSize: 0.5 },
  },
  'Delay': {
    id: 'test-delay', category: 'tonejs', type: 'Delay', enabled: true, wet: 30,
    parameters: { time: 0.25, feedback: 0.5 },
  },
  'FeedbackDelay': {
    id: 'test-feedbackdelay', category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 30,
    parameters: { time: 0.25, feedback: 0.5 },
  },
  'PingPongDelay': {
    id: 'test-pingpong', category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 30,
    parameters: { time: 0.25, feedback: 0.5 },
  },
  'SpaceEcho': {
    id: 'test-spaceecho', category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 30,
    parameters: { mode: 4, rate: 300, intensity: 0.5, echoVolume: 0.8, reverbVolume: 0.3 },
  },
  'SpaceyDelayer': {
    id: 'test-spaceydelayer', category: 'tonejs', type: 'SpaceyDelayer', enabled: true, wet: 30,
    parameters: { firstTap: 250, tapSize: 150, feedback: 50, multiTap: 1, tapeFilter: 1 },
  },
  'RETapeEcho': {
    id: 'test-retapeecho', category: 'tonejs', type: 'RETapeEcho', enabled: true, wet: 30,
    parameters: { mode: 4, repeatRate: 0.5, intensity: 0.5, echoVolume: 0.7, wow: 0.3, flutter: 0.3, dirt: 0.2, inputBleed: 0, loopAmount: 0, playheadFilter: 1 },
  },

  // === Modulation ===
  'BiPhase': {
    id: 'test-biphase', category: 'tonejs', type: 'BiPhase', enabled: true, wet: 50,
    parameters: { rateA: 0.5, depthA: 0.6, rateB: 4.0, depthB: 0.4, feedback: 0.3 },
  },
  'Chorus': {
    id: 'test-chorus', category: 'tonejs', type: 'Chorus', enabled: true, wet: 50,
    parameters: { frequency: 1.5, delayTime: 3.5, depth: 0.7 },
  },
  'Phaser': {
    id: 'test-phaser', category: 'tonejs', type: 'Phaser', enabled: true, wet: 50,
    parameters: { frequency: 0.5, octaves: 3, baseFrequency: 350 },
  },
  'Tremolo': {
    id: 'test-tremolo', category: 'tonejs', type: 'Tremolo', enabled: true, wet: 50,
    parameters: { frequency: 10, depth: 0.5 },
  },
  'Vibrato': {
    id: 'test-vibrato', category: 'tonejs', type: 'Vibrato', enabled: true, wet: 50,
    parameters: { frequency: 5, depth: 0.1 },
  },
  'AutoPanner': {
    id: 'test-autopanner', category: 'tonejs', type: 'AutoPanner', enabled: true, wet: 50,
    parameters: { frequency: 1, depth: 1 },
  },

  // === Filters ===
  'Filter': {
    id: 'test-filter', category: 'tonejs', type: 'Filter', enabled: true, wet: 100,
    parameters: { frequency: 350, Q: 1, gain: 0, type: 'lowpass' },
  },
  'DubFilter': {
    id: 'test-dubfilter', category: 'tonejs', type: 'DubFilter', enabled: true, wet: 100,
    parameters: { cutoff: 20, resonance: 1, gain: 1 },
  },
  'AutoFilter': {
    id: 'test-autofilter', category: 'tonejs', type: 'AutoFilter', enabled: true, wet: 50,
    parameters: { frequency: 1, baseFrequency: 200, octaves: 2.6 },
  },
  'AutoWah': {
    id: 'test-autowah', category: 'tonejs', type: 'AutoWah', enabled: true, wet: 50,
    parameters: { baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2 },
  },

  // === Pitch ===
  'PitchShift': {
    id: 'test-pitchshift', category: 'tonejs', type: 'PitchShift', enabled: true, wet: 100,
    parameters: { pitch: 0, windowSize: 0.1, delayTime: 0, feedback: 0 },
  },
  'FrequencyShifter': {
    id: 'test-freqshift', category: 'tonejs', type: 'FrequencyShifter', enabled: true, wet: 50,
    parameters: { frequency: 0 },
  },

  // === Spatial ===
  'StereoWidener': {
    id: 'test-stereowidener', category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100,
    parameters: { width: 0.5 },
  },

  // === Custom ===
  'TapeSaturation': {
    id: 'test-tapesat', category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 12000 },
  },
  'SidechainCompressor': {
    id: 'test-sidechain', category: 'tonejs', type: 'SidechainCompressor', enabled: true, wet: 100,
    parameters: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 6, sidechainGain: 50 },
  },

  // === Buzzmachine Effects ===
  'BuzzDistortion': {
    id: 'test-buzzdist', category: 'tonejs', type: 'BuzzDistortion', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzSVF': {
    id: 'test-buzzsvf', category: 'tonejs', type: 'BuzzSVF', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzDelay': {
    id: 'test-buzzdelay', category: 'tonejs', type: 'BuzzDelay', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzChorus': {
    id: 'test-buzzchorus', category: 'tonejs', type: 'BuzzChorus', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzCompressor': {
    id: 'test-buzzcomp', category: 'tonejs', type: 'BuzzCompressor', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzOverdrive': {
    id: 'test-buzzod', category: 'tonejs', type: 'BuzzOverdrive', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzDistortion2': {
    id: 'test-buzzdist2', category: 'tonejs', type: 'BuzzDistortion2', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzCrossDelay': {
    id: 'test-buzzcrossdelay', category: 'tonejs', type: 'BuzzCrossDelay', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzPhilta': {
    id: 'test-buzzphilta', category: 'tonejs', type: 'BuzzPhilta', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzDist2': {
    id: 'test-buzzelakdist', category: 'tonejs', type: 'BuzzDist2', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzFreeverb': {
    id: 'test-buzzfreeverb', category: 'tonejs', type: 'BuzzFreeverb', enabled: true, wet: 30,
    parameters: {},
  },
  'BuzzFreqShift': {
    id: 'test-buzzfreqshift', category: 'tonejs', type: 'BuzzFreqShift', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzNotch': {
    id: 'test-buzznotch', category: 'tonejs', type: 'BuzzNotch', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzStereoGain': {
    id: 'test-buzzsrgain', category: 'tonejs', type: 'BuzzStereoGain', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzSoftSat': {
    id: 'test-buzzsoftsat', category: 'tonejs', type: 'BuzzSoftSat', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzLimiter': {
    id: 'test-buzzlimiter', category: 'tonejs', type: 'BuzzLimiter', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzExciter': {
    id: 'test-buzzexciter', category: 'tonejs', type: 'BuzzExciter', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzMasterizer': {
    id: 'test-buzzmasterizer', category: 'tonejs', type: 'BuzzMasterizer', enabled: true, wet: 100,
    parameters: {},
  },
  'BuzzStereoDist': {
    id: 'test-buzzstereodist', category: 'tonejs', type: 'BuzzStereoDist', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzWhiteChorus': {
    id: 'test-buzzwhitechorus', category: 'tonejs', type: 'BuzzWhiteChorus', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzZfilter': {
    id: 'test-buzzzfilter', category: 'tonejs', type: 'BuzzZfilter', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzChorus2': {
    id: 'test-buzzchorus2', category: 'tonejs', type: 'BuzzChorus2', enabled: true, wet: 50,
    parameters: {},
  },
  'BuzzPanzerDelay': {
    id: 'test-buzzpanzerdelay', category: 'tonejs', type: 'BuzzPanzerDelay', enabled: true, wet: 50,
    parameters: {},
  },

  // === Neural Effects (representative subset - 1 per category) ===
  'Neural TS808 (Overdrive)': {
    id: 'test-neural-0', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 0, neuralModelName: 'TS808',
  },
  'Neural RAT (Distortion)': {
    id: 'test-neural-1', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 1, neuralModelName: 'ProCo RAT',
  },
  'Neural MT-2 (Metal Zone)': {
    id: 'test-neural-2', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 2, neuralModelName: 'MT-2',
  },
  'Neural DOD 250': {
    id: 'test-neural-3', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 3, neuralModelName: 'DOD 250',
  },
  'Neural Big Muff': {
    id: 'test-neural-4', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 4, neuralModelName: 'Big Muff',
  },
  'Neural MXR Dist+': {
    id: 'test-neural-5', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 5, neuralModelName: 'MXR Dist+',
  },
  'Neural Bluesbreaker': {
    id: 'test-neural-6', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 6, neuralModelName: 'Bluesbreaker',
  },
  'Neural Klon': {
    id: 'test-neural-7', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 7, neuralModelName: 'Klon',
  },
  'Neural Princeton (Amp)': {
    id: 'test-neural-8', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 8, neuralModelName: 'Princeton',
  },
  'Neural Plexi (Amp)': {
    id: 'test-neural-9', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 9, neuralModelName: 'Plexi',
  },
  'Neural Mesa Recto (Amp)': {
    id: 'test-neural-10', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 10, neuralModelName: 'Mesa Recto',
  },
  'Neural AC30 (Amp)': {
    id: 'test-neural-11', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 11, neuralModelName: 'AC30',
  },
  'Neural Bassman (Amp)': {
    id: 'test-neural-12', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 12, neuralModelName: 'Bassman',
  },
  'Neural JCM800 (Amp)': {
    id: 'test-neural-13', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 13, neuralModelName: 'JCM800',
  },
  'Neural SLO100 (Amp)': {
    id: 'test-neural-14', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 14, neuralModelName: 'SLO100',
  },
  'Neural 5150 (Amp)': {
    id: 'test-neural-15', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 15, neuralModelName: '5150',
  },
  'Neural Dumble (Amp)': {
    id: 'test-neural-16', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 16, neuralModelName: 'Dumble ODS',
  },
  'Neural Matchless (Amp)': {
    id: 'test-neural-17', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 17, neuralModelName: 'Matchless DC30',
  },
  'Neural Orange (Amp)': {
    id: 'test-neural-18', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 18, neuralModelName: 'Orange Rockerverb',
  },
  'Neural ENGL (Amp)': {
    id: 'test-neural-19', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 19, neuralModelName: 'ENGL Powerball',
  },
  'Neural Friedman (Amp)': {
    id: 'test-neural-20', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 20, neuralModelName: 'Friedman BE-100',
  },
  'Neural Timmy': {
    id: 'test-neural-21', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, treble: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 21, neuralModelName: 'Timmy',
  },
  'Neural Vertex': {
    id: 'test-neural-22', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 22, neuralModelName: 'Vertex',
  },
  'Neural Fulltone OCD': {
    id: 'test-neural-23', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 23, neuralModelName: 'Fulltone OCD',
  },
  'Neural Horizon': {
    id: 'test-neural-24', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 24, neuralModelName: 'Horizon',
  },
  'Neural Suhr Riot': {
    id: 'test-neural-25', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 25, neuralModelName: 'Suhr Riot',
  },
  'Neural Bogner': {
    id: 'test-neural-26', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 26, neuralModelName: 'Bogner Ecstasy',
  },
  'Neural Wampler': {
    id: 'test-neural-27', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 27, neuralModelName: 'Wampler Pinnacle',
  },
  'Neural Fortin 33': {
    id: 'test-neural-28', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 28, neuralModelName: 'Fortin 33',
  },
  'Neural Revv G3': {
    id: 'test-neural-29', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 29, neuralModelName: 'Revv G3',
  },
  'Neural Way Huge': {
    id: 'test-neural-30', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 30, neuralModelName: 'Way Huge Pork Loin',
  },
  'Neural Darkglass (Bass)': {
    id: 'test-neural-31', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 31, neuralModelName: 'Darkglass B7K',
  },
  'Neural SansAmp (Bass)': {
    id: 'test-neural-32', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, bass: 50, mid: 50, treble: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 32, neuralModelName: 'Tech 21 SansAmp',
  },
  'Neural Ampeg SVT (Bass)': {
    id: 'test-neural-33', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 33, neuralModelName: 'Ampeg SVT',
  },
  'Neural Virus Distortion': {
    id: 'test-neural-34', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, tone: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 34, neuralModelName: 'Virus Distortion',
  },
  'Neural Filmosound (Amp)': {
    id: 'test-neural-35', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 35, neuralModelName: 'Filmosound',
  },
  'Neural Gibson EH-185 (Amp)': {
    id: 'test-neural-36', category: 'neural', type: 'Neural', enabled: true, wet: 50,
    parameters: { drive: 50, presence: 50, level: 50, dryWet: 50 },
    neuralModelIndex: 36, neuralModelName: 'Gibson EH-185',
  },
};

// ============================================
// EFFECT TEST FUNCTIONS
// ============================================

function getEffectCategory(name: string): string {
  if (name.startsWith('Buzz')) return 'Buzzmachine';
  if (name.startsWith('Neural')) return 'Neural';
  if (['SpaceyDelayer', 'RETapeEcho'].includes(name)) return 'WASM';
  return 'ToneJS';
}

async function testEffectCreation() {
  logHtml('<h2>Effect Creation Tests</h2>');
  logHtml(`<p class="info">Testing creation of ${Object.keys(EFFECT_CONFIGS).length} effects (Tone.js, WASM, Buzzmachine, Neural).</p>`);

  logHtml('<table><tr><th>Effect</th><th>Category</th><th>Constructor</th><th>Status</th></tr>');

  // Track consecutive failures per category for skip logic
  const silentCountByCategory: Record<string, number> = {};
  let skippedCount = 0;

  for (const [name, config] of Object.entries(EFFECT_CONFIGS)) {
    const category = getEffectCategory(name);
    const catFails = silentCountByCategory[category] || 0;

    // Skip after 5 consecutive failures in the same category
    if (catFails >= 5) {
      testResults.failed++;
      testResults.errors.push({ name: `Effect: ${name}`, error: `Skipped (${category} engine failed)` });
      logHtml(`<tr><td>${name}</td><td>${category}</td><td>-</td><td class="fail">SKIPPED (${category})</td></tr>`);
      skippedCount++;
      continue;
    }

    try {
      const effect = await InstrumentFactory.createEffect(config);
      const ctorName = (effect as any).constructor?.name || 'Unknown';

      // Verify it has connect/disconnect/dispose methods
      const hasConnect = typeof (effect as any).connect === 'function';
      const hasDispose = typeof (effect as any).dispose === 'function';

      if (!hasConnect) {
        logHtml(`<tr><td>${name}</td><td>${category}</td><td>${ctorName}</td><td class="warn">NO connect()</td></tr>`);
        testResults.failed++;
        testResults.errors.push({ name: `Effect: ${name}`, error: 'Missing connect() method' });
        silentCountByCategory[category] = (silentCountByCategory[category] || 0) + 1;
      } else {
        logHtml(`<tr><td>${name}</td><td>${category}</td><td>${ctorName}</td><td class="pass">OK</td></tr>`);
        testResults.passed++;
        silentCountByCategory[category] = 0;
      }

      // Dispose
      if (hasDispose) {
        try { (effect as any).dispose(); } catch { /* may fail */ }
      }
    } catch (e: any) {
      const errMsg = e?.message || e?.name || e?.toString?.() || 'unknown error';
      logHtml(`<tr><td>${name}</td><td>${category}</td><td>-</td><td class="fail">Error: ${errMsg}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name: `Effect: ${name}`, error: errMsg });
      silentCountByCategory[category] = (silentCountByCategory[category] || 0) + 1;
    }
  }

  if (skippedCount > 0) {
    logHtml(`<tr><td colspan="4" class="info">${skippedCount} effects skipped after consecutive failures</td></tr>`);
  }

  logHtml('</table>');
}

async function testEffectSignalPath() {
  logHtml('<h2>Effect Signal Path Tests</h2>');
  logHtml('<p class="info">Testing that effects pass audio through (synth → effect → meter). Target: signal above -60dB.</p>');

  const meter = new Tone.Meter({ channels: 1, smoothing: 0 });
  meter.connect(Tone.getDestination());

  // Test a subset of Tone.js effects that are fast to create (skip WASM/Neural for speed)
  const fastEffects = [
    'Compressor', 'EQ3', 'Distortion', 'BitCrusher', 'Chebyshev',
    'Reverb', 'JCReverb', 'Delay', 'FeedbackDelay', 'PingPongDelay',
    'Chorus', 'Phaser', 'Tremolo', 'Vibrato', 'AutoPanner',
    'Filter', 'AutoFilter', 'AutoWah',
    'PitchShift', 'FrequencyShifter', 'StereoWidener',
    'TapeSaturation', 'BiPhase', 'DubFilter',
  ];

  logHtml('<table><tr><th>Effect</th><th>Peak (dB)</th><th>Status</th></tr>');

  for (const name of fastEffects) {
    const config = EFFECT_CONFIGS[name];
    if (!config) continue;

    try {
      // Create a simple synth as signal source
      const synth = new Tone.Synth({ volume: -12 });
      const effect = await InstrumentFactory.createEffect(config);

      // Chain: synth → effect → meter
      synth.connect(effect as any);
      (effect as any).connect(meter);

      // Trigger a note and measure
      synth.triggerAttack('C4');

      let peakDb = -Infinity;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, i < 10 ? 2 : 20));
        const level = meter.getValue() as number;
        if (level > peakDb) peakDb = level;
      }

      synth.triggerRelease();
      await new Promise(r => setTimeout(r, 50));

      let status = 'pass';
      let statusText = 'OK';
      if (peakDb === -Infinity || peakDb < -60) {
        status = 'fail';
        statusText = peakDb === -Infinity ? 'NO SIGNAL' : 'SILENT';
        testResults.failed++;
        testResults.errors.push({ name: `EffectPath: ${name}`, error: `No signal through effect (${peakDb === -Infinity ? 'silent' : peakDb.toFixed(1) + 'dB'})` });
      } else {
        testResults.passed++;
      }

      logHtml(`<tr>
        <td>${name}</td>
        <td>${peakDb === -Infinity ? '-∞' : peakDb.toFixed(1)}</td>
        <td class="${status}">${statusText}</td>
      </tr>`);

      // Cleanup
      try { synth.dispose(); } catch {}
      try { (effect as any).dispose(); } catch {}

      // Drain meter
      for (let drain = 0; drain < 5; drain++) {
        await new Promise(r => setTimeout(r, 10));
        const level = meter.getValue() as number;
        if (level <= -100 || level === -Infinity) break;
      }
    } catch (e: any) {
      logHtml(`<tr><td>${name}</td><td>-</td><td class="fail">Error: ${e.message}</td></tr>`);
      testResults.failed++;
      testResults.errors.push({ name: `EffectPath: ${name}`, error: e.message });
    }
  }

  logHtml('</table>');
  meter.dispose();
}

async function runEffectTests() {
  clearResults();
  logHtml('<h2>Running Effect Tests...</h2>');

  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

  try {
    await initAudio();
    await testEffectCreation();
    await testEffectSignalPath();

    // Summary
    const effectErrors = testResults.errors.filter(e => e.name.startsWith('Effect:') || e.name.startsWith('EffectPath:'));
    logHtml(`
      <div class="summary">
        <h2>Effect Test Summary</h2>
        <p class="pass">Passed: ${testResults.passed}</p>
        <p class="fail">Failed: ${testResults.failed}</p>
        ${effectErrors.length > 0 ? `<p class="fail">Errors: ${effectErrors.map(e => e.name.replace('Effect: ', '').replace('EffectPath: ', '')).join(', ')}</p>` : '<p class="pass">All effects created and passed signal!</p>'}
      </div>
    `);

    (window as any).SYNTH_TEST_RESULTS = testResults;
    (window as any).SYNTH_TEST_COMPLETE = true;
  } catch (e: any) {
    log('Test error: ' + e.message, 'fail');
  }

  buttons.forEach(b => (b as HTMLButtonElement).disabled = false);
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================

document.getElementById('runTests')?.addEventListener('click', runAllTests);
document.getElementById('runFallbackTests')?.addEventListener('click', runFallbackTests);
document.getElementById('runVolumeTests')?.addEventListener('click', runVolumeTests);
document.getElementById('runBehaviorTests')?.addEventListener('click', runBehaviorTests);
document.getElementById('runSamplePackTests')?.addEventListener('click', runSamplePackTests);
document.getElementById('runEffectTests')?.addEventListener('click', runEffectTests);

// Export for console access
(window as any).runAllTests = runAllTests;
(window as any).runFallbackTests = runFallbackTests;
(window as any).runVolumeTests = runVolumeTests;
(window as any).runBehaviorTests = runBehaviorTests;
(window as any).runSamplePackTests = runSamplePackTests;
(window as any).runEffectTests = runEffectTests;
