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
import { getNativeAudioNode, getDevilboxAudioContext } from '@utils/audio-context';
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

    // Set up audio routing for signal detection.
    // Two paths depending on whether the instrument exposes a native output node:
    //   A) DevilboxSynth / has .output GainNode → connect native GainNode → native AnalyserNode
    //   B) Plain-object synths (ChipSynth, PWMSynth, etc.) → connect via Tone.Analyser (SAC-safe)
    const nativeCtx = getDevilboxAudioContext();
    const nativeAnalyser = nativeCtx.createAnalyser();
    nativeAnalyser.fftSize = 256;
    nativeAnalyser.connect(nativeCtx.destination);

    const instrumentOutput = isDevilboxSynth(instrument)
      ? instrument.output
      : (instrument as unknown as { output?: unknown }).output ?? instrument;
    const nativeOut = getNativeAudioNode(instrumentOutput);

    // toneAnalyser is only used in path B
    let toneAnalyser: Tone.Analyser | null = null;

    if (nativeOut) {
      // Path A: native output → native AnalyserNode
      nativeOut.connect(nativeAnalyser);
    } else {
      // Path B: Tone.js plain-object synth → Tone.Analyser (stays within SAC layer)
      toneAnalyser = new Tone.Analyser('waveform', 256);
      toneAnalyser.toDestination();
      const connectFn = (instrument as unknown as { connect?: (n: Tone.ToneAudioNode) => void }).connect;
      if (typeof connectFn === 'function') {
        try {
          connectFn.call(instrument, toneAnalyser);
        } catch(e) { console.warn(`[synthTester] ${synthType} connect error: ${e}`); }
      }
    }

    // WASM-based synths: await ready (Promise property or function) or ensureInitialized() if
    // available. Catches V2, Sam, TB303, VSTBridge synths (Vital, Odin2, Surge,
    // Helm, Melodica, etc.), MAME synths, and FurnaceDispatchSynth.
    // V2 gets 12s (its internal timeout is 10s); all others get 8s.
    {
      const anyInstrument = instrument as unknown as {
        ready?: (() => Promise<void>) | Promise<void>;
        ensureInitialized?: () => Promise<void>;
      };
      // ready can be a function (SAMSynth, V2Synth, etc.) or a Promise getter (FurnaceDispatchSynth)
      const readyPromise: Promise<void> | null =
        typeof anyInstrument.ready === 'function'
          ? (anyInstrument.ready as () => Promise<void>)()
          : anyInstrument.ready instanceof Promise
            ? anyInstrument.ready
            : typeof anyInstrument.ensureInitialized === 'function'
              ? anyInstrument.ensureInitialized()
              : null;
      if (readyPromise) {
        const wasmTimeout = synthType === 'V2' ? 12000 : 8000;
        try { await Promise.race([readyPromise, new Promise<void>((_, r) => setTimeout(r, wasmTimeout))]); } catch { /* timeout */ }
      }
    }

    // Tone.js AudioWorklet effects (BitCrusher, etc.) initialize asynchronously.
    // Use workletsAreReady() to properly wait for all AudioWorklet modules to load,
    // then an extra tick for onReady() callbacks to fire and make their connections.
    if (!nativeOut && toneAnalyser) {
      try {
        await (Tone.getContext() as unknown as { workletsAreReady: () => Promise<void> }).workletsAreReady();
      } catch { /* ignore if worklet failed to load */ }
      // One extra event-loop tick so onReady() microtasks complete
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Use Tone.now() for Tone.js plain-object synths — they schedule against Tone.js's
    // internal clock which may differ from nativeCtx.currentTime. Passing native time
    // to a Tone.js synth can schedule events in the "past", causing silent drops.
    // Native DevilboxSynths (path A) schedule against the native AudioContext directly.
    const scheduleTime = nativeOut ? nativeCtx.currentTime : Tone.now();

    // GranularSynth uses Tone.GrainPlayer — start()/stop() interface
    if (synthType === 'GranularSynth') {
      try {
        const player = instrument as unknown as { start: (t: number) => void; stop: (t: number) => void };
        player.start(scheduleTime);
        result.noteOnWorked = true;
      } catch (e) {
        result.error = `GranularSynth start error: ${e}`;
      }
    } else {
      // Synths that don't take a note argument for attack/release
      // NoiseSynth/MetalSynth: triggerAttack(time, vel), triggerRelease(time)
      const isNoNote = synthType === 'NoiseSynth' || synthType === 'MetalSynth';

      // Drum machine synths: use MIDI note 36 (C2 = kick drum) instead of C4=60
      // TR707 drum map only covers notes 35-56; C4=60 has no mapping → silence
      const DRUM_SYNTHS: ReadonlySet<string> = new Set(['MAMETR707']);
      const testNote = DRUM_SYNTHS.has(synthType) ? 'C2' : 'C4';

      try {
        if ('triggerAttack' in instrument && typeof instrument.triggerAttack === 'function') {
          if (isNoNote) {
            (instrument as unknown as Tone.NoiseSynth).triggerAttack(scheduleTime, 0.8);
          } else {
            instrument.triggerAttack(testNote, scheduleTime, 0.8);
          }
          result.noteOnWorked = true;
        } else if ('triggerAttackRelease' in instrument && typeof instrument.triggerAttackRelease === 'function') {
          if (isNoNote) {
            (instrument as unknown as Tone.NoiseSynth).triggerAttackRelease('8n', scheduleTime, 0.8);
          } else {
            (instrument as unknown as { triggerAttackRelease: (note: string, dur: string, time: number, vel: number) => void }).triggerAttackRelease(testNote, '8n', scheduleTime, 0.8);
          }
          result.noteOnWorked = true;
        }
      } catch (e) {
        result.error = `Note trigger error: ${e}`;
      }
    }

    // Poll analyser every 10ms for up to 500ms — catches fast-decay percussive synths
    const nativeBuf = new Float32Array(nativeAnalyser.fftSize);
    let hasSignal = false;
    let dbgMax = 0;
    for (let elapsed = 0; elapsed < 500 && !hasSignal; elapsed += 10) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      try {
        if (toneAnalyser) {
          // Path B: read from Tone.Analyser
          const raw = toneAnalyser.getValue();
          // getValue() returns Float32Array (mono) or Float32Array[] (multi-channel)
          const val: Float32Array = Array.isArray(raw) ? (raw as Float32Array[])[0] : raw as Float32Array;
          if (elapsed === 0) console.log(`[synthTester-dbg] ${synthType} toneAnalyser raw type=${Array.isArray(raw)?'array':'float32'} len=${val?.length} first4=${val ? Array.from(val.slice(0,4)).join(',') : 'null'}`);
          const m = val ? Math.max(...Array.from(val).map(Math.abs)) : 0;
          if (m > dbgMax) dbgMax = m;
          if (m > 0.001) hasSignal = true;
        } else {
          // Path A: read from native AnalyserNode
          nativeAnalyser.getFloatTimeDomainData(nativeBuf);
          const m = Math.max(...Array.from(nativeBuf).map(Math.abs));
          if (m > dbgMax) dbgMax = m;
          if (m > 0.001) hasSignal = true;
        }
      } catch { /* ignore */ }
    }
    if (!hasSignal) console.warn(`[synthTester] ${synthType} silent: nativeOut=${!!nativeOut} maxSeen=${dbgMax.toFixed(6)} nativeCtxTime=${nativeCtx.currentTime.toFixed(2)}`);
    result.producedSound = hasSignal;

    // Try note off
    try {
      if (synthType === 'GranularSynth') {
        (instrument as unknown as { stop: (t: number) => void }).stop(Tone.now());
        result.noteOffWorked = true;
      } else if ('triggerRelease' in instrument && typeof instrument.triggerRelease === 'function') {
        const releaseTime = nativeOut ? nativeCtx.currentTime : Tone.now();
        const isNoNoteRelease = synthType === 'NoiseSynth' || synthType === 'MetalSynth' ||
          synthType === 'MembraneSynth' || synthType === 'MonoSynth' || synthType === 'DuoSynth';
        if (isNoNoteRelease) {
          (instrument as unknown as Tone.NoiseSynth).triggerRelease(releaseTime);
        } else {
          instrument.triggerRelease('C4', releaseTime);
        }
        result.noteOffWorked = true;
      }
    } catch {
      // Note off not critical
    }

    // Cleanup
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      if (nativeOut) {
        try { nativeOut.disconnect(nativeAnalyser); } catch { /* already disconnected */ }
      }
      nativeAnalyser.disconnect();
      if (toneAnalyser) {
        toneAnalyser.dispose();
      }
      if ('dispose' in instrument && typeof instrument.dispose === 'function') {
        instrument.dispose();
      }
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
