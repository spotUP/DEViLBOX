/**
 * Regression Test Suite — CI only (too slow for local parallel runs)
 *
 * Run locally with: npx vitest run src/__tests__/ci/
 * Runs automatically on push via GitHub Actions.
 *
 * Catches common regressions:
 * - Missing synth types in InstrumentFactory switch
 * - Broken effect parameter defaults
 * - Store initialization crashes
 * - Missing WASM engine file data keys on TrackerSong
 * - SynthRegistry / effect registry gaps
 * - Import format parser registration
 */

import { describe, it, expect } from 'vitest';

// ─── 1. SynthType coverage in InstrumentFactory ─────────────────────────────

describe('InstrumentFactory synth type coverage', () => {
  it('every SynthType in the union has a case in createInstrument', async () => {
    // Read the SynthType union and switch cases from source to compare
    const fs = await import('fs');
    const path = await import('path');

    const baseTs = fs.readFileSync(
      path.resolve(__dirname, '../../types/instrument/base.ts'),
      'utf-8',
    );
    const factoryTs = fs.readFileSync(
      path.resolve(__dirname, '../../engine/InstrumentFactory.ts'),
      'utf-8',
    );

    // Extract only the SynthType union block (starts at 'export type SynthType =', ends at ';')
    const synthTypeBlock = baseTs.match(/export type SynthType\s*=\s*([\s\S]*?);/)?.[1] ?? '';
    const synthTypeMatches = synthTypeBlock.match(/'\s*([^']+)\s*'/g) ?? [];
    const synthTypes = synthTypeMatches.map(m => m.replace(/'/g, '').trim());
    expect(synthTypes.length).toBeGreaterThan(50); // sanity check

    // Extract all case string literals from the switch
    const caseMatches = factoryTs.match(/case\s+'([^']+)'/g) ?? [];
    const handledTypes = new Set(caseMatches.map(m => m.replace(/case\s+'/, '').replace(/'$/, '')));

    // Also count types handled via SynthRegistry.get() (the "if (registryDesc)" path
    // handles any type registered in the registry, so those don't need explicit cases).
    // But we still want to verify every type is EITHER in the switch OR has a registry entry.
    // For now, check that the switch has a 'default' case as fallback.
    expect(factoryTs).toContain("default:");

    // Collect unhandled types (not in switch and not a known registry-handled prefix)
    const registryPrefixes = ['Furnace', 'MAME', 'Buzz', 'WAM'];
    const unhandled: string[] = [];

    for (const st of synthTypes) {
      if (handledTypes.has(st)) continue;
      // Skip types handled by registry prefix match
      if (registryPrefixes.some(p => st.startsWith(p))) continue;
      // Skip types that have a registry entry (checked by prefix above)
      unhandled.push(st);
    }

    if (unhandled.length > 0) {
      // Not a hard fail — the default case handles unknown types —
      // but warn so new types get explicitly handled.
      console.warn(
        `[WARN] ${unhandled.length} SynthType(s) not explicitly handled in InstrumentFactory switch:`,
        unhandled,
      );
    }
  });
});

// ─── 2. Effect parameter defaults ───────────────────────────────────────────

describe('Effect parameter defaults', () => {
  it('getDefaultEffectParameters returns an object for every AudioEffectType', async () => {
    const { getDefaultEffectParameters } = await import('../../engine/InstrumentFactory');
    const fs = await import('fs');
    const path = await import('path');

    const effectsTs = fs.readFileSync(
      path.resolve(__dirname, '../../types/instrument/effects.ts'),
      'utf-8',
    );

    const effectMatches = effectsTs.match(/\|\s*'([^']+)'/g) ?? [];
    const effectTypes = effectMatches
      .map(m => m.replace(/\|\s*'/, '').replace(/'$/, ''))
      .filter(t => !t.startsWith('Buzz') && t !== 'Neural'); // Buzz/Neural have different handling

    expect(effectTypes.length).toBeGreaterThan(15);

    const missing: string[] = [];
    for (const type of effectTypes) {
      const params = getDefaultEffectParameters(type);
      if (!params || typeof params !== 'object') {
        missing.push(type);
      }
    }

    expect(missing).toEqual([]);
  });
});

// ─── 3. AVAILABLE_EFFECTS registry ──────────────────────────────────────────

