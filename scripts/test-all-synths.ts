/**
 * Comprehensive Synth Test Script
 * Tests all synth types and presets in DEViLBOX
 *
 * Run with: npx tsx scripts/test-all-synths.ts
 */

import * as Tone from 'tone';

// Import synth types and factory
import { InstrumentFactory } from '../src/engine/InstrumentFactory';
import type { SynthType, InstrumentConfig } from '../src/types/instrument';

// Import all preset files
import { SYNTH_PRESETS } from '../src/constants/synthPresets';
import { TB303_PRESETS } from '../src/constants/tb303Presets';
import { TB303_DEVILFISH_PRESETS } from '../src/constants/tb303DevilFishPresets';
import { WAVETABLE_PRESETS } from '../src/constants/wavetablePresets';
import { FURNACE_PRESETS } from '../src/constants/furnacePresets';
import { BUZZMACHINE_PRESETS } from '../src/constants/buzzmachinePresets';
import { DUB_SIREN_PRESETS } from '../src/constants/dubSirenPresets';
import { SPACE_LASER_PRESETS } from '../src/constants/spaceLaserPresets';
import { SAM_PRESETS } from '../src/constants/samPresets';
import { SYNARE_PRESETS } from '../src/constants/synarePresets';
import { V2_PRESETS } from '../src/constants/v2Presets';
import { FACTORY_PRESETS } from '../src/constants/factoryPresets';

// ============================================
// TEST CONFIGURATION
// ============================================

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const TEST_AUDIO = process.argv.includes('--audio');
const SKIP_FURNACE = process.argv.includes('--skip-furnace');
const SKIP_BUZZ = process.argv.includes('--skip-buzz');

// All synth types to test (from types/instrument.ts)
const ALL_SYNTH_TYPES: SynthType[] = [
  // Core Tone.js synths
  'Synth',
  'MonoSynth',
  'DuoSynth',
  'FMSynth',
  'AMSynth',
  'PluckSynth',
  'MetalSynth',
  'MembraneSynth',
  'NoiseSynth',

  // 303 synths
  'TB303',
  'Buzz3o3',

  // Wavetable & Granular
  'Wavetable',
  'GranularSynth',

  // Extended synths
  'SuperSaw',
  'PolySynth',
  'Organ',
  'DrumMachine',
  'ChipSynth',
  'PWMSynth',
  'StringMachine',
  'FormantSynth',
  'WobbleBass',

  // Special synths
  'DubSiren',
  'SpaceLaser',
  'V2',
  'Sam',
  'Synare',

  // Samplers
  'Sampler',
  'Player',
  'DrumKit',
];

// Furnace chip synths (WASM-emulated)
const FURNACE_SYNTH_TYPES: SynthType[] = [
  'Furnace',
  'FurnaceOPN',
  'FurnaceOPM',
  'FurnaceOPL',
  'FurnaceOPLL',
  'FurnaceESFM',
  'FurnaceOPZ',
  'FurnaceOPNA',
  'FurnaceOPNB',
  'FurnaceOPL4',
  'FurnaceY8950',
  'FurnaceVRC7',
  'FurnaceNES',
  'FurnaceGB',
  'FurnaceSNES',
  'FurnacePCE',
  'FurnacePSG',
  'FurnaceVB',
  'FurnaceLynx',
  'FurnaceSWAN',
  'FurnaceVRC6',
  'FurnaceN163',
  'FurnaceFDS',
  'FurnaceMMC5',
  'FurnaceC64',
  'FurnaceAY',
  'FurnaceVIC',
  'FurnaceSAA',
  'FurnaceTED',
  'FurnaceVERA',
  'FurnaceSCC',
  'FurnaceTIA',
  'FurnaceSEGAPCM',
  'FurnaceQSOUND',
  'FurnaceES5506',
  'FurnaceRF5C68',
  'FurnaceC140',
  'FurnaceK007232',
  'FurnaceK053260',
  'FurnaceGA20',
  'FurnaceOKI',
  'FurnaceYMZ280B',
  'FurnaceX1_010',
  'FurnaceBUBBLE',
  'FurnaceSM8521',
  'FurnaceT6W28',
  'FurnaceSUPERVISION',
  'FurnaceUPD1771',
];

