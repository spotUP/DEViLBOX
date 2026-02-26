/**
 * UADEParser.ts - Catch-all parser for exotic Amiga music formats
 *
 * Handles 130+ formats that cannot be natively parsed in TypeScript:
 * JochenHippel, TFMX, FredEditor, SidMon, Hippel-7V, and many more.
 *
 * Enhanced mode (with rebuilt WASM): Extracts real PCM samples from Amiga chip RAM,
 * detects effects from per-tick analysis, and creates fully editable TrackerSong
 * with real Sampler instruments.
 *
 * Classic mode (fallback): Returns a playback-only TrackerSong with UADESynth instrument.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, UADEConfig } from '@/types/instrument';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { UADEEnhancedScanRow, UADEMetadata } from '@/engine/uade/UADEEngine';
import { createSamplerInstrument } from './AmigaUtils';

/**
 * Complete UADE eagleplayer extension set, derived from eagleplayer.conf prefixes.
 *
 * Excludes formats handled by dedicated parsers:
 *   - .mod variants → libopenmpt / MODParser
 *   - .hvl, .ahx, .thx → HivelyParser
 *   - .okt, .okta → OktalyzerParser
 *   - .med, .mmd0-3 → MEDParser
 *   - .digi → DigiBoosterParser
 *   - .fc, .fc13, .fc14, .sfc → FCParser
 *
 * Note: UADE also detects many formats by magic bytes, not just extension.
 * The catch-all in parseModuleToSong will try UADE for unknown formats too.
 */
