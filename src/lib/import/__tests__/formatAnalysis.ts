/**
 * Format Analysis Utility
 * Extracts structured instrument capability data from a parsed TrackerSong.
 * Use this in tests to discover what editors each format needs.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';

// ─── Standard MOD/XM/IT effect names (effTyp 0-35) ───────────────────────────
const EFFECT_NAMES: Record<number, string> = {
  0:  'Arpeggio',
  1:  'PortaUp',
  2:  'PortaDown',
  3:  'TonePorta',
  4:  'Vibrato',
  5:  'PortaVolSlide',
  6:  'VibratoVolSlide',
  7:  'Tremolo',
  8:  'SetPanning',
  9:  'SampleOffset',
  10: 'VolumeSlide',
  11: 'PositionJump',
  12: 'SetVolume',
  13: 'PatternBreak',
  14: 'ExtendedFx',
  15: 'SetSpeed',
  16: 'GlobalVolume',
  17: 'GlobalVolSlide',
  18: 'SetEnvPos',
  19: 'Panning',
  20: 'Panbrello',
  21: 'FineVibrato',
  22: 'SetGlobalVol',
  23: 'SoundControl',
  24: 'ChannelVol',
  25: 'ChannelVolSlide',
  26: 'NoteSlideUp',
  27: 'NoteSlideDown',
  28: 'NoteFade',
  29: 'PanbrelloFine',
  30: 'MIDIMacro',
  31: 'SmoothMIDI',
  32: 'SetTempoFine',
};

export interface InstrumentReport {
  id: number;
  name: string;
  type: 'sample' | 'synth';
  synthType: string;
  hasPCM: boolean;
  pcmBytes: number;
  bitDepth: number;             // 0=unknown, 8, 16, 32
  hasLoop: boolean;
  loopType: string;
  sampleRate: number | undefined;
  hasVolumeEnvelope: boolean;
  hasPanningEnvelope: boolean;
  hasAutoVibrato: boolean;
  hasMultiSamples: boolean;
  multiSampleCount: number;
  // Native synth configurations present
  nativeConfigs: string[];      // e.g. ['hively', 'soundMon', 'uade']
}

export interface FormatReport {
  filename: string;
  format: string;
  numChannels: number;
  initialBPM: number;
  initialSpeed: number;
  linearPeriods: boolean;
  patternCount: number;
  songLength: number;
  instrumentCount: number;
  sampleCount: number;
  synthCount: number;
  withPCMCount: number;
  loopTypes: Record<string, number>;
  synthTypes: Record<string, number>;
  hasVolumeEnvelopes: number;
  hasPanningEnvelopes: number;
  hasAutoVibrato: number;
  hasMultiSamples: number;
  instruments: InstrumentReport[];
  suggestedEditors: string[];

  // Subsong support (>0 means Furnace-style multiple subsongs)
  subsongCount: number;

  // Module-level wavetable data (Furnace chip synthesis waveforms)
  hasModuleWavetables: boolean;
  moduleWavetableCount: number;

  // Native playback data (raw binary needed by WASM replayer, e.g. HVL/AHX)
  // If absent for synth-heavy formats → silent playback
  hasNativePlaybackData: boolean;

  // Native editor data (format-specific data for specialized editors)
  hasNativeEditorData: boolean;

  // Per-channel independent sequencing (each channel has its own track order)
  hasPerChannelSequencing: boolean;

  // Per-channel speed override
  hasPerChannelSpeed: boolean;

  // Whether any instrument uses UADE playback (playback-only, no sample editor)
  hasUADEInstruments: boolean;

  // Native Amiga/PC synth configs present across all instruments
  nativeSynthConfigs: string[];

  // All unique effect types used across all patterns (non-zero effTyp values)
  usedEffects: Array<{ type: number; name: string; count: number }>;

  // Volume column effect types (non-zero) - separate from main effects
  hasVolumeColumn: boolean;
}

/** Analyse a parsed TrackerSong and return a structured capability report. */
export function analyzeFormat(song: TrackerSong, filename: string): FormatReport {
  const instruments = song.instruments;

  let sampleCount = 0;
  let synthCount = 0;
  let withPCMCount = 0;
  const loopTypes: Record<string, number> = {};
  const synthTypes: Record<string, number> = {};
  let hasVolumeEnvelopes = 0;
  let hasPanningEnvelopes = 0;
  let hasAutoVibratoCount = 0;
  let hasMultiSamplesCount = 0;
  let hasUADEInstruments = false;
  const nativeSynthConfigSet = new Set<string>();

  const instReports: InstrumentReport[] = instruments.map(inst => {
    // A real PCM sample is larger than the 44-byte WAV header + minimal silence
    const pcmBytes = inst.sample?.audioBuffer?.byteLength ?? 0;
    const hasPCM = pcmBytes > 100;
    const hasLoop = inst.sample?.loop ?? false;
    const loopType = hasLoop ? (inst.sample?.loopType ?? 'forward') : 'none';
    const sampleRate = inst.sample?.sampleRate;

    // Detect bit depth from sample rate or audioBuffer (WAV header byte 34-35 = bits per sample)
    let bitDepth = 0;
    if (hasPCM && inst.sample?.audioBuffer) {
      const view = new DataView(inst.sample.audioBuffer);
      // WAV header: offset 34 = bits per sample (little-endian u16)
      if (inst.sample.audioBuffer.byteLength >= 36) {
        bitDepth = view.getUint16(34, true);
        if (bitDepth !== 8 && bitDepth !== 16 && bitDepth !== 32) bitDepth = 0;
      }
    }

    const hasVolEnv = !!(inst.metadata?.originalEnvelope?.enabled);
    const hasPanEnv = !!(inst.metadata?.panningEnvelope?.enabled);
    const av = inst.metadata?.autoVibrato;
    const hasVib = !!(av && (av.depth > 0 || av.rate > 0));
    const multiSamps = inst.metadata?.multiSamples;
    const hasMulti = !!(multiSamps && multiSamps.length > 1);

    // Detect native synth configs
    const configs: string[] = [];
    if ((inst as unknown as Record<string, unknown>).hively)      { configs.push('hively');     nativeSynthConfigSet.add('hively'); }
    if ((inst as unknown as Record<string, unknown>).uade)        { configs.push('uade');       nativeSynthConfigSet.add('uade'); hasUADEInstruments = true; }
    if ((inst as unknown as Record<string, unknown>).soundMon)    { configs.push('soundMon');   nativeSynthConfigSet.add('soundMon'); }
    if ((inst as unknown as Record<string, unknown>).sidMon)      { configs.push('sidMon');     nativeSynthConfigSet.add('sidMon'); }
    if ((inst as unknown as Record<string, unknown>).sidmon1)     { configs.push('sidmon1');    nativeSynthConfigSet.add('sidmon1'); }
    if ((inst as unknown as Record<string, unknown>).digMug)      { configs.push('digMug');     nativeSynthConfigSet.add('digMug'); }
    if ((inst as unknown as Record<string, unknown>).fc)          { configs.push('fc');         nativeSynthConfigSet.add('fc'); }
    if ((inst as unknown as Record<string, unknown>).fred)        { configs.push('fred');       nativeSynthConfigSet.add('fred'); }
    if ((inst as unknown as Record<string, unknown>).tfmx)        { configs.push('tfmx');       nativeSynthConfigSet.add('tfmx'); }
    if ((inst as unknown as Record<string, unknown>).hippelCoso)  { configs.push('hippelCoso'); nativeSynthConfigSet.add('hippelCoso'); }
    if ((inst as unknown as Record<string, unknown>).robHubbard)  { configs.push('robHubbard'); nativeSynthConfigSet.add('robHubbard'); }
    if ((inst as unknown as Record<string, unknown>).octamed)     { configs.push('octamed');    nativeSynthConfigSet.add('octamed'); }
    if ((inst as unknown as Record<string, unknown>).davidWhittaker) { configs.push('davidWhittaker'); nativeSynthConfigSet.add('davidWhittaker'); }
    if ((inst as unknown as Record<string, unknown>).symphonie)   { configs.push('symphonie');  nativeSynthConfigSet.add('symphonie'); }

    if (inst.type === 'sample') {
      sampleCount++;
      if (hasPCM) withPCMCount++;
      loopTypes[loopType] = (loopTypes[loopType] ?? 0) + 1;
    } else {
      synthCount++;
      const st = inst.synthType || 'unknown';
      synthTypes[st] = (synthTypes[st] ?? 0) + 1;
    }

    if (hasVolEnv) hasVolumeEnvelopes++;
    if (hasPanEnv) hasPanningEnvelopes++;
    if (hasVib) hasAutoVibratoCount++;
    if (hasMulti) hasMultiSamplesCount++;

    return {
      id: inst.id,
      name: inst.name,
      type: inst.type as 'sample' | 'synth',
      synthType: inst.synthType,
      hasPCM,
      pcmBytes,
      bitDepth,
      hasLoop,
      loopType,
      sampleRate,
      hasVolumeEnvelope: hasVolEnv,
      hasPanningEnvelope: hasPanEnv,
      hasAutoVibrato: hasVib,
      hasMultiSamples: hasMulti,
      multiSampleCount: hasMulti ? (multiSamps?.length ?? 0) : 0,
      nativeConfigs: configs,
    };
  });

  // ─── Pattern effects scan ───────────────────────────────────────────────────
  const effectCounts = new Map<number, number>();
  let hasVolumeColumn = false;
  for (const pattern of song.patterns) {
    for (const ch of pattern.channels) {
      for (const cell of ch.rows) {
        if (cell.volume > 0) hasVolumeColumn = true;
        // Scan all effect slots
        const slots = [
          [cell.effTyp, cell.eff],
          [cell.effTyp2, cell.eff2],
          [cell.effTyp3, cell.eff3],
          [cell.effTyp4, cell.eff4],
          [cell.effTyp5, cell.eff5],
          [cell.effTyp6, cell.eff6],
          [cell.effTyp7, cell.eff7],
          [cell.effTyp8, cell.eff8],
        ] as Array<[number | undefined, number | undefined]>;
        for (const [typ] of slots) {
          if (typ && typ > 0) {
            effectCounts.set(typ, (effectCounts.get(typ) ?? 0) + 1);
          }
        }
      }
    }
  }

  const usedEffects = Array.from(effectCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([type, count]) => ({
      type,
      name: EFFECT_NAMES[type] ?? `Fx${type.toString(16).toUpperCase()}`,
      count,
    }));

  // ─── Module-level extras ────────────────────────────────────────────────────
  const subsongCount = song.furnaceSubsongs?.length ?? 0;
  const moduleWavetableCount = song.furnaceWavetables?.length ?? 0;
  const hasModuleWavetables = moduleWavetableCount > 0;
  const hasNativePlaybackData = !!(song.hivelyFileData);
  const hasNativeEditorData = !!(song.hivelyNative || song.furnaceNative);
  const hasPerChannelSequencing = !!(song.channelTrackTables?.length);
  const hasPerChannelSpeed = !!(song.channelSpeeds?.length);

  // ─── Editor suggestions ─────────────────────────────────────────────────────
  const suggestedEditors: string[] = [];
  if (withPCMCount > 0) suggestedEditors.push('SampleEditor');
  if (Object.keys(loopTypes).some(lt => lt !== 'none')) suggestedEditors.push('LoopEditor');
  if (hasVolumeEnvelopes > 0) suggestedEditors.push('VolumeEnvelopeEditor');
  if (hasPanningEnvelopes > 0) suggestedEditors.push('PanEnvelopeEditor');
  if (hasAutoVibratoCount > 0) suggestedEditors.push('VibratoEditor');
  if (hasMultiSamplesCount > 0) suggestedEditors.push('SampleMapEditor');
  if (hasModuleWavetables) suggestedEditors.push('WavetableEditor');
  if (hasNativePlaybackData) suggestedEditors.push('NativeWASMPlayer');
  if (hasNativeEditorData) suggestedEditors.push('NativeEditor');
  if (synthCount > 0) {
    for (const st of Object.keys(synthTypes)) {
      suggestedEditors.push(`SynthPanel(${st})`);
    }
  }
  if (nativeSynthConfigSet.size > 0) {
    for (const cfg of nativeSynthConfigSet) {
      suggestedEditors.push(`NativeSynth(${cfg})`);
    }
  }
  if (suggestedEditors.length === 0) suggestedEditors.push('None');

  return {
    filename,
    format: song.format,
    numChannels: song.numChannels,
    initialBPM: song.initialBPM,
    initialSpeed: song.initialSpeed,
    linearPeriods: song.linearPeriods ?? false,
    patternCount: song.patterns.length,
    songLength: song.songLength,
    instrumentCount: instruments.length,
    sampleCount,
    synthCount,
    withPCMCount,
    loopTypes,
    synthTypes,
    hasVolumeEnvelopes,
    hasPanningEnvelopes,
    hasAutoVibrato: hasAutoVibratoCount,
    hasMultiSamples: hasMultiSamplesCount,
    instruments: instReports,
    suggestedEditors,
    subsongCount,
    hasModuleWavetables,
    moduleWavetableCount,
    hasNativePlaybackData,
    hasNativeEditorData,
    hasPerChannelSequencing,
    hasPerChannelSpeed,
    hasUADEInstruments,
    nativeSynthConfigs: Array.from(nativeSynthConfigSet),
    usedEffects,
    hasVolumeColumn,
  };
}