// Buzzmachine generator synths
const BUZZMACHINE_SYNTH_TYPES: SynthType[] = [
  'Buzzmachine',
  'BuzzDTMF',
  'BuzzFreqBomb',
  'BuzzKick',
  'BuzzKickXP',
  'BuzzNoise',
  'BuzzTrilok',
  'Buzz4FM2F',
  'BuzzDynamite6',
  'BuzzM3',
];

// ============================================
// TEST RESULTS TRACKING
// ============================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: {
  synthTypes: TestResult[];
  presets: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
} = {
  synthTypes: [],
  presets: [],
  summary: { total: 0, passed: 0, failed: 0 },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function log(message: string) {
  console.log(message);
}

function logVerbose(message: string) {
  if (VERBOSE) console.log(`  ${message}`);
}

function logSuccess(name: string) {
  log(`  ✅ ${name}`);
}

function logError(name: string, error: string) {
  log(`  ❌ ${name}: ${error}`);
}

function getDefaultConfig(synthType: SynthType): InstrumentConfig {
  const config: InstrumentConfig = {
    id: 999,
    name: `Test ${synthType}`,
    synthType,
    volume: -12,
  };

  // Add required config for specific synth types
  switch (synthType) {
    case 'TB303':
    case 'Buzz3o3':
      config.tb303 = {
        filter: { cutoff: 1000, resonance: 50 },
        filterEnvelope: { envMod: 50, decay: 200 },
        accent: { amount: 50 },
        slide: { time: 60 },
        oscillator: { type: 'sawtooth' },
        overdrive: { amount: 0 },
      };
      break;
    case 'Wavetable':
      config.wavetable = {
        waveformIndex: 0,
        morphPosition: 0,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.5,
        release: 0.5,
      };
      break;
    case 'Sampler':
    case 'Player':
    case 'DrumKit':
      config.sample = {
        url: '',
        baseNote: 'C4',
      };
      break;
    case 'Furnace':
    case 'FurnaceOPN':
    case 'FurnaceGB':
    case 'FurnaceNES':
      config.furnace = {
        chipType: synthType === 'Furnace' ? 'GB' : synthType.replace('Furnace', ''),
        channelIndex: 0,
      };
      break;
  }

  return config;
}

// ============================================
// SYNTH TYPE TESTS
// ============================================

async function testSynthType(synthType: SynthType): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    name: synthType,
    passed: false,
  };

  try {
    logVerbose(`Creating ${synthType}...`);

    const config = getDefaultConfig(synthType);
    const instrument = InstrumentFactory.createInstrument(config);

    if (!instrument) {
      throw new Error('Factory returned null/undefined');
    }

    logVerbose(`Created instance: ${instrument.constructor.name}`);

    const inst = instrument as any;

    // Verify audio interface methods exist
    const hasConnect = typeof inst.toDestination === 'function' || typeof inst.connect === 'function';
    const hasTriggerAttack = typeof inst.triggerAttack === 'function';
    const hasTriggerRelease = typeof inst.triggerRelease === 'function';

    if (!hasConnect) {
      throw new Error('Missing audio output method (toDestination/connect)');
    }

    if (TEST_AUDIO) {
      // Audio smoke test: exercise the full audio lifecycle
      // NOTE: True audio output verification requires the browser test runner (src/test-runner.ts)

      // 1. Connect to destination
      if (typeof inst.toDestination === 'function') {
        inst.toDestination();
        logVerbose('Connected to destination');
      }

      // 2. Trigger attack (skip sample-based synths that need loaded files)
      const isSampleBased = ['Sampler', 'Player', 'DrumKit', 'GranularSynth'].includes(synthType);

      if (hasTriggerAttack && !isSampleBased) {
        inst.triggerAttack('C4');
        logVerbose('triggerAttack succeeded');

        if (hasTriggerRelease) {
          try {
            inst.triggerRelease();
            logVerbose('triggerRelease succeeded');
          } catch {
            // Some synths error on release if envelope already finished
            logVerbose('triggerRelease skipped (envelope may have completed)');
          }
        }
      } else if (!hasTriggerAttack && !isSampleBased) {
        throw new Error('Missing triggerAttack method - cannot produce audio');
      } else if (isSampleBased) {
        logVerbose('Skipping trigger test (sample-based synth, no loaded samples)');
      }

      // 3. Verify output node exists
      if (inst.output === undefined || inst.output === null) {
        throw new Error('Output node is null/undefined - cannot route audio');
      }
      logVerbose('Output node verified');
    } else {
      // Creation-only test (no --audio flag)
      logVerbose(`Methods: connect=${hasConnect}, triggerAttack=${hasTriggerAttack}, triggerRelease=${hasTriggerRelease}`);
    }

    // Test dispose
    if (typeof inst.dispose === 'function') {
      inst.dispose();
      logVerbose('Disposed successfully');
    }

    result.passed = true;
    result.duration = Date.now() - startTime;
  } catch (error) {
    result.passed = false;
    result.error = error instanceof Error ? error.message : String(error);
    result.duration = Date.now() - startTime;
  }

  return result;
}

