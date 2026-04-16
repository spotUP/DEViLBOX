/**
 * DJ Environment — snapshot/restore the full DJ setup.
 *
 * Reads from useDJStore, useAudioStore, useDrumPadStore to capture all
 * DJ-relevant settings. Restores them when loading a playlist or importing
 * a standalone .djenv.json file.
 */

import { useDJStore } from '@/stores/useDJStore';
import { useAudioStore } from '@/stores/useAudioStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import type {
  DJEnvironment,
  SerializableDrumPad,
  SerializableDrumProgram,
} from '@/types/djEnvironment';
import { DJ_ENV_VERSION } from '@/types/djEnvironment';
import type { DrumPad, DrumProgram } from '@/types/drumpad';

// ── Serialization helpers ────────────────────────────────────────────────────

/** Strip AudioBuffer fields from a DrumPad for JSON serialization */
function serializePad(pad: DrumPad): SerializableDrumPad {
  const { sample, layers, ...rest } = pad;
  return {
    ...rest,
    sampleName: sample?.name ?? null,
    sampleSourceUrl: sample?.sourceUrl ?? null,
    layerNames: (layers ?? []).map((l) => l.sample?.name ?? ''),
    layerSourceUrls: (layers ?? []).map((l) => l.sample?.sourceUrl ?? ''),
  };
}

