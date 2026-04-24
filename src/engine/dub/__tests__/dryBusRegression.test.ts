/**
 * Regression test for "dub bus totally dry" bug (2026-04-24).
 *
 * Root cause was two interacting bugs introduced in Phase 3:
 *
 * 1. ConvolverNode with null buffer was connected to return_ even when
 *    club simulation was disabled (default). A convolver with null buffer
 *    in the audio graph can cause browser-specific rendering issues.
 *    Fix: only wire convolver when clubSimEnabled is true.
 *
 * 2. External feedback loop (return_ → extFeedbackEq → extFeedbackGain
 *    → input → … → return_) created a cycle without any native DelayNode.
 *    The Web Audio spec says: "Cycles that do not contain any DelayNode
 *    will be muted by outputting silence." The echo engines have delays,
 *    but inside AudioWorkletNode/Tone wrappers — not visible to the
 *    browser's topological sort.
 *    Fix: insert a tiny native DelayNode (128 samples) in the ext
 *    feedback path.
 *
 * Source-contract test — happy-dom can't simulate Web Audio graph state.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const DUBBUS_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../DubBus.ts'),
  'utf8',
);

describe('DubBus dry-bus regression — ConvolverNode null buffer', () => {
  it('tracks whether the club convolver is wired via _clubConvolverWired', () => {
    expect(DUBBUS_SRC).toMatch(/_clubConvolverWired/);
  });

  it('does NOT unconditionally connect return_ to clubConvolver in constructor', () => {
    // The constructor should only connect the convolver when club sim is
    // enabled. Look for the conditional guard.
    const constructorStart = DUBBUS_SRC.indexOf('constructor(');
    const constructorBody = DUBBUS_SRC.slice(constructorStart, constructorStart + 8000);
    // Should NOT have a bare return_.connect(clubConvolver) — it should be
    // gated by clubSimEnabled or similar condition
    const bareConnect = /this\.return_\.connect\(this\.clubConvolver\)/.test(constructorBody);
    expect(bareConnect).toBe(false);
  });

  it('wires/unwires convolver dynamically in setSettings based on clubSimEnabled', () => {
    // setSettings should check clubSimEnabled and connect/disconnect accordingly
    // The method is very large (~20K chars) so we search the whole body
    const setSettingsStart = DUBBUS_SRC.indexOf('setSettings(settings:');
    const nextMethod = DUBBUS_SRC.indexOf('\n  /**', setSettingsStart + 100);
    const setSettingsBody = DUBBUS_SRC.slice(setSettingsStart, nextMethod > 0 ? nextMethod : undefined);
    expect(setSettingsBody).toMatch(/clubSimEnabled/);
    expect(setSettingsBody).toMatch(/_clubConvolverWired/);
  });
});

describe('DubBus dry-bus regression — feedback cycle DelayNode', () => {
  it('has an extFeedbackDelay: DelayNode field', () => {
    expect(DUBBUS_SRC).toMatch(/extFeedbackDelay/);
  });

  it('creates the delay node via createDelay in constructor', () => {
    expect(DUBBUS_SRC).toMatch(/createDelay\(/);
  });

  it('inserts extFeedbackDelay between extFeedbackGain and input', () => {
    // The ext feedback path should be:
    //   extFeedbackGain → extFeedbackDelay → input
    // NOT:
    //   extFeedbackGain → input (no DelayNode = muted cycle)
    expect(DUBBUS_SRC).toMatch(/extFeedbackGain.*connect.*extFeedbackDelay/s);
    expect(DUBBUS_SRC).toMatch(/extFeedbackDelay.*connect.*this\.input/s);
  });

  it('disconnects extFeedbackDelay in dispose', () => {
    const disposeStart = DUBBUS_SRC.indexOf('dispose(): void');
    expect(disposeStart).toBeGreaterThan(-1);
    const disposeBody = DUBBUS_SRC.slice(disposeStart, disposeStart + 3000);
    expect(disposeBody).toMatch(/extFeedbackDelay.*disconnect/s);
  });
});

// ── Mute-hold guard regression (2026-04-25) ────────────────────────────
// Root cause: PadGrid mirror effect fires setDubBusSettings ~50ms after a
// preset change. This re-entrant call wrote return_.gain.setTargetAtTime()
// which inserted an event defeating the warmup hold. The spring burst
// leaked through to master ("big effect on activation").
// Fix: _muteHoldActive flag + _pendingPostHoldSettings replay.

const ECHO_ENGINE_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../DubEchoEngine.ts'),
  'utf8',
);

describe('DubBus mute-hold guard — prevents burst leak during engine swap', () => {
  it('has _muteHoldActive flag field', () => {
    expect(DUBBUS_SRC).toMatch(/_muteHoldActive/);
  });

  it('has _pendingPostHoldSettings for deferred replay', () => {
    expect(DUBBUS_SRC).toMatch(/_pendingPostHoldSettings/);
  });

  it('sets _muteHoldActive = true in _swapEchoEngine', () => {
    const swapStart = DUBBUS_SRC.indexOf('_swapEchoEngine(');
    const swapBody = DUBBUS_SRC.slice(swapStart, swapStart + 2000);
    expect(swapBody).toMatch(/_muteHoldActive\s*=\s*true/);
  });

  it('sets _muteHoldActive = true in _warmupMute', () => {
    const warmupStart = DUBBUS_SRC.indexOf('_warmupMute(');
    const warmupBody = DUBBUS_SRC.slice(warmupStart, warmupStart + 2000);
    expect(warmupBody).toMatch(/_muteHoldActive\s*=\s*true/);
  });

  it('clears _muteHoldActive = false after warmup timeout', () => {
    expect(DUBBUS_SRC).toMatch(/_muteHoldActive\s*=\s*false/);
  });

  it('guards return_.gain write with _muteHoldActive check', () => {
    expect(DUBBUS_SRC).toMatch(/if\s*\(\s*this\._muteHoldActive\s*\)/);
  });

  it('guards sidechain.threshold write with _muteHoldActive check', () => {
    expect(DUBBUS_SRC).toMatch(/!this\._muteHoldActive/);
  });

  it('replays pending settings after hold ends', () => {
    expect(DUBBUS_SRC).toMatch(/_pendingPostHoldSettings/);
    expect(DUBBUS_SRC).toMatch(/pending\.returnGain/);
  });
});

describe('DubEchoEngine adapter — safe feedback for DubBus context', () => {
  it('AnotherDelay adapter disables internal reverb (DubBus has its own spring)', () => {
    const adapterStart = ECHO_ENGINE_SRC.indexOf('class AnotherDelayAdapter');
    const adapterBody = ECHO_ENGINE_SRC.slice(adapterStart, adapterStart + 1000);
    expect(adapterBody).toMatch(/reverbEnabled:\s*false/);
  });

  it('AnotherDelay adapter uses conservative feedback multiplier', () => {
    const adapterStart = ECHO_ENGINE_SRC.indexOf('class AnotherDelayAdapter');
    const adapterBody = ECHO_ENGINE_SRC.slice(adapterStart, adapterStart + 1500);
    expect(adapterBody).not.toMatch(/\*\s*0\.95/);
    expect(adapterBody).toMatch(/\*\s*0\.55/);
  });

  it('AnotherDelay adapter uses near-zero wow/flutter to avoid drunk pitch wobble', () => {
    const adapterStart = ECHO_ENGINE_SRC.indexOf('class AnotherDelayAdapter');
    const adapterBody = ECHO_ENGINE_SRC.slice(adapterStart, adapterStart + 1500);
    const flutterMatch = adapterBody.match(/flutterDepth:\s*([\d.]+)/);
    const wowMatch = adapterBody.match(/wowDepth:\s*([\d.]+)/);
    expect(flutterMatch).not.toBeNull();
    expect(wowMatch).not.toBeNull();
    // Both modulation depths must be ≤ 0.005 to prevent audible pitch wobble
    expect(parseFloat(flutterMatch![1])).toBeLessThanOrEqual(0.005);
    expect(parseFloat(wowMatch![1])).toBeLessThanOrEqual(0.005);
  });

  it('RE201 adapter enables light internal reverb for body', () => {
    const adapterStart = ECHO_ENGINE_SRC.indexOf('class RE201Adapter');
    const adapterBody = ECHO_ENGINE_SRC.slice(adapterStart, adapterStart + 1000);
    expect(adapterBody).toMatch(/reverbVolume:\s*0\.2/);
  });
});

// ── RE201 WASM stability regression (2026-04-24) ───────────────────────
// Root cause: RE201WASM.cpp had two stability bugs:
//   1. ToneStack 3rd-order IIR had no denormal/NaN protection — filter state
//      diverged to NaN at ~640ms, poisoning the entire downstream Web Audio chain.
//   2. Spring Reverb waveguide feedback (0.3f) + allpass gains (0.3-0.7) created
//      a combined loop gain >1.0, causing exponential growth to Inf→NaN.
// Fix: Added sanitize() for denormal/NaN/Inf protection in all filters,
//   safeSample() clamping in ToneStack and TapeDelay output,
//   reduced waveguide feedback 0.3→0.15, capped allpass gains to 0.2-0.45.

const RE201_WASM_SRC = (() => {
  try {
    return readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../../re201-wasm/RE201WASM.cpp'),
      'utf8',
    );
  } catch {
    return '';
  }
})();

describe('RE201 WASM stability — NaN prevention in DSP code', () => {
  it('has sanitize() helper for denormal/NaN/Inf protection', () => {
    expect(RE201_WASM_SRC).toMatch(/sanitize/);
    expect(RE201_WASM_SRC).toMatch(/0x7F800000/); // exponent mask for NaN/Inf check
  });

  it('has safeSample() helper for output clamping', () => {
    expect(RE201_WASM_SRC).toMatch(/safeSample/);
  });

  it('sanitizes Biquad filter state (y1) to prevent NaN accumulation', () => {
    // Biquad::process must sanitize y1 before storing
    const biquadProcess = RE201_WASM_SRC.match(/struct Biquad[\s\S]*?float process\(float x\)\s*\{[\s\S]*?\}/);
    expect(biquadProcess).not.toBeNull();
    expect(biquadProcess![0]).toMatch(/sanitize\(y\)/);
  });

  it('sanitizes ToneStack 3rd-order IIR state to prevent NaN at 640ms', () => {
    const toneProcess = RE201_WASM_SRC.match(/struct ToneStack[\s\S]*?float process\(float x\)\s*\{[\s\S]*?\}/);
    expect(toneProcess).not.toBeNull();
    expect(toneProcess![0]).toMatch(/sanitize/);
    expect(toneProcess![0]).toMatch(/safeSample/);
  });

  it('uses reduced waveguide feedback (<=0.2) to prevent spring reverb runaway', () => {
    // WaveguideUnit::process writes: delay.write(x + y * FEEDBACK)
    // FEEDBACK must be <= 0.2 (was 0.3 which caused exponential growth)
    const wgProcess = RE201_WASM_SRC.match(/float process\(float x, float delay_samp\)[\s\S]*?return y;\s*\}/);
    expect(wgProcess).not.toBeNull();
    // Should contain y * 0.15f (or similar small value)
    expect(wgProcess![0]).toMatch(/y \* 0\.1[0-5]f/);
  });

  it('caps allpass dispersor gains to prevent combined loop gain >1', () => {
    // AllPassDelay gains should be capped below 0.5
    // Original was 0.3 + rand*0.4 (up to 0.7), now 0.2 + rand*0.25 (up to 0.45)
    expect(RE201_WASM_SRC).toMatch(/0\.2f \+ fabsf\(rng\.next\(\)\) \* 0\.25f/);
  });

  it('clamps TapeDelay feedback output with safeSample', () => {
    const tapeBlock = RE201_WASM_SRC.match(/void processBlock\([\s\S]*?feedbackSample = /);
    expect(tapeBlock).not.toBeNull();
    expect(tapeBlock![0]).toMatch(/safeSample/);
  });
});

// ── Spring output mute during warmup (2026-04-24) ──────────────────────
// Root cause: switching to Mad Professor (RE201) produced an audible "crash"
// sound. Spring param changes during _swapEchoEngine excite waveguide
// resonances that accumulate in the spring's delay lines. When return_
// unmutes at 800ms, the stored energy burst through.
// Fix: muteOutput()/unmuteOutput() the spring during both _swapEchoEngine
// and _warmupMute warmup holds.

describe('Spring output muted during warmup to prevent crash sound', () => {
  it('_swapEchoEngine mutes spring output during warmup hold', () => {
    const swapBlock = DUBBUS_SRC.match(/_swapEchoEngine[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?\}, RAMP_SEC/);
    expect(swapBlock).not.toBeNull();
    expect(swapBlock![0]).toContain('spring.muteOutput()');
    expect(swapBlock![0]).toContain('spring.unmuteOutput()');
  });

  it('_warmupMute mutes spring output during hold', () => {
    const warmupBlock = DUBBUS_SRC.match(/_warmupMute\([\s\S]*?setTimeout\(\(\) => \{[\s\S]*?_muteHoldActive = false/);
    expect(warmupBlock).not.toBeNull();
    expect(warmupBlock![0]).toContain('spring.muteOutput()');
    expect(warmupBlock![0]).toContain('spring.unmuteOutput()');
  });
});

// ── Perry springEcho chain order (2026-04-24) ───────────────────────────
// Root cause: Lee Perry echo "never rolls off" because echoSpring topology
// adds new spring reverb tail to each echo repeat, creating overlapping
// energy that never fully decays. springEcho reverses the flow: dry signal
// hits spring first (reverb cloud), then echo repeats the cloud — the echo
// decays cleanly without adding new reverb to each repeat.

const DUB_TYPES_SRC = (() => {
  try {
    return readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../types/dub.ts'),
      'utf8',
    );
  } catch {
    return '';
  }
})();

describe('Perry preset uses springEcho chain order for clean decay', () => {
  it('perry preset sets chainOrder to springEcho', () => {
    const perryBlock = DUB_TYPES_SRC.match(/perry:\s*\{[\s\S]*?\n  \}/);
    expect(perryBlock).not.toBeNull();
    expect(perryBlock![0]).toContain("chainOrder:    'springEcho'");
  });

  it('perry echoIntensity is below 0.75 for clean decay', () => {
    const perryBlock = DUB_TYPES_SRC.match(/perry:\s*\{[\s\S]*?\n  \}/);
    expect(perryBlock).not.toBeNull();
    const match = perryBlock![0].match(/echoIntensity:\s*([\d.]+)/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBeLessThanOrEqual(0.75);
  });

  it('perry springWet is below 0.60 to avoid burying echo decay', () => {
    const perryBlock = DUB_TYPES_SRC.match(/perry:\s*\{[\s\S]*?\n  \}/);
    expect(perryBlock).not.toBeNull();
    const match = perryBlock![0].match(/springWet:\s*([\d.]+)/);
    expect(match).not.toBeNull();
    expect(parseFloat(match![1])).toBeLessThanOrEqual(0.60);
  });
});

// ── Tubby springEcho chain order (2026-04-24) ───────────────────────────
// Tubby (RE201, echoIntensity 0.65 + springWet 0.60 in echoSpring) had
// moderate stacking risk — each echo repeat added new spring reverb tail.
// Switched to springEcho like Perry.

describe('Tubby preset uses springEcho chain order', () => {
  it('tubby preset sets chainOrder to springEcho', () => {
    const tubbyBlock = DUB_TYPES_SRC.match(/tubby:\s*\{[\s\S]*?\n  \}/);
    expect(tubbyBlock).not.toBeNull();
    expect(tubbyBlock![0]).toContain("chainOrder:    'springEcho'");
  });
});

// ── WASM pre-heat on DubBus construction (2026-04-24) ───────────────────
// Pre-loads all echo engine WASM modules at DubBus construction so the
// first engine swap is instant (no 200-900ms fetch+compile delay).

describe('DubBus pre-heats WASM modules on construction', () => {
  it('constructor calls _preheatWASMModules', () => {
    expect(DUBBUS_SRC).toContain('void this._preheatWASMModules()');
  });

  it('_preheatWASMModules loads all four WASM effects', () => {
    const preheatBlock = DUBBUS_SRC.match(/_preheatWASMModules[\s\S]*?console\.log/);
    expect(preheatBlock).not.toBeNull();
    expect(preheatBlock![0]).toContain('RE201Effect.ensureModuleLoaded');
    expect(preheatBlock![0]).toContain('AnotherDelayEffect.ensureModuleLoaded');
    expect(preheatBlock![0]).toContain('RETapeEchoEffect.ensureModuleLoaded');
    expect(preheatBlock![0]).toContain('AelapseEffect.ensureInitialized');
  });
});

// ── Reduced warmup hold (2026-04-24) ────────────────────────────────────
// Spring output mute handles the burst, so the warmup hold is reduced
// from 800ms to 200ms for faster transitions.

describe('Warmup hold reduced with spring mute protection', () => {
  it('_swapEchoEngine warmup is 400ms or less', () => {
    const swapBlock = DUBBUS_SRC.match(/_swapEchoEngine[\s\S]*?const WARMUP_SEC = ([\d.]+)/);
    expect(swapBlock).not.toBeNull();
    expect(parseFloat(swapBlock![1])).toBeLessThanOrEqual(0.40);
  });

  it('_warmupMute hold is 400ms or less', () => {
    const warmupBlock = DUBBUS_SRC.match(/_warmupMute[\s\S]*?const WARMUP_SEC = ([\d.]+)/);
    expect(warmupBlock).not.toBeNull();
    expect(parseFloat(warmupBlock![1])).toBeLessThanOrEqual(0.40);
  });

  it('_swapEchoEngine mutes spring input AND output during hold', () => {
    const swapBlock = DUBBUS_SRC.match(/_swapEchoEngine[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?\}, RAMP_SEC/);
    expect(swapBlock).not.toBeNull();
    expect(swapBlock![0]).toContain('spring.muteInput()');
    expect(swapBlock![0]).toContain('spring.muteOutput()');
    expect(swapBlock![0]).toContain('spring.unmuteInput()');
    expect(swapBlock![0]).toContain('spring.unmuteOutput()');
  });

  it('firePing routes through bus input (full chain) not echo or return directly', () => {
    const firePingBlock = DUBBUS_SRC.match(/firePing\([\s\S]*?\n  \}/);
    expect(firePingBlock).not.toBeNull();
    const body = firePingBlock![0];
    // Must connect to this.input (bus input → full chain: HPF → tapeSat → echo → spring)
    expect(body).toContain('env.connect(this.input)');
    // Must NOT connect directly to echo.input or return_ (bypasses bus coloration)
    expect(body).not.toMatch(/connect\(this\.echo\.input/);
    expect(body).not.toMatch(/connect\(this\.return_\)/);
  });
});

describe('dub move contracts', () => {
  const MASTER_DROP_SRC = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../moves/masterDrop.ts'),
    'utf8',
  );
  const TOAST_SRC = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../moves/toast.ts'),
    'utf8',
  );
  const TAPE_STOP_SRC = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../moves/transportTapeStop.ts'),
    'utf8',
  );

  it('masterDrop uses fresh ctx.currentTime inside async callback', () => {
    // The async IIFE must capture currentTime AFTER the await, not before
    expect(MASTER_DROP_SRC).toMatch(/const collected = await collectDryGains[\s\S]*?const t = ctx\.currentTime/);
  });

  it('masterDrop notifies user when no dry gains found', () => {
    expect(MASTER_DROP_SRC).toContain('useNotificationStore');
  });

  it('toast notifies user when DJ mic is not active', () => {
    expect(TOAST_SRC).toContain('useNotificationStore');
    expect(TOAST_SRC).toMatch(/notify\.warning.*mic/i);
  });

  it('toast ducks WASM engine outputs in addition to Tone.js buses', () => {
    expect(TOAST_SRC).toContain('LibopenmptEngine');
    expect(TOAST_SRC).toContain('HivelyEngine');
    expect(TOAST_SRC).toContain('UADEEngine');
    expect(TOAST_SRC).toContain('FurnaceDispatchEngine');
  });

  it('transportTapeStop notifies user on non-LibOpenMPT engines', () => {
    expect(TAPE_STOP_SRC).toContain('useNotificationStore');
  });
});