async function testAllSynthTypes() {
  log('\n📦 TESTING SYNTH TYPES');
  log('═'.repeat(50));

  // Test core synths
  log('\n🎹 Core Synths:');
  for (const synthType of ALL_SYNTH_TYPES) {
    const result = await testSynthType(synthType);
    results.synthTypes.push(result);
    if (result.passed) {
      logSuccess(`${synthType} (${result.duration}ms)`);
    } else {
      logError(synthType, result.error || 'Unknown error');
    }
  }

  // Test Furnace synths
  if (!SKIP_FURNACE) {
    log('\n🎮 Furnace Chip Synths:');
    for (const synthType of FURNACE_SYNTH_TYPES) {
      const result = await testSynthType(synthType);
      results.synthTypes.push(result);
      if (result.passed) {
        logSuccess(`${synthType} (${result.duration}ms)`);
      } else {
        logError(synthType, result.error || 'Unknown error');
      }
    }
  } else {
    log('\n⏭️  Skipping Furnace synths (--skip-furnace)');
  }

  // Test Buzzmachine synths
  if (!SKIP_BUZZ) {
    log('\n🐝 Buzzmachine Synths:');
    for (const synthType of BUZZMACHINE_SYNTH_TYPES) {
      const result = await testSynthType(synthType);
      results.synthTypes.push(result);
      if (result.passed) {
        logSuccess(`${synthType} (${result.duration}ms)`);
      } else {
        logError(synthType, result.error || 'Unknown error');
      }
    }
  } else {
    log('\n⏭️  Skipping Buzzmachine synths (--skip-buzz)');
  }
}

// ============================================
// PRESET TESTS
// ============================================

interface PresetCollection {
  name: string;
  presets: any[];
  getSynthType?: (preset: any) => SynthType;
  getConfig?: (preset: any) => InstrumentConfig;
}

async function testPreset(
  presetName: string,
  config: InstrumentConfig
): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    name: presetName,
    passed: false,
  };

  try {
    const instrument = InstrumentFactory.createInstrument(config);

    if (!instrument) {
      throw new Error('Factory returned null/undefined');
    }

    // Dispose
    if (typeof (instrument as any).dispose === 'function') {
      (instrument as any).dispose();
    }

    result.passed = true;
    result.duration = Date.now() - startTime;
  } catch (error) {
    result.passed = false;
    result.error = error instanceof Error ? error.message : String(error);
    result.duration = Date.now() - startTime;
  }

  return result;
}

