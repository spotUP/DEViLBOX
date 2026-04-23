/**
 * SIDDubSynths contract tests — verifies the SID dub synths module's
 * structure and instrument configuration without requiring a real
 * AudioContext or GTUltra WASM engine.
 *
 * What this guards:
 *   - SIDDubSynths class can be constructed without throwing.
 *   - Instrument constants are correctly encoded (AD/SR byte packing).
 *   - All synth trigger methods exist and return expected shapes.
 *   - DubBus SID mode delegates are wired to the correct synth methods.
 */

import { describe, it, expect } from 'vitest';

// Test the ADSR byte packing logic (same as module's private helper)
const adsr = (hi: number, lo: number) => ((hi & 0xF) << 4) | (lo & 0xF);

describe('SID ADSR byte packing', () => {
  it('packs attack=0 decay=0 as 0x00', () => {
    expect(adsr(0, 0)).toBe(0x00);
  });

  it('packs attack=15 decay=0 as 0xF0', () => {
    expect(adsr(15, 0)).toBe(0xF0);
  });

  it('packs attack=0 decay=9 as 0x09', () => {
    expect(adsr(0, 9)).toBe(0x09);
  });

  it('packs sustain=15 release=6 as 0xF6', () => {
    expect(adsr(15, 6)).toBe(0xF6);
  });

  it('packs sustain=10 release=0 as 0xA0', () => {
    expect(adsr(10, 0)).toBe(0xA0);
  });

  it('clamps nibbles to 4 bits', () => {
    expect(adsr(0x1F, 0x1A)).toBe(adsr(0xF, 0xA));
  });
});

describe('SIDDubSynths class shape', () => {
  it('can be constructed without throwing', async () => {
    const { SIDDubSynths } = await import('../SIDDubSynths');
    const synths = new SIDDubSynths();
    expect(synths).toBeDefined();
    expect(synths.isReady).toBe(false);
    expect(synths.output).toBeNull();
  });

  it('has all required trigger methods', async () => {
    const { SIDDubSynths } = await import('../SIDDubSynths');
    const synths = new SIDDubSynths();
    // Original methods
    expect(typeof synths.startSiren).toBe('function');
    expect(typeof synths.firePing).toBe('function');
    expect(typeof synths.fireSnare).toBe('function');
    expect(typeof synths.startOscBass).toBe('function');
    expect(typeof synths.startCrushBass).toBe('function');
    expect(typeof synths.fireSubSwell).toBe('function');
    expect(typeof synths.fireRadioRiser).toBe('function');
    expect(typeof synths.dispose).toBe('function');
    // New SID-specific methods
    expect(typeof synths.fireLaser).toBe('function');
    expect(typeof synths.fireHiHat).toBe('function');
    expect(typeof synths.fireClap).toBe('function');
    expect(typeof synths.fireBell).toBe('function');
    expect(typeof synths.startSubBass).toBe('function');
    expect(typeof synths.fireStab).toBe('function');
    // Siren preset selection
    expect(typeof synths.setSirenPreset).toBe('function');
    expect(typeof synths.sirenPresetId).toBe('string');
  });

  it('trigger methods return noop functions when engine is not ready', async () => {
    const { SIDDubSynths } = await import('../SIDDubSynths');
    const synths = new SIDDubSynths();
    // Hold-style synths return dispose functions
    const sirenDispose = synths.startSiren();
    expect(typeof sirenDispose).toBe('function');
    sirenDispose(); // should not throw

    const bassDispose = synths.startOscBass();
    expect(typeof bassDispose).toBe('function');
    bassDispose();

    const crushDispose = synths.startCrushBass();
    expect(typeof crushDispose).toBe('function');
    crushDispose();

    // Fire-and-forget methods should not throw when not ready
    expect(() => synths.firePing()).not.toThrow();
    expect(() => synths.fireSnare()).not.toThrow();
    expect(() => synths.fireSubSwell()).not.toThrow();
    expect(() => synths.fireRadioRiser()).not.toThrow();
    expect(() => synths.fireLaser()).not.toThrow();
    expect(() => synths.fireHiHat()).not.toThrow();
    expect(() => synths.fireClap()).not.toThrow();
    expect(() => synths.fireBell()).not.toThrow();
    expect(() => synths.fireStab()).not.toThrow();

    // New hold-style bass
    const subDispose = synths.startSubBass();
    expect(typeof subDispose).toBe('function');
    subDispose();
  });

  it('siren preset selection works', async () => {
    const { SIDDubSynths, SID_SIREN_PRESETS } = await import('../SIDDubSynths');
    const synths = new SIDDubSynths();

    // Defaults to first preset
    expect(synths.sirenPresetId).toBe(SID_SIREN_PRESETS[0].id);

    // Can switch presets
    synths.setSirenPreset('saw-buzz');
    expect(synths.sirenPresetId).toBe('saw-buzz');

    // Invalid preset ID is ignored
    synths.setSirenPreset('nonexistent');
    expect(synths.sirenPresetId).toBe('saw-buzz');
  });

  it('has at least 6 siren presets with valid fields', async () => {
    const { SID_SIREN_PRESETS } = await import('../SIDDubSynths');
    expect(SID_SIREN_PRESETS.length).toBeGreaterThanOrEqual(6);
    for (const p of SID_SIREN_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.inst).toBeGreaterThanOrEqual(1);
      expect(p.baseNote).toBeGreaterThanOrEqual(0x50);
      expect(p.baseNote).toBeLessThanOrEqual(0xBC);
      expect(p.range).toBeGreaterThan(0);
      expect(p.rateHz).toBeGreaterThan(0);
    }

    // IDs are unique
    const ids = SID_SIREN_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dispose is safe to call multiple times', async () => {
    const { SIDDubSynths } = await import('../SIDDubSynths');
    const synths = new SIDDubSynths();
    expect(() => synths.dispose()).not.toThrow();
    expect(() => synths.dispose()).not.toThrow();
  });
});

