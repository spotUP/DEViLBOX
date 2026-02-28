/**
 * SunVoxSynth unit tests
 *
 * All Web Audio API and SunVoxEngine interactions are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────

/** Minimal mock GainNode */
function makeMockGainNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
    numberOfOutputs: 1,
  };
}

const mockEngineOutput = makeMockGainNode();

const mockEngine = {
  output: mockEngineOutput,
  ready: vi.fn().mockResolvedValue(undefined),
  createHandle: vi.fn().mockResolvedValue(42),
  destroyHandle: vi.fn(),
  loadSynth: vi.fn().mockResolvedValue(7),
  loadSong: vi.fn().mockResolvedValue(undefined),
  saveSong: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  saveSynth: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
  getControls: vi.fn().mockResolvedValue([
    { name: 'Volume', min: 0, max: 255, value: 128 },
    { name: 'Waveform', min: 0, max: 5, value: 0 },
  ]),
  getModules: vi.fn().mockResolvedValue([{ id: 7, name: 'Generator' }]),
  sendMessage: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
};

vi.mock('@/engine/sunvox/SunVoxEngine', () => ({
  SunVoxEngine: {
    getInstance: vi.fn(() => mockEngine),
  },
}));

const mockGainNode = makeMockGainNode();
const mockAudioContext = {
  createGain: vi.fn(() => mockGainNode),
  sampleRate: 44100,
};

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: vi.fn(() => mockAudioContext),
  noteToMidi: (note: string | number): number => {
    if (typeof note === 'number') return Math.max(0, Math.min(127, note));
    // Simple lookup for test notes
    const map: Record<string, number> = {
      'C4': 60, 'D4': 62, 'E4': 64, 'F4': 65,
      'G4': 67, 'A4': 69, 'B4': 71, 'C5': 72,
    };
    return map[note] ?? 60;
  },
}));

// ── Import under test (after mocks are set up) ───────────────────────────

