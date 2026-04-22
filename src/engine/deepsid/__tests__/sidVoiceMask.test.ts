/**
 * Regression test: SID per-voice mute/solo
 *
 * Bug: JSSIDEngine.setVoiceMask() ignored the voice parameter — it called
 * enableVoices(0) or enableVoices(0x1FF), muting/unmuting ALL voices at once.
 * Muting voice 2 would mute everything because the last call wins.
 *
 * Fix: Track a voiceMask bitmask per-engine, flip individual bits, pass
 * the combined mask to enableVoices().
 *
 * Same bug existed in ScriptNodePlayerEngine (stub — never forwarded to adapter).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── JSSIDEngine voice mask ────────────────────────────────────────────
describe('JSSIDEngine per-voice muting', () => {
  let engine: any;
  let enableVoicesCalls: number[];

  beforeEach(async () => {
    enableVoicesCalls = [];

    // Stub jsSID global (loaded via script tag normally)
    const fakeJsSID = {
      enableVoices: (mask: number) => enableVoicesCalls.push(mask),
      loadSidFile: vi.fn(),
      playSID: vi.fn(),
      stopSID: vi.fn(),
      setSpeedMultiplier: vi.fn(),
    };
    (globalThis as any).jsSID = fakeJsSID;

    // Import fresh each time to get clean state
    const mod = await import('../engines/JSSIDEngine');
    engine = new mod.JSSIDEngine(new Uint8Array(128));
    // Directly inject the jsSID instance (normally set during init)
    (engine as any).jsSID = fakeJsSID;
  });

  it('muting voice 2 only clears bit 2, leaves voices 0+1 enabled', () => {
    engine.setVoiceMask(2, true); // mute voice 2
    const lastMask = enableVoicesCalls[enableVoicesCalls.length - 1];
    // bit 0 and bit 1 should still be set, bit 2 cleared
    expect(lastMask & 0x07).toBe(0b011); // voices 0+1 on, voice 2 off
  });

  it('muting voice 0 only clears bit 0', () => {
    engine.setVoiceMask(0, true);
    const lastMask = enableVoicesCalls[enableVoicesCalls.length - 1];
    expect(lastMask & 0x07).toBe(0b110); // voices 1+2 on, voice 0 off
  });

  it('muting voice 1 then unmuting restores all', () => {
    engine.setVoiceMask(1, true);  // mute voice 1
    engine.setVoiceMask(1, false); // unmute voice 1
    const lastMask = enableVoicesCalls[enableVoicesCalls.length - 1];
    expect(lastMask & 0x07).toBe(0b111); // all on
  });

  it('muting voices 0 and 2 solos voice 1', () => {
    engine.setVoiceMask(0, true);
    engine.setVoiceMask(2, true);
    const lastMask = enableVoicesCalls[enableVoicesCalls.length - 1];
    expect(lastMask & 0x07).toBe(0b010); // only voice 1 on
  });

  it('sequential mute calls are cumulative (not last-call-wins)', () => {
    // This was the exact bug: each call replaced the entire mask
    engine.setVoiceMask(0, false); // unmute voice 0 (already on)
    engine.setVoiceMask(1, false); // unmute voice 1 (already on)
    engine.setVoiceMask(2, true);  // mute voice 2
    const lastMask = enableVoicesCalls[enableVoicesCalls.length - 1];
    // Before fix: enableVoices(0) — all muted (BUG)
    // After fix: enableVoices(0b110...011) — only voice 2 muted
    expect(lastMask & 0x07).toBe(0b011);
  });
});

// ── ScriptNodePlayerEngine voice mask ─────────────────────────────────
describe('ScriptNodePlayerEngine per-voice muting', () => {
  let engine: any;
  let enableVoicesCalls: number[];

  beforeEach(async () => {
    enableVoicesCalls = [];

    const mod = await import('../engines/ScriptNodePlayerEngine');
    engine = new mod.ScriptNodePlayerEngine(new Uint8Array(128), 'tinyrsid');
    // Inject a fake adapter with enableVoices
    (engine as any).adapter = {
      enableVoices: (mask: number) => enableVoicesCalls.push(mask),
    };
  });

  it('forwards per-voice mute to adapter.enableVoices with correct mask', () => {
    engine.setVoiceMask(1, true); // mute voice 1
    const lastMask = enableVoicesCalls[enableVoicesCalls.length - 1];
    expect(lastMask & 0x07).toBe(0b101); // voices 0+2 on, voice 1 off
  });

  it('accumulates mutes correctly', () => {
    engine.setVoiceMask(0, true); // mute 0
    engine.setVoiceMask(2, true); // mute 2
    const lastMask = enableVoicesCalls[enableVoicesCalls.length - 1];
    expect(lastMask & 0x07).toBe(0b010); // solo voice 1
  });

  it('does not crash when adapter lacks enableVoices (websid/websidplay)', () => {
    (engine as any).adapter = {}; // no enableVoices
    expect(() => engine.setVoiceMask(0, true)).not.toThrow();
  });
});
