/**
 * Synth Tester Utility
 *
 * Tests all synths to verify they:
 * 1. Load without errors
 * 2. Produce sound output (via analyser)
 * 3. Respond to note on/off correctly
 *
 * Run from browser console: await window.testAllSynths()
 */

import * as Tone from 'tone';
import { ALL_SYNTH_TYPES, SYNTH_INFO } from '@constants/synthCategories';
import { getToneEngine } from '@engine/ToneEngine';
import { WHOLE_SONG_SYNTH_TYPES } from '@engine/wholeSongSynths';
import { buildInstrumentConfig } from '@stores/useInstrumentStore';
import { applySynthTypeDefaults } from '@stores/instrument/synthTypeDefaults';
import type { SynthType, InstrumentConfig } from '@typedefs/instrument';

export interface SynthTestResult {
  synthType: SynthType;
  name: string;
  loaded: boolean;
  producedSound: boolean;
  noteOnWorked: boolean;
  noteOffWorked: boolean;
  error?: string;
  loadTimeMs: number;
}

export interface SynthTestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: SynthTestResult[];
  failedSynths: string[];
  passedSynths: string[];
  timestamp: string;
}

// Synths that are known to need special handling or are stubs
const SKIP_SYNTHS: SynthType[] = [
  'ChiptuneModule', // Requires external file
  'Player', // Requires sample URL
  'Sampler', // Requires sample URL
  'DrumKit', // Requires sample URLs
  'GranularSynth', // Requires a sample URL via config.granular.sampleUrl
  'Buzzmachine', // Effects processor — needs audio input, produces no sound alone
  'C64SID',      // Audio handled by C64SIDEngine — InstrumentFactory returns null intentionally
  'SF2Synth',    // Audio handled by SF2Engine (C64 memory-mapped SID) — no per-instrument audio
  'GTUltraSynth', // Audio handled by GT Ultra WASM engine — no per-instrument audio
];

/** Instrument id the tester borrows in the engine; disposed again after each synth.
 *  Not 999: preset and sample-pack previews use that id. Below 32768 for getInstrumentKey. */
const TEST_INSTRUMENT_ID = 32000;

/**
 * Test a single synth through the engine path the app plays notes on:
 * ToneEngine.ensureInstrumentReady, triggerNoteAttack/Release, and the engine's
 * per-instrument analyser (a tap on the instrument's effect-chain outputs, so it
 * hears synth-bus, native-context and per-channel routed synths alike).
 */
export async function testSynth(synthType: SynthType): Promise<SynthTestResult> {
  const info = SYNTH_INFO[synthType];
  const result: SynthTestResult = {
    synthType,
    name: info?.name || synthType,
    loaded: false,
    producedSound: false,
    noteOnWorked: false,
    noteOffWorked: false,
    loadTimeMs: 0,
  };

  if (SKIP_SYNTHS.includes(synthType)) {
    result.error = 'Skipped (requires external resources)';
    return result;
  }
  if (WHOLE_SONG_SYNTH_TYPES.has(synthType)) {
    result.error = 'Skipped (whole-song replayer, plays only inside a loaded song)';
    return result;
  }

  const engine = getToneEngine();
  const startTime = performance.now();
  const testNote = 'C4';

  try {
    // Build the config as the app does when a user switches an instrument's synthType
    const config: InstrumentConfig = buildInstrumentConfig(TEST_INSTRUMENT_ID, {
      name: `Test ${synthType}`,
      type: 'synth',
      synthType,
      effects: [],
      volume: -12,
      pan: 0,
    });
    applySynthTypeDefaults(config, synthType, false);

    await engine.ensureInstrumentReady(config);
    result.loadTimeMs = performance.now() - startTime;

    const analyser = engine.getInstrumentAnalyser(TEST_INSTRUMENT_ID);

    try {
      engine.triggerNoteAttack(TEST_INSTRUMENT_ID, testNote, Tone.now(), 0.8, config);
      result.noteOnWorked = true;
    } catch (e) {
      result.error = `Note trigger error: ${e}`;
    }
    result.loaded = engine.instancesOf(TEST_INSTRUMENT_ID).length > 0;

    // Poll the analyser for up to 1s; catches fast-decay percussion and slow WASM starts
    let maxSeen = 0;
    for (let elapsed = 0; elapsed < 1000 && maxSeen <= 0.001; elapsed += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      maxSeen = Math.max(maxSeen, analyser?.getPeak() ?? 0);
    }
    result.producedSound = maxSeen > 0.001;
    if (!result.producedSound) console.warn(`[synthTester] ${synthType} silent: loaded=${result.loaded} maxSeen=${maxSeen.toFixed(6)}`);

    try {
      engine.triggerNoteRelease(TEST_INSTRUMENT_ID, testNote, Tone.now(), config);
      result.noteOffWorked = true;
    } catch {
      // Note off not critical
    }
  } catch (e) {
    result.error = `${e}`;
    result.loadTimeMs = performance.now() - startTime;
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      engine.disposeInstrumentAnalyser(TEST_INSTRUMENT_ID);
      engine.disposeInstrument(TEST_INSTRUMENT_ID);
    } catch {
      // Cleanup errors not critical
    }
  }

  return result;
}

/**
 * Test all synths and return summary
 */
