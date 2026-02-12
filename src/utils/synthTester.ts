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
import { InstrumentFactory } from '@engine/InstrumentFactory';
import { isDevilboxSynth } from '@typedefs/synth';
import { getNativeAudioNode } from '@utils/audio-context';
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
];

/**
 * Test a single synth
 */
async function testSynth(synthType: SynthType): Promise<SynthTestResult> {
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

  // Skip known problematic synths
  if (SKIP_SYNTHS.includes(synthType)) {
    result.error = 'Skipped (requires external resources)';
    return result;
  }

  const startTime = performance.now();

  try {
    // Create a minimal instrument config
    const config: InstrumentConfig = {
      id: 999,
      name: `Test ${synthType}`,
      type: 'synth',
      synthType,
      effects: [],
      volume: -12,
      pan: 0,
    };

    // Create the instrument
    const instrument = InstrumentFactory.createInstrument(config);
    result.loadTimeMs = performance.now() - startTime;

    if (!instrument) {
      result.error = 'createInstrument returned null';
      return result;
    }

    result.loaded = true;

    // Connect to destination with an analyser to detect sound
    const analyser = new Tone.Analyser('waveform', 256);
    if (isDevilboxSynth(instrument)) {
      const nativeInput = getNativeAudioNode(analyser);
      if (nativeInput) instrument.output.connect(nativeInput);
    } else {
      (instrument as unknown as { connect: (dest: unknown) => void }).connect(analyser);
    }
    analyser.toDestination();

    // Try to trigger a note
    try {
      if ('triggerAttack' in instrument && typeof instrument.triggerAttack === 'function') {
        instrument.triggerAttack('C4', Tone.now(), 0.8);
        result.noteOnWorked = true;
      } else if ('triggerAttackRelease' in instrument && typeof instrument.triggerAttackRelease === 'function') {
        (instrument as unknown as { triggerAttackRelease: (note: string, dur: string, time: number, vel: number) => void }).triggerAttackRelease('C4', '8n', Tone.now(), 0.8);
        result.noteOnWorked = true;
      }
    } catch (e) {
      result.error = `Note trigger error: ${e}`;
    }

    // Wait for sound to be produced
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check if sound was produced
    try {
      const values = analyser.getValue() as Float32Array;
      const hasSignal = values.some((v) => Math.abs(v) > 0.001);
      result.producedSound = hasSignal;
    } catch {
      // Some synths may not produce sound in test context
    }

    // Try note off
    try {
      if ('triggerRelease' in instrument && typeof instrument.triggerRelease === 'function') {
        instrument.triggerRelease('C4', Tone.now());
        result.noteOffWorked = true;
      }
    } catch {
      // Note off not critical
    }

    // Cleanup
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      if (isDevilboxSynth(instrument)) {
        try { instrument.output.disconnect(); } catch { /* already disconnected */ }
      } else {
        (instrument as unknown as { disconnect: () => void }).disconnect();
      }
      analyser.disconnect();
      if ('dispose' in instrument && typeof instrument.dispose === 'function') {
        instrument.dispose();
      }
      analyser.dispose();
    } catch {
      // Cleanup errors not critical
    }
  } catch (e) {
    result.error = `${e}`;
    result.loadTimeMs = performance.now() - startTime;
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
  const { verbose = true, filter, timeout = 5000 } = options;

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
    'AMSynth',
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
    'Dexed',
    'OBXd',
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
  w.quickTestSynths = quickTestSynths;
}
