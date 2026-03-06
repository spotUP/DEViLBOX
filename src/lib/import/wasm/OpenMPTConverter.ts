/**
 * OpenMPTConverter — Convert OpenMPT WASM module data into TrackerSong
 *
 * Bridges the gap between the OpenMPT CSoundFile WASM module and DEViLBOX's
 * internal TrackerSong format. This replaces the TypeScript-based S3M/IT/XM/MOD
 * parsers with the reference OpenMPT implementation.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types/tracker';
import type { InstrumentConfig, SampleConfig } from '@/types/instrument';
import * as osl from './OpenMPTSoundlib';

/** Map OpenMPT type string → TrackerFormat */
function mapFormat(type: string): TrackerFormat {
  switch (type.toUpperCase()) {
    case 'MOD': return 'MOD';
    case 'XM':  return 'XM';
    case 'IT':  return 'IT';
    case 'S3M': return 'S3M';
    // Amiga formats that DEViLBOX has native TrackerFormat entries for
    case 'OKT':  return 'OKT';
    case 'MED':  return 'MED';
    case 'DIGI': return 'DIGI';
    case 'DBM':  return 'DBM';
    case 'SFX':  return 'SFX';
    // All other PC/exotic formats → treat as IT-compatible for editing
    default:    return 'IT';
  }
}

/** Map OpenMPT note value (1-120) to DEViLBOX note value (1-96, 97=keyoff) */
function mapNote(openmptNote: number): number {
  if (openmptNote === 0) return 0;         // Empty
  if (openmptNote === 255) return 97;      // Note Off → XM note-off
  if (openmptNote === 254) return 97;      // Note Cut → treat as note-off
  if (openmptNote === 253) return 97;      // Fade → treat as note-off
  if (openmptNote >= 1 && openmptNote <= 120) {
    // OpenMPT: C-1=1..B-9=120. DEViLBOX/XM: C-0=1..B-7=96
    // OpenMPT's note 1 = C-1 corresponds to XM note 1 = C-0
    return Math.min(openmptNote, 96);
  }
  return 0;
}

/** Map OpenMPT volume command + value → DEViLBOX volume column byte */
function mapVolumeColumn(volcmd: number, vol: number): number {
  // OpenMPT VolumeCommand enum:
  // 0=NONE, 1=Volume(0x10-0x50), 2=Panning, 3=VolSlideUp, 4=VolSlideDown,
  // 5=FineVolSlideUp, 6=FineVolSlideDown, 7=VibSpeed, 8=VibDepth,
  // 9=PanSlideLeft, 10=PanSlideRight, 11=TonePorta, 12=Portamento
  switch (volcmd) {
    case 0: return 0; // None
    case 1: return 0x10 + Math.min(vol, 64); // Volume set (0x10-0x50)
    case 2: return 0xC0 + (vol >> 2); // Panning
    case 3: return 0x60 + vol; // Vol slide up
    case 4: return 0x70 + vol; // Vol slide down
    case 5: return 0x80 + vol; // Fine vol slide up
    case 6: return 0x90 + vol; // Fine vol slide down
    case 7: return 0xA0 + vol; // Vibrato speed
    case 8: return 0xB0 + vol; // Vibrato depth
    case 11: return 0xF0 + vol; // Tone portamento
    default: return 0;
  }
}

/**
 * Map OpenMPT internal EffectCommand → DEViLBOX/XM effect type + adjusted param.
 *
 * OpenMPT CMD_* enum: 0=None, 1=Arpeggio, 2=PortaUp, 3=PortaDown, 4=TonePorta,
 * 5=Vibrato, 6=TonePortaVol, 7=VibratoVol, 8=Tremolo, 9=Panning, 10=Offset,
 * 11=VolSlide, 12=PosJump, 13=Volume, 14=PatBreak, 15=Retrig, 16=Speed, 17=Tempo,
 * 18=Tremor, 19=ModCmdEx(Exx), 20=S3MCmdEx, 21-24=ChanVol/GlobalVol, 25=KeyOff...
 *
 * XM/DEViLBOX effTyp: 0=Arpeggio, 1=PortaUp, 2=PortaDown, 3=TonePorta, 4=Vibrato,
 * 5=TonePortaVol, 6=VibratoVol, 7=Tremolo, 8=Panning, 9=Offset, 10(A)=VolSlide,
 * 11(B)=PosJump, 12(C)=Volume, 13(D)=PatBreak, 14(E)=Extended, 15(F)=SetSpeed/Tempo,
 * 16(G)=GlobalVol, 17(H)=GlobalVolSlide, 20(K)=KeyOff+VolSlide, 21(L)=SetEnvPos,
 * 25(P)=PanSlide, 27(R)=MultiRetrig, 29(T)=Tremor, 33(X)=ExtraFinePorts
 */
function mapEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  switch (cmd) {
    case 0:  return { effTyp: 0, eff: 0 }; // CMD_NONE → empty
    case 1:  return { effTyp: 0, eff: param }; // CMD_ARPEGGIO → 0xy
    case 2:  return { effTyp: 1, eff: param }; // CMD_PORTAMENTOUP → 1xx
    case 3:  return { effTyp: 2, eff: param }; // CMD_PORTAMENTODOWN → 2xx
    case 4:  return { effTyp: 3, eff: param }; // CMD_TONEPORTAMENTO → 3xx
    case 5:  return { effTyp: 4, eff: param }; // CMD_VIBRATO → 4xy
    case 6:  return { effTyp: 5, eff: param }; // CMD_TONEPORTAVOL → 5xy
    case 7:  return { effTyp: 6, eff: param }; // CMD_VIBRATOVOL → 6xy
    case 8:  return { effTyp: 7, eff: param }; // CMD_TREMOLO → 7xy
    case 9:  return { effTyp: 8, eff: param }; // CMD_PANNING8 → 8xx
    case 10: return { effTyp: 9, eff: param }; // CMD_OFFSET → 9xx
    case 11: return { effTyp: 10, eff: param }; // CMD_VOLUMESLIDE → Axy
    case 12: return { effTyp: 11, eff: param }; // CMD_POSITIONJUMP → Bxx
    case 13: return { effTyp: 12, eff: param }; // CMD_VOLUME → Cxx
    case 14: return { effTyp: 13, eff: param }; // CMD_PATTERNBREAK → Dxx
    case 15: return { effTyp: 27, eff: param }; // CMD_RETRIG → Rxy (multi-retrig)
    case 16: return { effTyp: 15, eff: param }; // CMD_SPEED → Fxx (speed < 0x20)
    case 17: return { effTyp: 15, eff: param }; // CMD_TEMPO → Fxx (tempo >= 0x20)
    case 18: return { effTyp: 29, eff: param }; // CMD_TREMOR → Txy
    case 19: return { effTyp: 14, eff: param }; // CMD_MODCMDEX → Exy (extended)
    case 20: // CMD_S3MCMDEX → convert to XM extended (Exy)
      return { effTyp: 14, eff: param };
    case 21: return { effTyp: 0, eff: 0 }; // CMD_CHANNELVOLUME (no XM equiv)
    case 22: return { effTyp: 0, eff: 0 }; // CMD_CHANNELVOLSLIDE (no XM equiv)
    case 23: return { effTyp: 16, eff: param }; // CMD_GLOBALVOLUME → Gxx
    case 24: return { effTyp: 17, eff: param }; // CMD_GLOBALVOLSLIDE → Hxy
    case 25: return { effTyp: 20, eff: param }; // CMD_KEYOFF → Kxx
    case 26: return { effTyp: 4, eff: param }; // CMD_FINEVIBRATO → 4xy (approx)
    case 27: return { effTyp: 25, eff: param }; // CMD_PANBRELLO → Yxy → Pxy (approx)
    case 28: return { effTyp: 33, eff: param }; // CMD_XFINEPORTAUPDOWN → Xxx
    case 29: return { effTyp: 25, eff: param }; // CMD_PANNINGSLIDE → Pxy
    case 30: return { effTyp: 21, eff: param }; // CMD_SETENVPOSITION → Lxx
    case 31: return { effTyp: 0, eff: 0 }; // CMD_MIDI (no tracker equiv)
    default: return { effTyp: 0, eff: 0 }; // Unknown → empty
  }
}

/** Convert OpenMPT pattern data cell array to ChannelData */
function buildChannelData(
  channelIdx: number,
  rows: osl.PatternCell[][],
  numRows: number,
): ChannelData {
  const cells: TrackerCell[] = [];

  for (let r = 0; r < numRows; r++) {
    const cell = rows[r]?.[channelIdx];
    if (!cell) {
      cells.push({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      });
      continue;
    }

    const fx = mapEffect(cell.command, cell.param);
    cells.push({
      note: mapNote(cell.note),
      instrument: cell.instrument,
      volume: mapVolumeColumn(cell.volcmd, cell.vol),
      effTyp: fx.effTyp,
      eff: fx.eff,
      effTyp2: 0,
      eff2: 0,
    });
  }

  return {
    id: `ch-${channelIdx}`,
    name: `Ch ${channelIdx + 1}`,
    rows: cells,
    muted: false,
    solo: false,
    collapsed: false,
    volume: 100,
    pan: 0,
    instrumentId: null,
    color: null,
  };
}

/**
 * Parse a tracker module using the OpenMPT WASM soundlib and return a TrackerSong.
 * Replaces the TypeScript S3M/IT/XM/MOD parsers with the reference C++ implementation.
 */