/** Render a FormatReport as a human-readable string for console.log in tests. */
export function formatReportToString(report: FormatReport): string {
  const lines: string[] = [];
  const bar = '═'.repeat(Math.max(40, report.filename.length + 22));

  lines.push(`╔${bar}`);
  lines.push(`║ FORMAT ANALYSIS: ${report.filename}`);
  lines.push(`║ Format: ${report.format}  Channels: ${report.numChannels}  BPM: ${report.initialBPM}  Speed: ${report.initialSpeed}  Periods: ${report.linearPeriods ? 'linear' : 'amiga'}`);
  lines.push(`║ Patterns: ${report.patternCount}  Song length: ${report.songLength}`);
  if (report.subsongCount > 0) {
    lines.push(`║ Subsongs: ${report.subsongCount}`);
  }
  lines.push(`║ Instruments: ${report.instrumentCount} total  (${report.sampleCount} sample / ${report.synthCount} synth)`);

  if (report.sampleCount > 0) {
    lines.push(`║   PCM data: ${report.withPCMCount}/${report.sampleCount} have audio`);
    const lt = Object.entries(report.loopTypes).map(([t, n]) => `${t}×${n}`).join(', ');
    if (lt) lines.push(`║   Loop types: ${lt}`);
  }

  if (report.synthCount > 0) {
    const st = Object.entries(report.synthTypes).map(([t, n]) => `${t}×${n}`).join(', ');
    lines.push(`║   Synth types: ${st}`);
  }

  if (report.nativeSynthConfigs.length > 0) {
    lines.push(`║   Native synth configs: ${report.nativeSynthConfigs.join(', ')}`);
  }

  if (report.hasVolumeEnvelopes > 0) lines.push(`║   Volume envelopes: ${report.hasVolumeEnvelopes}`);
  if (report.hasPanningEnvelopes > 0) lines.push(`║   Pan envelopes: ${report.hasPanningEnvelopes}`);
  if (report.hasAutoVibrato > 0) lines.push(`║   Auto-vibrato: ${report.hasAutoVibrato}`);
  if (report.hasMultiSamples > 0) lines.push(`║   Multi-sample instruments: ${report.hasMultiSamples}`);
  if (report.hasModuleWavetables) lines.push(`║   Module wavetables: ${report.moduleWavetableCount}`);
  if (report.hasNativePlaybackData) lines.push(`║   ⚠ Native WASM playback data (raw binary — must load for audio)`);
  if (report.hasNativeEditorData) lines.push(`║   Native editor data present`);
  if (report.hasPerChannelSequencing) lines.push(`║   Per-channel sequencing (channelTrackTables)`);
  if (report.hasPerChannelSpeed) lines.push(`║   Per-channel speed override`);
  if (report.hasUADEInstruments) lines.push(`║   ⚠ UADE instruments (playback-only, no sample editor)`);
  if (report.hasVolumeColumn) lines.push(`║   Uses volume column`);

  if (report.usedEffects.length > 0) {
    const effectStr = report.usedEffects.map(e => `${e.name}(${e.count})`).join(', ');
    lines.push(`║   Effects used: ${effectStr}`);
  }

  lines.push(`║ Suggested editors: ${report.suggestedEditors.join(', ')}`);
  lines.push(`╠${'─'.repeat(bar.length)}`);

  for (const inst of report.instruments) {
    if (inst.type === 'sample') {
      const pcmStr = inst.hasPCM ? `${inst.pcmBytes}b${inst.bitDepth ? `@${inst.bitDepth}bit` : ''}` : 'empty';
      const rateStr = inst.sampleRate ? ` ${inst.sampleRate}Hz` : '';
      const loopStr = inst.hasLoop ? ` loop:${inst.loopType}` : '';
      const multiStr = inst.hasMultiSamples ? ` [${inst.multiSampleCount} samples]` : '';
      const envStr = inst.hasVolumeEnvelope ? ' env' : '';
      const natStr = inst.nativeConfigs.length > 0 ? ` [${inst.nativeConfigs.join(',')}]` : '';
      lines.push(`║  #${String(inst.id).padStart(3)} "${inst.name.slice(0, 22)}"  sample  ${pcmStr}${rateStr}${loopStr}${multiStr}${envStr}${natStr}`);
    } else {
      const envStr = inst.hasVolumeEnvelope ? ' env' : '';
      const natStr = inst.nativeConfigs.length > 0 ? ` [${inst.nativeConfigs.join(',')}]` : '';
      lines.push(`║  #${String(inst.id).padStart(3)} "${inst.name.slice(0, 22)}"  synth/${inst.synthType}${envStr}${natStr}`);
    }
  }

  lines.push(`╚${bar}`);
  return lines.join('\n');
}