async function testPresetCollection(collection: PresetCollection) {
  log(`\n🎛️  ${collection.name} (${collection.presets.length} presets):`);

  for (const preset of collection.presets) {
    const name = preset.name || preset.label || 'Unnamed';
    let config: InstrumentConfig;

    try {
      if (collection.getConfig) {
        config = collection.getConfig(preset);
      } else {
        // Try to extract config from preset
        config = {
          id: 999,
          name,
          synthType: collection.getSynthType?.(preset) || preset.synthType || 'Synth',
          ...preset,
        };
      }

      const result = await testPreset(name, config);
      results.presets.push(result);

      if (result.passed) {
        logSuccess(`${name} (${result.duration}ms)`);
      } else {
        logError(name, result.error || 'Unknown error');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      results.presets.push({ name, passed: false, error: errMsg });
      logError(name, errMsg);
    }
  }
}

async function testAllPresets() {
  log('\n📚 TESTING PRESETS');
  log('═'.repeat(50));

  // Define preset collections
  const collections: PresetCollection[] = [
    {
      name: 'Synth Presets',
      presets: Object.values(SYNTH_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: preset.synthType || 'Synth',
        ...preset,
      }),
    },
    {
      name: 'TB303 Presets',
      presets: Object.values(TB303_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'TB303' as SynthType,
        tb303: preset,
      }),
    },
    {
      name: 'TB303 Devil Fish Presets',
      presets: Object.values(TB303_DEVILFISH_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'TB303' as SynthType,
        tb303: preset,
      }),
    },
    {
      name: 'Wavetable Presets',
      presets: Object.values(WAVETABLE_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'Wavetable' as SynthType,
        wavetable: preset,
      }),
    },
    {
      name: 'Furnace Presets',
      presets: Object.values(FURNACE_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: (preset.chipType ? `Furnace${preset.chipType}` : 'Furnace') as SynthType,
        furnace: preset,
      }),
    },
    {
      name: 'Buzzmachine Presets',
      presets: Object.values(BUZZMACHINE_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'Buzzmachine' as SynthType,
        buzzmachine: preset,
      }),
    },
    {
      name: 'Dub Siren Presets',
      presets: Object.values(DUB_SIREN_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'DubSiren' as SynthType,
        dubSiren: preset,
      }),
    },
    {
      name: 'Space Laser Presets',
      presets: Object.values(SPACE_LASER_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'SpaceLaser' as SynthType,
        spaceLaser: preset,
      }),
    },
    {
      name: 'Sam Presets',
      presets: Object.values(SAM_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'Sam' as SynthType,
        sam: preset,
      }),
    },
    {
      name: 'Synare Presets',
      presets: Object.values(SYNARE_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'Synare' as SynthType,
        synare: preset,
      }),
    },
    {
      name: 'V2 Presets',
      presets: Object.values(V2_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: 'V2' as SynthType,
        v2: preset,
      }),
    },
    {
      name: 'Factory Presets',
      presets: Object.values(FACTORY_PRESETS || {}),
      getConfig: (preset) => ({
        id: 999,
        name: preset.name || 'Test',
        synthType: preset.synthType || 'Synth',
        ...preset,
      }),
    },
  ];

  for (const collection of collections) {
    if (collection.presets && collection.presets.length > 0) {
      await testPresetCollection(collection);
    } else {
      log(`\n⏭️  ${collection.name}: No presets found`);
    }
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runTests() {
  log('╔════════════════════════════════════════════════════╗');
  log('║     DEViLBOX COMPREHENSIVE SYNTH TEST SUITE        ║');
  log('╚════════════════════════════════════════════════════╝');
  log('');
  log(`Options: verbose=${VERBOSE}, audio=${TEST_AUDIO}, skip-furnace=${SKIP_FURNACE}, skip-buzz=${SKIP_BUZZ}`);

  if (TEST_AUDIO) {
    log('');
    log('  --audio: Audio lifecycle smoke tests enabled.');
    log('  NOTE: This exercises connect/trigger/release but cannot verify');
    log('  actual audio output. Use the browser test runner for full');
    log('  audio output verification (silent synth detection).');
  }

  const startTime = Date.now();

  // Run tests
  await testAllSynthTypes();
  await testAllPresets();

  // Calculate summary
  const allResults = [...results.synthTypes, ...results.presets];
  results.summary.total = allResults.length;
  results.summary.passed = allResults.filter((r) => r.passed).length;
  results.summary.failed = allResults.filter((r) => !r.passed).length;

  const totalTime = Date.now() - startTime;

  // Print summary
  log('\n');
  log('╔════════════════════════════════════════════════════╗');
  log('║                    TEST SUMMARY                    ║');
  log('╚════════════════════════════════════════════════════╝');
  log('');
  log(`  Total Tests:  ${results.summary.total}`);
  log(`  ✅ Passed:    ${results.summary.passed}`);
  log(`  ❌ Failed:    ${results.summary.failed}`);
  log(`  ⏱️  Duration:  ${totalTime}ms`);
  log('');

  // Print failed tests
  if (results.summary.failed > 0) {
    log('Failed Tests:');
    log('─'.repeat(50));
    for (const result of allResults) {
      if (!result.passed) {
        log(`  ❌ ${result.name}: ${result.error}`);
      }
    }
    log('');
  }

  // Note about audio testing scope
  if (!TEST_AUDIO) {
    log('  NOTE: Tests only verified synth creation/disposal.');
    log('        Use --audio to also test audio lifecycle (connect/trigger/release).');
    log('        Use the browser test runner for true audio output verification.');
  } else {
    log('  Audio lifecycle tests completed.');
    log('  For true silent-synth detection, use the browser test runner.');
  }
  log('');

  // Exit code
  const exitCode = results.summary.failed > 0 ? 1 : 0;
  log(`Exit code: ${exitCode}`);

  return exitCode;
}

// Run if called directly
runTests()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