import { SunVoxSynth } from '../SunVoxSynth';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Reset all mocks and the static _engineConnected flag between tests */
function resetAll() {
  vi.clearAllMocks();
  // Reset static singleton flag so each test starts fresh
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (SunVoxSynth as any)._engineConnected = false;

  // Re-apply default mock implementations after clearAllMocks
  mockEngine.ready.mockResolvedValue(undefined);
  mockEngine.createHandle.mockResolvedValue(42);
  mockEngine.loadSynth.mockResolvedValue(7);
  mockEngine.loadSong.mockResolvedValue(undefined);
  mockEngine.saveSong.mockResolvedValue(new ArrayBuffer(8));
  mockEngine.saveSynth.mockResolvedValue(new ArrayBuffer(4));
  mockEngine.getControls.mockResolvedValue([
    { name: 'Volume', min: 0, max: 255, value: 128 },
    { name: 'Waveform', min: 0, max: 5, value: 0 },
  ]);
  mockAudioContext.createGain.mockReturnValue(makeMockGainNode());
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('SunVoxSynth', () => {
  beforeEach(() => {
    resetAll();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates a GainNode output via the AudioContext', () => {
      const synth = new SunVoxSynth();
      expect(mockAudioContext.createGain).toHaveBeenCalledOnce();
      expect(synth.output).toBeDefined();
      synth.dispose();
    });

    it('connects engine.output to the GainNode on first instance', () => {
      const synth = new SunVoxSynth();
      expect(mockEngine.output.connect).toHaveBeenCalledWith(synth.output);
      synth.dispose();
    });

    it('does NOT double-connect engine.output for a second instance', () => {
      const synth1 = new SunVoxSynth();
      const connectCallsAfterFirst = (mockEngine.output.connect as Mock).mock.calls.length;

      const synth2 = new SunVoxSynth();
      const connectCallsAfterSecond = (mockEngine.output.connect as Mock).mock.calls.length;

      // Second instance must not add another connect call
      expect(connectCallsAfterSecond).toBe(connectCallsAfterFirst);

      synth1.dispose();
      synth2.dispose();
    });

    it('has the correct name', () => {
      const synth = new SunVoxSynth();
      expect(synth.name).toBe('SunVoxSynth');
      synth.dispose();
    });
  });

  // ── 2. setModule ──────────────────────────────────────────────────────

  describe('setModule', () => {
    it('waits for engine ready before proceeding', async () => {
      const synth = new SunVoxSynth();
      const data = new ArrayBuffer(64);
      await synth.setModule(data);
      expect(mockEngine.ready).toHaveBeenCalledOnce();
      synth.dispose();
    });

    it('creates a handle with the AudioContext sample rate', async () => {
      const synth = new SunVoxSynth();
      const data = new ArrayBuffer(64);
      await synth.setModule(data);
      expect(mockEngine.createHandle).toHaveBeenCalledWith(44100);
      synth.dispose();
    });

    it('calls loadSynth with the handle and data buffer', async () => {
      const synth = new SunVoxSynth();
      const data = new ArrayBuffer(64);
      await synth.setModule(data);
      expect(mockEngine.loadSynth).toHaveBeenCalledWith(42, data);
      synth.dispose();
    });

    it('stores the moduleId returned by loadSynth', async () => {
      mockEngine.loadSynth.mockResolvedValue(99);
      const synth = new SunVoxSynth();
      const data = new ArrayBuffer(64);
      await synth.setModule(data);

      // Trigger a note — only works if moduleId was stored correctly
      synth.triggerAttack('C4', undefined, 1);
      const noteOnCall = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOn'
      );
      expect(noteOnCall?.[0].moduleId).toBe(99);
      synth.dispose();
    });

    it('reuses the existing handle on a second setModule call', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      await synth.setModule(new ArrayBuffer(4));
      // createHandle should only have been called once
      expect(mockEngine.createHandle).toHaveBeenCalledOnce();
      synth.dispose();
    });
  });

  // ── 3. triggerAttack ─────────────────────────────────────────────────

  describe('triggerAttack', () => {
    it('sends noteOn with the correct MIDI note for a string note name', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.triggerAttack('C4', undefined, 1);

      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOn'
      )?.[0];
      expect(msg).toBeDefined();
      expect(msg.note).toBe(60); // C4 = MIDI 60
      synth.dispose();
    });

    it('sends noteOn with a numeric note directly', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.triggerAttack(72, undefined, 0.5);

      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOn'
      )?.[0];
      expect(msg?.note).toBe(72);
      synth.dispose();
    });

    it('defaults to MIDI 60 (C4) when no note is provided', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.triggerAttack();

      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOn'
      )?.[0];
      expect(msg?.note).toBe(60);
      synth.dispose();
    });

    it('converts velocity 0-1 to SunVox range 1-128', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      // velocity 1.0 → Math.round(1 * 127) + 1 = 128
      synth.triggerAttack('C4', undefined, 1.0);
      const full = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOn'
      )?.[0];
      expect(full?.vel).toBe(128);

      vi.clearAllMocks();

      // velocity 0.0 → Math.round(0 * 127) + 1 = 1
      synth.triggerAttack('C4', undefined, 0.0);
      const zero = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOn'
      )?.[0];
      expect(zero?.vel).toBe(1);

      synth.dispose();
    });

    it('clamps velocity to 1-128 range', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.triggerAttack('C4', undefined, 2.0); // above 1
      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOn'
      )?.[0];
      expect(msg?.vel).toBeLessThanOrEqual(128);
      expect(msg?.vel).toBeGreaterThanOrEqual(1);
      synth.dispose();
    });

    it('calls engine.play in song mode (no module loaded)', () => {
      // In song mode, setSong was called but moduleId stays -1
      // We simulate this by setting _handle manually
      const synth = new SunVoxSynth();
      // Manually set handle to simulate post-setSong state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (synth as any)._handle = 42;
      // _moduleId stays -1 (song mode)

      synth.triggerAttack();
      expect(mockEngine.play).toHaveBeenCalledWith(42);
      synth.dispose();
    });

    it('does nothing when disposed', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      synth.dispose();
      vi.clearAllMocks();

      synth.triggerAttack('C4');
      expect(mockEngine.sendMessage).not.toHaveBeenCalled();
    });
  });

  // ── 4. triggerRelease ─────────────────────────────────────────────────

  describe('triggerRelease', () => {
    it('sends noteOff with handle and moduleId', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.triggerRelease();

      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOff'
      )?.[0];
      expect(msg).toBeDefined();
      expect(msg.handle).toBe(42);
      expect(msg.moduleId).toBe(7);
      synth.dispose();
    });

    it('calls engine.stop in song mode (no module)', () => {
      const synth = new SunVoxSynth();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (synth as any)._handle = 42;
      // _moduleId stays -1

      synth.triggerRelease();
      expect(mockEngine.stop).toHaveBeenCalledWith(42);
      synth.dispose();
    });

    it('does nothing when disposed', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      synth.dispose();
      vi.clearAllMocks();

      synth.triggerRelease();
      expect(mockEngine.sendMessage).not.toHaveBeenCalled();
    });
  });

  // ── 5. releaseAll ────────────────────────────────────────────────────

  describe('releaseAll', () => {
    it('delegates to triggerRelease', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.releaseAll();

      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'noteOff'
      )?.[0];
      expect(msg).toBeDefined();
      synth.dispose();
    });
  });

  // ── 6. set / get ─────────────────────────────────────────────────────

  describe('set(param, value)', () => {
    it('sends setControl with the parsed ctlId and value', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.set('3', 200);

      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'setControl'
      )?.[0];
      expect(msg).toBeDefined();
      expect(msg.handle).toBe(42);
      expect(msg.moduleId).toBe(7);
      expect(msg.ctlId).toBe(3);
      expect(msg.value).toBe(200);
      synth.dispose();
    });

    it('stores the value so get() can retrieve it', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.set('5', 100);
      expect(synth.get('5')).toBe(100);
      synth.dispose();
    });

    it('ignores non-numeric param strings', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      synth.set('volume', 128); // 'volume' is NaN when parsed as int
      const msg = (mockEngine.sendMessage as Mock).mock.calls.find(
        (c) => c[0].type === 'setControl'
      );
      expect(msg).toBeUndefined();
      synth.dispose();
    });

    it('does nothing when disposed', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      synth.dispose();
      vi.clearAllMocks();

      synth.set('0', 255);
      expect(mockEngine.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('get(param)', () => {
    it('returns undefined for a param that has never been set', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      expect(synth.get('99')).toBeUndefined();
      synth.dispose();
    });

    it('returns the value for a param that was set', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      synth.set('2', 42);
      expect(synth.get('2')).toBe(42);
      synth.dispose();
    });
  });

  // ── 7. getControls ───────────────────────────────────────────────────

  describe('getControls', () => {
    it('returns SunVoxControl array from the engine', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));

      const controls = await synth.getControls();
      expect(controls).toHaveLength(2);
      expect(controls[0].name).toBe('Volume');
      expect(controls[1].name).toBe('Waveform');
      expect(mockEngine.getControls).toHaveBeenCalledWith(42, 7);
      synth.dispose();
    });

    it('returns an empty array when no module is loaded', async () => {
      const synth = new SunVoxSynth();
      const controls = await synth.getControls();
      expect(controls).toEqual([]);
      synth.dispose();
    });
  });

  // ── 8. dispose ───────────────────────────────────────────────────────

  describe('dispose', () => {
    it('calls destroyHandle with the engine handle', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      synth.dispose();
      expect(mockEngine.destroyHandle).toHaveBeenCalledWith(42);
    });

    it('disconnects engine.output from this.output when it owns the connection', () => {
      const synth = new SunVoxSynth();
      const outputNode = synth.output;
      synth.dispose();
      expect(mockEngine.output.disconnect).toHaveBeenCalledWith(outputNode);
    });

    it('resets the static _engineConnected flag so next instance can connect', () => {
      const synth1 = new SunVoxSynth();
      synth1.dispose();

      // Now _engineConnected should be false → next instance connects
      const connectBefore = (mockEngine.output.connect as Mock).mock.calls.length;
      const synth2 = new SunVoxSynth();
      const connectAfter = (mockEngine.output.connect as Mock).mock.calls.length;
      expect(connectAfter).toBe(connectBefore + 1);
      synth2.dispose();
    });

    it('is idempotent — calling dispose twice does not throw', async () => {
      const synth = new SunVoxSynth();
      await synth.setModule(new ArrayBuffer(4));
      synth.dispose();
      expect(() => synth.dispose()).not.toThrow();
    });

    it('does not call destroyHandle when no handle was created', () => {
      const synth = new SunVoxSynth();
      synth.dispose();
      expect(mockEngine.destroyHandle).not.toHaveBeenCalled();
    });
  });

  // ── 9. getEngine ─────────────────────────────────────────────────────

  describe('getEngine', () => {
    it('returns the SunVoxEngine singleton', () => {
      const synth = new SunVoxSynth();
      expect(synth.getEngine()).toBe(mockEngine);
      synth.dispose();
    });
  });
});