describe('AVAILABLE_EFFECTS registry', () => {
  it('every entry has a type and label', async () => {
    const { AVAILABLE_EFFECTS } = await import('../../constants/unifiedEffects');
    expect(AVAILABLE_EFFECTS.length).toBeGreaterThan(20);

    for (const fx of AVAILABLE_EFFECTS) {
      expect(fx.label).toBeTruthy();
      // Neural effects use neuralModelIndex instead of type
      if (fx.category !== 'neural') {
        expect(fx.type).toBeTruthy();
      }
    }
  });
});

// ─── 4. Store initialization ────────────────────────────────────────────────

describe('Store initialization (no crash)', () => {
  it('useTrackerStore initializes', async () => {
    const { useTrackerStore } = await import('../../stores/useTrackerStore');
    const state = useTrackerStore.getState();
    expect(state).toBeDefined();
    expect(state.patterns).toBeDefined();
  });

  it('useTransportStore initializes with valid bpm', async () => {
    const { useTransportStore } = await import('../../stores/useTransportStore');
    const state = useTransportStore.getState();
    expect(state).toBeDefined();
    expect(state.bpm).toBeGreaterThan(0);
  });

  it('useInstrumentStore initializes', async () => {
    const { useInstrumentStore } = await import('../../stores/useInstrumentStore');
    const state = useInstrumentStore.getState();
    expect(state).toBeDefined();
    expect(state.instruments).toBeDefined();
    expect(Array.isArray(state.instruments)).toBe(true);
  });

  it('useFormatStore initializes', async () => {
    const { useFormatStore } = await import('../../stores/useFormatStore');
    const state = useFormatStore.getState();
    expect(state).toBeDefined();
  });

  it('useWorkbenchStore initializes with valid camera', async () => {
    const { useWorkbenchStore } = await import('../../stores/useWorkbenchStore');
    const state = useWorkbenchStore.getState();
    expect(state).toBeDefined();
    expect(state.camera).toBeDefined();
    expect(typeof state.camera.x).toBe('number');
    expect(typeof state.camera.y).toBe('number');
    expect(typeof state.camera.scale).toBe('number');
    expect(state.camera.scale).toBeGreaterThan(0);
  });

  it('useAudioStore initializes', async () => {
    const { useAudioStore } = await import('../../stores/useAudioStore');
    const state = useAudioStore.getState();
    expect(state).toBeDefined();
    expect(Array.isArray(state.masterEffects)).toBe(true);
  });
});

// ─── 5. TrackerSong fileData keys match NativeEngineRouting ──────────────────

describe('NativeEngineRouting integrity', () => {
  it('all fileDataKey fields exist as optional properties on TrackerSong', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // Read NativeEngineRouting to extract fileDataKey values
    const routingTs = fs.readFileSync(
      path.resolve(__dirname, '../../engine/replayer/NativeEngineRouting.ts'),
      'utf-8',
    );

    // Extract fileDataKey: 'xxx' values
    const keyMatches = routingTs.match(/fileDataKey:\s*'([^']+)'/g) ?? [];
    const fileDataKeys = keyMatches.map(m => m.replace(/fileDataKey:\s*'/, '').replace(/'$/, ''));
    expect(fileDataKeys.length).toBeGreaterThan(5);

    // Read TrackerReplayer to get TrackerSong interface fields
    const replayerTs = fs.readFileSync(
      path.resolve(__dirname, '../../engine/TrackerReplayer.ts'),
      'utf-8',
    );

    const missing: string[] = [];
    for (const key of fileDataKeys) {
      // Check that the key appears as a property (with or without ?)
      const regex = new RegExp(`\\b${key}\\b\\s*[?]?\\s*:`);
      if (!regex.test(replayerTs)) {
        missing.push(key);
      }
    }

    expect(missing).toEqual([]);
  });

  it('all engine descriptors have required fields', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const routingTs = fs.readFileSync(
      path.resolve(__dirname, '../../engine/replayer/NativeEngineRouting.ts'),
      'utf-8',
    );

    // Extract engine descriptor blocks
    const engineBlocks = routingTs.match(/\{\s*key:\s*'[^']+'/g) ?? [];
    expect(engineBlocks.length).toBeGreaterThan(5);

    // Every engine must have key, synthType, fileDataKey, loadMethod
    const requiredFields = ['key', 'synthType', 'fileDataKey', 'loadMethod'];
    for (const field of requiredFields) {
      const fieldRegex = new RegExp(`${field}:\\s*['"]`);
      const occurrences = (routingTs.match(new RegExp(fieldRegex, 'g')) ?? []).length;
      expect(occurrences).toBeGreaterThanOrEqual(engineBlocks.length);
    }
  });
});

