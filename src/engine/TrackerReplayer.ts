/**
 * TrackerReplayer - Real-time tick-based tracker playback
 *
 * This replaces PatternScheduler with a proper tick-based architecture
 * that works for ALL tracker formats (MOD, XM, IT, S3M).
 *
 * All trackers use the same fundamental architecture:
 * - CIA/timer fires every tick (2.5 / BPM seconds)
 * - Speed = ticks per row
 * - Tick 0: read row data, trigger notes
 * - Ticks 1+: process continuous effects
 *
 * Format-specific behavior is handled by effect handlers.
 */

import * as Tone from 'tone';
import type { Pattern, TrackerCell, FurnaceNativeData, HivelyNativeData, KlysNativeData, FurnaceSubsongPlayback } from '@/types';
import type { TFMXNativeData } from '@/types/tfmxNative';
import { setFormatPlaybackPlaying } from './FormatPlaybackState';
import type { InstrumentConfig } from '@/types/instrument';
import { PatternAccessor } from './PatternAccessor';
import { getToneEngine } from './ToneEngine';
import { StereoSeparationNode } from './StereoSeparationNode';
// getNativeAudioNode used in audio-context utilities
import { getAutomationPlayer } from './AutomationPlayer';
import { syncCaptureToStore, resetCaptureSync } from './automation/AutomationCaptureSync';
import { useTransportStore, cancelPendingRowUpdate } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { setCellInPattern } from '@/stores/tracker/patternEditActions';
import { useAutomationStore } from '@/stores/useAutomationStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { unlockIOSAudio } from '@utils/ios-audio-unlock';
import { ft2NoteToPeriod, ft2Period2Hz, ft2GetSampleC4Rate } from './effects/FT2Tables';
// HivelyEngine used via dynamic import
// MusicLineEngine used via dynamic import

// Cached LibopenmptEngine reference for zero-latency forcePosition seeks.
// Populated on first dynamic import; thereafter synchronous access.
let _cachedLibopenmpt: typeof import('@engine/libopenmpt/LibopenmptEngine') | null = null;
function getLibopenmptSync() {
  if (_cachedLibopenmpt) return _cachedLibopenmpt.LibopenmptEngine;
  // Warm the cache (async, but only happens once)
  import('@engine/libopenmpt/LibopenmptEngine').then(m => { _cachedLibopenmpt = m; }).catch(() => {});
  return null;
}

// Extracted modules
import {
  AMIGA_PAL_FREQUENCY,
  OCTAVE_UP, PERIOD_TABLE,
  NOTE_STRING_MAP,
  GROOVE_MAP,
  xmNoteToNoteName, periodToNoteName,
  getGrooveOffset, getGrooveVelocity,
} from './replayer/PeriodTables';
import {
  C64SIDEngine,
  SF2Engine,
  startNativeEngines,
  stopNativeEngines,
  pauseNativeEngines,
  resumeNativeEngines,
  restoreNativeRouting,
  preInitMusicLine,
} from './replayer/NativeEngineRouting';
// ============================================================================
// CONSTANTS (imported from replayer/PeriodTables.ts)
// ============================================================================

const PLAYERS_PER_CHANNEL = 2; // Double-buffered pool for overlap-free note transitions

// ============================================================================
// TYPES
// ============================================================================

export type TrackerFormat =
  | 'MOD' | 'XM' | 'IT' | 'S3M' | 'HVL' | 'AHX' | 'ML'
  // Exotic Amiga formats (Phase 2 full editing)
  | 'OKT'   // Oktalyzer
  | 'MED'   // OctaMED / MED
  | 'DIGI'  // DigiBooster
  | 'DBM'   // DigiBooster Pro (.dbm)
  | 'FC'    // Future Composer 1.3/1.4
  // FlodJS-enhanced native parsers
  | 'SFX'   // Sound-FX
  | 'SMON'  // SoundMon (Brian Postma)
  | 'SIDMON2' // SidMon II
  | 'FRED'  // Fred Editor
  | 'DMUG'  // Digital Mugician
  // UADE catch-all (playback-only, 130+ formats)
  | 'UADE'
  // Chip-dump / CPU-code formats (metadata + stub patterns)
  | 'VGM'  // Video Game Music (OPN2/OPL/SN register dumps)
  | 'S98'  // S98 FM register dump (PC-88/PC-98/MSX)
  | 'YM'   // Atari ST AY/YM2149 register dumps
  | 'NSF'  // NES Sound Format (2A03 + expansion chips)
  | 'SID'  // Commodore 64 SID (PSID/RSID)
  | 'SAP'  // Atari 8-bit POKEY
  | 'GBS'  // Game Boy Sound System
  | 'AY'   // ZX Spectrum AY (ZXAYEMUL)
  | 'KSS'  // MSX KSS (AY/SCC/OPLL/Y8950)
  | 'SNDH' // Atari ST SNDH/SC68 (YM2149 68000 code)
  | 'HES'  // PC Engine / TurboGrafx-16 HuC6280
  | 'SPC'  // Super Nintendo SPC700 sound format
  | 'MDX'  // Sharp X68000 MDX (YM2151 OPM + ADPCM, native note data)
  | 'JamCracker'       // JamCracker Pro (.jam, .jc)
  | 'FuturePlayer'     // Future Player (Wanted Team, .fp)
  | 'PMD'              // PC-98 Professional Music Driver (YM2608/OPNA)
  | 'FMP'              // PC-98 FMP/PLAY6 music driver (YM2608/OPNA)
  | 'AdPlug'           // PC AdLib/OPL formats (RAD, HSC, DRO, IMF, CMF)
  | 'KT'              // Klystrack chiptune tracker (.kt)
  | 'Organya'         // Cave Story / Organya (.org)
  | 'PxTone'          // PxTone Collage (.ptcop, .pttune)
  | 'SteveTurner'    // Steve Turner (.jpo) — Amiga 4-voice with 7-phase envelope
  | 'PreTracker'    // PreTracker (.prt) — Amiga 4-channel by Ratt/Abyss
  | 'TFMX'          // TFMX Professional (Jochen Hippel, libtfmxaudiodecoder WASM)
  | 'ASAP';         // ASAP (Another Slight Atari Player) - Atari 8-bit POKEY formats

/**
 * Channel state - all the per-channel data needed for playback
 */
export interface ChannelState {
  // Note state
  note: number;                  // Current note (period for MOD, note number for XM)
  period: number;                // Current period (after effects)
  volume: number;                // Current volume (0-64)
  panning: number;               // Current panning (0-255, 128=center)
  basePan: number;               // Original LRRL pan position (-1 to +1) before separation

  // Sample state
  sampleNum: number;             // Current sample/instrument number
  finetune: number;              // Finetune: -8 to +7 (MOD) or -128 to +127 (XM)
  relativeNote: number;          // XM sample relative note (-96 to +95)

  // Effect memory (used by hybrid dispatch + SynthEffectProcessor)
  portaSpeed: number;            // Portamento speed (1xx, 2xx) - MOD shared
  portaTarget: number;           // Tone portamento target (3xx)
  tonePortaSpeed: number;        // Tone portamento speed
  vibratoPos: number;            // Vibrato position
  vibratoCmd: number;            // Vibrato speed/depth
  tremoloPos: number;            // Tremolo position
  tremoloCmd: number;            // Tremolo speed/depth (MOD)
  tremoloSpeed: number;          // FT2: stored separately, = (param & 0xF0) >> 2
  tremoloDepth: number;          // FT2: stored separately
  waveControl: number;           // Waveform control
  glissandoMode: boolean;        // E3x: true = semitone portamento
  tremorPos: number;             // Tremor state: bit 7 = on/off, bits 0-6 = counter
  tremorParam: number;           // Tremor parameter memory (Txy)
  noteRetrigSpeed: number;       // FT2 Rxy: retrigger speed memory
  noteRetrigVol: number;         // FT2 Rxy: retrigger volume slide memory
  noteRetrigCounter: number;     // FT2 Rxy: retrigger tick counter
  volColumnVol: number;          // FT2: volume column byte from current row (for Rxy quirk)
  volSlideSpeed: number;         // FT2: volume slide speed memory (Axx)
  panSlide: number;              // Pan slide memory (Pxx)

  // Macro state (Furnace instruments)
  macroPos: number;              // Current position in macros
  macroReleased: boolean;        // Whether note has been released
  macroPitchOffset: number;      // Current pitch offset from macros
  macroArpNote: number;          // Current arpeggio note offset

  // XM key-off state
  keyOff: boolean;               // Key-off flag — triggers fadeout + envelope release

  // Output volumes (used by hybrid dispatch)
  outVol: number;                // FT2 output volume = ch.volume (0-64)
  outPan: number;                // FT2 output panning (0-255)

  // TB-303 specific state
  previousSlideFlag: boolean;    // Previous row's slide flag (for proper 303 slide semantics)
  lastPlayedNoteName: string | null; // Last triggered note name for same-pitch slide detection
  xmNote: number;                // Original XM note number (for synth instruments, avoids period conversion)

  // Synth pitch tracking (for portamento/vibrato/arpeggio on synths)
  _synthDetuneOffset?: number;   // Current detune offset in semitones (for 1xx/2xx portamento)

  // Note retriggering state (for synth pitch effects via note attack/release)
  baseNote?: string;             // Original note name (e.g., "C-4") before pitch effects
  currentPitchOffset?: number;   // Current semitone offset applied (0 for base pitch)
  currentPlayingNote?: string;   // Currently playing note name after pitch offset
  currentVelocity?: number;      // Current velocity for retriggering

  // Audio nodes - player pool (pre-allocated, pre-connected)
  player: Tone.Player | null;       // Active player reference (for updatePeriod compatibility)
  playerPool: Tone.Player[];        // Pre-allocated player pool
  gainNode: Tone.Gain;
  panNode: Tone.Panner;
  muteGain: Tone.Gain;              // Dedicated mute/solo gain (always 0 or 1)

  // Instrument reference
  instrument: InstrumentConfig | null;

  // Mute/solo tracking for gain sync
  _muteState: boolean;
}

/**
 * Song data for playback
 */
export interface TrackerSong {
  name: string;
  format: TrackerFormat;
  patterns: Pattern[];
  instruments: InstrumentConfig[];
  songPositions: number[];       // Pattern order
  songLength: number;
  restartPosition: number;
  numChannels: number;
  initialSpeed: number;
  initialBPM: number;
  // XM frequency mode: true = linear periods (most XMs), false = amiga periods
  linearPeriods?: boolean;
  // Display-only note offset (semitones) — adjusts note display without affecting playback
  noteDisplayOffset?: number;
  // Per-song note offset applied during MOD export (semitones) — adjusts the
  // note-to-period mapping without affecting internal playback or display.
  // Used for S3M-origin formats (GDM/S3M) where OpenMPT notes are 60 semitones
  // above ProTracker period-table indices (S3M octave 5 = ProTracker octave 0).
  noteExportOffset?: number;
  // Furnace-specific timing/compat (optional)
  speed2?: number;
  hz?: number;
  virtualTempoN?: number;
  virtualTempoD?: number;
  compatFlags?: Record<string, unknown>;
  grooves?: number[][];
  // Furnace module-level wavetables/samples for WASM dispatch upload
  furnaceWavetables?: Array<{ data: number[]; width: number; height: number }>;
  furnaceSamples?: Array<{ data: Int16Array | Int8Array | Uint8Array; rate: number; depth: number;
    loopStart: number; loopEnd: number; loopMode: number; name: string }>;
  // HVL/AHX metadata
  hivelyMeta?: {
    stereoMode: number;
    mixGain: number;
    speedMultiplier: number;
    version: number;
  };
  /** Raw HVL/AHX binary for loading into the HivelyEngine WASM */
  hivelyFileData?: ArrayBuffer;
  /** Raw MusicLine binary for loading into the MusicLineEngine WASM */
  musiclineFileData?: Uint8Array;
  /** MusicLine INFO chunk metadata (title, author, date, duration, info text 1-5) */
  musiclineMetadata?: {
    title: string;
    author: string;
    date: string;
    duration: string;
    infoText: string[];
  };
  /** Raw C64 SID binary for loading into the C64SIDEngine */
  c64SidFileData?: Uint8Array;
  /** Raw JamCracker .jam binary for loading into the JamCrackerEngine WASM */
  jamCrackerFileData?: ArrayBuffer;
  /** Raw Future Player .fp binary for loading into the FuturePlayerEngine WASM */
  futurePlayerFileData?: ArrayBuffer;
  /** Raw PreTracker .prt binary for loading into the PreTrackerEngine WASM */
  preTrackerFileData?: ArrayBuffer;
  /** Raw Music-Assembler .ma binary for loading into the MaEngine WASM */
  maFileData?: ArrayBuffer;
  /** Raw Jochen Hippel ST binary for loading into the HippelEngine WASM */
  hippelFileData?: ArrayBuffer;
  /** Raw Sonix Music Driver binary for loading into the SonixEngine WASM */
  sonixFileData?: ArrayBuffer;
  /** Raw PxTone Collage binary for loading into the PxtoneEngine WASM */
  pxtoneFileData?: ArrayBuffer;
  /** Raw Organya (.org) binary for loading into the OrganyaEngine WASM */
  organyaFileData?: ArrayBuffer;
  /** Raw Sawteeth (.st) binary for loading into the SawteethEngine WASM */
  sawteethFileData?: ArrayBuffer;
  /** Raw FM Towns EUP binary for loading into the EupminiEngine WASM */
  eupFileData?: ArrayBuffer;
  /** Raw IXS binary for loading into the IxalanceEngine WASM */
  ixsFileData?: ArrayBuffer;
  /** Raw Psycle (.psy) binary for loading into the CpsycleEngine WASM */
  psycleFileData?: ArrayBuffer;
  /** Raw ZXTune binary for loading into the ZxtuneEngine WASM */
  zxtuneFileData?: ArrayBuffer;
  /** Raw SC68/SNDH binary for loading into the Sc68Engine WASM */
  sc68FileData?: ArrayBuffer;
  /** Raw PumaTracker .puma binary for loading into the PumaTrackerEngine WASM */
  pumaTrackerFileData?: ArrayBuffer;
  /** Raw Steve Turner binary for loading into the SteveTurnerEngine WASM */
  steveTurnerFileData?: ArrayBuffer;
  /** Raw SidMon 1.0 (.sid1/.smn) binary for SidMon1ReplayerEngine WASM playback */
  sidmon1WasmFileData?: ArrayBuffer;
  /** Raw Fred Editor binary for loading into the FredEditorReplayerEngine WASM */
  fredEditorWasmFileData?: ArrayBuffer;
  /** Raw Art of Noise (.aon) binary for ArtOfNoiseEngine WASM playback */
  artOfNoiseFileData?: ArrayBuffer;
  /** Raw QSF (.qsf/.miniqsf) binary for QsfEngine WASM playback (Capcom QSound) */
  qsfFileData?: ArrayBuffer;
  /** Raw PMD (.m/.m2) binary for PmdminiEngine WASM playback (PC-98 YM2608) */
  pmdFileData?: ArrayBuffer;
  /** Raw FMP (.opi/.ovi/.ozi) binary for FmplayerEngine WASM playback (PC-98 YM2608 PLAY6) */
  fmplayerFileData?: ArrayBuffer;
  /** Raw Ben Daglish (.bd) binary for BdEngine WASM playback */
  bdFileData?: ArrayBuffer;
  /** Raw SidMon 2.0 (.sid2) binary for Sd2Engine WASM playback */
  sd2FileData?: ArrayBuffer;
  /** Raw Startrekker AM (.am/.nt) binary for StartrekkerAMEngine WASM playback */
  startrekkerAMFileData?: ArrayBuffer;
  /** Raw Startrekker AM .nt synth data for StartrekkerAMEngine WASM playback */
  startrekkerAMNtData?: ArrayBuffer;
  /** Raw SoundMon binary for SoundMonEngine WASM playback */
  soundMonFileData?: ArrayBuffer;
  /** Raw Sonic Arranger binary for SonicArrangerEngine WASM playback */
  sonicArrangerFileData?: ArrayBuffer;
  /** Raw Rob Hubbard binary for RobHubbardEngine WASM playback */
  robHubbardFileData?: ArrayBuffer;
  /** Raw Digital Mugician binary for DigMugEngine WASM playback */
  digMugFileData?: ArrayBuffer;
  /** Raw Core Design binary for CoreDesignEngine WASM playback */
  coreDesignFileData?: ArrayBuffer;
  /** Raw David Whittaker binary for DavidWhittakerEngine WASM playback */
  davidWhittakerFileData?: ArrayBuffer;
  /** Raw Sound Control binary for SoundControlEngine WASM playback */
  soundControlFileData?: ArrayBuffer;
  /** Raw Delta Music 1.0 binary for DeltaMusic1Engine WASM playback */
  deltaMusic1FileData?: ArrayBuffer;
  /** Raw Delta Music 2.0 binary for DeltaMusic2Engine WASM playback */
  deltaMusic2FileData?: ArrayBuffer;
  /** Raw SoundFx binary for SoundFxEngine WASM playback */
  soundFxFileData?: ArrayBuffer;
  /** Raw Game Music Creator binary for GmcEngine WASM playback */
  gmcFileData?: ArrayBuffer;
  /** Raw Voodoo Supreme binary for VoodooEngine WASM playback */
  voodooFileData?: ArrayBuffer;  /** Raw file binary for UADE playback of editable formats (native parser provides patterns, UADE provides audio) */
  fredReplayerFileData?: ArrayBuffer;
  oktalyzerFileData?: ArrayBuffer;
  inStereo1FileData?: ArrayBuffer;
  futureComposerFileData?: ArrayBuffer;
  inStereo2FileData?: ArrayBuffer;
  quadraComposerFileData?: ArrayBuffer;  uadeEditableFileData?: ArrayBuffer;
  ronKlarenFileData?: ArrayBuffer;
  actionamicsFileData?: ArrayBuffer;
  activisionProFileData?: ArrayBuffer;
  synthesisFileData?: ArrayBuffer;
  dssFileData?: ArrayBuffer;
  soundFactoryFileData?: ArrayBuffer;
  faceTheMusicFileData?: ArrayBuffer;  /** Original filename hint for UADE format detection */
  uadeEditableFileName?: string;
  /** Raw MDX binary for mdxmini WASM playback (Sharp X68000 YM2151) */
  mdxminiFileData?: ArrayBuffer;
  /** Raw V2M binary for V2MEngine WASM playback (Farbrausch V2 Synthesizer Music) */
  v2mFileData?: ArrayBuffer;
  /** Raw file binary for AdPlug streaming playback (patterns displayed, AdPlug renders audio) */
  adplugFileData?: ArrayBuffer;
  /** Original filename for AdPlug format detection */
  adplugFileName?: string;
  /** Ticks per row for AdPlug position tracking (capture formats) */
  adplugTicksPerRow?: number;
  /** Companion files for two-file UADE formats (e.g. smp.*, .ins, .set) */
  uadeCompanionFiles?: Map<string, ArrayBuffer>;
  /** Raw Symphonie Pro (.symmod) binary for SymphonieEngine playback + export */
  symphonieFileData?: ArrayBuffer;
  /** Raw module binary for libopenmpt WASM playback (MOD/XM/IT/S3M) */
  libopenmptFileData?: ArrayBuffer;
  /** Raw ASAP file data for AsapEngine WASM playback (SAP/CMC/RMT/TMC/DLT/MPT etc.) */
  asapFileData?: ArrayBuffer;
  /** Original filename for ASAP format detection (extension determines format) */
  asapFilename?: string;
  // Native format data (preserved for format-specific editors)
  furnaceNative?: FurnaceNativeData;
  hivelyNative?: HivelyNativeData;
  /** Native klystrack data for the klystrack pattern editor */
  klysNative?: KlysNativeData;
  /** Native TFMX data for the TFMX trackstep/pattern editor */
  tfmxNative?: TFMXNativeData;
  /** Raw klystrack .kt binary for loading into the KlysEngine WASM */
  klysFileData?: ArrayBuffer;
  /** Raw TFMX mdat binary for loading into TFMXEngine WASM module player */
  tfmxFileData?: ArrayBuffer;
  /** Raw TFMX smpl binary (companion sample data) */
  tfmxSmplData?: ArrayBuffer;
  // Pre-converted subsong data for in-editor subsong switching
  furnaceSubsongs?: FurnaceSubsongPlayback[];
  furnaceActiveSubsong?: number;

