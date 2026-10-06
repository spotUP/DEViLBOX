/**
 * snapshotSong - THE reader of "the current song".
 *
 * Autosave / crash recovery / revisions (buildSavedProject), the .dbx download
 * (exportSong) and song tabs all read the stores through this; they used to
 * build their own snapshots, and wrote different fields - the .dbx export
 * dropped the groove when saved from the Export dialog, and a tab kept only
 * patterns, instruments, automation, metadata and BPM (2026-09-29 audit).
 * savedSongToApply reads it back; applySong applies it.
 */
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useAudioStore } from '@/stores/useAudioStore';
import { useEditorStore } from '@/stores/useEditorStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useDrumPadStore } from '@stores/useDrumPadStore';
import { useDubStore } from '@stores/useDubStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getPerformanceJournal } from '@/engine/dub/performanceJournalBridge';
import {
  getOriginalModuleDataForExport, getNativeEngineDataForExport, getNativeEngineMetaForExport, getNativeCompanionFilesForExport,
} from '@/lib/export/exporters';
import type { SavedSongFields } from './savedSong';
import { getGridBaseline } from './gridBaseline';

/** The current song, serialisable (sample buffers stripped, native data base64). */
export function snapshotSong(): SavedSongFields {
  const trackerState = useTrackerStore.getState();
  const instrumentState = useInstrumentStore.getState();
  const projectState = useProjectStore.getState();
  const transportState = useTransportStore.getState();
  const automationState = useAutomationStore.getState();
  const audioState = useAudioStore.getState();
  const editorState = useEditorStore.getState();

  // Derive trackerFormat from first pattern's importMetadata
  const firstPattern = trackerState.patterns[0];
  const trackerFormat = firstPattern?.importMetadata?.sourceFormat as string | undefined;

  return {
    metadata: projectState.metadata,
    bpm: transportState.bpm,
    patterns: trackerState.patterns,
    patternOrder: trackerState.patternOrder,
    instruments: instrumentState.instruments.map(inst => {
      // Don't save blob URLs for baked instruments — re-calculated on load
      if (inst.metadata?.preservedSynth && inst.sample?.url?.startsWith('blob:')) {
        const cleanedInst = { ...inst };
        cleanedInst.sample = { ...inst.sample, url: '' };
        return cleanedInst;
      }
      // Strip raw ArrayBuffer fields before saving — data URLs (sample.url) are
      // the serializable equivalent and survive both IDB and JSON round-trips.
      const needsClean =
        inst.sample?.audioBuffer ||
        inst.metadata?.preservedSample?.audioBuffer ||
        inst.metadata?.multiSamples?.some(ms => ms.sample?.audioBuffer);
      if (needsClean) {
        const cleanedInst = { ...inst };
        if (cleanedInst.sample?.audioBuffer) {
          cleanedInst.sample = { ...cleanedInst.sample, audioBuffer: undefined };
        }
        if (cleanedInst.metadata) {
          const cleanedMeta = { ...cleanedInst.metadata };
          if (cleanedMeta.preservedSample?.audioBuffer) {
            cleanedMeta.preservedSample = {
              ...cleanedMeta.preservedSample,
              audioBuffer: undefined as unknown as ArrayBuffer,
            };
          }
          if (cleanedMeta.multiSamples) {
            cleanedMeta.multiSamples = cleanedMeta.multiSamples.map(ms =>
              ms.sample?.audioBuffer
                ? { ...ms, sample: { ...ms.sample, audioBuffer: undefined } }
                : ms
            );
          }
          cleanedInst.metadata = cleanedMeta;
        }
        return cleanedInst;
      }
      return inst;
    }),
    automation: automationState.curves,
    masterEffects: audioState.masterEffects,
    ...(transportState.grooveTemplateId !== 'straight' ? { grooveTemplateId: transportState.grooveTemplateId } : {}),
    ...(transportState.speed !== 6 ? { speed: transportState.speed } : {}),
    ...(trackerFormat ? { trackerFormat } : {}),
    ...(editorState.linearPeriods ? { linearPeriods: editorState.linearPeriods } : {}),
    ...(() => {
      const omd = getOriginalModuleDataForExport();
      return omd ? { originalModuleData: omd } : {};
    })(),
    ...(() => {
      const ned = getNativeEngineDataForExport();
      return ned ? { nativeEngineData: ned } : {};
    })(),
    ...(() => {
      const nem = getNativeEngineMetaForExport();
      return nem ? { nativeEngineMeta: nem } : {};
    })(),
    ...(() => {
      const ncf = getNativeCompanionFilesForExport();
      return ncf ? { nativeCompanionFiles: ncf } : {};
    })(),
    // The grid as the decoder produced it: restore tells edits from decoder output with it.
    ...(() => {
      const gb = getGridBaseline();
      return gb ? { gridBaseline: gb } : {};
    })(),
    // Save replaced instrument IDs for hybrid playback persistence
    ...(() => {
      try {
        const replayer = getTrackerReplayer();
        if (replayer.hasReplacedInstruments) {
          return { replacedInstruments: replayer.replacedInstrumentIds };
        }
      } catch { /* replayer not initialized */ }
      return {};
    })(),
    // Mixer state — channel volumes, pans, mutes, solos, dub sends, send buses
    mixer: {
      channels: useMixerStore.getState().channels,
      master: useMixerStore.getState().master,
      sendBuses: useMixerStore.getState().sendBuses,
    },
    // Dub bus tuning — character preset + coloring params
    dubBus: useDrumPadStore.getState().dubBus,
    // Only save a journal that has something in it — an empty one is noise in
    // every project file that never ran the performer.
    performanceJournal: (() => {
      try {
        const journal = getPerformanceJournal();
        return journal.entries.length > 0 ? journal : undefined;
      } catch {
        return undefined;
      }
    })(),
    // Auto Dub state
    ...(() => {
      const s = useDubStore.getState();
      return {
        autoDub: {
          enabled: s.autoDubEnabled,
          persona: s.autoDubPersona,
          intensity: s.autoDubIntensity,
          moveBlacklist: s.autoDubMoveBlacklist ?? [],
        },
      };
    })(),
  };
}