const UADE_EXTENSIONS: Set<string> = new Set([
  // AProSys
  'aps',
  // ActionAmics
  'ast',
  // ADPCM
  'adpcm',
  // AM-Composer
  'amc',
  // AMOS
  'abk',
  // Anders Öland
  'hot',
  // ArtAndMagic
  'aam',
  // Alcatraz Packer
  'alp',
  // Andrew Parton
  'bye',
  // ArtOfNoise
  'aon', 'aon4', 'aon8',
  // Ashley Hogg
  'ash',
  // AudioSculpture
  'adsc', 'mod_adsc4',
  // Beathoven Synthesizer
  'bss',
  // BenDaglish
  'bd', 'bds',
  // BladePacker
  'uds',
  // ChipTracker
  'kris',
  // Cinemaware
  'cin',
  // CoreDesign
  'core',
  // custom / CustomMade
  'cus', 'cust', 'custom', 'cm', 'rk', 'rkb',
  // DariusZendeh
  'dz', 'mkiio',
  // DaveLowe
  'dl', 'dl_deli', 'dln',
  // DavidHanney
  'dh',
  // DavidWhittaker
  'dw', 'dwold',
  // DeltaMusic
  'dlm1', 'dlm2', 'dm', 'dm1', 'dm2',
  // Desire
  'dsr',
  // DigitalSonixChrome
  'dsc',
  // DigitalSoundStudio
  'dss',
  // DynamicSynthesizer
  'dns',
  // EMS
  'ems', 'emsv6',
  // FashionTracker
  'ex',
  // FutureComposer variants (all routed to UADE for authentic eagleplayer playback)
  'fc', 'fc13', 'fc14', 'sfc', 'bfc', 'bsi', 'fc-bsi', 'fc2', 'fc3', 'fc4', 'smod',
  // Fred
  'fred',
  // FredGray
  'gray',
  // FuturePlayer
  'fp',
  // ForgottenWorlds
  'fw',
  // GlueMon
  'glue', 'gm',
  // GMC
  'gmc',
  // EarAche
  'ea', 'mg',
  // HowieDavies
  'hd',
  // JochenHippel
  'hip', 'hip7', 'hipc', 'hst', 'mcmd', 'mcmd_org', 'soc', 'sog', 's7g',
  // QuadraComposer
  'emod', 'qc',
  // ImagesMusicSystem
  'ims',
  // Infogrames
  'dum',
  // InStereo
  'is', 'is20',
  // JamCracker
  'jam', 'jc',
  // JankoMrsicFlogel
  'jmf',
  // Janne Salmijarvi Optimizer
  'js',
  // JasonBrooke
  'jcb', 'jcbo', 'jb',
  // JasonPage
  'jpn', 'jpnd', 'jp',
  // JeroenTel
  'jt', 'mon_old',
  // JesperOlsen
  'jo',
  // Kim Christensen
  'kim',
  // KrisHatlelid
  'kh',
  // Laxity
  'powt', 'pt',
  // LegglessMusicEditor
  'lme',
  // ManiacsOfNoise
  'mon',
  // MagneticFieldsPacker
  'mfp',
  // MajorTom
  'hn', 'mtp2', 'thn', 'arp',
  // Mark Cooksey
  'mc', 'mcr', 'mco',
  // MarkII
  'mk2', 'mkii',
  // MartinWalker
  'avp', 'mw',
  // Maximum Effect
  'max',
  // MikeDavies
  'md',
  // Mosh Packer
  'mosh',
  // MMDC
  'mmdc',
  // Mugician
  'dmu', 'dmu2', 'mug', 'mug2',
  // MusicAssembler
  'ma',
  // MusicMaker
  'mm4', 'mm8', 'sdata',
  // MultiMedia Sound
  'mms', 'sfx20',
  // Nick Pelling Packer
  'npp',
  // NovoTradePacker
  'ntp',
  // NTSP
  'two',
  // Octa-MED (handled by MEDParser for mmd0-3, but octamed prefix goes to UADE)
  'octamed',
  // onEscapee
  'one',
  // PaulRobotham
  'dat',
  // PaulShields
  'ps',
  // PaulSummers
  'snk',
  // Paul Tonge
  'pat',
  // PeterVerswyvelen
  'pvp',
  // PierreAdane
  'pap',
  // Pokeynoise
  'pn',
  // PreTracker
  'prt',
  // ProfessionalSoundArtists
  'psa',
  // Protracker4
  'ptm', 'mod3',
  // PumaTracker
  'puma',
  // RichardJoseph
  'rj', 'rjp',
  // RiffRaff
  'riff',
  // RobHubbard
  'rh', 'rho',
  // SCUMM
  'scumm',
  // SeanConnolly
  's-c', 'scn',
  // SeanConran
  'scr',
  // SIDMon
  'sid', 'sid1', 'sid2', 'smn',
  // Silmarils
  'mok',
  // SonicArranger
  'sa', 'sa-p', 'sa_old', 'sonic', 'lion',
  // SonixMusicDriver
  'smus', 'snx', 'tiny',
  // SoundProgrammingLanguage
  'spl',
  // SoundControl
  'sc', 'sct',
  // SoundFactory
  'psf',
  // Sound-FX
  'sfx', 'sfx13',
  // SoundImages
  'tw',
  // SoundMaster
  'sm', 'sm1', 'sm2', 'sm3', 'smpro',
  // SoundMon
  'bp', 'bp3', 'sndmon',
  // SoundPlayer
  'sjs',
  // Special-FX
  'jd', 'doda',
  // SpeedyA1System / SpeedySystem
  'sas', 'ss',
  // SteveBarrett
  'sb',
  // SteveTurner
  'jpo', 'jpold',
  // SUN-Tronic
  'sun',
  // Synth / SynthDream / SynthPack
  'syn', 'sdr', 'osp',
  // SynTracker
  'st', 'synmod',
  // TCB Tracker
  'tcb',
  // TFMX variants
  'tfmx', 'mdat', 'tfmxpro', 'tfmx1.5', 'tfmx7v', 'tfhd1.5', 'tfhd7v', 'tfhdpro',
  // ThomasHermann
  'thm',
  // TimeTracker
  'tmk',
  // TimFollin
  'tf',
  // Titanics Packer
  'tits',
  // TheMusicalEnlightenment
  'tme',
  // TomyTracker
  'sg',
  // Tronic
  'dp', 'trc', 'tro', 'tronic',
  // UFO
  'mus', 'ufo',
  // VoodooSupremeSynthesizer
  'vss',
  // WallyBeben
  'wb',
  // YM-2149
  'ym', 'ymst',
  // MusiclineEditor
  'ml',
  // Sierra AGI
  'agi',
  // DirkBialluch
  'tpu',
  // Quartet
  'qpa', 'qts', 'sqt',
  // ZoundMonitor
  'sng',
  // PTK-Prowiz packed formats
  'mod_doc', 'mod15', 'mod15_mst', 'mod_ntk', 'mod_ntk1', 'mod_ntk2',
  'mod_ntkamp', 'mod_flt4', 'mod_comp', 'mod15_ust', 'mod15_st-iv',
  // Prowiz packed module variants (many obscure packer formats)
  'ac1', 'ac1d', 'aval', 'chan', 'cp', 'cplx', 'crb', 'di', 'eu',
  'fc-m', 'fcm', 'ft', 'fuz', 'fuzz', 'gv', 'hmc', 'hrt',
  'ice', 'it1', 'kef', 'kef7', 'krs', 'ksm', 'lax',
  'mexxmp', 'mpro', 'np', 'np1', 'np2', 'np3', 'nr', 'nru', 'ntpk',
  'p10', 'p21', 'p30', 'p40a', 'p40b', 'p41a', 'p4x', 'p50a', 'p5a', 'p5x',
  'p60', 'p60a', 'p61', 'p61a', 'p6x', 'pha', 'pin',
  'pm', 'pm0', 'pm01', 'pm1', 'pm10c', 'pm18a', 'pm2', 'pm20', 'pm4', 'pm40', 'pmz',
  'polk', 'pp10', 'pp20', 'pp21', 'pp30', 'ppk',
  'pr1', 'pr2', 'prom', 'pru', 'pru1', 'pru2', 'prun', 'prun1', 'prun2', 'pwr',
  'pyg', 'pygm', 'pygmy', 'skt', 'skyt', 'snt',
  'st2', 'st26', 'st30', 'star', 'stpk',
  'tp', 'tp1', 'tp2', 'tp3', 'un2', 'unic', 'unic2', 'wn', 'xan', 'xann', 'zen',
]);