  /** UADE pattern layout — enables live chip RAM patching for editable UADE formats.
   *  When present, pattern edits are written back to the module binary in UADE's
   *  emulated chip RAM, making the 68k replayer play the edited data in real-time. */
  uadePatternLayout?: import('./uade/UADEPatternEncoder').UADEPatternLayout;

  /** UADE variable-length pattern layout — for formats where cell byte size varies.
   *  Uses full-pattern re-serialization instead of per-cell patching. */
  uadeVariableLayout?: import('./uade/UADEPatternEncoder').UADEVariablePatternLayout;

  /** CIA tick of the first reconstructed row — offset for real-time position calculation.
   *  During playback, row = floor((tickCount - uadeFirstTick) / initialSpeed). */
  uadeFirstTick?: number;

  /** When true, the UADE playback engine should capture tick snapshots + Paula log
   *  during normal-speed playback and reconstruct patterns after one song loop.
   *  Used for SKIP_SCAN formats where enhanced scan crashes but playback works. */
  uadeDeferredCapture?: boolean;

  /** TFMX timing table: cumulative jiffies at each (patternIndex, row) for position sync */
  tfmxTimingTable?: { patternIndex: number; row: number; cumulativeJiffies: number }[];

  // Per-channel independent sequencing (MusicLine Editor and similar formats)
  // When present, each channel uses its own pattern sequence instead of the global songPositions.
  // channelTrackTables[chIdx][posIdx] = patternIndex  (analogous to Furnace orders matrix)
  channelTrackTables?: number[][];
  // Per-channel ticks-per-row (overrides initialSpeed for each channel independently)
  channelSpeeds?: number[];
  // Per-channel groove speed (alternates with channelSpeeds each row; 0 = no groove)
  channelGrooves?: number[];

  /** SID Factory II store data — populated by SIDFactory2Parser, consumed by useSF2Store */
  sf2StoreData?: import('@/stores/useSF2Store').SF2LoadPayload;

  /** CheeseCutter raw 64KB C64 memory image — played by cheesecutter-wasm engine */
  cheeseCutterFileData?: ArrayBuffer;
  /** CheeseCutter store data — populated by CheeseCutterParser, consumed by useCheeseCutterStore */
  cheeseCutterStoreData?: import('@/stores/useCheeseCutterStore').CheeseCutterLoadPayload;

  /** Post-init C64 RAM patches — written to the emulator after PSID init completes.
   *  Used by CheeseCutter: the PSID driver overwrites $C000-$CFFF with its shim,
   *  but the CheeseCutter player may have music data there. These patches restore it. */
  c64MemPatches?: Array<{ addr: number; data: Uint8Array }>;
}

// ============================================================================
// TRACKER REPLAYER
// ============================================================================

// DisplayState now lives in PlaybackCoordinator. Re-export for backward
// compatibility with any caller that imports it from this module.
export type { DisplayState } from './PlaybackCoordinator';
import { PlaybackCoordinator, type DisplayState } from './PlaybackCoordinator';

export class TrackerReplayer {
  // Song data
  private song: TrackerSong | null = null;
  // Format-dispatching pattern accessor (for native Furnace/Hively data)
  private accessor = new PatternAccessor();

  // PERF: Cached transport state — set once per scheduler interval (15ms),
  // reused by processTick() and triggerNote() to avoid repeated getState() calls
  private _cachedTransportState: ReturnType<typeof useTransportStore.getState> | null = null;

  // Playback state
  // Backed by a private field so the setter can mirror into the coordinator,
  // which uses .playing to decide whether getStateAtTime() should drain the
  // ring buffer (playing) or freeze on the last dequeued state (stopped).
  private _playing = false;
  private get playing(): boolean { return this._playing; }
  private set playing(v: boolean) {
    this._playing = v;
    this.coordinator.stateRing.playing = v;
  }
  private _songEndFiredThisBatch = false;
  // Position state lives on the coordinator. Engines call
  // coordinator.dispatchEnginePosition() directly which writes to
  // coordinator.songPos / pattPos. The accessors below let the rest of
  // TrackerReplayer keep its `this.songPos` / `this.pattPos` sites unchanged.
  private get songPos(): number { return this.coordinator.songPos; }
  private set songPos(v: number) { this.coordinator.songPos = v; }
  private get pattPos(): number { return this.coordinator.pattPos; }
  private set pattPos(v: number) { this.coordinator.pattPos = v; }
  private currentTick = 0;       // Current tick (0 to speed-1)
  // Speed (ticks per row) and BPM mirror into coordinator.context so the
  // coordinator's dispatchEnginePosition() always sees the live values when
  // it computes the row-duration hint for the display ring buffer.
  private _speed = 6;
  private get speed(): number { return this._speed; }
  private set speed(v: number) { this._speed = v; this.coordinator.context.speed = v; }
  private _bpm = 125;
  private get bpm(): number { return this._bpm; }
  private set bpm(v: number) { this._bpm = v; this.coordinator.context.bpm = v; }

  // FT2 XM period mode: true = linear periods, false = amiga periods
  // Set from song.linearPeriods when loading. MOD always uses amiga.
  private linearPeriods = false;
  // Whether to use FT2's period system (true for XM, false for MOD)
  private useXMPeriods = false;

  // Timing drift diagnostics
  private totalRowsProcessed = 0;    // Total rows processed since start
  private totalTicksProcessed = 0;   // Total ticks processed (tracks actual time regardless of speed changes)

  // Furnace speed alternation (speed1/speed2)
  private speed2: number | null = null;  // null = no alternation (XM/MOD mode)
  private speedAB = false;               // false = use speed1 next, true = use speed2 next

  // Furnace groove (variable tick count per row, replaces speed alternation when active)
  private activeGroove: number[] | null = null; // null = no groove active
  private groovePos = 0;                        // current position within groove table

  // Per-channel independent sequencing (MusicLine Editor and similar formats)
  // Each channel has its own tick counter and position, advancing at its own speed.
  private channelTickCounters: number[] = [];   // Per-channel tick counter (0 .. effectiveSpeed-1)
  private channelPattPos: number[] = [];         // Per-channel row within current pattern
  private channelSongPos: number[] = [];         // Per-channel index into its track table
  private channelGrooveToggle: boolean[] = [];   // Per-channel groove phase (alternates each row)

  // Pattern break/jump
  private pBreakPos = 0;
  private pBreakFlag = false;
  private posJumpFlag = false;
  private patternDelay = 0;      // EEx pattern delay (legacy, non-XM)
  // FT2 two-stage pattern delay
  private pattDelTime = 0;       // Set by EEx on tick 0, copied to pattDelTime2 at row boundary
  private pattDelTime2 = 0;      // Decremented each row; while > 0, row repeats (no new notes read)

  // Channels
  private channels: ChannelState[] = [];

  // Per-channel analysers for DJ oscilloscope display (created on demand)
  private channelAnalysers: AnalyserNode[] = [];

  // Master output
  private masterGain: Tone.Gain;
  private readonly separationNode: StereoSeparationNode;
  private stereoMode: 'pt2' | 'modplug' = 'pt2';
  private modplugSeparation = 0;

  // Audio-synced state ring buffer for smooth scrolling (BassoonTracker pattern).
  // States are queued with Web Audio timestamps during scheduling, then
  // dequeued in the render loop as audioContext.currentTime advances.
  // Owned by the PlaybackCoordinator — TrackerReplayer just delegates.
  private readonly coordinator = new PlaybackCoordinator();

  // Cache for ToneAudioBuffer wrappers (keyed by instrument ID)
  // Avoids re-wrapping the same decoded AudioBuffer on every note trigger
  private bufferCache: Map<number, Tone.ToneAudioBuffer> = new Map();
  // Cache for multi-sample decoded AudioBuffers (keyed by "instId:sampleIdx")
  private multiSampleBufferCache: Map<string, AudioBuffer> = new Map();

  // Instrument lookup map (keyed by instrument ID) — avoids linear scan per note
  private instrumentMap: Map<number, InstrumentConfig> = new Map();

  // Callbacks — owned by the PlaybackCoordinator. The fields below are
  // accessor pairs that delegate, so external callers (DJ deck, transport,
  // pattern editor, etc.) don't need to change.
  public get onRowChange() { return this.coordinator.onRowChange; }
  public set onRowChange(v) { this.coordinator.onRowChange = v; }
  public get onChannelRowChange() { return this.coordinator.onChannelRowChange; }
  public set onChannelRowChange(v) { this.coordinator.onChannelRowChange = v; }
  public get onSongEnd() { return this.coordinator.onSongEnd; }
  public set onSongEnd(v) { this.coordinator.onSongEnd = v; }
  public get onTickProcess() { return this.coordinator.onTickProcess; }
  public set onTickProcess(v) { this.coordinator.onTickProcess = v; }

  // DJ mode state
  private nudgeOffset = 0;            // Temporary BPM offset for DJ nudge
  private nudgeTicksRemaining = 0;    // Auto-reset counter for nudge
  private lineLoopStart = -1;         // Line loop start row (-1 = off)
  private lineLoopEnd = -1;           // Line loop end row
  private lineLoopActive = false;
  private patternLoopStartPos = -1;   // Pattern loop start song position
  private patternLoopEndPos = -1;     // Pattern loop end song position
  private patternLoopActive = false;
  private slipEnabled = false;
  private slipSongPos = 0;            // Ghost position (advances while looping)
  private slipPattPos = 0;

  // Per-deck pitch isolation (DJ mode only)
  private isDJDeck = false;           // True when created with outputNode
  private tempoMultiplier = 1.0;      // Scheduler BPM multiplier (from pitch slider)
  private pitchMultiplier = 1.0;      // Sample playback rate multiplier
  private deckDetuneCents = 0;        // Per-deck synth detune

  // Scratch note suppression: when true, the sequencer advances (position tracking)
  // but processRow/processEffectTick are skipped so no new notes trigger.
  // Used by DeckEngine during pattern scratches to prevent "extra notes" while
  // still allowing the pattern view to follow the scratch position.
  private _suppressNotes = false;

  // Instrument IDs replaced with synths during ANY WASM engine playback.
  // When _suppressNotes is true, notes for channels playing these instruments
  // are still fired via ToneEngine (hybrid WASM + ToneEngine playback).
  private _replacedInstruments = new Set<number>();

  // Reference to the active WASM engine that supports setMuteMask().
  // Set during startNativeEngines(), cleared on loadSong().
  // Used by updateWasmMuteMask() to mute channels playing replaced instruments.
  private _activeWasmEngine: { setMuteMask(mask: number): void } | null = null;

  // Tick-level effect processor for synth instruments in hybrid mode.
  // Created when libopenmpt starts and replaced instruments exist.
  private _synthEffectProcessor: import('./replayer/SynthEffectProcessor').SynthEffectProcessor | null = null;

  // SonicArranger dynamic track length (effect 0x9): overrides pattern length
  // Reset to 0 on each pattern advance; 0 = use normal pattern length
  private _saTrackLen = 0;

  // Generation counter for play() to detect stale async continuations.
  // Incremented at the start of every play() call; checked after each await.
  // If the value changed (another play/stop happened while awaiting), the stale
  // continuation aborts to prevent ghost schedulers or dead-engine playback.
  private _playGeneration = 0;

  // WASM sequencer bypass (Furnace formats): when true, the WASM sequencer in
  // the AudioWorklet drives all tick processing and chip dispatch directly.
  // The TS scheduler does NOT run; position updates come from worklet messages.
  private useWasmSequencer = false;
  private _seqPositionUnsub: (() => void) | null = null;

  // libopenmpt playback: when active, audio comes from the libopenmpt worklet
  // and TrackerReplayer only forwards position updates to the UI.
  private useLibopenmptPlayback = false;
  // Synchronous cleanup for libopenmpt engine — nulls callbacks and stops the
  // worklet without a deferred import. Set during play(), called during stop().
  private _libopenmptCleanup: (() => void) | null = null;

  // AdPlug streaming player: when active, audio comes from AdPlug WASM worklet.
  // Set when an OPL3-only song has extracted patterns + streaming player loaded.
  private useAdPlugStreaming = false;
  private _adplugPositionUnsub: (() => void) | null = null;

  // Per-deck channel mute mask (DJ mode only)
  // Bit N = 1 means channel N is ENABLED, 0 means MUTED.
  // Kept separate from ToneEngine's global mute states so each deck is independent.
  private channelMuteMask = 0xFFFF;   // All 16 channels enabled by default

  // Pre-allocated VU meter trigger callbacks (avoid closure allocation per note)
  private meterCallbacks: (() => void)[] | null = null;
  private meterStaging = new Float64Array(64);

  // External playback engines for formats that don't use standard tracker playback
  private c64SidEngine: C64SIDEngine | null = null;
  private sf2Engine: SF2Engine | null = null;
  private hivelyEngine: import('./hively/HivelyEngine').HivelyEngine | null = null;
  private _hvlPositionUnsub: (() => void) | null = null;
  private _mlPositionUnsub: (() => void) | null = null;
  // Composite UADE cleanup returned by UADEEngine.subscribeToCoordinator;
  // unwinds position subscription + Paula log polling + deferred pattern
  // reconstruction + TFMX channel subscription in one call.
  private _uadePositionUnsub: (() => void) | null = null;
  // Furnace cmd log subscription rolled into _seqPositionUnsub (4.6)
  // Capture sync interval moved to coordinator.startCaptureSync/stopCaptureSync
  // TFMX channel subscription moved into UADEEngine composite cleanup (4.5)

  /** Get the active C64 SID engine (for subsong switching etc.) */
  public getC64SIDEngine(): C64SIDEngine | null {
    return this.c64SidEngine;
  }

  /** Get the active SF2 engine (for live editing with memory patching) */
  public getSF2Engine(): SF2Engine | null {
    return this.sf2Engine;
  }

  // Stereo separation (0-100): controls how wide the stereo image is.
  // 100 = full Amiga hard-pan (LRRL), 0 = mono, 20 = pt2-clone default for MOD.
  // Based on per-channel pan narrowing: actual_pan = basePan * (separation / 100)
  // Reference: pt2-clone (8bitbubsy), MilkyTracker, Schism Tracker
  private stereoSeparation = 100;

  // Track native engines (UADE/Hively) rerouted to separation chain (for cleanup on song change)
  private routedNativeEngines: Set<string> = new Set();

  // Whether the replayer is muted (DJ mode visuals-only)
  private _muted = false;

  /**
   * Optional callback set by DeckEngine to handle DJ scratch effect commands (Xnn).
   * High nibble 0: scratch pattern (0=stop, 1=Baby, 2=Trans, 3=Flare, 4=Hydro, 5=Crab, 6=Orbit)
   * High nibble 1: fader LFO (0=off, 1=¼, 2=⅛, 3=⅟₁₆, 4=⅟₃₂)
   */
  onScratchEffect?: (param: number) => void;

  constructor(outputNode?: Tone.ToneAudioNode) {
    // Connect to provided output node (for DJ decks) or default to
    // ToneEngine's masterInput (existing behavior for tracker view).
    this.masterGain = new Tone.Gain(1);
    this.separationNode = new StereoSeparationNode();
    // Chain: masterGain → separationNode → destination
    this.masterGain.connect(this.separationNode.inputTone);
    if (outputNode) {
      this.separationNode.outputTone.connect(outputNode);
      this.isDJDeck = true;
    } else {
      try {
        const engine = getToneEngine();
        this.separationNode.outputTone.connect(engine.masterInput);
      } catch (err) {
        // AudioContext mismatch during view transitions — defer connection
        // until the shared context is ready
        console.warn('[TrackerReplayer] Deferred audio connection — context not ready:', (err as Error).message);
        setTimeout(() => {
          try {
            const engine = getToneEngine();
            this.separationNode.outputTone.connect(engine.masterInput);
          } catch { /* will reconnect on next song load */ }
        }, 500);
      }
    }
  }

  // ==========================================================================
  // DJ MODE METHODS
  // ==========================================================================

  /** Get the master gain node for external routing (DJ mixer, etc.) */
  getMasterGain(): Tone.Gain {
    return this.masterGain;
  }

  /** Mute/unmute all audio from this replayer (including native engines). */
  setMuted(mute: boolean): void {
    this._muted = mute;
    this.masterGain.gain.value = mute ? 0 : 1;
  }

  /** Get the stereo separation node's input for routing external native audio sources.
   *  UADE/Hively outputs connect here so stereo separation applies to their pre-mixed output. */
  getSeparationInput(): Tone.Gain {
    return this.separationNode.inputTone;
  }

  /** Get the full merged output of the tracker (after stereo separation).
   *  ALL tracker audio — internal sequencer AND native WASM engines (libopenmpt, UADE, etc.)
   *  — converges here before reaching ToneEngine.masterInput.
   *  Use this to mute/unmute the entire tracker output without needing per-engine calls. */
  getFullOutput(): Tone.Gain {
    return this.separationNode.outputTone;
  }

  /** Get current song position */
  getSongPos(): number { return this.songPos; }

  /** Get current pattern row position */
  getPattPos(): number { return this.pattPos; }

  /** Guard flag: when true, usePatternPlayback should not stop/restart the replayer.
   *  Set by forcePosition, cleared after one React render cycle. */
  public skipNextReload = false;

  /** Track whether play() has completed at least once (audio infra is set up). */
  private _hasPlayedOnce = false;

  /** Force position reset — sets internal replayer state and resyncs scheduler.
   *  If the replayer was previously playing (warm restart), restarts immediately
   *  bypassing the slow React effect → async play() chain.
   *  Cold start (first play) must go through the normal path for full audio init. */
  forcePosition(songPos: number, pattPos: number): void {
    this.songPos = songPos;
    this.pattPos = pattPos;
    this.currentTick = 0;
    this.nextScheduleTime = Tone.now();
    // Tell usePatternPlayback to skip its next stop/restart cycle
    this.skipNextReload = true;

    // Forward to libopenmpt synchronously if active (zero-latency seek)
    if (this.useLibopenmptPlayback) {
      const Mpt = getLibopenmptSync();
      if (Mpt?.hasInstance()) {
        Mpt.getInstance().seekTo(songPos, pattPos);
      }
      this._synthEffectProcessor?.reset();
    }

    // Warm restart: audio infra already set up from a previous play().
    // Restart directly — no React effect cycle needed.
    if (!this.playing && this.song && this._hasPlayedOnce) {
      this.playing = true;
      // Restore _suppressNotes for WASM-backed formats so ToneEngine doesn't
      // play samples in parallel with the WASM engine (causes flanger/doubling).
      this._suppressNotes = this.useLibopenmptPlayback || this.coordinator.hasActiveDispatch;
      this.clearStateQueue();
      this.coordinator.stateRing.clearLastDequeued();
      // Restart libopenmpt if this is a libopenmpt-backed format
      if (this.useLibopenmptPlayback) {
        const Mpt2 = getLibopenmptSync();
        if (Mpt2?.hasInstance()) {
          const mptEngine = Mpt2.getInstance();
          if (!this._muted) {
            mptEngine.play();
            if (songPos > 0 || pattPos > 0) {
              mptEngine.seekTo(songPos, pattPos);
            }
          }
        }
      }
      this.startScheduler();
      // Ensure store reflects playing state
      const store = useTransportStore.getState();
      if (!store.isPlaying) store.play();
    } else if (!this.playing && this.song) {
      // Cold start — let the normal React effect → play() handle full init.
      // Don't skip the reload since we need the effect to run.
      this.skipNextReload = false;
      const store = useTransportStore.getState();
      if (!store.isPlaying) store.play();
    }
  }