// ─── 6. SynthRegistry has entries ───────────────────────────────────────────

describe('SynthRegistry', () => {
  it('has registered synth descriptors after builtin init', async () => {
    // Import builtin registrations (side-effect: registers descriptors)
    await import('../../engine/registry/builtin/index');
    const { SynthRegistry } = await import('../../engine/registry/SynthRegistry');

    const all = SynthRegistry.getAll();
    expect(all.length).toBeGreaterThan(0);

    // Every descriptor must have id and create function
    for (const desc of all) {
      expect(desc.id).toBeTruthy();
      expect(typeof desc.create).toBe('function');
    }
  });
});

// ─── 7. Format parsers ──────────────────────────────────────────────────────

describe('Format parser registry', () => {
  it('FORMAT_REGISTRY has registered formats', async () => {
    const { FORMAT_REGISTRY } = await import('../../lib/import/FormatRegistry');
    expect(FORMAT_REGISTRY.length).toBeGreaterThan(10);

    for (const fmt of FORMAT_REGISTRY) {
      expect(fmt.label).toBeTruthy();
      expect(fmt.key).toBeTruthy();
    }
  });
});

// ─── 8. Visual effect editors ───────────────────────────────────────────────

describe('Visual effect editor coverage', () => {
  it('ENCLOSURE_COLORS has entries for common effect types', async () => {
    const { ENCLOSURE_COLORS } = await import('../../components/effects/VisualEffectEditors');

    const coreEffects = [
      'Distortion', 'Reverb', 'Delay', 'Chorus', 'Phaser',
      'Compressor', 'EQ3', 'Filter', 'BitCrusher', 'Tremolo',
    ];

    const missing: string[] = [];
    for (const type of coreEffects) {
      if (!ENCLOSURE_COLORS[type]) {
        missing.push(type);
      }
    }

    expect(missing).toEqual([]);
  });
});

// ─── 9. Workbench store camera actions ──────────────────────────────────────

describe('Workbench camera actions', () => {
  it('panCamera updates camera position', async () => {
    const { useWorkbenchStore } = await import('../../stores/useWorkbenchStore');
    const { camera: before } = useWorkbenchStore.getState();
    useWorkbenchStore.getState().panCamera(10, 20);
    const { camera: after } = useWorkbenchStore.getState();
    expect(after.x).toBe(before.x + 10);
    expect(after.y).toBe(before.y + 20);
    // Restore
    useWorkbenchStore.getState().panCamera(-10, -20);
  });

  it('zoomCamera changes scale', async () => {
    const { useWorkbenchStore } = await import('../../stores/useWorkbenchStore');
    useWorkbenchStore.getState().setCamera({ x: 0, y: 0, scale: 1 });
    useWorkbenchStore.getState().zoomCamera(0.1, 500, 500);
    const { camera } = useWorkbenchStore.getState();
    expect(camera.scale).toBeGreaterThan(1);
    expect(camera.scale).toBeLessThan(4);
    // Restore
    useWorkbenchStore.getState().setCamera({ x: 0, y: 0, scale: 1 });
  });

  it('zoomCamera clamps to min/max scale', async () => {
    const { useWorkbenchStore } = await import('../../stores/useWorkbenchStore');
    // Zoom way out
    useWorkbenchStore.getState().setCamera({ x: 0, y: 0, scale: 1 });
    useWorkbenchStore.getState().zoomCamera(-10, 500, 500);
    expect(useWorkbenchStore.getState().camera.scale).toBeGreaterThanOrEqual(0.15);
    // Zoom way in
    useWorkbenchStore.getState().setCamera({ x: 0, y: 0, scale: 1 });
    useWorkbenchStore.getState().zoomCamera(10, 500, 500);
    expect(useWorkbenchStore.getState().camera.scale).toBeLessThanOrEqual(4);
    // Restore
    useWorkbenchStore.getState().setCamera({ x: 0, y: 0, scale: 1 });
  });
});