/**
 * Detect whether a filename likely belongs to a UADE-handled format.
 * Returns true if the extension matches a known UADE format.
 */
export function isUADEFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return UADE_EXTENSIONS.has(ext);
}

/**
 * Parse an exotic Amiga music file via UADE scan.
 *
 * If the WASM has enhanced exports (read_memory, get_channel_extended, get_cia_state),
 * produces a fully editable TrackerSong with real Sampler instruments containing
 * extracted PCM audio, detected effects, and accurate tempo.
 *
 * Otherwise falls back to classic mode: display-only patterns with UADESynth playback.
 *
 * @param mode    - 'enhanced' (default) for editable output, 'classic' for UADESynth playback-only
 * @param subsong - Subsong index to import (0 = default/first). When > 0, triggers a separate
 *                  re-scan of that subsong without re-transferring the file data.
 */
export async function parseUADEFile(
  buffer: ArrayBuffer,
  filename: string,
  mode: 'enhanced' | 'classic' = 'enhanced',
  subsong = 0,
  preScannedMeta?: UADEMetadata,
): Promise<TrackerSong> {
  const { UADEEngine } = await import('@engine/uade/UADEEngine');
  const { periodToNoteIndex } = await import('@engine/effects/PeriodTables');

  const name = filename.replace(/\.[^/.]+$/, '');
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  // Initialize UADE engine; reuse pre-scanned metadata from the dialog when available
  // (avoids a second full scan which can take several seconds per file)
  const engine = UADEEngine.getInstance();
  await engine.ready();
  const metadata = preScannedMeta ?? await engine.load(buffer, filename);
  const scanRows = metadata.scanData ?? [];

  // Resolve scan data for the requested subsong.
  // subsong=0 reuses the data from the initial load; subsong>0 triggers a worklet re-scan.
  let activeScanRows = scanRows;
  let activeEnhancedScan = metadata.enhancedScan;

  if (subsong > 0 && mode === 'enhanced') {
    try {
      const result = await engine.scanSubsong(subsong);
      activeScanRows = result.scanResult.rows as Array<Array<{ period: number; volume: number; samplePtr: number }>>;
      activeEnhancedScan = result.scanResult;
    } catch (err) {
      console.warn(`[UADEParser] subsong ${subsong} re-scan failed, using subsong 0 data:`, err);
    }
  }

  // Build the subsong name: append subsong index when it's not the default
  const songName = subsong > 0 ? `${name} (${subsong + 1})` : name;

  // Synthesis-based formats use short macro-driven waveforms (16-32 bytes) that the
  // enhanced scan cannot reliably extract. Force classic (UADE playback) for these.
  // NOTE: bare 'fc' is excluded here because .fc covers both FC 1.x (synthesis) and FC 2.0
  // (real PCM samples). FC 2.0 should get enhanced treatment; only FC 1.x is synthesis.
  const SYNTHESIS_FORMATS = new Set([
    'fc3', 'sfc', 'bfc', 'bsi',              // Future Composer 1.x variants (synthesis only)
    'bp', 'bp3', 'sm', 'sm2', 'sm3', 'sm4',  // SoundMon / BPSoundMon variants
    'fred',                                    // Fred Editor
    'sid', 'sid2',                             // SidMon variants
    'dmu', 'dmu2', 'mug', 'mug2',             // Digital Mugician variants
  ]);
  if (mode === 'enhanced' && SYNTHESIS_FORMATS.has(ext)) {
    console.warn(`[UADEParser] ${ext.toUpperCase()} uses synthesis waveforms; using classic mode for accurate playback`);
    return buildClassicSong(songName, ext, filename, buffer, metadata, activeScanRows, periodToNoteIndex);
  }
  // For .fc files, distinguish FC 1.x (synthesis: FC13/FC14/SMOD magic) from FC 2.0 (real PCM).
  if (mode === 'enhanced' && ext === 'fc') {
    const fcBytes = new Uint8Array(buffer, 0, 4);
    const fcMagic = String.fromCharCode(fcBytes[0], fcBytes[1], fcBytes[2], fcBytes[3]);
    if (fcMagic === 'FC13' || fcMagic === 'FC14' || fcMagic === 'SMOD') {
      console.warn('[UADEParser] FC 1.x synthesis format (wavetable-only); using classic mode for accurate playback');
      return buildClassicSong(songName, ext, filename, buffer, metadata, activeScanRows, periodToNoteIndex);
    }
  }

  // If enhanced scan data is available AND mode is 'enhanced', build editable song
  if (mode === 'enhanced' && activeEnhancedScan) {
    const song = buildEnhancedSong(
      songName, ext, filename, buffer,
      { ...metadata, enhancedScan: activeEnhancedScan },
      activeScanRows, periodToNoteIndex,
    );
    // Fall back to classic if enhanced scan yielded no playable instruments.
    // This happens for synthesis-only formats, all-zero PCM, or pure VBlank formats
    // where no chip RAM samples were extracted.
    const hasPlayableInstruments = song.instruments.some(
      i => i.synthType === 'Sampler' && i.sample?.audioBuffer,
    );
    if (hasPlayableInstruments) {
      // Surface any scan-quality warnings in the song name so the user sees them
      const warnings = activeEnhancedScan?.warnings ?? [];
      if (warnings.length > 0) {
        console.warn('[UADEParser] Scan warnings:', warnings);
        song.name = `${song.name} [${warnings.join('; ')}]`;
      }
      return song;
    }
    console.warn('[UADEParser] Enhanced scan yielded no playable instruments, falling back to classic');
  }

  // Classic mode: UADESynth playback with display-only patterns
  return buildClassicSong(
    songName, ext, filename, buffer, metadata, activeScanRows, periodToNoteIndex,
  );
}