export async function testAllSynths(
  options: {
    verbose?: boolean;
    filter?: (synthType: SynthType) => boolean;
    timeout?: number;
  } = {}
): Promise<SynthTestSummary> {
  const { verbose = true, filter, timeout = 20000 } = options;

  // Ensure audio context is running
  await Tone.start();

  const synthsToTest = filter ? ALL_SYNTH_TYPES.filter(filter) : ALL_SYNTH_TYPES;

  if (verbose) {
    console.log(`\n🎹 Testing ${synthsToTest.length} synths...\n`);
  }

  const results: SynthTestResult[] = [];

  for (const synthType of synthsToTest) {
    if (verbose) {
      console.log(`Testing: ${synthType}...`);
    }

    // Add timeout
    const result = await Promise.race([
      testSynth(synthType),
      new Promise<SynthTestResult>((resolve) =>
        setTimeout(
          () =>
            resolve({
              synthType,
              name: SYNTH_INFO[synthType]?.name || synthType,
              loaded: false,
              producedSound: false,
              noteOnWorked: false,
              noteOffWorked: false,
              error: 'Timeout',
              loadTimeMs: timeout,
            }),
          timeout
        )
      ),
    ]);

    results.push(result);

    if (verbose) {
      const status = result.loaded ? (result.producedSound ? '✅' : '⚠️') : '❌';
      console.log(`  ${status} ${result.name} - ${result.error || (result.producedSound ? 'OK' : 'No sound')}`);
    }
  }

  // Generate summary
  const passed = results.filter((r) => r.loaded && r.noteOnWorked);
  const failed = results.filter((r) => !r.loaded && !SKIP_SYNTHS.includes(r.synthType));
  const skipped = results.filter((r) => SKIP_SYNTHS.includes(r.synthType));

  const summary: SynthTestSummary = {
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    skipped: skipped.length,
    results,
    failedSynths: failed.map((r) => r.synthType),
    passedSynths: passed.map((r) => r.synthType),
    timestamp: new Date().toISOString(),
  };

  if (verbose) {
    console.log('\n📊 SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Total:   ${summary.total}`);
    console.log(`Passed:  ${summary.passed} ✅`);
    console.log(`Failed:  ${summary.failed} ❌`);
    console.log(`Skipped: ${summary.skipped} ⏭️`);

    if (summary.failedSynths.length > 0) {
      console.log('\n❌ FAILED SYNTHS:');
      summary.failedSynths.forEach((s) => {
        const r = results.find((r) => r.synthType === s);
        console.log(`  - ${s}: ${r?.error || 'Unknown error'}`);
      });
    }

    // Report synths that loaded but produced no sound
    const noSound = results.filter((r) => r.loaded && !r.producedSound && !SKIP_SYNTHS.includes(r.synthType));
    if (noSound.length > 0) {
      console.log('\n⚠️ LOADED BUT NO SOUND:');
      noSound.forEach((r) => console.log(`  - ${r.synthType}`));
    }
  }

  return summary;
}

/**
 * Test only Tone.js synths (fastest)
 */
export async function testToneSynths(): Promise<SynthTestSummary> {
  const toneSynths: SynthType[] = [
    'Synth',
    'MonoSynth',
    'DuoSynth',
    'FMSynth',
    'ToneAM',
    'PluckSynth',
    'MetalSynth',
    'MembraneSynth',
    'NoiseSynth',
    'PolySynth',
  ];
  return testAllSynths({ filter: (t) => toneSynths.includes(t) });
}

/**
 * Test only DEViLBOX custom synths
 */
export async function testCustomSynths(): Promise<SynthTestSummary> {
  const customSynths: SynthType[] = [
    'TB303',
    'DubSiren',
    'SpaceLaser',
    'Synare',
    'V2',
    'Sam',
    'SuperSaw',
    'Organ',
    'DrumMachine',
    'ChipSynth',
    'PWMSynth',
    'WobbleBass',
    'StringMachine',
    'FormantSynth',
    'GranularSynth',
    'Wavetable',
  ];
  return testAllSynths({ filter: (t) => customSynths.includes(t) });
}

/**
 * Test only Furnace chip synths
 */
export async function testFurnaceSynths(): Promise<SynthTestSummary> {
  return testAllSynths({ filter: (t) => t.startsWith('Furnace'), timeout: 10000 });
}

/**
 * Test only Buzzmachine synths
 */
export async function testBuzzmachineSynths(): Promise<SynthTestSummary> {
  return testAllSynths({ filter: (t) => t.startsWith('Buzz') });
}

/**
 * Test only MAME hardware chip synths
 */
export async function testMAMESynths(startIndex = 0, batchSize = 0): Promise<SynthTestSummary> {
  // 30s timeout: ROM-based chips (TR707, C352, ICS2115, etc.) fetch+unzip ROMs on first init
  const allMame = ALL_SYNTH_TYPES.filter((t) => t.startsWith('MAME'));
  const slice = batchSize > 0 ? allMame.slice(startIndex, startIndex + batchSize) : allMame;
  return testAllSynths({ filter: (t) => (slice as string[]).includes(t), timeout: 30000 });
}

/**
 * Quick test - just test loading, not sound production
 */
export async function quickTestSynths(): Promise<SynthTestSummary> {
  return testAllSynths({ timeout: 2000 });
}

// Export for browser console access
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.testAllSynths = testAllSynths;
  w.testToneSynths = testToneSynths;
  w.testCustomSynths = testCustomSynths;
  w.testFurnaceSynths = testFurnaceSynths;
  w.testBuzzmachineSynths = testBuzzmachineSynths;
  w.testMAMESynths = testMAMESynths;
  w.quickTestSynths = quickTestSynths;
}