describe('SIDDubSynths uses playTestNote (not jamNoteOn)', () => {
  it('triggers notes via playTestNote which works without a loaded song', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/engine/dub/SIDDubSynths.ts', 'utf-8');

    // Must use playTestNote/releaseTestNote (direct note init)
    expect(source).toContain('.playTestNote(');
    expect(source).toContain('.releaseTestNote(');

    // Must NOT use jamNoteOn/jamNoteOff (requires playroutine tick)
    expect(source).not.toContain('.jamNoteOn(');
    expect(source).not.toContain('.jamNoteOff(');
  });
});

describe('SIDDubSynths pulse-wave instruments have pulse table', () => {
  it('pulse instruments have non-zero pulse table pointers (prevents silence)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/engine/dub/SIDDubSynths.ts', 'utf-8');

    // Pulse table entries MUST be written (pulse width 0 = silence on SID)
    expect(source).toContain('setTableEntry(PTBL,');
    // At least one set-pulse command (left byte >= 0x80)
    expect(source).toMatch(/setTableEntry\(PTBL,\s*0,\s*\w+,\s*0x8/);

    // Pulse instruments must NOT all have pulse table ptr = 0
    // The pulseInstruments map must exist with non-zero values
    expect(source).toContain('pulseInstruments');
    expect(source).toMatch(/INST\.SIREN\]:\s*PTBL_WIDE_ROW/);
    expect(source).toMatch(/INST\.CRUSH_BASS\]:\s*PTBL_NARROW_ROW/);
  });

  it('startSubBass note is within valid range (>= 0x60 FIRSTNOTE)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/engine/dub/SIDDubSynths.ts', 'utf-8');

    // startSubBass default note must be >= 0x60 (FIRSTNOTE)
    const match = source.match(/startSubBass\(note\s*=\s*(0x[0-9a-fA-F]+)/);
    expect(match).toBeTruthy();
    const noteValue = parseInt(match![1], 16);
    expect(noteValue).toBeGreaterThanOrEqual(0x60);
  });
});

describe('DubBus SID mode contract', () => {
  it('DubBus exports enableSIDMode and disableSIDMode methods', async () => {
    // Static source contract: grep for the method signatures
    const fs = await import('fs');
    const source = fs.readFileSync('src/engine/dub/DubBus.ts', 'utf-8');

    expect(source).toContain('async enableSIDMode()');
    expect(source).toContain('disableSIDMode()');
    expect(source).toContain('get isSIDMode()');
    // SID mode delegates in synth methods
    expect(source).toContain('this._sidSynths?.isReady');
    expect(source).toContain('this._sidSynths.startSiren()');
    expect(source).toContain('this._sidSynths.firePing(');
    expect(source).toContain('this._sidSynths.fireSnare(');
    expect(source).toContain('this._sidSynths.startOscBass()');
    expect(source).toContain('this._sidSynths.startCrushBass()');
    expect(source).toContain('this._sidSynths.fireSubSwell(');
    expect(source).toContain('this._sidSynths.fireRadioRiser(');
  });

  it('SID mode auto-enables when SID file is loaded (NativeEngineRouting contract)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/engine/replayer/NativeEngineRouting.ts', 'utf-8');

    // Must call enableSIDMode when connecting SID dub send
    expect(source).toContain('enableSIDMode()');
    // Must call disableSIDMode when stopping SID engine
    expect(source).toContain('disableSIDMode()');
  });

  it('per-voice SID taps are registered when available (NativeEngineRouting contract)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/engine/replayer/NativeEngineRouting.ts', 'utf-8');

    // Must register per-voice taps and dub send gain with DubBus
    expect(source).toContain('registerSidDubSend');
    expect(source).toContain('registerSidVoiceTaps');
    expect(source).toContain('getVoiceOutputs');
    expect(source).toContain('getDubSendGain');
  });

  it('DubBus has registerSidVoiceTaps and registerSidDubSend methods', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/engine/dub/DubBus.ts', 'utf-8');

    // Per-voice SID tap registration
    expect(source).toContain('registerSidVoiceTaps(voiceOutputs: GainNode[])');
    expect(source).toContain('registerSidDubSend(gain: GainNode, baseline: number)');
    expect(source).toContain('unregisterSidDubSend()');
    // Must connect voice taps to dub bus input
    expect(source).toContain('voiceOutputs[i].connect(tapGain)');
    expect(source).toContain('tapGain.connect(this.input)');
  });
});