/**
 * Attempt to extract instrument names from a raw Amiga file buffer.
 *
 * Strategy 1 — Format-specific parsers for well-known formats:
 *   • Delta Music 2 (.dm2): "DM2!" magic, 22-byte names at fixed stride
 *     NOTE: "DM2!" magic has not been observed in real-world files — real .dm2 files
 *     appear to be compiled Amiga binaries with no static name table.
 *   • Sonic Arranger (.sa, .sa-p, .sa_old, .sonic, .lion): "SOAR" chunk format,
 *     INST chunk with 152-byte structs, name at offset +122, max 30 chars.
 *
 * Strategy 2 — Generic MOD-style name scan:
 *   Many Amiga formats store instrument names as blocks of 22-byte null-terminated
 *   ASCII strings (the ProTracker convention). We scan the first 8 KB for the
 *   largest run of consecutive 22-byte printable-ASCII slots and return it.
 *
 * Returns an ordered array of names (may be shorter than the actual instrument
 * count), or null if nothing convincing was found.
 */
function tryExtractInstrumentNames(buffer: ArrayBuffer, ext: string): string[] | null {
  if (buffer.byteLength < 64) return null;
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);

  /* ── Delta Music 2 (.dm2) ─────────────────────────────────────────────── */
  if (ext === 'dm2' || ext === 'dm') {
    // DM2 header: magic "DM2!" at offset 0, followed by song table, then
    // instrument table.  Each instrument slot is 32 bytes:
    //   [0..1]  loop offset (u16BE)
    //   [2..3]  loop length (u16BE, in words)
    //   [4..5]  sample length (u16BE, in words)
    //   [6]     volume (u8)
    //   [7]     pad
    //   [8..29] name (22 bytes, null-terminated ASCII)
    // The instrument table starts at offset 0x3A.
    // NOTE: real-world .dm2 files are typically compiled Amiga binaries and do NOT
    // carry the "DM2!" magic. This case is retained for hypothetical bare-format files.
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic === 'DM2!') {
      const INSTR_TABLE = 0x3A;
      const INSTR_SIZE  = 32;
      const MAX_INSTR   = 31;
      const names: string[] = [];
      for (let i = 0; i < MAX_INSTR; i++) {
        const off = INSTR_TABLE + i * INSTR_SIZE + 8;
        if (off + 22 > bytes.length) break;
        const name = readFixedAscii(bytes, off, 22);
        if (!name) continue;
        names.push(name);
      }
      if (names.length > 0) return names;
    }
  }

  /* ── Sonic Arranger (.sa, .sa-p, .sa_old, .sonic, .lion) ──────────────── */
  if (ext === 'sa' || ext === 'sa-p' || ext === 'sa_old' || ext === 'sonic' || ext === 'lion') {
    // New-format SA files start with 'SOAR' + 'V1.0' followed by named chunks.
    // Old-format SA files are compiled Amiga binaries (start with JMP instruction
    // 0x4EFA) — those have no static name table and fall through to the generic scan.
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic === 'SOAR' && buffer.byteLength >= 16) {
      // Chunk layout:
      //   +0   'SOAR' (4)
      //   +4   'V1.0' (4)
      //   +8   'STBL' tag (4)
      //   +12  subsong count (u32BE)
      //   +16  subsong table (count × 12 bytes)
      //   then sequential chunks: TAG(4) + count(4) + data
      //     'OVTB' — count × 16 bytes
      //     'NTBL' — count × 4 bytes
      //     'INST' — count × 152 bytes; name at offset +122, max 30 chars
      const subsongCount = view.getUint32(12, false);
      let pos = 16 + subsongCount * 12;  // skip past STBL data

      // Walk chunks until INST or EOF
      while (pos + 8 <= bytes.length) {
        const tag   = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
        const count = view.getUint32(pos + 4, false);
        pos += 8;

        if (tag === 'OVTB') { pos += count * 16; continue; }
        if (tag === 'NTBL') { pos += count * 4;  continue; }
        if (tag === 'INST') {
          const INST_STRIDE = 152;
          const NAME_OFF    = 122;
          const NAME_LEN    = 30;
          const names: string[] = [];
          for (let i = 0; i < count; i++) {
            const base = pos + i * INST_STRIDE;
            if (base + INST_STRIDE > bytes.length) break;
            // SA name fields may contain garbage bytes after the null terminator.
            // Read only up to the first null; discard anything after it.
            let name = '';
            for (let j = 0; j < NAME_LEN; j++) {
              const c = bytes[base + NAME_OFF + j];
              if (c === 0) break;
              if (c < 0x20 || c > 0x7e) { name = ''; break; }
              name += String.fromCharCode(c);
            }
            const trimmed = name.trim();
            if (trimmed) names.push(trimmed);
          }
          if (names.length > 0) return names;
          break;
        }
        // Unknown chunk — stop navigating to avoid misreading binary data
        break;
      }
    }
  }

  /* ── SoundFX (.sfx, .sfx13) ───────────────────────────────────────────── */
  // Format spec (libxmp): sfx-format.txt
  // Two variants, detected by where 'SONG' magic appears:
  //   SFX 1.3: sample size table = 15×4 = 60 bytes → 'SONG' at offset 60
  //            instrument table at offset 80, 15 × 30-byte entries
  //   SFX 2.0: sample size table = 31×4 = 124 bytes → 'SONG' at offset 124
  //            instrument table at offset 144, 31 × 30-byte entries
  // Each instrument entry: name[22] + len(2) + finetune(1) + vol(1) + loopStart(2) + loopLen(2)
  if (ext === 'sfx' || ext === 'sfx13') {
    const INSTR_STRIDE = 30;
    const INSTR_NAME   = 22;
    let instrCount = 0;
    let instrTable  = 0;
    if (bytes.length >= 64) {
      const songOff = String.fromCharCode(bytes[60], bytes[61], bytes[62], bytes[63]);
      if (songOff === 'SONG') { instrCount = 15; instrTable = 80; }   // SFX 1.3
    }
    if (instrCount === 0 && bytes.length >= 128) {
      const songOff = String.fromCharCode(bytes[124], bytes[125], bytes[126], bytes[127]);
      if (songOff === 'SONG') { instrCount = 31; instrTable = 144; }  // SFX 2.0
    }
    if (instrCount > 0) {
      const names: string[] = [];
      for (let i = 0; i < instrCount; i++) {
        const off = instrTable + i * INSTR_STRIDE;
        if (off + INSTR_NAME > bytes.length) break;
        const name = readFixedAscii(bytes, off, INSTR_NAME);
        if (name) names.push(name);
      }
      if (names.length > 0) return names;
    }
  }

  /* ── Generic: scan for MOD-style 22-byte ASCII name blocks ───────────── */
  // Many Amiga trackers use the same 22-byte fixed-length string convention
  // for instrument names (ProTracker, NoiseTracker, etc. and derivatives).
  // We search the first SCAN_LIMIT bytes for the start position of the largest
  // consecutive run of valid 22-byte ASCII strings.
  const SCAN_LIMIT = Math.min(8192, buffer.byteLength);
  const NAME_LEN   = 22;

  let bestStart  = -1;
  let bestCount  = 0;

  // Try every possible start offset
  for (let startOff = 0; startOff + NAME_LEN <= SCAN_LIMIT; startOff += 2) {
    let count = 0;
    let off   = startOff;
    while (off + NAME_LEN <= SCAN_LIMIT) {
      const n = readFixedAscii(bytes, off, NAME_LEN);
      if (n === null) break;
      count++;
      off += NAME_LEN;
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = startOff;
    }
    // Require at least 3 consecutive valid names to consider the block real
    if (bestCount >= 3) break; // good enough
  }

  if (bestCount >= 2 && bestStart >= 0) {
    const names: string[] = [];
    let off = bestStart;
    for (let i = 0; i < bestCount && i < 32; i++) {
      const n = readFixedAscii(bytes, off, NAME_LEN);
      if (n !== null) names.push(n);
      off += NAME_LEN;
    }
    return names.length > 0 ? names : null;
  }

  void view; // suppress unused-var lint for future use
  return null;
}