  /** Get total song positions */
  getTotalPositions(): number { return this.song?.songLength ?? 0; }

  /** Get loaded song data */
  getSong(): TrackerSong | null { return this.song; }

  /** Update a single instrument in the replayer's cached instrument map.
   *  Called when the user replaces/edits an instrument while a song is loaded. */
  updateInstrument(config: InstrumentConfig): void {
    this.instrumentMap.set(config.id, config);
    // Also update the song.instruments array so channel state refs stay current
    if (this.song) {
      const idx = this.song.instruments.findIndex(i => i.id === config.id);
      if (idx >= 0) {
        this.song.instruments[idx] = config;
      }
    }
  }

  /** Whether a WASM engine handles playback (forcePosition is meaningless) */
  get isSuppressNotes(): boolean { return this._suppressNotes; }

  /** Jump to a specific position while playing */
  jumpToPosition(songPos: number, pattPos: number = 0): void {
    this.seekTo(songPos, pattPos);
  }

  /** Temporary BPM offset for DJ nudge — auto-resets after tickCount ticks */
  setNudge(offset: number, tickCount: number = 8): void {
    this.nudgeOffset = offset;
    this.nudgeTicksRemaining = tickCount;
  }

  /** Set line-level loop (quantized to rows within current pattern) */
  setLineLoop(startRow: number, size: number): void {
    this.lineLoopStart = startRow;
    this.lineLoopEnd = startRow + size - 1;
    this.lineLoopActive = true;
    // Save ghost position for slip mode
    if (this.slipEnabled) {
      this.slipSongPos = this.songPos;
      this.slipPattPos = this.pattPos;
    }
  }

  /** Clear line loop */
  clearLineLoop(): void {
    this.lineLoopActive = false;
    this.lineLoopStart = -1;
    this.lineLoopEnd = -1;
    // If slip mode, jump to ghost position
    if (this.slipEnabled) {
      this.seekTo(this.slipSongPos, this.slipPattPos);
    }
  }

  /** Set pattern-level loop (loop between song positions) */
  setPatternLoop(startPos: number, endPos: number): void {
    this.patternLoopStartPos = startPos;
    this.patternLoopEndPos = endPos;
    this.patternLoopActive = true;
    if (this.slipEnabled) {
      this.slipSongPos = this.songPos;
      this.slipPattPos = this.pattPos;
    }
  }

  /** Clear pattern loop */
  clearPatternLoop(): void {
    this.patternLoopActive = false;
    this.patternLoopStartPos = -1;
    this.patternLoopEndPos = -1;
    if (this.slipEnabled) {
      this.seekTo(this.slipSongPos, this.slipPattPos);
    }
  }

  /** Enable/disable slip mode */
  setSlipEnabled(enabled: boolean): void {
    this.slipEnabled = enabled;
    if (enabled) {
      this.slipSongPos = this.songPos;
      this.slipPattPos = this.pattPos;
    }
  }

  /** Get slip (ghost) position state */
  getSlipState(): { enabled: boolean; songPos: number; pattPos: number } {
    return {
      enabled: this.slipEnabled,
      songPos: this.slipSongPos,
      pattPos: this.slipPattPos,
    };
  }

  /**
   * Suppress note/effect processing while still advancing the sequencer.
   * Used during DJ scratch patterns so the pattern view follows the scratch
   * without triggering new note events.
   */
  setSuppressNotes(suppress: boolean): void {
    this._suppressNotes = suppress;
  }

  /** Mark an instrument as replaced — its notes will be fired via ToneEngine
   *  even when libopenmpt handles overall playback (_suppressNotes = true). */
  markInstrumentReplaced(instrumentId: number): void {
    this._replacedInstruments.add(instrumentId);
  }

  /** Unmark an instrument as replaced (revert to libopenmpt playback). */
  unmarkInstrumentReplaced(instrumentId: number): void {
    this._replacedInstruments.delete(instrumentId);
  }

  /** Whether any instruments are replaced with synths. */
  get hasReplacedInstruments(): boolean {
    return this._replacedInstruments.size > 0;
  }

  /** Get the list of replaced instrument IDs (for DBX persistence). */
  get replacedInstrumentIds(): number[] {
    return Array.from(this._replacedInstruments);
  }

  /** Restore replaced instruments from saved state (DBX load). */
  restoreReplacedInstruments(ids: number[]): void {
    this._replacedInstruments.clear();
    for (const id of ids) this._replacedInstruments.add(id);
  }

  /** Set the active WASM engine for dynamic mute mask updates.
   *  Called from startNativeEngines() when a WASM engine starts. */
  setActiveWasmEngine(engine: { setMuteMask(mask: number): void } | null): void {
    this._activeWasmEngine = engine;
  }

  /**
   * Drive the automation player for the current row. Called from
   * coordinator.dispatchEnginePosition for WASM-backed formats so curve
   * automation applies at row boundaries without the TS scheduler running.
   * Sub-row interpolation only happens via processTick (non-WASM path).
   */
  private applyAutomationForRow(): void {
    if (!this.song) return;
    const ap = getAutomationPlayer();
    const curPattern = this.song.patterns[this.song.songPositions[this.songPos]];
    if (!curPattern) return;
    ap.setPattern(curPattern);
    ap.setAutomationData(useAutomationStore.getState().buildAutomationData());
    ap.processPatternRow(this.pattPos);
  }

  /**
   * Read the current row's pattern data and fire per-channel VU meters.
   * Used by WASM-backed formats (libopenmpt, Hively, MusicLine, UADE,
   * JamCracker, FC, Klystrack, etc.) where the TS scheduler doesn't run
   * but the meters still need to animate. Wired into
   * coordinator.context.triggerVUMeters via syncCoordinatorContext().
   *
   * For non-suppressNotes formats the meters fire naturally from
   * triggerNote() inside processRow — this method is a no-op there.
   */
  private triggerVUMetersForRow(time: number): void {
    if (!this._suppressNotes || !this.song) return;
    const engine = getToneEngine();
    if (!this.meterCallbacks) {
      this.meterCallbacks = [];
      this.meterStaging = new Float64Array(64);
      for (let i = 0; i < 64; i++) {
        const ch = i;
        this.meterCallbacks[i] = () => {
          engine.triggerChannelMeter(ch, this.meterStaging[ch]);
        };
      }
    }
    // Read pattern data live from the tracker store so user edits are visible
    const storePatterns = useTrackerStore.getState().patterns;
    const patternNum = this.song.songPositions[this.songPos];
    const livePattern = storePatterns[patternNum];
    if (!livePattern) return;
    for (let ch = 0; ch < Math.min(this.channels.length, livePattern.channels.length); ch++) {
      const row = livePattern.channels[ch]?.rows[this.pattPos];
      if (row && row.note > 0 && row.note < 97) {
        const vol = (row.volume !== undefined && row.volume !== null && row.volume <= 64)
          ? row.volume / 64 : 0.7;
        this.meterStaging[ch] = vol;
        Tone.Draw.schedule(this.meterCallbacks[ch], time);
      }
    }
  }

  /** Compute and apply a mute mask to the active WASM engine.
   *  Channels playing replaced instruments are muted in the WASM engine
   *  so ToneEngine can play the synth replacements without doubling. */
  updateWasmMuteMask(): void {
    if (!this._activeWasmEngine || !this.song) return;
    let mask = 0xFFFFFFFF; // all channels active
    for (let ch = 0; ch < this.channels.length; ch++) {
      const raw = this.channels[ch].instrument;
      const chanInst = typeof raw === 'number' ? raw
        : raw != null && typeof raw === 'object' && 'id' in raw ? (raw as { id: number }).id
        : 0;
      if (chanInst && this._replacedInstruments.has(chanInst)) {
        mask &= ~(1 << ch); // mute this channel in WASM
      }
    }
    this._activeWasmEngine.setMuteMask(mask);
  }

  /**
   * Fire ToneEngine notes for replaced instruments on the current row.
   * Called from WASM engine position callbacks (libopenmpt, UADE, Hively, etc.)
   * so the WASM engine drives timing — no parallel TS scheduler needed.
   *
   * @param time  Audio-accurate timestamp for note scheduling
   */
  private fireHybridNotesForRow(time: number): void {
    if (!this.song || this._replacedInstruments.size === 0) return;

    // Read LIVE pattern data from the tracker store (user edits go here)
    const storePatterns = useTrackerStore.getState().patterns;
    const patternNum = this.song.songPositions[this.songPos];
    const livePattern = storePatterns[patternNum];
    if (!livePattern) return;

    for (let ch = 0; ch < Math.min(this.channels.length, livePattern.channels.length); ch++) {
      const channel = this.channels[ch];
      const row = livePattern.channels[ch]?.rows[this.pattPos];
      if (!row) continue;

      // Determine instrument ID: row's explicit instrument or channel's current
      const chanInst = typeof channel.instrument === 'number' ? channel.instrument
        : channel.instrument != null && typeof channel.instrument === 'object' && 'id' in channel.instrument
          ? (channel.instrument as { id: number }).id : 0;
      const rowInst = row.instrument || 0;

      const wasPlayingSynth = chanInst && this._replacedInstruments.has(chanInst);

      // Case 1: Row triggers a NON-replaced instrument → release synth, let libopenmpt play
      if (row.note > 0 && row.note < 97 && rowInst && !this._replacedInstruments.has(rowInst)) {
        if (wasPlayingSynth) {
          try {
            const engine = getToneEngine();
            const config = this.instrumentMap.get(chanInst);
            if (config) engine.triggerNoteRelease(chanInst, 'C4', time, config, ch);
          } catch { /* ToneEngine not ready */ }
          channel.instrument = null;
        }
        continue;
      }

      // Case 2: Note-off → release synth
      if (row.note === 97 && wasPlayingSynth) {
        try {
          const engine = getToneEngine();
          const config = this.instrumentMap.get(chanInst);
          if (config) engine.triggerNoteRelease(chanInst, 'C4', time, config, ch);
        } catch { /* ToneEngine not ready */ }
        continue;
      }

      // Case 3: Replaced instrument note → fire via ToneEngine
      const instId = rowInst || chanInst;
      if (!instId || !this._replacedInstruments.has(instId)) continue;

      // Only fire on rows with actual notes — empty rows sustain current note
      if (row.note <= 0 || row.note >= 97) continue;

      // Update channel instrument config from the instrumentMap
      const updatedInst = this.instrumentMap.get(instId);
      if (updatedInst) {
        channel.instrument = updatedInst;
      }

      // Fire the note — it sustains until the next note, note-off, or instrument switch.
      // No scheduled release. This matches tracker behavior: notes ring until explicitly stopped.
      this.processHybridRow(ch, channel, row, time);
    }

    // NOTE: We intentionally do NOT call updateWasmMuteMask() here.
    // Muting channels in libopenmpt prevents subsequent non-replaced instrument
    // notes from playing (the unmute arrives too late — the row already rendered
    // as silence). The synth plays on top of the original sample. This is
    // acceptable until the OpenMPT core engine migration (Phase 2+) where
    // libopenmpt becomes the soundlib and we can silence samples directly.
  }

  /**
   * Lightweight row processor for hybrid synth note triggering.
   *
   * Called ONLY from fireHybridNotesForRow() for replaced-instrument channels.
   * Handles: note triggers, note-off, CXX volume, TB-303 slide/accent/mute/hammer,
   * SonicArranger WASM effects. Skips all tick-level effect initialization
   * (portamento targets, vibrato params, etc.) — those will be handled by
   * SynthEffectProcessor once it exists.
   */
  private processHybridRow(chIndex: number, ch: ChannelState, row: TrackerCell, time: number): void {
    if (!this.song) return;

    // TB-303 flag columns: 0=none, 1=accent, 2=slide, 3=mute, 4=hammer
    const accent = (row.flag1 === 1 || row.flag2 === 1);
    const slide = (row.flag1 === 2 || row.flag2 === 2);
    const mute = (row.flag1 === 3 || row.flag2 === 3);
    const hammer = (row.flag1 === 4 || row.flag2 === 4);

    // Mute: silence this channel (TT-303 extension)
    if (mute) {
      ch.gainNode.gain.setValueAtTime(0, time);
      if (ch.player) {
        try { ch.player.stop(time); } catch { /* ignored */ }
        ch.player = null;
      }
      return;
    }

    // Parse effect for CXX volume detection
    const effect = row.effTyp ?? (row.effect ? parseInt(row.effect[0], 16) : 0);
    const param = row.eff ?? (row.effect ? parseInt(row.effect.substring(1), 16) : 0);

    // Instrument lookup
    const instNum = row.instrument ?? 0;
    if (instNum > 0) {
      const instrument = this.instrumentMap.get(instNum);
      if (instrument) {
        ch.instrument = instrument;
        ch.sampleNum = instNum;
      }
    }

    // SonicArranger synth: route per-row WASM effects
    if (ch.instrument?.synthType === 'SonicArrangerSynth') {
      const engine = getToneEngine();
      const saInst = engine.getInstrument(ch.instrument.id, ch.instrument, chIndex);
      if (saInst && typeof (saInst as any).set === 'function') {
        if (row.note > 0 && row.note < 97) {
          (saInst as any).set('speedCounter', 0);
        }
        if (row.saArpTable !== undefined) {
          (saInst as any).set('arpeggioTable', row.saArpTable);
        }
        const arpEffArg = (effect === 0 && param !== 0) ? param : 0;
        (saInst as any).set('effectArpArg', arpEffArg);

        const saEff = row.saEffect ?? 0;
        const saArg = row.saEffectArg ?? 0;
        (saInst as any).set('setSlideSpeed', 0);
        (saInst as any).set('volumeSlide', 0);
        switch (saEff) {
          case 0x1: (saInst as any).set('setSlideSpeed', saArg); break;
          case 0x2: (saInst as any).set('restartAdsr', saArg); break;
          case 0x4: (saInst as any).set('setVibrato', saArg); break;
          case 0x7: (saInst as any).set('setPortamento', saArg); break;
          case 0x8: (saInst as any).set('skipPortamento', 0); break;
          case 0xA: (saInst as any).set('volumeSlide', saArg); break;
          case 0x9:
            if (saArg > 0 && saArg <= 128) this._saTrackLen = saArg;
            break;
        }
      }
    }

    const noteValue = row.note;
    const rawPeriod = row.period;
    const prob = row.probability;
    const probabilitySkip = prob !== undefined && prob > 0 && prob < 100 && Math.random() * 100 >= prob;

    // Note-off
    if (noteValue === 97) {
      ch.previousSlideFlag = false;
      this.releaseMacros(ch);
      this.stopChannel(ch, chIndex, time);
      return;
    }

    // Normal note trigger
    if (noteValue && noteValue > 0 && noteValue < 97 && !probabilitySkip) {
      ch.xmNote = noteValue;

      // Determine playback period/pitch
      const usePeriod = this.noteToPlaybackPeriod(noteValue, rawPeriod, ch);
      ch.note = usePeriod;
      ch.period = ch.note;

      // TB-303 slide semantics
      const effectiveSlide = slide || hammer;
      const slideActive = ch.previousSlideFlag && noteValue !== null && !hammer;

      // Resolve note name (synths use XM note numbers directly)
      const isSynthInstrument = ch.instrument?.synthType && ch.instrument.synthType !== 'Sampler';
      const newNoteName = (this.useXMPeriods || isSynthInstrument)
        ? xmNoteToNoteName(noteValue)
        : periodToNoteName(usePeriod);

      // Apply CXX (set volume) from all effect columns before triggering
      if (effect === 0xC) {
        ch.volume = Math.min(64, param);
        ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
      }
      for (const [eTyp, eVal] of [
        [row.effTyp2, row.eff2], [row.effTyp3, row.eff3], [row.effTyp4, row.eff4],
        [row.effTyp5, row.eff5], [row.effTyp6, row.eff6], [row.effTyp7, row.eff7],
        [row.effTyp8, row.eff8],
      ]) {
        if (eTyp === 0xC && eVal !== undefined) {
          ch.volume = Math.min(64, eVal);
          ch.gainNode.gain.setValueAtTime(ch.volume / 64, time);
        }
      }

      // Release previous synth note (unless sliding)
      if (!slideActive && ch.lastPlayedNoteName && ch.instrument?.synthType && ch.instrument.synthType !== 'Sampler') {
        try {
          getToneEngine().triggerNoteRelease(ch.instrument.id, ch.lastPlayedNoteName, time, ch.instrument, chIndex);
        } catch { /* ignored */ }
      }
      ch.lastPlayedNoteName = newNoteName;

      // Trigger the synth note
      this.triggerNote(ch, time, 0, chIndex, accent, slideActive, effectiveSlide, hammer);

      // Update slide flag for next row
      ch.previousSlideFlag = (slide || hammer) ?? false;
    }
  }

