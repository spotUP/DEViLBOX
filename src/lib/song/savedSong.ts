/**
 * A saved song (autosave / crash recovery / revision SavedProject, or a .dbx
 * SongExport) turned into the song applySong applies.
 *
 * Both shapes were loaded by hand in four places (three in
 * useProjectPersistence, one in the file loader), each restoring a slightly
 * different subset: the .dbx path dropped the mixer and the hybrid
 * instruments, none of them set the editor mode unless the song had native
 * engine data (2026-09-29 audit). One parser, one apply.
 */
import type { AutomationCurve } from '@typedefs/automation';
import type { EffectConfig, InstrumentConfig } from '@typedefs/instrument';
import type { Pattern } from '@/types';
import type { ProjectMetadata } from '@/types/project';
import type { MixerSnapshot } from '@stores/useMixerStore';
import type { DubBusSettings } from '@/types/dub';
import { needsMigration, migrateProject } from '@/lib/migration';
import { decodeNativeEngineFields, type SerializedCompanionFiles } from '@/lib/export/exporters';
import type { SongToApply, ProjectExtras } from './applySong';

/** The fields both saved shapes (SavedProject and SongExport) carry. */
export interface SavedSongFields {
  metadata: ProjectMetadata;
  bpm: number;
  speed?: number;
  patterns: Pattern[];
  instruments: InstrumentConfig[];
  /** Playback order by index (both shapes). */
  patternOrder?: number[];
  /** Older .dbx: playback order by pattern id. */
  sequence?: string[];
  /** SavedProject: the automation curves. */
  automation?: AutomationCurve[] | Record<string, unknown>;
  /** SongExport: the automation curves. */
  automationCurves?: AutomationCurve[];
  masterEffects?: EffectConfig[];
  grooveTemplateId?: string;
  trackerFormat?: string;
  linearPeriods?: boolean;
  replacedInstruments?: number[];
  originalModuleData?: { base64: string; format: string; sourceFile?: string };
  nativeEngineData?: Record<string, string>;
  nativeEngineMeta?: Record<string, unknown>;
  nativeCompanionFiles?: SerializedCompanionFiles;
  mixer?: MixerSnapshot;
  dubBus?: Partial<DubBusSettings>;
  autoDub?: { enabled: boolean; persona: string; intensity: number; moveBlacklist?: string[] };
  performanceJournal?: unknown;
}

/** The song a saved project or .dbx describes. Migrates old pattern/instrument formats in place. */
export function savedSongToApply(data: SavedSongFields): SongToApply {
  let { patterns, instruments } = data;
  if (needsMigration(patterns, instruments)) {
    const migrated = migrateProject(patterns, instruments);
    patterns = migrated.patterns;
    instruments = migrated.instruments;
  }

  // Tag the first pattern with its source format so the replayer gets it.
  if (data.trackerFormat && patterns.length > 0 && !patterns[0].importMetadata?.sourceFormat) {
    patterns[0].importMetadata = {
      ...patterns[0].importMetadata,
      sourceFormat: data.trackerFormat,
    } as Pattern['importMetadata'];
  }

  let order = data.patternOrder ?? [];
  if (order.length === 0 && Array.isArray(data.sequence)) {
    const indexById = new Map(patterns.map((p, i) => [p.id, i]));
    order = data.sequence.map((id) => indexById.get(id)).filter((i): i is number => i !== undefined);
  }

  const curves = Array.isArray(data.automationCurves) ? data.automationCurves
    : Array.isArray(data.automation) ? data.automation
    : undefined;

  const extras: ProjectExtras = {
    automation: curves,
    masterEffects: data.masterEffects,
    grooveTemplateId: data.grooveTemplateId,
    linearPeriods: data.linearPeriods,
    replacedInstruments: data.replacedInstruments,
    mixer: data.mixer,
    dubBus: data.dubBus,
    autoDub: data.autoDub,
    performanceJournal: data.performanceJournal,
  };

  return {
    instruments,
    patterns,
    order,
    bpm: data.bpm,
    speed: data.speed ?? 6,
    metadata: data.metadata,
    originalModuleData: data.originalModuleData?.base64 ? (data.originalModuleData as SongToApply['originalModuleData']) : null,
    engine: decodeNativeEngineFields(data.nativeEngineData, data.nativeEngineMeta, data.linearPeriods, data.nativeCompanionFiles) as SongToApply['engine'],
    extras,
  };
}