/**
 * Read a fixed-length null-terminated ASCII string from a Uint8Array.
 * Returns null if the slice contains non-printable non-null bytes
 * (indicating it is not a string field).
 */
function readFixedAscii(bytes: Uint8Array, off: number, len: number): string | null {
  let str = '';
  let foundNull = false;
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i];
    if (c === 0) {
      foundNull = true;
      continue;
    }
    if (foundNull) {
      // Non-null byte after null-terminator → not a proper string field
      return null;
    }
    // Allow printable ASCII (0x20-0x7E)
    if (c < 0x20 || c > 0x7E) return null;
    str += String.fromCharCode(c);
  }
  return str.trim() || null; // Return null for all-whitespace names
}

/**
 * Build a contextual instrument label from enhanced scan metadata.
 * Uses loop state and playback frequency as descriptors.
 */
function buildSampleLabel(instrIdx: number, typicalPeriod: number, loopLength: number): string {
  const num = String(instrIdx).padStart(2, '0');

  // Approximate note name from Amiga period (PAL: freq = 3546895 / period)
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  let noteName = '';
  if (typicalPeriod > 0) {
    const freq = 3546895 / typicalPeriod;
    // A4 = 440 Hz = MIDI 69
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    if (midi >= 0 && midi <= 127) {
      const octave  = Math.floor(midi / 12) - 1;
      const semitone = midi % 12;
      noteName = ` ${noteNames[semitone]}-${octave}`;
    }
  }

  const loopSuffix = loopLength > 0 ? ' (loop)' : '';
  return `Sample ${num}${noteName}${loopSuffix}`;
}

