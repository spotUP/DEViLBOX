/**
 * UADEParser.ts - Catch-all parser for exotic Amiga music formats
 *
 * Handles 130+ formats that cannot be natively parsed in TypeScript:
 * JochenHippel, TFMX, FredEditor, SidMon, Hippel-7V, and many more.
 *
 * Returns a playback-only TrackerSong with a single UADEConfig instrument.
 * The UADE WASM module (emulating Amiga 68000 + Paula) handles all audio output.
 *
 * Pattern editing is not supported for these opaque formats — they use
 * tightly-coupled Amiga machine code that cannot be decomposed into cells.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, UADEConfig } from '@/types/instrument';
import type { Pattern, ChannelData, TrackerCell } from '@/types';

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
 * Parse an exotic Amiga music file by running a fast UADE scan.
 * Loads the file into the UADE WASM engine, renders the entire song silently,
 * captures Paula channel state at row intervals, and builds full pattern data
 * with detected instruments.
 */
export async function parseUADEFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const { UADEEngine } = await import('@engine/uade/UADEEngine');
  const { periodToNoteIndex } = await import('@engine/effects/PeriodTables');

  const name = filename.replace(/\.[^/.]+$/, '');
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  // Initialize UADE engine and load + scan the file
  const engine = UADEEngine.getInstance();
  await engine.ready();
  const metadata = await engine.load(buffer, filename);
  const scanRows = metadata.scanData ?? [];

  // Build instrument map from unique sample pointers
  const sampleMap = new Map<number, number>(); // samplePtr → instrumentId
  let nextInstrId = 2; // 1 = UADESynth playback engine

  for (const row of scanRows) {
    for (const ch of row) {
      if (ch.samplePtr > 0 && !sampleMap.has(ch.samplePtr)) {
        sampleMap.set(ch.samplePtr, nextInstrId++);
      }
    }
  }

  // Create UADESynth instrument (holds file data for playback)
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
      pan: 0,
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

        // Convert Amiga period to XM note (1-96)
        const noteIdx = periodToNoteIndex(ch.period);
        const note = noteIdx >= 0 ? Math.min(96, Math.max(1, noteIdx + 1)) : 0;
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