  /**
   * Process row-level notes and effects for pure synth songs (no WASM engine).
   * Called from processTick on tick 0 when _suppressNotes is false.
   * Handles: note triggers (via processHybridRow), Fxx speed/tempo, Bxx position
   * jump, Dxx pattern break, F00 stop, CXX volume.
   */
  private processRowForSynths(time: number): void {
    if (!this.song) return;

    const storePatterns = useTrackerStore.getState().patterns;
    const patternNum = this.song.songPositions[this.songPos];
    const livePattern = storePatterns[patternNum];
    if (!livePattern) return;

    for (let ch = 0; ch < Math.min(this.channels.length, livePattern.channels.length); ch++) {
      const channel = this.channels[ch];
      const row = livePattern.channels[ch]?.rows[this.pattPos];
      if (!row) continue;

      // Process row-level effects (Fxx, Bxx, Dxx) for all channels
      const effect = row.effTyp ?? (row.effect ? parseInt(row.effect[0], 16) : 0);
      const param = row.eff ?? (row.effect ? parseInt(row.effect.substring(1), 16) : 0);

      if (effect === 0xF && param > 0) {
        // Fxx: Set speed (1-31) or tempo (32+)
        if (param < 32) {
          this.speed = param;
        } else {
          this.bpm = param;
        }
      } else if (effect === 0xB) {
        // Bxx: Position jump
        this.songPos = param - 1; // advanceRow will increment
        this.posJumpFlag = true;
      } else if (effect === 0xD) {
        // Dxx: Pattern break (BCD in MOD, hex in XM)
        const breakRow = this.useXMPeriods ? param : ((param >> 4) * 10 + (param & 0xF));
        this.pBreakPos = breakRow;
        this.posJumpFlag = true;
      } else if (effect === 0xF && param === 0) {
        // F00: Stop song
        this.stop();
        return;
      }

      // Also scan extra effect columns for Fxx/Bxx/Dxx
      for (const [eTyp, eVal] of [
        [row.effTyp2, row.eff2], [row.effTyp3, row.eff3], [row.effTyp4, row.eff4],
        [row.effTyp5, row.eff5], [row.effTyp6, row.eff6], [row.effTyp7, row.eff7],
        [row.effTyp8, row.eff8],
      ]) {
        if (eTyp === 0xF && eVal !== undefined && eVal > 0) {
          if (eVal < 32) this.speed = eVal; else this.bpm = eVal;
        } else if (eTyp === 0xB && eVal !== undefined) {
          this.songPos = eVal - 1;
          this.posJumpFlag = true;
        } else if (eTyp === 0xD && eVal !== undefined) {
          this.pBreakPos = this.useXMPeriods ? eVal : ((eVal >> 4) * 10 + (eVal & 0xF));
          this.posJumpFlag = true;
        }
      }

      // Determine instrument ID
      const instNum = row.instrument ?? 0;
      if (instNum > 0) {
        const instrument = this.instrumentMap.get(instNum);
        if (instrument) {
          channel.instrument = instrument;
          channel.sampleNum = instNum;
        }
      }

      // Get the effective instrument
      const chanInst = typeof channel.instrument === 'number' ? channel.instrument
        : channel.instrument != null && typeof channel.instrument === 'object' && 'id' in channel.instrument
          ? (channel.instrument as { id: number }).id : 0;
      const inst = chanInst ? this.instrumentMap.get(chanInst) : null;
      const isSynth = inst?.synthType && inst.synthType !== 'Sampler';

      // Note-off
      if (row.note === 97) {
        if (isSynth && inst) {
          try {
            const noteName = channel.lastPlayedNoteName || 'C4';
            getToneEngine().triggerNoteRelease(inst.id, noteName, time, inst, ch);
          } catch { /* ignored */ }
        }
        this.stopChannel(channel, ch, time);
        continue;
      }

      // Trigger synth notes via processHybridRow
      if (row.note > 0 && row.note < 97 && isSynth) {
        this.processHybridRow(ch, channel, row, time);
      }
    }

    // Trigger VU meters
    const engine = getToneEngine();
    if (!this.meterCallbacks) {
      this.meterCallbacks = [];
      this.meterStaging = new Float64Array(64);
      for (let i = 0; i < 64; i++) {
        const idx = i;
        this.meterCallbacks[i] = () => {
          engine.triggerChannelMeter(idx, this.meterStaging[idx]);
        };
      }
    }
    for (let ch = 0; ch < Math.min(this.channels.length, livePattern.channels.length); ch++) {
      const row = livePattern.channels[ch]?.rows[this.pattPos];
      if (row && row.note > 0 && row.note < 97) {
        const vol = (row.volume !== undefined && row.volume !== null && row.volume <= 64)
          ? row.volume / 64 : 0.7;
        this.meterStaging[ch] = vol;
        Tone.Draw.schedule(this.meterCallbacks[ch], time);
      }
    }
  }

  // ==========================================================================
  // WASM SEQUENCER CELL SYNC
  // ==========================================================================

  /** Whether the WASM sequencer is actively driving playback */
  get isWasmSequencerActive(): boolean {
    return this.useWasmSequencer;
  }