/**
 * Build fully editable TrackerSong from enhanced scan data.
 * Creates real Sampler instruments with extracted PCM audio.
 */
function buildEnhancedSong(
  name: string,
  ext: string,
  filename: string,
  buffer: ArrayBuffer,
  metadata: UADEMetadata,
  scanRows: Array<Array<{ period: number; volume: number; samplePtr: number; effTyp?: number; eff?: number }>>,
  periodToNoteIndex: (period: number, finetune?: number) => number,
): TrackerSong {
  const enhanced = metadata.enhancedScan!;

  // Attempt to extract instrument names from the file header.
  // Names are ordered (index 0 = first instrument in file). We match them
  // to the scan samples in ascending memory-pointer order.
  const extractedNames = tryExtractInstrumentNames(buffer, ext);

  // Build instrument map: samplePtr → instrumentId, and create real Sampler instruments
  const sampleMap = new Map<number, number>();
  const instruments: InstrumentConfig[] = [];
  let nextInstrId = 1;

  // Create real Sampler instruments from extracted PCM data
  for (const ptrStr of Object.keys(enhanced.samples)) {
    const ptr = Number(ptrStr);
    const sample = enhanced.samples[ptr];
    if (!sample || !sample.pcm || sample.length <= 4) continue;

    const instrId = nextInstrId++;
    sampleMap.set(ptr, instrId);

    // Calculate sample rate from typical playback period
    // Amiga PAL: sampleRate = 3546895 / period  (NOT /2 — that's a common off-by-one)
    // Period 428 → 8287 Hz (C-3), period 214 → 16574 Hz (C-4)
    const rawRate = sample.typicalPeriod > 0
      ? Math.round(3546895 / sample.typicalPeriod)
      : 8287;
    // Clamp to valid Web Audio API range (8000–96000 Hz)
    const sampleRate = Math.max(8000, Math.min(96000, rawRate));

    // Reconstruct Uint8Array from transferred data
    const pcm = sample.pcm instanceof Uint8Array
      ? sample.pcm
      : new Uint8Array(sample.pcm);

    // Clamp loopEnd to pcm.length — wlen from DMA can exceed extracted bytes if sample
    // was truncated by MEM_READ_BUF_SIZE during capture.
    const rawLoopEnd = sample.loopLength > 0 ? sample.loopStart + sample.loopLength : 0;
    const loopEnd = rawLoopEnd > 0 ? Math.min(rawLoopEnd, pcm.length) : 0;

    // Use extracted name if available; otherwise build contextual label
    const extractedName = extractedNames?.[instrId - 1];
    const instrName = extractedName
      || buildSampleLabel(instrId, sample.typicalPeriod, sample.loopLength);

    instruments.push(createSamplerInstrument(
      instrId,
      instrName,
      pcm,
      64, // Full volume
      sampleRate,
      sample.loopStart,
      loopEnd,
    ));
  }

  // Build reverse-lookup: loop-start Amiga address → original sample pointer.
  // After a DMA loop reload the Paula `lc` register changes to the loop-start
  // address, so scan rows captured during looped playback have samplePtr equal
  // to that loop-start address — NOT the original sample start that is the key
  // in sampleMap.  Use the loopStart byte-offset (already computed by the
  // worklet's loop-reload detector) to reconstruct the loop address and map it
  // back to the original pointer so the correct instrument ID is found.
  const loopAliasMap = new Map<number, number>(); // loopAddr → original samplePtr
  for (const ptrStr of Object.keys(enhanced.samples)) {
    const ptr = Number(ptrStr);
    const s = enhanced.samples[ptr];
    if (s?.loopStart > 0) {
      loopAliasMap.set(ptr + s.loopStart, ptr);
    }
  }

  // Add a muted UADE reference instrument for comparison playback
  const uadeRefId = nextInstrId++;
  const uadeConfig: UADEConfig = {
    type: 'uade',
    filename,
    fileData: buffer,
    subsongCount: metadata.subsongCount,
    currentSubsong: 0,
    metadata: {
      player: metadata.player,
      formatName: metadata.formatName || guessFormatName(ext),
      minSubsong: metadata.minSubsong,
      maxSubsong: metadata.maxSubsong,
    },
  };
  instruments.push({
    id: uadeRefId,
    name: 'UADE Reference',
    type: 'synth' as const,
    synthType: 'UADESynth' as const,
    effects: [],
    volume: -60, // Muted by default
    pan: 0,
    uade: uadeConfig,
  });

  // Build patterns from enhanced scan rows (64 rows per pattern)
  const ROWS_PER_PATTERN = 64;
  const PAULA_CHANNEL_NAMES = ['Paula 1', 'Paula 2', 'Paula 3', 'Paula 4'];
  const totalRows = scanRows.length;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  // Track previous volume per channel across all patterns — only write volume on change
  const prevVolPerChannel: number[] = [-1, -1, -1, -1];

  for (let pat = 0; pat < numPatterns; pat++) {
    const rowStart = pat * ROWS_PER_PATTERN;
    const rowEnd = Math.min(rowStart + ROWS_PER_PATTERN, totalRows);

    const channels: ChannelData[] = PAULA_CHANNEL_NAMES.map((chName, chIdx) => ({
      id: `channel-${chIdx}`,
      name: chName,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      // Amiga hard stereo: channels 0,3 = left, channels 1,2 = right
      pan: (chIdx === 0 || chIdx === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, (_, rowIdx) => {
        const scanIdx = rowStart + rowIdx;
        if (scanIdx >= rowEnd || scanIdx >= scanRows.length) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }

        const ch = scanRows[scanIdx][chIdx];
        if (!ch || ch.period <= 0) {
          // No note, but check for volume-only or effect-only data
          const effTyp = (ch as UADEEnhancedScanRow)?.effTyp ?? 0;
          const eff = (ch as UADEEnhancedScanRow)?.eff ?? 0;
          if (effTyp > 0 || eff > 0) {
            return { note: 0, instrument: 0, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
          }
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }

        // Convert Amiga period to XM-compatible note number for TrackerReplayer.
        // periodToNoteIndex returns an internal absolute index (C-1=36, C-2=48, C-3=60).
        // TrackerReplayer.noteToPeriod expects XM-style 1-based note numbers (C-1=13, C-2=25, C-3=37).
        // Offset: xmNote = noteIdx - 23.
        // We also store the raw Amiga period so TrackerReplayer.noteToPeriod uses it
        // directly (via rawPeriodToFinetuned) rather than going through noteToPeriod,
        // which ensures correct period → playbackRate calculation in MOD mode.
        const noteIdx = periodToNoteIndex(ch.period);
        const xmNote = noteIdx > 0 ? noteIdx - 23 : 0;
        const note = (xmNote > 0 && xmNote <= 96) ? xmNote : 0;
        // Resolve samplePtr → instrument ID.  After a DMA loop reload the
        // samplePtr becomes the loop-start address; fall back to loopAliasMap
        // so looped notes still get the correct instrument instead of id=0.
        const rawPtr = ch.samplePtr;
        const resolvedPtr = (rawPtr > 0 && !sampleMap.has(rawPtr))
          ? (loopAliasMap.get(rawPtr) ?? rawPtr)
          : rawPtr;
        const instrId = resolvedPtr > 0 ? (sampleMap.get(resolvedPtr) ?? 0) : 0;
        const rawVol = Math.min(0x50, 0x10 + ch.volume);
        // Only write volume when it changes from the previous row — reduces pattern bloat
        const volume = rawVol !== prevVolPerChannel[chIdx] ? rawVol : 0;
        prevVolPerChannel[chIdx] = rawVol;

        // Use detected effects from enhanced scan
        const effTyp = (ch as UADEEnhancedScanRow)?.effTyp ?? 0;
        const eff = (ch as UADEEnhancedScanRow)?.eff ?? 0;

        return {
          note,
          period: ch.period > 0 ? ch.period : undefined,  // Raw Amiga period for pitch-correct MOD-mode playback
          instrument: instrId,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        } as TrackerCell;
      }),
    }));

    // Insert tempo change effects at pattern start if needed
    const tempoChanges = enhanced.tempoChanges || [];
    for (const tc of tempoChanges) {
      if (tc.row >= rowStart && tc.row < rowEnd) {
        const localRow = tc.row - rowStart;
        // Put tempo effect (Fxx) on channel 0 if no effect already present
        const cell = channels[0].rows[localRow];
        if (cell.effTyp === 0 && cell.eff === 0) {
          if (tc.bpm !== enhanced.bpm) {
            cell.effTyp = 0x0F; // Fxx — Set speed/BPM
            cell.eff = tc.bpm >= 32 ? tc.bpm : tc.speed;
          }
        }
      }
    }

    patterns.push({
      id: `pattern-${pat}`,
      name: pat === 0 ? 'Song' : `Pattern ${pat}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: 'MOD',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instruments.length,
      },
    });

    songPositions.push(pat);
  }

  return {
    name,
    format: 'MOD' as TrackerFormat, // Editable! TrackerReplayer handles playback
    patterns,
    instruments,
    songPositions,
    songLength: numPatterns,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: enhanced.speed || 6,
    initialBPM: enhanced.bpm || 125,
  };
}

/**
 * Build classic UADESynth-based TrackerSong (display-only patterns).
 */
function buildClassicSong(
  name: string,
  ext: string,
  filename: string,
  buffer: ArrayBuffer,
  metadata: UADEMetadata,
  scanRows: Array<Array<{ period: number; volume: number; samplePtr: number }>>,
  periodToNoteIndex: (period: number, finetune?: number) => number,
): TrackerSong {
  // Build instrument map from unique sample pointers
  const sampleMap = new Map<number, number>();
  let nextInstrId = 2; // 1 = UADESynth playback engine

  for (const row of scanRows) {
    for (const ch of row) {
      if (ch.samplePtr > 0 && !sampleMap.has(ch.samplePtr)) {
        sampleMap.set(ch.samplePtr, nextInstrId++);
      }
    }
  }

  // Create UADESynth instrument
  const uadeConfig: UADEConfig = {
    type: 'uade',
    filename,
    fileData: buffer,
    subsongCount: metadata.subsongCount,
    currentSubsong: 0,
    metadata: {
      player: metadata.player,
      formatName: metadata.formatName || guessFormatName(ext),
      minSubsong: metadata.minSubsong,
      maxSubsong: metadata.maxSubsong,
    },
  };

  const instruments: InstrumentConfig[] = [
    {
      id: 1,
      name: name || 'UADE Song',
      type: 'synth' as const,
      synthType: 'UADESynth' as const,
      effects: [],
      volume: -6,
      pan: 0,
      uade: uadeConfig,
    },
  ];

  // Create display instruments for each detected sample
  for (const [, instrId] of sampleMap) {
    instruments.push({
      id: instrId,
      name: `Sample ${String(instrId - 1).padStart(2, '0')}`,
      type: 'synth' as const,
      synthType: 'Sampler' as const,
      effects: [],
      volume: 0,
      pan: 0,
    });
  }

  // Build patterns from scan data (64 rows per pattern)
  const ROWS_PER_PATTERN = 64;
  const PAULA_CHANNEL_NAMES = ['Paula 1', 'Paula 2', 'Paula 3', 'Paula 4'];
  const totalRows = scanRows.length;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  for (let pat = 0; pat < numPatterns; pat++) {
    const rowStart = pat * ROWS_PER_PATTERN;
    const rowEnd = Math.min(rowStart + ROWS_PER_PATTERN, totalRows);

    const channels: ChannelData[] = PAULA_CHANNEL_NAMES.map((chName, chIdx) => ({
      id: `channel-${chIdx}`,
      name: chName,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      // Amiga hard stereo: channels 0,3 = left, channels 1,2 = right
      pan: (chIdx === 0 || chIdx === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, (_, rowIdx) => {
        const scanIdx = rowStart + rowIdx;
        if (scanIdx >= rowEnd || scanIdx >= scanRows.length) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }

        const ch = scanRows[scanIdx][chIdx];
        if (!ch || ch.period <= 0) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }

        const noteIdx = periodToNoteIndex(ch.period);
        // Convert internal note index to XM-compatible note number: C-1=36→13, C-2=48→25 (offset -23)
        const xmNote = noteIdx > 0 ? noteIdx - 23 : 0;
        const note = (xmNote > 0 && xmNote <= 96) ? xmNote : 0;
        const instrId = ch.samplePtr > 0 ? (sampleMap.get(ch.samplePtr) ?? 0) : 0;
        const volume = Math.min(0x50, 0x10 + ch.volume);

        return {
          note,
          instrument: instrId,
          volume,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        } as TrackerCell;
      }),
    }));

    patterns.push({
      id: `pattern-${pat}`,
      name: pat === 0 ? 'Song' : `Pattern ${pat}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: 'UADE',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instruments.length,
      },
    });

    songPositions.push(pat);
  }

  return {
    name,
    format: 'UADE' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: numPatterns,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
  };
}

/** Map common file extensions to human-readable format names */
function guessFormatName(ext: string): string {
  const names: Record<string, string> = {
    hip: 'Jochen Hippel',
    hip7: 'Jochen Hippel 7V',
    sog: 'Jochen Hippel Song',
    tfmx: 'TFMX',
    mdat: 'TFMX',
    tfx: 'TFMX',
    fc: 'Future Composer',
    sfc: 'Future Composer',
    fred: 'FRED Editor',
    sm: 'SidMon',
    sm2: 'SidMon 2',
    bd: 'Ben Daglish',
    bd5: 'Ben Daglish 5',
    bdm: 'Ben Daglish MOD',
    dw: 'David Whittaker',
    mc: 'Mark Cooksey',
    jp: 'Jason Page',
    rj: 'Richard Joseph',
    dm: 'Delta Music',
    dm2: 'Delta Music 2',
    sa: 'Sonic Arranger',
    abk: 'AMOS AMBank',
    aon: 'Art of Noise',
  };
  return names[ext] ?? `Amiga ${ext.toUpperCase()}`;
}