export async function parseWithOpenMPT(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const loaded = await osl.loadModule(buffer);
  if (!loaded) {
    throw new Error(`OpenMPT: Failed to load ${filename}`);
  }

  try {
    const info = await osl.getModuleInfo();
    const format = mapFormat(info.type);

    // Get order list
    const orderList = await osl.getOrderList();
    // Filter out invalid patterns (0xFE = skip, 0xFF = end)
    const validOrders = orderList.filter(p => p < 254);

    // Get all patterns
    const patterns: Pattern[] = [];
    const numPatterns = info.numPatterns;
    const numChannels = info.numChannels;

    for (let p = 0; p < numPatterns; p++) {
      const numRows = await osl.getPatternNumRows(p);
      if (numRows === 0) {
        // Empty/invalid pattern — create placeholder
        patterns.push({
          id: `pat-${p}`,
          name: `Pattern ${p}`,
          length: 64,
          channels: Array.from({ length: numChannels }, (_, c) => ({
            id: `ch-${c}`,
            name: `Ch ${c + 1}`,
            rows: Array.from({ length: 64 }, () => ({
              note: 0, instrument: 0, volume: 0,
              effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
            })),
            muted: false, solo: false, collapsed: false,
            volume: 100, pan: 0, instrumentId: null, color: null,
          })),
        });
        continue;
      }

      const cellData = await osl.getPatternData(p);
      const channels: ChannelData[] = [];
      for (let c = 0; c < numChannels; c++) {
        channels.push(buildChannelData(c, cellData, numRows));
      }

      patterns.push({
        id: `pat-${p}`,
        name: `Pattern ${p}`,
        length: numRows,
        channels,
      });
    }

    // Get instrument names and sample data → build InstrumentConfig with PCM
    const instrumentNames = await osl.getInstrumentNames();
    const sampleNames = await osl.getSampleNames();
    const instruments: InstrumentConfig[] = [];

    // For formats with instruments (IT/XM/MPTM), use instrument layer
    // For formats without (MOD/S3M), samples ARE the instruments
    const hasInstruments = instrumentNames.length > 0 && info.numInstruments > 0;
    const count = hasInstruments ? instrumentNames.length : sampleNames.length;

    for (let i = 0; i < count; i++) {
      const name = hasInstruments
        ? (instrumentNames[i] || `Instrument ${i + 1}`)
        : (sampleNames[i] || `Sample ${i + 1}`);

      // Extract sample PCM data (1-indexed in OpenMPT)
      const sampleIdx = i + 1;
      let sampleConfig: SampleConfig | undefined;

      try {
        const smpInfo = await osl.getSampleInfo(sampleIdx);
        if (smpInfo && smpInfo.length > 0) {
          const { data } = await osl.getSampleData(sampleIdx);

          // Convert PCM to ArrayBuffer (always 16-bit mono for playback)
          let audioBuffer: ArrayBuffer;
          if (data instanceof Int16Array && data.length > 0) {
            audioBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          } else if (data instanceof Int8Array && data.length > 0) {
            // Upscale 8-bit → 16-bit
            const pcm16 = new Int16Array(data.length);
            for (let s = 0; s < data.length; s++) pcm16[s] = data[s] << 8;
            audioBuffer = pcm16.buffer;
          } else {
            audioBuffer = new ArrayBuffer(0);
          }

          sampleConfig = {
            audioBuffer,
            url: '',
            baseNote: 'C-4',
            detune: smpInfo.fineTune || 0,
            loop: smpInfo.hasLoop,
            loopType: smpInfo.pingPongLoop ? 'pingpong' : (smpInfo.hasLoop ? 'forward' : 'off'),
            loopStart: smpInfo.loopStart,
            loopEnd: smpInfo.loopEnd,
            sustainLoop: smpInfo.hasSustainLoop,
            sustainLoopStart: smpInfo.sustainStart,
            sustainLoopEnd: smpInfo.sustainEnd,
            sampleRate: smpInfo.c5Speed || 8363,
            reverse: false,
            playbackRate: 1,
          };
        }
      } catch {
        // Sample extraction failed for this index — create without PCM
      }

      instruments.push({
        id: i + 1,
        name,
        synthType: 'Sampler',
        type: 'sample',
        volume: 0, // 0 dB
        pan: 0,
        muted: false,
        solo: false,
        effects: [],
        sample: sampleConfig,
        modPlayback: {
          usePeriodPlayback: format === 'MOD',
          periodMultiplier: 3546895,
          finetune: 0,
          relativeNote: 0,
        },
      } as InstrumentConfig);
    }

    const song: TrackerSong = {
      name: info.title || filename.replace(/\.[^.]+$/, ''),
      format,
      patterns,
      instruments,
      songPositions: validOrders,
      songLength: validOrders.length,
      restartPosition: 0,
      numChannels,
      initialSpeed: info.initialSpeed || 6,
      initialBPM: info.initialBPM || 125,
      linearPeriods: info.linearSlides,
    };

    return song;
  } finally {
    // Don't destroy — keep loaded for sample access and saving
    // Caller can call destroyModule() when done
  }
}