  /**
   * Sync a pattern cell edit to the WASM sequencer (fire-and-forget).
   * Called from the tracker store when cells are edited during Furnace playback.
   * Maps TrackerCell fields to WASM sequencer column indices:
   *   col 0 = note, col 1 = instrument, col 2 = volume,
   *   col 3+fx*2 = effect cmd, col 4+fx*2 = effect val
   */
  syncCellToWasmSequencer(ch: number, patIdx: number, row: number, cell: Partial<import('@/types/tracker').TrackerCell>): void {
    if (!this.useWasmSequencer) return;
    import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
      const engine = FurnaceDispatchEngine.getInstance();
      if (cell.note !== undefined)       engine.seqSetCell(ch, patIdx, row, 0, cell.note);
      if (cell.instrument !== undefined) engine.seqSetCell(ch, patIdx, row, 1, cell.instrument);
      if (cell.volume !== undefined)     engine.seqSetCell(ch, patIdx, row, 2, cell.volume);
      if (cell.effTyp !== undefined)     engine.seqSetCell(ch, patIdx, row, 3, cell.effTyp);
      if (cell.eff !== undefined)        engine.seqSetCell(ch, patIdx, row, 4, cell.eff);
      if (cell.effTyp2 !== undefined)    engine.seqSetCell(ch, patIdx, row, 5, cell.effTyp2);
      if (cell.eff2 !== undefined)       engine.seqSetCell(ch, patIdx, row, 6, cell.eff2);
    }).catch(() => {});
  }

  // ==========================================================================
  // PER-DECK PITCH/TEMPO (DJ mode isolation)
  // ==========================================================================

  /** Set the tempo multiplier (changes scheduler speed without touching ToneEngine globals) */
  setTempoMultiplier(m: number): void {
    this.tempoMultiplier = m;
  }

  /** Get the current tempo multiplier */
  getTempoMultiplier(): number {
    return this.tempoMultiplier;
  }

  /** Set the sample playback rate multiplier + update all currently playing samples */
  setPitchMultiplier(m: number): void {
    this.pitchMultiplier = m;
    this.updateAllPlaybackRates();
  }

  /** Re-sync the scheduler timeline to now so the next tick fires immediately.
   *  Call after restoring tempoMultiplier from a very low scratch value,
   *  otherwise nextScheduleTime may be seconds/minutes in the future. */
  resyncSchedulerToNow(): void {
    this.nextScheduleTime = Tone.now();
  }

  /** Pause all active WASM engines (for scratch mode) */
  pauseNativeEnginesForScratch(): void {
    pauseNativeEngines(this.routedNativeEngines);
  }

  /** Resume all active WASM engines (after scratch mode) */
  resumeNativeEnginesAfterScratch(): void {
    resumeNativeEngines(this.routedNativeEngines, this._muted);
  }

  /** Set per-deck synth detune in cents */
  setDetuneCents(cents: number): void {
    this.deckDetuneCents = cents;
  }

  /** Get per-deck detune cents */
  getDetuneCents(): number {
    return this.deckDetuneCents;
  }

  /**
   * Set per-deck channel mute mask (DJ mode only).
   * Bit N = 1 → channel N is audible; bit N = 0 → channel N is muted.
   * Kept isolated per-replayer so Deck A and Deck B don't interfere.
   */
  setChannelMuteMask(mask: number): void {
    this.channelMuteMask = mask;
    // Forward to the active WASM engine for actual channel muting.
    if (this._activeWasmEngine) {
      this._activeWasmEngine.setMuteMask(mask);
    }
    // Also forward to LibopenmptEngine if it's the active audio renderer.
    import('@engine/libopenmpt/LibopenmptEngine').then(({ LibopenmptEngine }) => {
      if (LibopenmptEngine.hasInstance()) {
        LibopenmptEngine.getInstance().setMuteMask(mask);
      }
    }).catch(() => {});
  }

  // ==========================================================================
  // STEREO SEPARATION
  // ==========================================================================

  /**
   * Set stereo separation percentage (0-100).
   * 0 = mono (all channels center), 100 = full Amiga hard-pan.
   * Default: 20 for MOD (matching pt2-clone), 100 for XM/IT/S3M.
   *
   * Applies per-channel pan narrowing: actual_pan = basePan * (separation / 100)
   * This matches MilkyTracker and Schism Tracker's approach.
   */
  setStereoSeparation(percent: number): void {
    this.stereoSeparation = Math.max(0, Math.min(100, percent));
    if (this.stereoMode === 'pt2') {
      for (const ch of this.channels) {
        this.applyChannelPan(ch);
      }
    }
  }

  getStereoSeparation(): number {
    return this.stereoSeparation;
  }

  /**
   * Switch between PT2-clone and ModPlug stereo separation algorithms.
   * PT2:    per-channel pan positions are scaled toward center.
   * ModPlug: mid-side decomposition applied post-mix (OpenMPT algorithm).
   */
  setStereoSeparationMode(mode: 'pt2' | 'modplug'): void {
    this.stereoMode = mode;
    if (mode === 'pt2') {
      // Bypass the post-mix node (identity) and restore per-channel pan scaling
      this.separationNode.setSeparation(100);
      for (const ch of this.channels) {
        this.applyChannelPan(ch);
      }
    } else {
      // Activate post-mix node; set all channels to full (unscaled) basePan
      this.separationNode.setSeparation(this.modplugSeparation);
      for (const ch of this.channels) {
        ch.panNode.pan.rampTo(ch.basePan, 0.02);
      }
    }
  }

  /**
   * Set ModPlug separation percentage (0–200).
   * Only has effect when stereoMode === 'modplug'.
   */
  setModplugSeparation(percent: number): void {
    this.modplugSeparation = Math.max(0, Math.min(200, percent));
    if (this.stereoMode === 'modplug') {
      this.separationNode.setSeparation(this.modplugSeparation);
    }
  }

  getModplugSeparation(): number {
    return this.modplugSeparation;
  }

  getStereoSeparationMode(): 'pt2' | 'modplug' {
    return this.stereoMode;
  }

  /**
   * Apply stereo separation to a channel's pan node.
   * Uses the channel's basePan (original LRRL position) scaled by separation.
   */
  private applyChannelPan(ch: ChannelState): void {
    const actualPan = this.stereoMode === 'pt2'
      ? ch.basePan * (this.stereoSeparation / 100)
      : ch.basePan;
    ch.panNode.pan.rampTo(actualPan, 0.02);
  }

  /** Get effective playback rate for sample pitch (per-deck in DJ mode, global otherwise) */
  getEffectivePlaybackRate(): number {
    if (this.isDJDeck) {
      return this.pitchMultiplier;
    }
    const engine = getToneEngine();
    return engine.getGlobalPlaybackRate();
  }

  /** Get elapsed time in milliseconds based on rows processed */
  getElapsedMs(): number {
    if (!this.song) return 0;
    // Approximate: each row takes (speed * 2.5 / BPM) seconds
    // In DJ mode, tempo multiplier affects tick duration
    const effectiveBPM = this.bpm * this.tempoMultiplier;
    const tickDuration = 2.5 / effectiveBPM;
    return this.totalRowsProcessed * this.speed * tickDuration * 1000;
  }

  // ==========================================================================
  // SONG LOADING
  // ==========================================================================

  loadSong(song: TrackerSong): void {
    // Stop without saving position — loadSong is a preparation step, not a
    // user-initiated stop. The user's stop already saved the correct position
    // via stop(true). Without this, the effect's loadSong → stop → setCurrentRow(0)
    // overwrites the saved position for WASM singleton engines (JamCracker etc.).
    // Skip native engine stop — startNativeEngines will handle reload. Stopping
    // them here destroys WASM state that the subsequent play() needs.
    this.stop(false, true);
    this._hasPlayedOnce = false;
    this._replacedInstruments.clear();
    this._activeWasmEngine = null;
    // Reset format compat flag so the warning fires again for the new song
    import('@/lib/formatCompatibility').then(({ resetFormatViolations }) => {
      resetFormatViolations();
    }).catch(() => {});

    // Restore any native engines rerouted to separation chain (UADE/Hively)
    restoreNativeRouting(this.routedNativeEngines);

    // Reset the OpenMPT edit bridge — it will be re-activated by parseWithOpenMPT
    // if the new song is a MOD/XM/IT/S3M loaded via the soundlib
    import('@engine/libopenmpt/OpenMPTEditBridge').then(b => b.reset()).catch(() => {});

    this.song = song;

    // Configure format-dispatching pattern accessor
    if (song.furnaceNative) {
      this.accessor.setFurnace(song.furnaceNative, song.patterns, song.songPositions);
    } else if (song.hivelyNative) {
      this.accessor.setHively(song.hivelyNative, song.patterns, song.songPositions);
    } else {
      this.accessor.setClassic(song.patterns, song.songPositions);
    }

    this.bufferCache.clear();
    this.multiSampleBufferCache.clear(); // New song = new samples, invalidate cache
    this.instrumentMap = new Map(song.instruments.map(i => [i.id, i]));

    // NOTE: We do NOT call disposeAllInstruments() here.
    // Instrument disposal is handled by loadInstruments() in useInstrumentStore
    // which runs BEFORE the playback effect calls loadSong().
    // Disposing here would kill freshly-created instruments, causing silence
    // when loading a second song while the first was playing.

    // Pre-load any embedded-buffer Sampler instruments so ToneEngine begins decoding
    // immediately on song load rather than lazily on first note trigger.
    // Without this, the first note fired per instrument is always dropped while
    // decodeAudioData() runs asynchronously.
    // Skip when libopenmpt will handle playback — no need for ToneEngine samples.
    if (!song.libopenmptFileData) {
      const engine = getToneEngine();
      for (const inst of song.instruments) {
        if (inst.synthType === 'Sampler' && inst.sample?.audioBuffer && !engine.getDecodedBuffer(inst.id)) {
          engine.getInstrument(inst.id, inst);
        }
      }
    }

    // Pre-initialize MusicLine WASM when an ML song is loaded so instrument preview
    // works immediately (before the user presses play).
    if (song.musiclineFileData) {
      preInitMusicLine(song.musiclineFileData);
    }

    // Reset scratch buffer — new song means old captured audio is stale.
    // Lazy import to avoid circular dependency.
    import('@/engine/TrackerScratchController').then(({ getTrackerScratchController }) => {
      getTrackerScratchController().resetScratchBuffer();
    }).catch(() => { /* scratch not available */ });

    // Dispose old channels before creating new ones (prevent Web Audio node leaks)
    for (const a of this.channelAnalysers) {
      try { a.disconnect(); } catch { /* ignored */ }
    }
    this.channelAnalysers = [];
    for (const ch of this.channels) {
      for (const p of ch.playerPool) {
        try { p.dispose(); } catch { /* ignored */ }
      }
      try { ch.gainNode.dispose(); } catch { /* ignored */ }
      try { ch.panNode.dispose(); } catch { /* ignored */ }
      try { ch.muteGain.dispose(); } catch { /* ignored */ }
    }

    // Recreate master routing chain if AudioContext changed (e.g. iOS audio unlock,
    // Furnace WASM init creates a new context). Without this, new Tone nodes on the
    // current context can't connect to masterGain on the old context → InvalidAccessError.
    try {
      const testNode = new Tone.Gain(0);
      testNode.connect(this.masterGain);
      testNode.dispose();
    } catch {
      // Context mismatch — rebuild the routing chain.
      // IMPORTANT: call getToneEngine() FIRST so ToneEngine (re)creates its AudioContext
      // and calls Tone.setContext() before we create any new Tone.js nodes. Otherwise
      // the new nodes end up on a stale Tone context and can't connect to masterInput.
      const engine = this.isDJDeck ? null : getToneEngine();
      // Sync Tone.js to the engine's context before creating new nodes.
      // getToneEngine() may return an existing engine whose masterInput is on context C1
      // while Tone.js was left on a different context C2 (e.g. by offline rendering in
      // SynthBaker/previewGenerator). Creating newSep on C2 then connecting to masterInput
      // on C1 would throw another InvalidAccessError.
      if (engine) {
        Tone.setContext(engine.nativeContext);
      }
      try { this.masterGain.dispose(); } catch { /* ignored */ }
      this.separationNode.dispose();
      this.masterGain = new Tone.Gain(1);
      const newSep = new StereoSeparationNode();
      this.masterGain.connect(newSep.inputTone);
      if (engine) {
        newSep.outputTone.connect(engine.masterInput);
      }
      // Replace the readonly separation node
      (this as unknown as { separationNode: StereoSeparationNode }).separationNode = newSep;
    }

    // Initialize channels
    this.channels = [];
    for (let i = 0; i < song.numChannels; i++) {
      this.channels.push(this.createChannel(i, song.numChannels));
    }

    // Set stereo separation default based on format:
    // MOD/AHX (Amiga) = 20% (matching pt2-clone default — the Amiga's hard LRRL
    // sounds harsh on headphones; 20% gives pleasant width without hard panning)
    // HVL = derived from stereo mode in file header (0=center, 1-4=increasing separation)
    // XM/IT/S3M = 100% (these formats have their own per-channel panning)
    if (song.format === 'MOD' || song.format === 'AHX' || song.format === 'FC') {
      this.stereoSeparation = 20; // Amiga LRRL with pt2-clone-style narrowing
    } else if (song.format === 'HVL') {
      // HVL stereo mode 0=center, 1-4 = increasing separation
      this.stereoSeparation = song.hivelyMeta?.stereoMode
        ? (song.hivelyMeta.stereoMode * 25) : 50;
    } else {
      this.stereoSeparation = 100;
    }

    // FT2 XM period system: use for XM/IT/S3M files, not for MOD/HVL/AHX
    // XM, IT, S3M and AdPlug all use note numbers (1-96/120) instead of Amiga periods
    this.useXMPeriods = song.format === 'XM' || song.format === 'IT' || song.format === 'S3M' || song.format === 'AdPlug';
    this.linearPeriods = song.linearPeriods ?? (song.format === 'XM' || song.format === 'AdPlug');

    // Set initial playback state
    this.songPos = 0;
    this.pattPos = 0;
    this.currentTick = 0;
    this.speed = song.initialSpeed;
    this.bpm = song.initialBPM;
    this.pBreakFlag = false;
    this.pBreakPos = 0;
    this.posJumpFlag = false;
    this.patternDelay = 0;
    this.pattDelTime = 0;
    this.pattDelTime2 = 0;

    // Reset per-deck pitch/tempo state (prevents carry-over between songs & views)
    this.tempoMultiplier = 1.0;
    this.pitchMultiplier = 1.0;
    this.deckDetuneCents = 0;

    // For the global tracker replayer, also reset ToneEngine globals
    // (Wxx effects modify these, and they persist across song loads otherwise)
    if (!this.isDJDeck) {
      const engine = getToneEngine();
      engine.setGlobalPlaybackRate(1.0);
      engine.setGlobalDetune(0);
      // Reset Tone.js transport BPM and store display to match the new song
      Tone.getTransport().bpm.value = song.initialBPM;
      useTransportStore.getState().setBPM(song.initialBPM);
      useTransportStore.getState().setGlobalPitch(0);
    }

    // Clear stale callbacks from previous song
    this.coordinator.clearCallbacks();

    // Furnace speed alternation: if speed2 differs from speed1, enable alternation
    if (song.speed2 !== undefined && song.speed2 !== song.initialSpeed) {
      this.speed2 = song.speed2;
      this.speedAB = false; // false = row 0 uses speed1; after advance, alternates to speed2
    } else {
      this.speed2 = null;
      this.speedAB = false;
    }

    // Furnace groove: initialized to null, activated at runtime via effect 09xx.
    // Grooves replace speed alternation — each row uses a different tick count from the groove table.
    this.activeGroove = null;
    this.groovePos = 0;

    // Per-channel sequencing state (MusicLine Editor and similar formats)
    if (song.channelTrackTables) {
      const n = song.numChannels;
      this.channelTickCounters  = Array.from({ length: n }, () => 0);
      this.channelPattPos       = Array.from({ length: n }, () => 0);
      this.channelSongPos       = Array.from({ length: n }, () => 0);
      this.channelGrooveToggle  = Array.from({ length: n }, () => false);
    } else {
      this.channelTickCounters  = [];
      this.channelPattPos       = [];
      this.channelSongPos       = [];
      this.channelGrooveToggle  = [];
    }

  }

  private createChannel(index: number, totalChannels: number): ChannelState {
    // Amiga LRRL panning: channels 0,3 = hard left, 1,2 = hard right
    // Uses the Schism Tracker formula: (((n+1)>>1) & 1) gives 0,1,1,0 pattern
    // basePan stores the original position; stereoSeparation scales it for output.
    let basePan: number;
    if (totalChannels <= 4) {
      // Classic 4-channel Amiga: LRRL at full ±1.0
      basePan = (((index + 1) >> 1) & 1) ? 1.0 : -1.0;
    } else {
      // >4 channels: LRRL repeating pattern at full ±1.0
      basePan = (((index + 1) >> 1) & 1) ? 1.0 : -1.0;
    }

    const panValue = this.stereoMode === 'pt2'
      ? basePan * (this.stereoSeparation / 100)
      : basePan;

    const panNode = new Tone.Panner(panValue);
    const gainNode = new Tone.Gain(1);
    const muteGain = new Tone.Gain(1); // Dedicated mute/solo gain
    gainNode.connect(panNode);
    panNode.connect(muteGain);
    muteGain.connect(this.masterGain);

    // Pre-allocate player pool and connect to gain node
    const playerPool: Tone.Player[] = [];
    for (let p = 0; p < PLAYERS_PER_CHANNEL; p++) {
      const player = new Tone.Player();
      player.connect(gainNode);
      playerPool.push(player);
    }

    return {
      note: 0,
      period: 0,
      volume: 64,
      panning: 128,
      basePan,
      sampleNum: 0,
      finetune: 0,
      relativeNote: 0,
      portaSpeed: 0,
      portaTarget: 0,
      tonePortaSpeed: 0,
      vibratoPos: 0,
      vibratoCmd: 0,
      tremoloPos: 0,
      tremoloCmd: 0,
      tremoloSpeed: 0,
      tremoloDepth: 0,
      waveControl: 0,
      glissandoMode: false,
      tremorPos: 0,
      tremorParam: 0,
      noteRetrigSpeed: 0,
      noteRetrigVol: 0,
      noteRetrigCounter: 0,
      volColumnVol: 0,
      volSlideSpeed: 0,
      panSlide: 0,
      macroPos: 0,
      macroReleased: false,
      macroPitchOffset: 0,
      macroArpNote: 0,
      keyOff: false,
      outVol: 64,
      outPan: 128,
      previousSlideFlag: false,
      lastPlayedNoteName: null,
      xmNote: 0,
      player: null,
      playerPool,
      gainNode,
      panNode,
      muteGain,
      instrument: null,
      _muteState: false,
    };
  }

  // ==========================================================================
  // PLAYBACK CONTROL
  // ==========================================================================

  // Lookahead scheduling state (BassoonTracker pattern)
  // BassoonTracker uses: 200ms initial buffer, 1 SECOND during playback, scheduler every 10ms
  // 250ms lookahead gives resilience against main-thread stalls (React re-renders at
  // pattern boundaries can block setInterval for 50-150ms). Groove/swing offsets are
  // applied per-tick relative to their own time, so larger lookahead is safe.
  private scheduleAheadTime = 0.25;
  private schedulerInterval = 0.010; // Check every 10ms (fills more frequently)
  private nextScheduleTime = 0;
  
  private lastGrooveTemplateId = 'straight';
  private lastSwingAmount = 100;
  private lastGrooveSteps = 2;

  // Raw interval timer ID (more reliable than Tone.Loop for scheduling)
  private schedulerTimerId: ReturnType<typeof setInterval> | null = null;

  async play(): Promise<void> {
    if (!this.song) return;

    const _debug = (window as any).REPLAYER_DEBUG;
    const _playT0 = _debug ? performance.now() : 0;
    const _playLog = _debug
      ? (label: string) => console.log(`[TrackerReplayer.play] ${label}: ${(performance.now() - _playT0).toFixed(0)}ms`)
      : () => {};
    // Gate all play-path logging behind debug flag to avoid latency from console I/O
    const _log = _debug ? console.log.bind(console) : () => {};
    const _warn = _debug ? console.warn.bind(console) : () => {};

    // If already playing (e.g. reload path), stop first so we don't orphan schedulers
    if (this.playing) {
      this.stop();
    }

    // Bump generation so any in-flight async play() from a previous call aborts
    const gen = ++this._playGeneration;

    // Reset note suppression — startNativeEngines will re-enable if needed for this song
    this._suppressNotes = false;
    // NOTE: _replacedInstruments is NOT cleared here — it persists across play/stop.
    // It's only cleared in loadSong() when a genuinely new song is loaded.

    // Refresh the coordinator's playback context (songPositions / bpm / speed /
    // hybrid hook / audio context). Engines that subscribe to position updates
    // dispatch through the coordinator and read from this on every callback.
    this.syncCoordinatorContext();
    // Reset the dispatch-active flag — each engine that wires a position
    // subscription this play() will set it back to true via markDispatchActive.
    // The end-of-play() guard reads it to decide whether to skip the scheduler.
    this.coordinator.hasActiveDispatch = false;

    await unlockIOSAudio(); // Play silent MP3 + pump AudioContext for iOS
    _playLog('unlockIOSAudio');
    if (gen !== this._playGeneration) return; // stale — another play/stop happened
    await Tone.start();
    _playLog('Tone.start');
    if (gen !== this._playGeneration) return;

    // CRITICAL: Wait for AudioContext to actually be running
    // Tone.start() may return before context state changes
    // Use raw AudioContext for state check (Tone.context.state has narrower TS types)
    const rawCtx = Tone.context.rawContext;
    const getState = () => rawCtx.state as string;
    if (getState() !== 'running') {
      await Tone.context.resume();
      if (gen !== this._playGeneration) return;
      // Poll for running state with timeout
      const maxWait = 2000;
      const startTime = Date.now();
      while (getState() !== 'running' && Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (gen !== this._playGeneration) return;
      }
      if (getState() !== 'running') {
        console.error(`[TrackerReplayer] AudioContext failed to start: ${getState()}`);
        return;
      }
    }
    _playLog('AudioContext running');

    // Ensure WASM synths (Open303, etc.) are initialized before starting playback.
    const engine = getToneEngine();
    await engine.ensureWASMSynthsReady(this.song.instruments);
    _playLog('ensureWASMSynthsReady');
    if (gen !== this._playGeneration) return;

    // Start all native WASM engines (HVL, JamCracker, SID, MusicLine, UADE routing)
    {
      const result = await startNativeEngines(
        this.song,
        this.separationNode.inputTone,
        this.isDJDeck,
        this._muted,
        this.routedNativeEngines,
      );
      _playLog('startNativeEngines');
      if (gen !== this._playGeneration) return;
      if (result.suppressNotes) this._suppressNotes = true;
      if (result.c64SidEngine) this.c64SidEngine = result.c64SidEngine;
      if (result.sf2Engine) this.sf2Engine = result.sf2Engine;
      // Wire the active WASM engine for hybrid playback mute mask updates.
      // Try engines returned in the result first, then probe singletons.
      if (result.uadeEngine && 'setMuteMask' in result.uadeEngine) {
        this._activeWasmEngine = result.uadeEngine;
      } else if (result.musicLineEngine && 'setMuteMask' in result.musicLineEngine) {
        this._activeWasmEngine = result.musicLineEngine as unknown as { setMuteMask(mask: number): void };
      } else if (result.hivelyEngine && 'setMuteMask' in result.hivelyEngine) {
        this._activeWasmEngine = result.hivelyEngine as unknown as { setMuteMask(mask: number): void };
      } else if (result.suppressNotes) {
        // A WASM engine started but wasn't in the result — probe singletons
        // This covers JamCracker, FC, Klystrack, PxTone, Organya, etc.
        void import('@stores/useMixerStore').then(({ getActiveGainEngine }) => {
          const engine = getActiveGainEngine();
          if (engine && 'setMuteMask' in engine) {
            this._activeWasmEngine = engine as { setMuteMask(mask: number): void };
          }
        }).catch(() => {});
      }

      // Subscribe to HivelyEngine position updates (~15fps from WASM).
      // The engine's subscribeToCoordinator() handles throttling + dispatch.
      if (result.hivelyEngine) {
        this.hivelyEngine = result.hivelyEngine;
        this._hvlPositionUnsub = this.hivelyEngine.subscribeToCoordinator(this.coordinator);
        this.coordinator.markDispatchActive();
        _playLog('HVL position subscription active');
      }

      // Subscribe to MusicLineEngine position updates.
      if (result.musicLineEngine) {
        this._mlPositionUnsub = result.musicLineEngine.subscribeToCoordinator(this.coordinator);
        this.coordinator.markDispatchActive();
      }

      // UADE setup — position subscription with CIA-tick→row math, Paula log
      // polling for automation capture, optional deferred pattern reconstruction
      // for SKIP_SCAN formats, and optional TFMX timing-table position sync.
      // All ~110 lines of glue now live in UADEEngine.subscribeToCoordinator.
      // Only mark dispatch active if a position subscription was actually wired
      // (uadeFirstTick != null OR tfmxTimingTable populated). UADE songs without
      // a known firstTick (some FC/JAM/etc. variants) still need the TS scheduler
      // for VU/automation/display state updates.
      if (result.uadeEngine && typeof result.uadeEngine.subscribeToCoordinator === 'function') {
        this._uadePositionUnsub = result.uadeEngine.subscribeToCoordinator(
          this.coordinator,
          this.song,
          () => this.playing && this.song != null,
        );
        const uadeHasPositionDispatch = this.song.uadeFirstTick != null
          || (this.song.tfmxTimingTable != null && this.song.tfmxTimingTable.length > 0);
        if (uadeHasPositionDispatch) {
          this.coordinator.markDispatchActive();
        }
        if (this.song.uadeFirstTick != null) _playLog('UADE position subscription active');
        if (this.song.tfmxTimingTable) _playLog('TFMX timing-table position subscription active');
      }
    }

    this.playing = true;

    // ── Universal hybrid playback setup (ALL formats) ──────────────────────
    // Rebuild _replacedInstruments from current instrument store state.
    // Any instrument whose synthType is not Sampler/Player AND not a native
    // whole-song player type is "replaced" — the hybrid block will fire
    // ToneEngine notes for it. Native whole-song players (HVL, TFMX, FC,
    // SID, etc.) handle all their instruments internally via the engine
    // singleton — they must NOT get standalone players.
    {
      const nativeWholePlayerTypes = new Set([
        'HivelySynth', 'UADESynth', 'UADEEditableSynth', 'SymphonieSynth',
        'MusicLineSynth', 'JamCrackerSynth', 'PreTrackerSynth', 'FuturePlayerSynth',
        'TFMXSynth', 'FCSynth', 'C64SID',
        // OPL3: AdPlug streaming player handles audio when adplugFileData is present.
        // The replayer displays patterns and follows position — same as UADE editable.
        'OPL3',
        // WASM player-pool synths — each has a fixed-size pool, must dedup
        'SoundMonSynth', 'SidMonSynth', 'SidMon1Synth', 'DigMugSynth',
        'FredSynth', 'FredEditorReplayerSynth', 'OctaMEDSynth',
        'HippelCoSoSynth', 'RobHubbardSynth', 'SteveTurnerSynth',
        'DavidWhittakerSynth', 'SonicArrangerSynth',
        'InStereo2Synth', 'InStereo1Synth', 'StartrekkerAMSynth',
        'DeltaMusic1Synth', 'DeltaMusic2Synth',
      ]);
      const { useInstrumentStore } = await import('@stores/useInstrumentStore');
      const instruments = useInstrumentStore.getState().instruments;
      for (const inst of instruments) {
        if (inst.synthType !== 'Sampler' && inst.synthType !== 'Player'
            && !nativeWholePlayerTypes.has(inst.synthType || '')) {
          this._replacedInstruments.add(inst.id);
        }
      }
      if (this._replacedInstruments.size > 0) {
        console.log('[HybridPlayback] Replaced instruments:', Array.from(this._replacedInstruments));
      }
    }

    // Start automation capture → store sync (converts register writes to automation curves).
    // The coordinator owns the timer; we hand it a closure that knows our song context.
    resetCaptureSync();
    this.coordinator.startCaptureSync(() => {
      if (!this.playing || !this.song) return;
      const pat = this.song.patterns[this.song.songPositions?.[this.songPos] ?? 0];
      if (!pat) return;
      const speed = this.speed || this.song.initialSpeed || 6;
      const firstTick = (this.song as any).uadeFirstTick ?? 0;
      syncCaptureToStore(pat.id, speed, firstTick, pat.length);
    });

    const transportState = useTransportStore.getState();
    this.lastGrooveTemplateId = transportState.grooveTemplateId;
    this.lastSwingAmount = transportState.swing;
    this.lastGrooveSteps = transportState.grooveSteps;

    // Wait for any pending Sampler/Player buffer decodes before starting the tick loop.
    // Without this, the first note on each sample-based instrument is dropped because
    // decodeAudioData() hasn't completed by the time the first tick fires.
    await engine.awaitPendingLoads();
    _playLog('awaitPendingLoads');
    if (gen !== this._playGeneration) return;

    // WASM sequencer path: if Furnace native data exists, upload it to the WASM sequencer
    // (which lives in the AudioWorklet) and delegate all tick processing there.
    // Must happen AFTER ensureWASMSynthsReady() so the dispatch engine worklet exists.
    // Furnace WASM sequencer: delegate the entire ~150-line boot sequence to
    // FurnaceDispatchEngine.startWithCoordinator. Owns chip lifecycle, sample
    // upload, INS2 instrument upload, sequencer serialization, position
    // subscription, command-log capture, and seqPlay. Returns a composite
    // cleanup we store as _seqPositionUnsub for stop().
    if (this.song.furnaceNative) {
      try {
        const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
        if (gen !== this._playGeneration) return;
        const dispatchEngine = FurnaceDispatchEngine.getInstance();

        // Resolve the synth bus AudioNode the engine should route to.
        const { getNativeAudioNode } = await import('@/utils/audio-context');
        const synthBus = getNativeAudioNode(engine.synthBus as any);

        const result = await dispatchEngine.startWithCoordinator(this.coordinator, {
          song: this.song,
          synthBus,
          isStillCurrent: () => gen === this._playGeneration,
          initialSongPos: this.songPos,
          initialPattPos: this.pattPos,
        });
        if (gen !== this._playGeneration) return;

        if (result.started) {
          this.useWasmSequencer = true;
          this._seqPositionUnsub = result.cleanup;
          this.coordinator.markDispatchActive();
          _log('[TrackerReplayer] Using WASM sequencer for Furnace playback');
          return;
        }
        _warn('[TrackerReplayer] WASM sequencer unavailable, falling back to TS replayer');
        this.useWasmSequencer = false;
      } catch (err) {
        _warn('[TrackerReplayer] WASM sequencer failed, falling back to TS replayer:', err);
        this.useWasmSequencer = false;
        this._seqPositionUnsub = null;
      }
    }

    // Phase 5.4: If no libopenmptFileData exists (fresh song, never imported),
    // create an empty XM module on-demand so the song routes through libopenmpt.
    // Done HERE instead of in useTrackerStore.reset() to avoid the race condition
    // where async init clobbers a concurrently-imported real module.
    //
    // IMPORTANT: skip this if a native WASM engine already started (suppressNotes
    // or coordinator.hasActiveDispatch), OR if ALL non-sampler synths are native
    // whole-player types (V2, HVL, UADE, etc.) that handle their own audio.
    // Songs with replaced instruments (TB-303, FM, etc.) still need the soundlib
    // so the libopenmpt path fires fireHybridNotesForRow().
    const hasOnlyNativePlayerSynths = this.song.instruments.some(inst =>
      inst.synthType && inst.synthType !== 'Sampler' && inst.synthType !== 'Player'
    ) && this._replacedInstruments.size === 0;
    if (!this.song.libopenmptFileData && !this.useWasmSequencer && !this.song.furnaceNative
        && !this._suppressNotes && !this.coordinator.hasActiveDispatch
        && !hasOnlyNativePlayerSynths) {
      try {
        const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
        if (gen !== this._playGeneration) return;
        await osl.destroyModule();
        const numPat = this.song.patterns.length || 1;
        const ok = await osl.createNewModule(1 /* XM */, this.song.numChannels || 4, numPat);
        if (ok) {
          const data = await osl.saveModule('xm');
          if (data && gen === this._playGeneration) {
            this.song.libopenmptFileData = data;
            const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
            bridge.markLoaded('xm');
          }
        }
      } catch (err) {
        console.warn('[TrackerReplayer] Phase 5.4: soundlib creation failed:', err);
      }
    }

    // libopenmpt playback: if we have raw module data, delegate startup to
    // LibopenmptEngine.startWithCoordinator. The engine handles bridge
    // serialization, loadTune, audio routing, stereo separation, and the
    // onPosition / onEnded subscriptions; we only have to mark this format
    // as the active hybrid host so the universal mute/solo path knows.
    if (this.song.libopenmptFileData && !this.useWasmSequencer) {
      _log('[TrackerReplayer] libopenmpt path: fileData size =', this.song.libopenmptFileData.byteLength);
      try {
        const { LibopenmptEngine } = await import('@engine/libopenmpt/LibopenmptEngine');
        if (gen !== this._playGeneration) return;

        const mptEngine = LibopenmptEngine.getInstance();

        // Resolve the destination node (stereo separation input). Always
        // pass it so the engine reconnects if TrackerReplayer was recreated
        // by HMR with a new separationNode (the singleton engine persists).
        const { getNativeAudioNode } = await import('@/utils/audio-context');
        const destination: AudioNode | null = getNativeAudioNode(this.separationNode.inputTone as any);
        if (!this.isDJDeck) {
          this.routedNativeEngines.add('LibopenmptSynth');
        }

        const result = await mptEngine.startWithCoordinator(this.coordinator, {
          song: this.song,
          destination,
          initialSongPos: this.songPos,
          initialPattPos: this.pattPos,
          startMuted: this._muted,
        });
        if (gen !== this._playGeneration) return;

        if (result.started) {
          this.useLibopenmptPlayback = true;
          this._suppressNotes = true;
          this._activeWasmEngine = mptEngine; // for updateWasmMuteMask()
          this.coordinator.markDispatchActive();
          // Synchronous cleanup closure — avoids the deferred import().then() race
          // that could null callbacks AFTER the next play() sets new ones.
          this._libopenmptCleanup = () => {
            mptEngine.onPosition = null;
            mptEngine.onPositionTick = null;
            mptEngine.onEnded = null;
            mptEngine.stop();
          };
          // Warm the cached reference for zero-latency forcePosition seeks
          getLibopenmptSync();

          // Wire SynthEffectProcessor for tick-level effects on replaced instruments.
          // Always created (even if no instruments replaced yet) so mid-playback
          // replacements get tick-level effects immediately.
          try {
            const { SynthEffectProcessor } = await import('./replayer/SynthEffectProcessor');
            if (gen !== this._playGeneration) return;
            const replayer = this;
            this._synthEffectProcessor = new SynthEffectProcessor({
              getReplacedInstruments: () => replayer._replacedInstruments,
              getPatternCell: (channel: number, row: number) => {
                const storePatterns = useTrackerStore.getState().patterns;
                const patternNum = replayer.song?.songPositions[replayer.songPos];
                if (patternNum == null) return null;
                const pat = storePatterns[patternNum];
                return pat?.channels[channel]?.rows[row] ?? null;
              },
              getChannelCount: () => replayer.channels.length,
              applySynthFrequency: (instrumentId, frequency, channelIndex, rampTime) => {
                try { getToneEngine().applySynthFrequency(instrumentId, frequency, channelIndex, rampTime); }
                catch { /* ToneEngine not ready */ }
              },
              setChannelGain: (channelIndex, gain, _time) => {
                const ch = replayer.channels[channelIndex];
                if (ch?.gainNode) {
                  try { ch.gainNode.gain.setValueAtTime(gain, Tone.now()); }
                  catch { /* ignored */ }
                }
              },
              getChannelBaseFrequency: (channelIndex) => {
                try { return getToneEngine().getChannelLastNoteFrequency(channelIndex); }
                catch { return 0; }
              },
              getChannelInstrumentId: (channelIndex) => {
                const ch = replayer.channels[channelIndex];
                if (!ch) return 0;
                return typeof ch.instrument === 'number' ? ch.instrument
                  : ch.instrument != null && typeof ch.instrument === 'object' && 'id' in ch.instrument
                    ? (ch.instrument as { id: number }).id : 0;
              },
            });
            mptEngine.onPositionTick = (audioTime, row, order, speed, tempo) => {
              replayer._synthEffectProcessor?.process(audioTime, row, order, speed, tempo);
            };
            _log('[TrackerReplayer] SynthEffectProcessor wired');
          } catch (err) {
            _warn('[TrackerReplayer] SynthEffectProcessor init failed:', err);
          }

          // Re-activate the edit bridge if it was reset by loadSong. This
          // handles fresh songs where initFreshSoundlib created the soundlib
          // module but loadSong's bridge.reset() deactivated it. The soundlib
          // WASM is still in memory — just re-mark it so cell edits sync.
          try {
            const bridge = await import('@engine/libopenmpt/OpenMPTEditBridge');
            if (!bridge.isActive() && this.song.libopenmptFileData) {
              bridge.markLoaded('xm');
            }
          } catch { /* bridge not available */ }

          _log('[TrackerReplayer] Using libopenmpt for playback, suppressNotes =', this._suppressNotes,
            'replacedInstruments =', this._replacedInstruments.size);
          return;
        }
        _warn('[TrackerReplayer] libopenmpt unavailable, falling back to ToneEngine');
      } catch (err) {
        _warn('[TrackerReplayer] libopenmpt failed, falling back to ToneEngine:', err);
        this.useLibopenmptPlayback = false;
      }
    }

    // ── AdPlug streaming: use AdPlug WASM for audio, replayer for display ────
    // Same approach as UADE editable: AdPlug renders perfect audio via OPL
    // emulation, the replayer ticks forward for pattern cursor display.
    if (this.song.adplugFileData && !this.useWasmSequencer && !this.useLibopenmptPlayback) {
      try {
        const { getAdPlugPlayer } = await import('@/lib/import/AdPlugPlayer');
        if (gen !== this._playGeneration) return;
        const adplugPlayer = getAdPlugPlayer();
        const ok = await adplugPlayer.load(
          this.song.adplugFileData,
          this.song.adplugFileName || 'song.d00',
          undefined,
          true,
          this.song.adplugTicksPerRow,
        );
        if (gen !== this._playGeneration) return;

        if (ok) {
          this.useAdPlugStreaming = true;
          this._suppressNotes = true;

          // Register AdPlug as the active WASM engine for mute/solo support.
          this._activeWasmEngine = adplugPlayer;

          // Mark dispatch active so the TS scheduler is skipped
          this.coordinator.markDispatchActive();

          // Subscribe to position updates from the streaming player.
          // Use dispatchEnginePosition() — same path as libopenmpt/Furnace —
          // which computes stable, theoretical row duration from BPM/speed
          // and handles latency compensation, hybrid notes, VU, automation.
          adplugPlayer.onPosition = (order: number, row: number, audioTime?: number) => {
            if (!this.playing || !this.song) return;
            if (order >= 0 && order < (this.song.songPositions?.length ?? 0)) {
              this.coordinator.dispatchEnginePosition(row, order, audioTime, false);
            }
          };

          // Subscribe to per-channel levels for VU meters
          adplugPlayer.onChannelLevels = (levels: Float32Array) => {
            const engine = getToneEngine();
            const arr: number[] = [];
            for (let i = 0; i < levels.length; i++) arr.push(levels[i]);
            engine.updateRealtimeChannelLevels(arr);
          };

          // Subscribe to live channel notes — fill pattern grid during playback.
          // This enriches the statically-extracted pattern data with real-time
          // note/instrument/effect data from the player's internal state.
          adplugPlayer.onChannelNotes = (notes, order, row) => {
            if (!this.playing || !this.song) return;
            const store = useTrackerStore.getState();
            const patIdx = this.song.songPositions?.[order];
            if (patIdx == null || patIdx < 0 || patIdx >= store.patterns.length) return;
            const pattern = store.patterns[patIdx];
            if (!pattern || row < 0 || row >= pattern.length) return;

            for (const n of notes) {
              if (n.trigger && n.note > 0 && n.ch < pattern.channels.length) {
                const existing = pattern.channels[n.ch].rows[row];
                // Only write if the cell is currently empty
                if (!existing || (existing.note === 0 && existing.instrument === 0)) {
                  setCellInPattern(pattern, n.ch, row, {
                    note: n.note as any,
                    instrument: n.inst as any,
                    volume: n.vol > 0 ? (0x10 + Math.min(n.vol, 63)) as any : 0 as any,
                    effTyp: n.effTyp as any,
                    eff: n.eff as any,
                  });
                }
              }
            }
          };

          // Wire onEnded so we stop when the song finishes — prevents
          // the pattern from continuing to scroll after playback ends.
          adplugPlayer.onEnded = () => {
            _log('[TrackerReplayer] AdPlug song ended');
            this.stop();
          };

          _log('[TrackerReplayer] Using AdPlug streaming for audio, suppressNotes = true');
        } else {
          _warn('[TrackerReplayer] AdPlug streaming failed to load');
        }
      } catch (err) {
        _warn('[TrackerReplayer] AdPlug streaming failed:', err);
        this.useAdPlugStreaming = false;
      }
    }

    // Eagerly initialize the scratch buffer so it starts capturing audio from
    // the moment playback begins. Without this, the first scratch attempt would
    // lazily init the buffer and immediately freeze it — resulting in silence
    // because no audio has accumulated yet. Fire-and-forget (non-blocking).
    import('@/engine/TrackerScratchController').then(({ getTrackerScratchController }) => {
      void getTrackerScratchController().initScratchBuffer();
    }).catch(() => { /* scratch not available */ });

    // Phase 5.3: WASM-backed formats no longer need the TS scheduler.
    // Display state, hybrid notes, VU meters, and automation curves all
    // flow through coordinator.dispatchEnginePosition (driven by the
    // engine's own position callback). Skip startScheduler entirely when
    // an engine actually wired a position-update subscription.
    //
    // Gating on hasActiveDispatch (not _suppressNotes) is critical: some
    // UADE-backed formats (FC, JAM variants, etc.) play through UADE but
    // don't have uadeFirstTick set, so no position subscription gets wired.
    // Those songs need the TS scheduler to drive VU/automation/display
    // state even though _suppressNotes is true.
    if (this.coordinator.hasActiveDispatch) {
      _playLog('skipping TS scheduler (engine driving position dispatch)');
      this._hasPlayedOnce = true;
      return;
    }

    _playLog('startScheduler (total)');
    this.startScheduler();
    this._hasPlayedOnce = true;
  }

  stop(preservePosition = true, skipNativeStop = false): void {
    // Sync transport store to the last visually-displayed row before stopping.
    // The pattern editor reads currentRow from the store when stopped (line 1134
    // of PixiPatternEditor). Use lastDequeuedState (what was on screen) rather
    // than pattPos (which is ahead due to look-ahead scheduling).
    // preservePosition=false skips this (used by loadSong — a preparation stop
    // that should not overwrite the position saved by the user's stop action).
    if (this.playing && preservePosition) {
      // Drain the ring buffer up to NOW to get the most current audible position,
      // not the stale lastDequeuedState from the previous rAF frame.
      this.getStateAtTime(Tone.now());
      // For WASM engines (JamCracker etc.), prefer the WASM position store
      // which tracks the engine's actual position. The replayer's lastDequeuedState
      // is stale (row 0) because no notes were scheduled.
      const wasmPos = useWasmPositionStore.getState();
      const lastVisual = this.coordinator.stateRing.getLastDequeued();
      const stopRow = wasmPos.active ? wasmPos.row : (lastVisual ? lastVisual.row : this.pattPos);
      useTransportStore.getState().setCurrentRow(stopRow);
      // Move the editing cursor to the stop position so the pattern editor
      // doesn't jump back to the pre-play cursor position on stop.
      // Set cursor directly (not moveCursorToRow which would trigger a seek).
      const cursorState = useCursorStore.getState();
      useCursorStore.setState({ cursor: { ...cursorState.cursor, rowIndex: stopRow } });
    }

    this.playing = false;
    this._playGeneration++; // Invalidate any in-flight async play()

    // Stop WASM sequencer if active
    if (this.useWasmSequencer) {
      this.useWasmSequencer = false;
      if (this._seqPositionUnsub) {
        this._seqPositionUnsub();
        this._seqPositionUnsub = null;
      }
      try {
        // Use cached import — post seqStop directly to the worklet
        import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
          const eng = FurnaceDispatchEngine.getInstance();
          eng.seqStop();
          eng.reset(); // silence all chip voices immediately
        });
      } catch { /* ignored */ }
    }

    // Stop libopenmpt playback if active — synchronous to avoid race with next play()
    if (this.useLibopenmptPlayback) {
      this.useLibopenmptPlayback = false;
      // Reset SynthEffectProcessor
      if (this._synthEffectProcessor) {
        this._synthEffectProcessor.reset();
        this._synthEffectProcessor = null;
      }
      if (this._libopenmptCleanup) {
        this._libopenmptCleanup();
        this._libopenmptCleanup = null;
      }
    }

    // Stop AdPlug streaming player if active
    if (this.useAdPlugStreaming) {
      this.useAdPlugStreaming = false;
      this._suppressNotes = false;
      if (this._adplugPositionUnsub) {
        this._adplugPositionUnsub();
        this._adplugPositionUnsub = null;
      }
      try {
        import('@/lib/import/AdPlugPlayer').then(({ getAdPlugPlayer }) => {
          const p = getAdPlugPlayer();
          p.onPosition = null;
          p.onChannelLevels = null;
          p.onChannelNotes = null;
          p.onEnded = null;
          p.stop();
        });
      } catch { /* ignored */ }
    }

    // Clear the scheduler interval
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }

    // Stop routed native engines (UADE/Hively/SID/MusicLine/JamCracker)
    if (!skipNativeStop) {
      this.c64SidEngine = stopNativeEngines(this.song, this.routedNativeEngines, this.c64SidEngine);
      if (this.sf2Engine) {
        this.sf2Engine.dispose();
        this.sf2Engine = null;
      }
    }

    // Clean up HVL position subscription
    if (this._hvlPositionUnsub) {
      this._hvlPositionUnsub();
      this._hvlPositionUnsub = null;
    }
    this.hivelyEngine = null;

    // Clean up MusicLine position subscription
    if (this._mlPositionUnsub) {
      this._mlPositionUnsub();
      this._mlPositionUnsub = null;
    }

    // Clean up UADE composite cleanup (position, Paula log, deferred capture,
    // TFMX channel — all rolled into the unsubscribe returned from
    // UADEEngine.subscribeToCoordinator).
    if (this._uadePositionUnsub) {
      this._uadePositionUnsub();
      this._uadePositionUnsub = null;
      // TFMX path drives FormatPlaybackPlaying — clear it on stop in case it
      // was set. Cheap no-op for non-TFMX UADE songs.
      setFormatPlaybackPlaying(false);
    }
    // Furnace WASM seq cleanup is now part of _seqPositionUnsub (composite
    // returned by FurnaceDispatchEngine.startWithCoordinator).
    // Clean up automation capture sync
    this.coordinator.stopCaptureSync();
    resetCaptureSync();

    // Stop all channels (release synth notes + stop sample players)
    for (let i = 0; i < this.channels.length; i++) {
      this.stopChannel(this.channels[i], i);
    }

    // Cancel any scheduled VU meter triggers (look-ahead scheduling enqueues callbacks
    // into Tone.Draw that would otherwise fire after stop, causing lingering VU bouncing)
    try {
      Tone.Draw.cancel(0);
    } catch { /* ignored */ }

    // Clear all pending channel trigger levels so VU meters read zero immediately
    try {
      const engine = getToneEngine();
      engine.clearChannelTriggerLevels();
    } catch { /* ignored */ }

    // Keep position — don't reset songPos/pattPos so playback resumes where it stopped
    this.currentTick = 0;
    this.lastGrooveTemplateId = 'straight';
    this.lastSwingAmount = 100;
    this.lastGrooveSteps = 2;

    // Clear audio-synced state queue
    this.clearStateQueue();

    // Cancel any pending throttled row updates
    cancelPendingRowUpdate();
  }

  pause(): void {
    // Clear the scheduler interval
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    this.playing = false;

    // Pause WASM sequencer
    if (this.useWasmSequencer) {
      import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
        FurnaceDispatchEngine.getInstance().seqStop();
      }).catch(() => {});
    }

    // Pause libopenmpt
    if (this.useLibopenmptPlayback) {
      import('@engine/libopenmpt/LibopenmptEngine').then(({ LibopenmptEngine }) => {
        if (LibopenmptEngine.hasInstance()) LibopenmptEngine.getInstance().pause();
      }).catch(() => {});
    }

    // Pause routed native engines (UADE/Hively) on pause
    pauseNativeEngines(this.routedNativeEngines);
  }

  resume(): void {
    if (this.song && !this.playing) {
      this.playing = true;

      // Resume WASM sequencer from current position
      if (this.useWasmSequencer) {
        import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
          FurnaceDispatchEngine.getInstance().seqPlay(this.songPos, this.pattPos);
        }).catch(() => {});
        return;
      }

      // Resume libopenmpt playback
      if (this.useLibopenmptPlayback) {
        import('@engine/libopenmpt/LibopenmptEngine').then(({ LibopenmptEngine }) => {
          if (LibopenmptEngine.hasInstance()) LibopenmptEngine.getInstance().resume();
        }).catch(() => {});
        return;
      }

      // Restart WASM playback for HVL/AHX
      resumeNativeEngines(this.routedNativeEngines, this._muted);

      this.startScheduler();
    }
  }

  private startScheduler(): void {
    // BassoonTracker architecture: initialize a continuous timeline that NEVER
    // references Tone.now() again. The `time` variable only ever advances via
    // `+= tickInterval`. Pattern boundaries, breaks, jumps — none of them
    // touch the timeline. This makes cumulative drift impossible.
    this.nextScheduleTime = Tone.now() + 0.02;
    this.totalRowsProcessed = 0;
    this.totalTicksProcessed = 0;

    const schedulerTick = () => {
      if (!this.playing) return;
      this._songEndFiredThisBatch = false;

      const scheduleUntil = Tone.now() + this.scheduleAheadTime;
      const transportState = useTransportStore.getState();
      // PERF: Cache for reuse in processTick/triggerNote (avoids 3-4 extra getState calls)
      this._cachedTransportState = transportState;

      // Sync groove/swing parameters (never touches timeline)
      if (transportState.grooveTemplateId !== this.lastGrooveTemplateId ||
          transportState.swing !== this.lastSwingAmount ||
          transportState.grooveSteps !== this.lastGrooveSteps) {
        if (typeof window !== 'undefined' && (window as unknown as { GROOVE_DEBUG?: boolean }).GROOVE_DEBUG) {
          console.log(`[Groove] template changed: "${this.lastGrooveTemplateId}" → "${transportState.grooveTemplateId}" swing=${transportState.swing} steps=${transportState.grooveSteps}`);
        }
        this.lastGrooveTemplateId = transportState.grooveTemplateId;
        this.lastSwingAmount = transportState.swing;
        this.lastGrooveSteps = transportState.grooveSteps;
      }

      // Sync BPM from UI (takes effect on next tick naturally)
      if (Math.abs(transportState.bpm - this.bpm) > 0.1) {
        this.bpm = transportState.bpm;
      }
      // Note: speed is NOT synced from UI — it's controlled by Fxx effects
      // and speed2 alternation within the replayer itself.

      // Fill the lookahead buffer — BassoonTracker pattern:
      // Schedule all ticks whose time falls within the look-ahead window.
      // `nextScheduleTime` is a continuous accumulator that never resets.
      while (this.nextScheduleTime < scheduleUntil && this.playing) {
        this.processTick(this.nextScheduleTime);

        // Advance timeline by one tick interval.
        // If BPM changed during processTick (Fxx effect), the new interval
        // takes effect immediately for the next tick — no reset needed.
        // DJ nudge: apply temporary BPM offset for beat matching
        // Tempo multiplier: per-deck pitch slider scales BPM (DJ mode)
        const effectiveBPM = (this.bpm + this.nudgeOffset) * this.tempoMultiplier;
        const tickInterval = 2.5 / effectiveBPM;
        this.nextScheduleTime += tickInterval;
      }
    };

    // Initial fill, then keep filling every 15ms
    schedulerTick();
    this.schedulerTimerId = setInterval(schedulerTick, this.schedulerInterval * 1000);
  }

  private calculateGrooveOffset(row: number, rowDuration: number, state: { grooveTemplateId: string; swing: number; grooveSteps: number }): number {
    const grooveTemplate = GROOVE_MAP.get(state.grooveTemplateId);

    if (grooveTemplate && grooveTemplate.id !== 'straight') {
      // For TEMPLATES: swing is 0-200 where 100 = full template effect
      // This allows scaling the template groove up or down
      const templateIntensity = state.swing / 100;
      // grooveSteps = total cycle length in rows. stride = grooveSteps / template.values.length.
      // e.g. grooveSteps=2, boom-bap(4 vals): stride=1 (natural 16th speed, cycle=4 rows)
      //      grooveSteps=8, boom-bap(4 vals): stride=2 (8th note, cycle=8 rows)
      //      grooveSteps=32, boom-bap(4 vals): stride=8 (cycle=32 rows)
      const stride = Math.max(1, Math.round(state.grooveSteps / grooveTemplate.values.length));
      const stretchedRow = Math.floor(row / stride);
      const offset = getGrooveOffset(grooveTemplate, stretchedRow, rowDuration) * templateIntensity;
      if (typeof window !== 'undefined' && (window as unknown as { GROOVE_DEBUG?: boolean }).GROOVE_DEBUG) {
        console.log(`[Groove] row=${String(row).padStart(2)} template="${state.grooveTemplateId}" stride=${stride} intensity=${templateIntensity.toFixed(2)} offset=${(offset * 1000).toFixed(2)}ms rowDur=${(rowDuration * 1000).toFixed(1)}ms`);
      }
      return offset;
    }
    // Straight template or no template = no timing offset.
    // The legacy manual-swing path that was here applied offsets whenever swing ≠ 100,
    // which caused every other row to be shifted even when the user selected "straight".
    return 0;
  }

  // ==========================================================================
  // TICK PROCESSING - THE HEART OF THE REPLAYER
  // ==========================================================================

  private processTick(time: number): void {
    if (!this.song || !this.playing) return;

    this.totalTicksProcessed++;

    // Per-channel path: each channel advances at its own speed (MusicLine Editor)
    if (this.song.channelTrackTables && this.accessor.getMode() === 'classic') {
      this.processTickPerChannel(time);
      return;
    }

    // Handle pattern delay (legacy MOD behavior — skips entire tick)
    if (!this.useXMPeriods && this.patternDelay > 0) {
      this.patternDelay--;
      return;
    }

    // --- Groove & Swing Support ---
    // PERF: Use cached state from scheduler tick (avoids redundant getState())
    const transportState = this._cachedTransportState ?? useTransportStore.getState();

    // BPM sync from UI is handled by the grooveChanged detector in schedulerTick
    // (checks every 15ms with >0.1 threshold). We do NOT sync here because
    // any mismatch triggers bpmBefore !== this.bpm in the while loop, causing
    // a baseline reset that can accumulate timing errors over long playback.
    // Speed is controlled by Fxx effects during playback, don't override from UI

    const tickInterval = 2.5 / this.bpm;
    let safeTime = time;

    // Apply groove/swing to Tick 0 only
    if (this.currentTick === 0) {
      const rowDuration = tickInterval * this.speed;
      safeTime += this.calculateGrooveOffset(this.pattPos, rowDuration, transportState);
    }

    // Apply micro-timing jitter (Humanization)
    if (transportState.jitter > 0) {
      const jitterMs = (transportState.jitter / 100) * 0.01;
      const jitterOffset = (Math.random() * 2 - 1) * jitterMs;
      safeTime += jitterOffset;
    }

    // Get current pattern (classic path) or use accessor for native formats
    const useNativeAccessor = this.accessor.getMode() !== 'classic';
    const patternNum = this.song.songPositions[this.songPos];
    const pattern = useNativeAccessor ? null : this.song.patterns[patternNum];
    if (!useNativeAccessor && !pattern) return;

    // Queue display state for audio-synced UI (tick 0 = start of row)
    // Use swung time (safeTime) so visual follows the same timing as audio
    if (this.currentTick === 0) {
      this.queueDisplayState(safeTime, this.pattPos, patternNum, this.songPos, 0, tickInterval * this.speed);
    }

    // Note processing: when no WASM engine is active (_suppressNotes = false),
    // the TS scheduler drives note triggering for synth instruments. WASM-backed
    // formats handle notes via fireHybridNotesForRow() from engine callbacks.
    if (!this._suppressNotes && this.currentTick === 0) {
      this.processRowForSynths(safeTime);
    }

    // Notify tick processing
    if (this.onTickProcess) {
      this.onTickProcess(this.currentTick, this.pattPos);
    }

    // Advance tick counter
    this.currentTick++;
    if (this.currentTick >= this.speed) {
      this.currentTick = 0;

      // Furnace groove: cycle through groove table tick counts per row
      if (this.activeGroove !== null) {
        this.groovePos = (this.groovePos + 1) % this.activeGroove.length;
        this.speed = this.activeGroove[this.groovePos];
      }
      // Furnace speed alternation: alternate between speed1 and speed2 each row
      else if (this.speed2 !== null) {
        if (this.speedAB) {
          this.speed = this.speed2;
          this.speedAB = false;
        } else {
          this.speed = this.song!.initialSpeed;
          this.speedAB = true;
        }
      }

      this.advanceRow();
    }
  }

  /**
   * Queue a display state for audio-synced UI updates.
   * Delegates to the PlaybackCoordinator's ring buffer.
   */
  private queueDisplayState(time: number, row: number, pattern: number, position: number, tick: number, duration: number = 0): void {
    this.coordinator.queueDisplayState(time, row, pattern, position, tick, duration);
  }

  /**
   * Get display state for audio-synced UI rendering (BassoonTracker pattern).
   * Call this in the render loop with audioContext.currentTime + lookahead.
   * Returns the most recent state that should be displayed at the given time.
   * @param time Web Audio time
   * @param peek If true, just look at the state at that time without dequeuing older states
   */
  public getStateAtTime(time: number, peek: boolean = false): DisplayState | null {
    return this.coordinator.getStateAtTime(time, peek);
  }

  /** Clear the state queue (called on stop/reset). Keeps lastDequeuedState. */
  private clearStateQueue(): void {
    this.coordinator.stateRing.clear();
  }

  /**
   * Refresh the coordinator's playback context with the replayer's current
   * songPositions / bpm / speed / hybrid hook. Called from play() right before
   * any engine subscription is wired up. The coordinator reads from this on
   * every dispatchEnginePosition() call.
   */
  private syncCoordinatorContext(): void {
    if (!this.song) return;
    this.coordinator.context.songPositions = this.song.songPositions;
    this.coordinator.context.bpm = this.bpm;
    this.coordinator.context.speed = this.speed;
    this.coordinator.context.fireHybridNotes = (time) => this.fireHybridNotesForRow(time);
    this.coordinator.context.triggerVUMeters = (time) => this.triggerVUMetersForRow(time);
    this.coordinator.context.applyAutomation = () => this.applyAutomationForRow();
    this.coordinator.context.audioContext = Tone.context.rawContext as AudioContext;
    // songPos / pattPos already live on coordinator (mirrored via accessor)
  }

  /**
   * Handle note release for macros
   */
  private releaseMacros(ch: ChannelState): void {
    ch.macroReleased = true;
  }

  // ==========================================================================
  // VOICE CONTROL
  // ==========================================================================

  private triggerNote(ch: ChannelState, time: number, _offset: number, channelIndex?: number, accent?: boolean, slideActive?: boolean, currentRowSlide?: boolean, hammer?: boolean): void {
    // Skip note trigger if channel is muted.
    // slideActive = from PREVIOUS row's slide flag, determines pitch glide behavior
    // currentRowSlide = CURRENT row's slide flag, determines gate timing (sustain into next note)
    if (channelIndex !== undefined) {
      if (this.isDJDeck) {
        // DJ decks use a per-replayer bitmask so each deck is independent.
        // Bit N = 1 → channel N audible; bit N = 0 → muted.
        if ((this.channelMuteMask & (1 << channelIndex)) === 0) return;
      } else {
        // Tracker view uses ToneEngine's global mute state.
        const engine = getToneEngine();
        if (engine.isChannelMuted(channelIndex)) return;
      }
    }

    const safeTime = time ?? Tone.now();

    // Stop the current active player at the new note's start time
    // Uses pool: old player stops, we switch to the next pooled player
    if (ch.player) {
      try {
        ch.player.stop(safeTime);
      } catch {
        // Player might already be stopped
      }
    }

    // Reset macro state on note trigger
    ch.macroPos = 0;
    ch.macroReleased = false;
    ch.macroPitchOffset = 0;
    ch.macroArpNote = 0;

    // Reset synth pitch offset on new note
    ch._synthDetuneOffset = 0;

    if (!ch.instrument) {
      // No instrument assigned - try to use the first available instrument
      if (this.song && this.song.instruments.length > 0) {
        // No instrument assigned - assign default instrument silently
        ch.instrument = this.song.instruments[0];
        ch.sampleNum = this.song.instruments[0].id;
        ch.volume = 64;
        ch.finetune = ch.instrument.metadata?.modPlayback?.finetune ?? 0;
      } else {
        console.warn('[TrackerReplayer] No instrument assigned to channel and no instruments available');
        return;
      }
    }

    const engine = getToneEngine();
    
    // For XM files or synth instruments, use XM note directly (avoids period table issues)
    // For MOD sample-based, use period-to-note conversion
    const isSynthInstrument = ch.instrument.synthType && ch.instrument.synthType !== 'Sampler';
    const useXMNote = (this.useXMPeriods || isSynthInstrument) && ch.xmNote > 0 && ch.xmNote < 97;
    const noteName = useXMNote
      ? xmNoteToNoteName(ch.xmNote)
      : periodToNoteName(ch.period);
    
    // Store base note state for pitch effect retriggering
    ch.baseNote = noteName;
    ch.currentPitchOffset = 0;
    ch.currentPlayingNote = noteName;
    
    // --- Groove Velocity/Dynamics ---
    // PERF: Use cached state from scheduler tick (avoids redundant getState())
    const transportState = this._cachedTransportState ?? useTransportStore.getState();
    const grooveTemplateId = transportState.grooveTemplateId;
    const grooveTemplate = GROOVE_MAP.get(grooveTemplateId);
    const intensity = transportState.swing / 100;
    
    let velocityOffset = 0;
    if (grooveTemplate) {
      const stride = Math.max(1, Math.round(transportState.grooveSteps / grooveTemplate.values.length));
      const stretchedRow = Math.floor(this.pattPos / stride);
      velocityOffset = getGrooveVelocity(grooveTemplate, stretchedRow) * intensity;
    }

    const velocity = Math.max(0, Math.min(1, (ch.volume / 64) + velocityOffset));
    
    // Store velocity for retriggering
    ch.currentVelocity = velocity;

    if (typeof window !== 'undefined' && (window as unknown as { GROOVE_DEBUG?: boolean }).GROOVE_DEBUG && grooveTemplate && grooveTemplate.id !== 'straight') {
      console.log(`[Groove] row=${String(this.pattPos).padStart(2)} ch=${channelIndex} velOffset=${velocityOffset >= 0 ? '+' : ''}${velocityOffset.toFixed(3)} velocity=${velocity.toFixed(3)}`);
    }

    // Schedule VU meter trigger at audio playback time.
    // Uses Tone.Draw.schedule to defer the visual trigger to the nearest
    // animation frame matching the audio time. Pre-allocated per-channel
    // callbacks avoid closure allocation per note.
    // Add a small offset (+30ms) so the VU flash lands ON or just AFTER the
    // audible note rather than one rAF ahead of it.
    if (channelIndex !== undefined) {
      if (!this.meterCallbacks) {
        this.meterCallbacks = [];
        this.meterStaging = new Float64Array(64);
        for (let i = 0; i < 64; i++) {
          const ch = i;
          this.meterCallbacks[i] = () => {
            engine.triggerChannelMeter(ch, this.meterStaging[ch]);
          };
        }
      }
      this.meterStaging[channelIndex] = velocity;
      Tone.Draw.schedule(this.meterCallbacks[channelIndex], safeTime + 0.03);
    }

    // Check if this is a synth instrument (has synthType) or sample-based
    if (ch.instrument.synthType && ch.instrument.synthType !== 'Sampler') {
      
      // Use ToneEngine for synth instruments (TB303, drums, etc.)
      // Calculate duration based on speed/BPM (one row duration as default)
      const rowDuration = (2.5 / this.bpm) * this.speed;

      // TB-303 MID-STEP GATE TIMING:
      // Real 303 lowers gate at ~50-80% of step, unless sliding to next note.
      // Slide on CURRENT row means gate stays high until next note starts.
      const is303Synth = ch.instrument.synthType === 'TB303' ||
                         ch.instrument.synthType === 'Buzz3o3';
      
      // For 303 synths: use 80% duration for standard notes to ensure the gate
      // drops before the next tick starts (prevents unintentional slides).
      // Use 105% (slight overlap) for sliding notes to guarantee legato.
      // Note: currentRowSlide controls gate timing, slideActive controls pitch glide
      const noteDuration = is303Synth && !currentRowSlide
        ? rowDuration * 0.8  // 80% gate for punchy retrigger
        : rowDuration * 1.05; // 105% gate for guaranteed slide overlap

      engine.triggerNote(
        ch.instrument.id,
        noteName,
        noteDuration,
        safeTime,
        velocity,
        ch.instrument,
        accent,      // accent: applies to current note
        slideActive, // slide: from PREVIOUS row's slide flag - controls pitch glide!
        channelIndex,   // channelIndex: pass tracker channel to chip engine
        ch.period,   // period for MOD playback
        undefined,   // sampleOffset
        0,           // nnaAction
        hammer       // TT-303 hammer: legato without pitch glide (synth sets slideTime=0)
      );
      return;
    }

    // Non-synth sample-based playback is handled entirely by libopenmpt.
    // No TS-side sample scheduling needed.
  }

  private stopChannel(ch: ChannelState, channelIndex?: number, time?: number): void {
    // Quick volume ramp down before stop (click prevention, ~2ms)
    if (time !== undefined && time > 0) {
      try {
        ch.gainNode.gain.setValueAtTime(ch.gainNode.gain.value, time);
        ch.gainNode.gain.linearRampToValueAtTime(0, time + 0.002);
      } catch { /* ignored */ }
    }

    // Stop all pooled players (no disposal - they're reused)
    // Break loop FIRST to prevent looped samples from continuing after stop.
    // Then call stop(). Always call without checking player.state first —
    // Source.stop() internally handles future-scheduled starts via getNextState().
    const stopTime = time !== undefined ? time + 0.003 : undefined; // Stop slightly after ramp
    for (const player of ch.playerPool) {
      try {
        player.loop = false;
        if (stopTime !== undefined) {
          player.stop(stopTime);
        } else {
          player.stop();
        }
      } catch { /* ignored */ }
    }
    ch.player = null;

    // Zero the gain node (after ramp or immediately if no time)
    try {
      if (time === undefined || time <= 0) {
        ch.gainNode.gain.cancelScheduledValues(0);
        ch.gainNode.gain.setValueAtTime(0, 0);
      }
    } catch { /* ignored */ }

    // Release any active synth notes on this channel
    // Use the scheduled time so NOTE_OFF arrives at the correct moment
    // (time=0 means "immediately", which fails if NOTE_ON is still queued for a future time)
    if (ch.instrument && ch.instrument.synthType && ch.instrument.synthType !== 'Sampler' && ch.lastPlayedNoteName) {
      try {
        const engine = getToneEngine();
        engine.triggerNoteRelease(ch.instrument.id, ch.lastPlayedNoteName, time ?? 0, ch.instrument, channelIndex);
      } catch { /* ignored */ }
    }
    ch.lastPlayedNoteName = null; // Clear for next note sequence
  }

  /**
   * Update all active players' playback rates when global playback rate changes
   * Called by DJ pitch slider to apply pitch shift to already-playing samples
   */
  public updateAllPlaybackRates(): void {
    const rate = this.getEffectivePlaybackRate();

    for (const ch of this.channels) {
      if (ch.player && ch.period > 0) {
        if (this.useXMPeriods) {
          const hz = ft2Period2Hz(ch.period, this.linearPeriods);
          if (hz <= 0) continue;
          const c4Rate = ft2GetSampleC4Rate(ch.relativeNote, ch.finetune, this.linearPeriods);
          ch.player.playbackRate = (hz / c4Rate) * rate;
        } else {
          const clampedPeriod = ch.period < 113 ? 113 : ch.period;
          const sampleRate = ch.instrument?.sample?.sampleRate || 8363;
          const frequency = AMIGA_PAL_FREQUENCY / clampedPeriod;
          ch.player.playbackRate = (frequency / sampleRate) * rate;
        }
      }
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Unified note-to-period conversion that handles both MOD and XM formats.
   *
   * For XM files: Uses FT2's 1936-entry period LUTs with relativeNote support.
   * For MOD files: Uses ProTracker's 3-octave period table with rawPeriod priority.
   */
  private noteToPlaybackPeriod(noteValue: number, rawPeriod: number | undefined, ch: ChannelState): number {
    if (this.useXMPeriods && noteValue > 0 && noteValue < 97) {
      // XM mode: Use FT2 period system
      // Add relativeNote to note BEFORE period lookup (FT2 triggerNote behavior)
      let note = noteValue + ch.relativeNote;

      // FT2: if note >= 10*12 (120), it's out of range — return 0
      if (note < 1 || note >= 10 * 12) return 0;

      return ft2NoteToPeriod(note, ch.finetune, this.linearPeriods);
    }

    // MOD mode: Priority rawPeriod → old noteToPeriod
    // MOD import stores both note (2-octave-shifted XM number) and period (original Amiga period).
    // Using noteToPeriod first would double-shift the pitch — period 428 → XM 49 → period 107.
    //
    // PT2's setPeriod: MOD pattern data stores finetune-0 periods. Convert to
    // the finetune-specific period so that ALL downstream code (triggerNote,
    // updatePeriodDirect, arpeggio tick-0, vibrato centre) uses the right pitch.
    if (rawPeriod) {
      return this.rawPeriodToFinetuned(rawPeriod, ch.finetune);
    }
    return this.noteToPeriod(noteValue, ch.finetune) || 0;
  }

  /**
   * PT2's setPeriod equivalent: convert a raw pattern period (finetune-0) to
   * the correct period from the finetune-specific table.
   *
   * MOD pattern data always stores periods from the finetune-0 table.
   * The replayer must re-lookup the note index in finetune-0 and then pull
   * the period from the sample's finetune table.
   */
  private rawPeriodToFinetuned(rawPeriod: number, finetune: number): number {
    if (finetune === 0 || rawPeriod <= 0) return rawPeriod;

    // Search finetune-0 table (first 36 entries) for the note index
    let noteIndex = 0;
    for (let i = 0; i < 36; i++) {
      if (rawPeriod >= PERIOD_TABLE[i]) {
        noteIndex = i;
        break;
      }
    }

    // Look up the period from the finetune-specific table section
    const ftIndex = finetune >= 0 ? finetune : finetune + 16;
    return PERIOD_TABLE[ftIndex * 36 + noteIndex];
  }

  private noteToPeriod(note: number | string, finetune: number): number {
    if (typeof note === 'number' && note > 0) {
      // MOD files use period values directly (113-856), XM uses note numbers (1-96)
      if (note >= 113 && note <= 856) {
        // Already a period value (MOD format)
        return note;
      } else if (note < 97) {
        // Note number (1-96): convert to period
        // Note 1 = C-0, Note 13 = C-1, Note 25 = C-2, etc.
        // Period table covers C-1 to B-3 (notes 13-48 in 1-based, or 12-47 in 0-based)

        const noteIndex = note - 1; // Convert to 0-based

        // Find which note within the period table's 3-octave range
        // Period table: 0-11 = C-1 to B-1, 12-23 = C-2 to B-2, 24-35 = C-3 to B-3
        let tableIndex = noteIndex;
        let octaveShift = 0;

        // If note is below C-1 (index 12), shift up
        while (tableIndex < 12) {
          tableIndex += 12;
          octaveShift--;
        }

        // If note is above B-3 (index 47), shift down to table range
        while (tableIndex > 47) {
          tableIndex -= 12;
          octaveShift++;
        }

        // Adjust to 0-35 range (C-1 = 0, B-3 = 35)
        tableIndex -= 12;

        if (tableIndex >= 0 && tableIndex < 36) {
          let period = this.getPeriod(tableIndex, finetune);

          // Adjust for octaves: period halves for each octave up, doubles for each octave down
          if (octaveShift > 0) {
            period = Math.round(period / (OCTAVE_UP[Math.min(10, octaveShift)] ?? Math.pow(2, octaveShift)));
          } else if (octaveShift < 0) {
            period = Math.round(period * (OCTAVE_UP[Math.min(10, -octaveShift)] ?? Math.pow(2, -octaveShift)));
          }

          return period;
        }
      }
    } else if (typeof note === 'string') {
      // String note to period
      return this.noteStringToPeriod(note, finetune);
    }
    return 0;
  }

  private noteStringToPeriod(note: string, finetune: number): number {
    const match = note.match(/^([A-G][#]?)-?(\d)$/);
    if (!match) return 0;
    const noteIndex = NOTE_STRING_MAP[match[1]] ?? 0;
    const octave = parseInt(match[2], 10);
    const absIndex = (octave - 1) * 12 + noteIndex;
    if (absIndex < 0 || absIndex >= 36) return 0;
    return this.getPeriod(absIndex, finetune);
  }

  private getPeriod(noteIndex: number, finetune: number): number {
    const ftIndex = finetune >= 0 ? finetune : finetune + 16;
    const offset = ftIndex * 36;
    return PERIOD_TABLE[offset + Math.min(35, Math.max(0, noteIndex))];
  }

  // ==========================================================================
  // PER-CHANNEL TICK (MusicLine Editor and similar formats)
  // ==========================================================================

  /**
   * Tick handler for formats with per-channel independent track tables.
   * Each channel maintains its own tick counter, row position, and song position.
   * Channels with different speeds advance their rows at different rates.
   * Groove per channel: effectiveSpeed alternates between channelSpeeds[ch] and
   * channelGrooves[ch] each row when groove > 0.
   */
  private processTickPerChannel(time: number): void {
    if (!this.song) return;

    const tables    = this.song.channelTrackTables!;
    const speeds    = this.song.channelSpeeds;
    const grooves   = this.song.channelGrooves;
    const fallback  = this.song.initialSpeed;
    const tickInterval = 2.5 / this.bpm;

    // Queue display state and notify row change for channel 0 at row start
    if (this.channelTickCounters[0] === 0) {
      const ch0Song = this.channelSongPos[0];
      const ch0Patt = this.channelPattPos[0];
      const ch0Pat  = tables[0]?.[ch0Song] ?? 0;
      const ch0Speed = (grooves?.[0] ?? 0) > 0 && this.channelGrooveToggle[0]
        ? ((grooves ?? [])[0] ?? fallback)
        : (speeds?.[0] ?? fallback);
      this.queueDisplayState(time, ch0Patt, ch0Pat, ch0Song, 0, tickInterval * ch0Speed);
      if (this.onRowChange) this.onRowChange(ch0Patt, ch0Pat, ch0Song);
    }

    // Sync mute state
    if (!this.isDJDeck) {
      const muteEngine = getToneEngine();
      for (let m = 0; m < this.channels.length; m++) {
        const muted = muteEngine.isChannelMuted(m);
        if (this.channels[m]._muteState !== muted) {
          this.channels[m]._muteState = muted;
          this.channels[m].muteGain.gain.setValueAtTime(muted ? 0 : 1, time);
        }
      }
    }

    for (let ch = 0; ch < this.channels.length; ch++) {
      const chTick   = this.channelTickCounters[ch];
      const chSong   = this.channelSongPos[ch];
      const chPatt   = this.channelPattPos[ch];

      // Effective speed alternates between base speed and groove each row
      const baseSpeed     = speeds?.[ch]  ?? fallback;
      const groove        = grooves?.[ch] ?? 0;
      const effectiveSpeed = (groove > 0 && this.channelGrooveToggle[ch]) ? groove : baseSpeed;

      // Look up row from this channel's current pattern
      const chPatIdx = tables[ch]?.[chSong] ?? 0;
      const row = this.song.patterns[chPatIdx]?.channels[0]?.rows[chPatt];


      // VU meters for per-channel native engines (MusicLine)
      if (this._suppressNotes && chTick === 0 && row && row.note > 0 && row.note < 97) {
        const engine = getToneEngine();
        if (!this.meterCallbacks) {
          this.meterCallbacks = [];
          this.meterStaging = new Float64Array(64);
          for (let i = 0; i < 64; i++) {
            const c = i;
            this.meterCallbacks[i] = () => { engine.triggerChannelMeter(c, this.meterStaging[c]); };
          }
        }
        const vol = (row.volume !== undefined && row.volume !== null && row.volume <= 64)
          ? row.volume / 64 : 0.7;
        this.meterStaging[ch] = vol;
        Tone.Draw.schedule(this.meterCallbacks[ch], time);
      }

      // Advance this channel's counter; when it overflows, advance its position.
      // Always runs regardless of _suppressNotes so the display position tracks correctly.
      this.channelTickCounters[ch]++;
      if (this.channelTickCounters[ch] >= effectiveSpeed) {
        this.channelTickCounters[ch] = 0;
        if (groove > 0) this.channelGrooveToggle[ch] = !this.channelGrooveToggle[ch];

        // Advance row within pattern
        this.channelPattPos[ch]++;
        const chPattern = this.song.patterns[chPatIdx];
        const patLen    = chPattern?.channels[0]?.rows.length ?? 128;
        if (this.channelPattPos[ch] >= patLen) {
          this.channelPattPos[ch] = 0;
          // Advance to next track table entry
          this.channelSongPos[ch]++;
          const chTable = tables[ch]!;
          if (this.channelSongPos[ch] >= chTable.length) {
            this.channelSongPos[ch] = 0;
            // Channel 0 looping = song end
            if (ch === 0 && !this._songEndFiredThisBatch) {
              this._songEndFiredThisBatch = true;
              this.onSongEnd?.();
            }
          }
        }
      }
    }

    if (this.onTickProcess) {
      this.onTickProcess(this.channelTickCounters[0], this.channelPattPos[0]);
    }
    if (this.onChannelRowChange) {
      this.onChannelRowChange(this.channelPattPos.slice());
    }
    this.totalRowsProcessed++;
  }

  // ==========================================================================
  // ROW ADVANCEMENT
  // ==========================================================================

  private advanceRow(): void {
    if (!this.song) return;

    // DJ nudge: apply temporary BPM offset and decrement counter
    if (this.nudgeTicksRemaining > 0) {
      this.nudgeTicksRemaining--;
      if (this.nudgeTicksRemaining === 0) {
        this.nudgeOffset = 0;
      }
    }

    // DJ slip mode: advance ghost position even while looping
    if (this.slipEnabled && (this.lineLoopActive || this.patternLoopActive)) {
      this.slipPattPos++;
      const slipPatternNum = this.song.songPositions[this.slipSongPos];
      const slipPattern = this.song.patterns[slipPatternNum];
      const slipLength = slipPattern?.length ?? 64;
      if (this.slipPattPos >= slipLength) {
        this.slipPattPos = 0;
        this.slipSongPos++;
        if (this.slipSongPos >= this.song.songLength) {
          this.slipSongPos = this.song.restartPosition < this.song.songLength
            ? this.song.restartPosition : 0;
        }
      }
    }

    // DJ line loop: if active, wrap within loop boundaries
    if (this.lineLoopActive && this.lineLoopStart >= 0) {
      this.pattPos++;
      if (this.pattPos > this.lineLoopEnd) {
        this.pattPos = this.lineLoopStart;
      }
      // Notify and return early — don't do normal advancement
      if (this.onRowChange && this.song) {
        const pattNum = this.song.songPositions[this.songPos];
        this.onRowChange(this.pattPos, pattNum, this.songPos);
      }
      this.totalRowsProcessed++;
      return;
    }

    // FT2-accurate row advancement (matches getNextPos in ft2_replayer.c)
    // Reference: ft2_replayer.c lines 2245-2294
    this.pattPos++;

    // FT2 two-stage pattern delay (after row increment, before position checks)
    if (this.useXMPeriods) {
      if (this.pattDelTime > 0) {
        this.pattDelTime2 = this.pattDelTime;
        this.pattDelTime = 0;
      }
      if (this.pattDelTime2 > 0) {
        this.pattDelTime2--;
        if (this.pattDelTime2 > 0) {
          this.pattPos--; // Repeat the same row
        }
      }
    }

    // E6x pattern loop: just sets row position, no song position change
    // FT2: pBreakFlag is ONLY set by E6x (pattern loop), NOT by Dxx
    if (this.pBreakFlag) {
      this.pBreakFlag = false;
      this.pattPos = this.pBreakPos;
    }

    // Pattern end or position jump (Bxx / Dxx / natural end of pattern)
    const patternNum = this.song.songPositions[this.songPos];
    let patternLength = this.accessor.getMode() !== 'classic'
      ? this.accessor.getPatternLength(this.songPos)
      : (this.song.patterns[patternNum]?.length ?? 64);

    // SonicArranger effect 0x9 (SetTrackLen) overrides pattern length
    if (this._saTrackLen > 0) {
      patternLength = Math.min(patternLength, this._saTrackLen);
    }

    if (this.pattPos >= patternLength || this.posJumpFlag) {
      this.pattPos = this.pBreakPos; // Dxx target row, or 0 if Bxx/natural
      this.pBreakPos = 0;
      this.posJumpFlag = false;
      this._saTrackLen = 0; // Reset dynamic track length on pattern advance

      // FT2: ++song.songPos (Bxx already set songPos = param-1, so net = param)
      this.songPos++;

      // Overflow / song end
      if (this.songPos >= this.song.songLength) {
        this.songPos = this.song.restartPosition < this.song.songLength
          ? this.song.restartPosition
          : 0;
        // Debounce: only fire onSongEnd once per actual song loop (not per scheduler batch)
        if (!this._songEndFiredThisBatch) {
          this._songEndFiredThisBatch = true;
          this.onSongEnd?.();
        }
      }
    }

    // DJ pattern loop: wrap song position within loop boundaries
    if (this.patternLoopActive && this.patternLoopStartPos >= 0) {
      if (this.songPos > this.patternLoopEndPos) {
        this.songPos = this.patternLoopStartPos;
        this.pattPos = 0;
      }
    }

    // Notify
    if (this.onRowChange && this.song) {
      const pattNum = this.song.songPositions[this.songPos];
      this.onRowChange(this.pattPos, pattNum, this.songPos);
    }

    this.totalRowsProcessed++;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  /**
   * Seek to a specific song position and pattern row.
   * Stops all channels, resets state, then resumes if playing.
   */
  seekTo(songPos: number, pattPos: number): void {
    if (!this.song) return;

    // ---- Seamless seek while playing ----
    // Don't stop channels or restart the scheduler — just update the position
    // pointers so the next scheduled tick picks up from the new location.
    // This prevents the audible pause that would occur from releasing all
    // active notes and restarting the scheduler.
    if (this.playing) {
      this.songPos = Math.max(0, Math.min(songPos, this.song.songLength - 1));
      this.pattPos = Math.max(0, pattPos);
      this.currentTick = 0;

      // Forward seek to libopenmpt worklet
      if (this.useLibopenmptPlayback) {
        import('@engine/libopenmpt/LibopenmptEngine').then(({ LibopenmptEngine }) => {
          if (LibopenmptEngine.hasInstance()) {
            LibopenmptEngine.getInstance().seekTo(this.songPos, this.pattPos);
          }
        }).catch(() => {});
        return;
      }

      // Stop SunVox sequencer during seek — it runs independently in the WASM
      // worklet and would keep playing from its old position, causing double audio.
      // It will restart on the next play().
      import('@/engine/sunvox-modular/SunVoxModularSynth').then(({ getSharedSunVoxHandle }) => {
        if (getSharedSunVoxHandle() >= 0) {
          import('@/engine/sunvox/SunVoxEngine').then(({ SunVoxEngine }) => {
            if (SunVoxEngine.hasInstance()) {
              SunVoxEngine.getInstance().stop(getSharedSunVoxHandle());
            }
          }).catch(() => {});
        }
      }).catch(() => {});

      // Per-channel seek: all channels jump to the requested position
      if (this.song.channelTrackTables) {
        for (let ch = 0; ch < this.channelTickCounters.length; ch++) {
          const tbl = this.song.channelTrackTables[ch];
          this.channelSongPos[ch]    = Math.max(0, Math.min(songPos, tbl.length - 1));
          this.channelPattPos[ch]    = pattPos;
          this.channelTickCounters[ch] = 0;
          this.channelGrooveToggle[ch] = false;
        }
      }

      // Clamp pattern position
      const patternNum = this.song.songPositions[this.songPos];
      const pattern = this.song.patterns[patternNum];
      if (pattern && this.pattPos >= pattern.length) {
        this.pattPos = 0;
      }

      // Reset pattern break/jump flags so stale jumps don't fire
      this.pBreakFlag = false;
      this.posJumpFlag = false;
      this.patternDelay = 0;
    this.pattDelTime = 0;
    this.pattDelTime2 = 0;

      // Re-sync speed alternation to match target row parity
      if (this.speed2 !== null) {
        // Furnace alternates: row 0 = speed1, row 1 = speed2, row 2 = speed1, ...
        // speedAB=false means "next row will use speed1", so for the CURRENT row:
        // even rows → currently using speed1, speedAB should be true (next = speed2)
        // odd rows → currently using speed2, speedAB should be false (next = speed1)
        this.speedAB = (this.pattPos % 2 === 0);
        this.speed = (this.pattPos % 2 === 0) ? this.song.initialSpeed : this.speed2;
      }

      // Re-sync scheduler timing to NOW so the next tick fires immediately
      // from the new position instead of waiting for the old schedule.
      // This is the ONLY place nextScheduleTime is set to Tone.now() — and
      // only for user-initiated seeks, never for natural pattern advancement.
      this.nextScheduleTime = Tone.now();

      // Clear queued display states so old position updates don't flicker the UI
      this.clearStateQueue();
      cancelPendingRowUpdate();

      // Notify UI of the new position immediately
      if (this.onRowChange) {
        this.onRowChange(this.pattPos, patternNum, this.songPos);
      }

      return;
    }

    // ---- Full seek while stopped ----
    // Stop all channels (release synth notes + stop sample players)
    for (let i = 0; i < this.channels.length; i++) {
      this.stopChannel(this.channels[i], i);
    }

    // Clear state queue
    this.clearStateQueue();

    // Cancel any pending throttled row updates to prevent UI reverting to old position
    cancelPendingRowUpdate();

    // Set new position
    this.songPos = Math.max(0, Math.min(songPos, this.song.songLength - 1));
    this.pattPos = Math.max(0, pattPos);
    this.currentTick = 0;

    // Per-channel seek: all channels jump to the requested position
    if (this.song.channelTrackTables) {
      for (let ch = 0; ch < this.channelTickCounters.length; ch++) {
        const tbl = this.song.channelTrackTables[ch];
        this.channelSongPos[ch]    = Math.max(0, Math.min(songPos, tbl.length - 1));
        this.channelPattPos[ch]    = pattPos;
        this.channelTickCounters[ch] = 0;
        this.channelGrooveToggle[ch] = false;
      }
    }

    // Re-sync speed alternation for stopped seek too
    if (this.speed2 !== null) {
      this.speedAB = (this.pattPos % 2 === 0);
      this.speed = (this.pattPos % 2 === 0) ? this.song.initialSpeed : this.speed2;
    }

    // Clamp pattern position
    const patternNum = this.song.songPositions[this.songPos];
    const pattern = this.song.patterns[patternNum];
    if (pattern && this.pattPos >= pattern.length) {
      this.pattPos = 0;
    }

    // Reset pattern break/jump flags
    this.pBreakFlag = false;
    this.posJumpFlag = false;
    this.patternDelay = 0;
    this.pattDelTime = 0;
    this.pattDelTime2 = 0;

    // Notify UI
    if (this.onRowChange) {
      this.onRowChange(this.pattPos, patternNum, this.songPos);
    }

  }

  /**
   * Jump to a specific pattern by index (not song position).
   * Finds the first song position that references this pattern and seeks there.
   * If the pattern is not in the song order, it won't jump.
   */
  jumpToPattern(patternIndex: number, row: number = 0): void {
    if (!this.song) return;
    
    // Find the first song position that plays this pattern
    const songPos = this.song.songPositions.findIndex(p => p === patternIndex);
    if (songPos !== -1) {
      this.seekTo(songPos, row);
    } else {
      // Pattern not in song order - just update the display state
      // Clear the state queue so old states don't override
      this.clearStateQueue();
      // Pattern not in song order — just clear the state queue, don't seek
    }
  }

  isPlaying(): boolean { return this.playing; }
  getBPM(): number { return this.bpm; }
  getSpeed(): number { return this.speed; }
  getCurrentRow(): number { return this.pattPos; }
  getCurrentPosition(): number { return this.songPos; }
  getCurrentTick(): number { return this.currentTick; }

  /**
   * Get per-channel waveform data for oscilloscope display.
   * Creates lightweight AnalyserNodes on demand (one per channel, 128 samples).
   * Returns array of Float32Array, one per channel (up to maxChannels).
   */
  getChannelWaveforms(maxChannels = 4): Float32Array[] {
    const ctx = Tone.getContext().rawContext;
    if (!ctx) return [];

    const numCh = Math.min(this.channels.length, maxChannels);

    // Create analysers on demand when channel count changes
    if (this.channelAnalysers.length !== numCh) {
      // Dispose old analysers
      for (const a of this.channelAnalysers) {
        a.disconnect();
      }
      this.channelAnalysers = [];

      for (let i = 0; i < numCh; i++) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        // Tap from the channel's gain node (pre-pan, has the raw channel audio)
        const ch = this.channels[i];
        if (ch?.gainNode) {
          (ch.gainNode as any).connect(analyser);
        }
        this.channelAnalysers.push(analyser);
      }
    }

    const result: Float32Array[] = [];
    for (let i = 0; i < numCh; i++) {
      const buf = new Float32Array(128);
      this.channelAnalysers[i].getFloatTimeDomainData(buf);
      result.push(buf);
    }
    return result;
  }

  /** Update Furnace speed alternation for live subsong switching (no song reload needed). */
  setSpeed2(value: number | null): void {
    this.speed2 = value;
    this.speedAB = value !== null;
  }

  /**
   * Hot-swap pattern data without stopping playback.
   * The scheduler reads this.song.patterns on every tick, so updating the
   * reference is enough for edits (transpose, cell edits, fills) to take
   * effect immediately — no stop/reload/play cycle needed.
   */
  updatePatterns(patterns: Pattern[]): void {
    if (this.song) {
      this.song.patterns = patterns;
      // Keep the accessor in sync so getClassicRow reads current data
      this.accessor.updatePatterns(patterns);

      // Grow channel array if the pattern has more channels than the replayer.
      // This happens when the user adds a channel while playing — the pattern
      // data gets the new channel immediately but the replayer's ChannelState
      // array stays at its original size, causing the tick loop to skip it.
      const maxPatCh = Math.max(...patterns.map(p => p.channels.length));
      if (maxPatCh > this.channels.length) {
        this.song.numChannels = maxPatCh;
        for (let i = this.channels.length; i < maxPatCh; i++) {
          this.channels.push(this.createChannel(i, maxPatCh));
        }
      }
    }
  }

  /**
   * Hot-swap instrument list without stopping playback.
   * When the user adds, removes, or updates instruments while playing,
   * the replayer's instrumentMap must stay in sync so processRow()
   * can resolve instrument numbers from pattern cells.
   */
  updateInstruments(instruments: InstrumentConfig[]): void {
    if (this.song) {
      this.song.instruments = instruments;
      this.instrumentMap = new Map(instruments.map(i => [i.id, i]));
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose(): void {
    this.stop();

    // Restore any native engines rerouted to separation chain
    restoreNativeRouting(this.routedNativeEngines);

    for (const ch of this.channels) {
      // Dispose all pooled players
      for (const player of ch.playerPool) {
        try { player.dispose(); } catch { /* ignored */ }
      }
      ch.gainNode.dispose();
      ch.panNode.dispose();
      ch.muteGain.dispose();
    }
    // Clear buffer cache
    this.bufferCache.clear();
    this.multiSampleBufferCache.clear();
    this.separationNode.dispose();
    this.masterGain.dispose();
    this.channels = [];
    this.song = null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: TrackerReplayer | null = null;

export function getTrackerReplayer(): TrackerReplayer {
  if (!instance) {
    instance = new TrackerReplayer();
  }
  return instance;
}

export function disposeTrackerReplayer(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