/** Strip AudioBuffer fields from a DrumProgram */
function serializeProgram(prog: DrumProgram): SerializableDrumProgram {
  return {
    id: prog.id,
    name: prog.name,
    pads: prog.pads.map(serializePad),
    masterLevel: prog.masterLevel,
    masterTune: prog.masterTune,
    mpcResample: prog.mpcResample,
  };
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

/** Capture the current DJ environment from all stores */
export function snapshotDJEnvironment(): DJEnvironment {
  const dj = useDJStore.getState();
  const audio = useAudioStore.getState();
  const drum = useDrumPadStore.getState();

  // Serialize drumpad programs (Map → Record, strip AudioBuffers)
  const programs: Record<string, SerializableDrumProgram> = {};
  drum.programs.forEach((prog, id) => {
    programs[id] = serializeProgram(prog);
  });

  return {
    version: DJ_ENV_VERSION,

    // DJ Store
    crossfaderCurve: dj.crossfaderCurve,
    hamsterSwitch: dj.hamsterSwitch,
    masterVolume: dj.masterVolume,
    boothVolume: dj.boothVolume,
    sessionMonitorVolume: dj.sessionMonitorVolume,
    cueMix: dj.cueMix,
    cueVolume: dj.cueVolume,
    jogWheelSensitivity: dj.jogWheelSensitivity,
    deckViewMode: dj.deckViewMode,
    thirdDeckActive: dj.thirdDeckActive,

    // Auto DJ
    autoDJTransitionBars: dj.autoDJTransitionBars,
    autoDJShuffle: dj.autoDJShuffle,
    autoDJWithFilter: dj.autoDJWithFilter,

    // Master effects
    masterEffects: JSON.parse(JSON.stringify(audio.masterEffects)),

    // Drumpad
    drumpad: {
      currentProgramId: drum.currentProgramId,
      programs,
      midiMappings: JSON.parse(JSON.stringify(drum.midiMappings)),
      preferences: JSON.parse(JSON.stringify(drum.preferences)),
      busLevels: { ...drum.busLevels },
      noteRepeatEnabled: drum.noteRepeatEnabled,
      noteRepeatRate: drum.noteRepeatRate,
      currentBank: drum.currentBank,
    },
  };
}

// ── Restore ──────────────────────────────────────────────────────────────────

/** Restore a DJ environment snapshot to all stores */
export function restoreDJEnvironment(env: DJEnvironment): void {
  if (!env || typeof env !== 'object') return;

  const djStore = useDJStore.getState();
  const audioStore = useAudioStore.getState();

  // ── DJ Store settings ──────────────────────────────────────────────
  if (env.crossfaderCurve) djStore.setCrossfaderCurve(env.crossfaderCurve);
  if (env.hamsterSwitch !== undefined) djStore.setHamsterSwitch(env.hamsterSwitch);
  if (env.masterVolume !== undefined) djStore.setMasterVolume(env.masterVolume);
  if (env.boothVolume !== undefined) djStore.setBoothVolume(env.boothVolume);
  if (env.sessionMonitorVolume !== undefined) djStore.setSessionMonitorVolume(env.sessionMonitorVolume);
  if (env.cueMix !== undefined) djStore.setCueMix(env.cueMix);
  if (env.cueVolume !== undefined) djStore.setCueVolume(env.cueVolume);
  if (env.jogWheelSensitivity !== undefined) djStore.setJogWheelSensitivity(env.jogWheelSensitivity);
  if (env.deckViewMode) djStore.setDeckViewMode(env.deckViewMode);
  if (env.thirdDeckActive !== undefined) djStore.setThirdDeckActive(env.thirdDeckActive);

  // Auto DJ config
  djStore.setAutoDJConfig({
    transitionBars: env.autoDJTransitionBars,
    shuffle: env.autoDJShuffle,
    withFilter: env.autoDJWithFilter,
  });

  // ── Master effects ─────────────────────────────────────────────────
  if (Array.isArray(env.masterEffects)) {
    audioStore.setMasterEffects(env.masterEffects);
  }

  // ── Drumpad ────────────────────────────────────────────────────────
  if (env.drumpad) {
    restoreDrumpadEnvironment(env.drumpad);
  }
}

/** Restore drumpad config — re-fetches built-in samples from sourceUrl */
function restoreDrumpadEnvironment(drumEnv: DJEnvironment['drumpad']): void {
  const store = useDrumPadStore.getState();

  // Restore programs — merge pad configs onto existing pads
  if (drumEnv.programs) {
    const currentPrograms = store.programs;
    for (const [id, savedProg] of Object.entries(drumEnv.programs)) {
      const existing = currentPrograms.get(id);
      if (existing) {
        // Merge pad configs onto existing pads, preserving existing audio data initially
        const mergedPads = existing.pads.map((existingPad, i) => {
          const savedPad = savedProg.pads[i];
          if (!savedPad) return existingPad;
          const { sampleName, sampleSourceUrl, layerNames, layerSourceUrls, ...padConfig } = savedPad;
          return {
            ...existingPad,
            ...padConfig,
            // Keep existing audio data (may be replaced by async re-fetch below)
            sample: existingPad.sample,
            layers: existingPad.layers,
          };
        });
        store.saveProgram({
          ...existing,
          name: savedProg.name,
          masterLevel: savedProg.masterLevel,
          masterTune: savedProg.masterTune,
          mpcResample: savedProg.mpcResample,
          pads: mergedPads,
        });

        // Async: re-fetch built-in samples for pads that have a sourceUrl
        reloadBuiltInSamples(savedProg.pads);
      }
    }
  }

  // Restore other drumpad settings
  if (drumEnv.currentProgramId) store.loadProgram(drumEnv.currentProgramId);
  if (drumEnv.midiMappings) {
    for (const [padId, mapping] of Object.entries(drumEnv.midiMappings)) {
      store.setMIDIMapping(padId, mapping);
    }
  }
  if (drumEnv.preferences) {
    for (const [key, value] of Object.entries(drumEnv.preferences)) {
      store.setPreference(key as keyof typeof drumEnv.preferences, value as never);
    }
  }
  if (drumEnv.busLevels) {
    for (const [bus, level] of Object.entries(drumEnv.busLevels)) {
      store.setBusLevel(bus, level);
    }
  }
  if (drumEnv.noteRepeatEnabled !== undefined) store.setNoteRepeatEnabled(drumEnv.noteRepeatEnabled);
  if (drumEnv.noteRepeatRate !== undefined) store.setNoteRepeatRate(drumEnv.noteRepeatRate);
  if (drumEnv.currentBank) store.setBank(drumEnv.currentBank);
}

/** Check if a URL points to a built-in sample (served from /data/samples/) */
function isBuiltInSampleUrl(url: string): boolean {
  return url.startsWith('/data/samples/') || url.startsWith('data/samples/');
}

/** Re-fetch built-in samples for pads and load them via the store */
async function reloadBuiltInSamples(savedPads: SerializableDrumPad[]): Promise<void> {
  // Dynamically import to get normalizeUrl and audio context
  const [{ normalizeUrl }, { getAudioContext }] = await Promise.all([
    import('@/utils/urlUtils'),
    import('@/audio/AudioContextSingleton'),
  ]);
  const store = useDrumPadStore.getState();
  const audioContext = getAudioContext();

  for (const savedPad of savedPads) {
    if (savedPad.sampleSourceUrl && isBuiltInSampleUrl(savedPad.sampleSourceUrl)) {
      // Check if the pad already has the right sample loaded
      const currentPad = store.programs.get(store.currentProgramId)?.pads.find(p => p.id === savedPad.id);
      if (currentPad?.sample?.sourceUrl === savedPad.sampleSourceUrl) continue;

      try {
        const resp = await fetch(normalizeUrl(savedPad.sampleSourceUrl));
        if (!resp.ok) continue;
        const arrayBuffer = await resp.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        await store.loadSampleToPad(savedPad.id, {
          id: `env_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: savedPad.sampleName || savedPad.name,
          audioBuffer,
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
          sourceUrl: savedPad.sampleSourceUrl,
        });
      } catch (err) {
        console.warn(`[DJEnvironment] Failed to reload sample for pad ${savedPad.id}:`, err);
      }
    }
  }
}

// ── Standalone export/import ─────────────────────────────────────────────────

/** Export the current DJ environment as a JSON string */
export function exportDJEnvironmentJSON(): string {
  return JSON.stringify(snapshotDJEnvironment(), null, 2);
}

/** Parse and validate a DJ environment JSON string */
export function parseDJEnvironmentJSON(json: string): DJEnvironment {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !parsed.version) {
    throw new Error('Invalid DJ environment file — missing version field');
  }
  if (parsed.version > DJ_ENV_VERSION) {
    console.warn(`[DJEnvironment] File version ${parsed.version} is newer than supported ${DJ_ENV_VERSION}, some settings may be ignored`);
  }
  return parsed as DJEnvironment;
}
