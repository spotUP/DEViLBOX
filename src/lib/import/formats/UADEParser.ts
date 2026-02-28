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
  // Formats with native parsers — also registering extension for UADE fallback
  'symmod',  // Symphonie Pro (SymphonieProParser)
  'dbm',     // DigiBooster Pro (DigiBoosterProParser)
  'ams',     // AMS / Velvet Studio (AMSParser) — also in libopenmpt, native takes priority
  'ftm',     // Face the Music (FaceTheMusicParser) — also in libopenmpt, native takes priority
  'gt2', 'gtk',   // Graoumf Tracker 2 (GraoumfTracker2Parser)
  'dsym',    // Digital Symphony (DigitalSymphonyParser)
  'cba',     // Chuck Biscuits Atari ST (ChuckBiscuitsParser)
  'act',     // Actionamics (ActionamicsParser)
  'fmt',     // FM Tracker (FMTrackerParser)
  'c67',     // CDFM Composer 670 (CDFM67Parser)
  '667',     // Composer 667 (Composer667Parser)
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
 * Try to read instrument names from Amiga chip RAM via the UADE memory accessor.
 *
 * After the enhanced scan the 68k CPU emulator memory still holds the loaded
 * (possibly decompressed) module.  For ProTracker-family MOD files, UADE's
 * eagleplayer depacks the data to chip RAM address 0x000000, so names are
 * readable even when the original file was packed and the raw buffer returned
 * null from tryExtractInstrumentNames().
 *
 * Detection: reads 4 bytes at chip RAM offset 0x438 (= 1080 decimal), which is
 * where all ProTracker-family formats store their 4-character channel/magic tag.
 * If the tag matches a known MOD-family identifier, reads up to 31 instrument
 * name slots (each 22 bytes) from offset 0x14 in parallel.
 *
 * Returns ordered name strings (may contain empty strings for blank slots),
 * or null if the chip RAM does not contain a recognised MOD-family module.
 */
async function tryReadChipRamNames(
  engine: { readStringFromMemory(addr: number, maxLen?: number): Promise<string> },
): Promise<string[] | null> {
  // Standard ProTracker-family magic identifiers at byte offset 1080 (0x438).
  // All share the same instrument table layout (31 entries × 30 bytes at offset 20).
  const MOD_MAGIC_TAGS = new Set([
    'M.K.', 'M!K!', 'M&K!',        // 4-channel ProTracker / Noisetracker variants
    'FLT4', 'FLT8',                 // StarTrekker 4/8 channel
    '4CHN', '6CHN', '8CHN',         // Generic channel-count markers
    '2CHN', '3CHN', '5CHN', '7CHN', '9CHN',
    '10CH', '11CH', '12CH', '13CH', '14CH', '15CH', '16CH',
    '18CH', '20CH', '22CH', '24CH', '26CH', '28CH', '30CH', '32CH',
  ]);

  try {
    // maxLen=5 → reads up to 4 non-null bytes (loop i=0..3) + null terminator
    const magic = await engine.readStringFromMemory(0x438, 5);
    if (!MOD_MAGIC_TAGS.has(magic)) return null;

    // ProTracker/Noisetracker MOD instrument table:
    //   Starts at byte 20 (0x14), 31 entries × 30 bytes each
    //   Name occupies bytes 0–21 of each 30-byte entry (22 chars, null-padded)
    const namePromises = Array.from({ length: 31 }, (_, i) =>
      engine.readStringFromMemory(0x14 + i * 30, 23), // maxLen=23 → reads up to 22 bytes
    );
    const rawNames = await Promise.all(namePromises);
    const names = rawNames.map(n => n.trim());

    if (!names.some(Boolean)) return null;
    console.log('[UADEParser] Phase 3b: read', names.filter(Boolean).length, 'instrument names from chip RAM (MOD magic:', magic, ')');
    return names;
  } catch {
    // readStringFromMemory not yet available (older WASM) or memory access failed
    return null;
  }
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

  // Phase 3a: Route to native parser when UADE detects a format with native support.
  // Native parsers deliver more accurate instrument names, effects, and pattern data
  // than the Paula-register heuristic scan can provide.
  //
  // Format name strings come from uade_wasm_get_format_name() at runtime.
  // NOTE: Verify exact strings by logging metadata.formatName with real test files
  // before adding new entries — UADE format names may differ from what's expected.
  if (mode === 'enhanced') {
    const fmt = metadata.formatName;
    type NativeRoute = () => Promise<TrackerSong | null>;
    const NATIVE_ROUTES: Record<string, NativeRoute> = {
      'ProTracker':         async () => { const { parseMODFile } = await import('./MODParser'); return parseMODFile(buffer, filename); },
      'Noisetracker':       async () => { const { parseMODFile } = await import('./MODParser'); return parseMODFile(buffer, filename); },
      'Soundtracker':       async () => { const { parseMODFile } = await import('./MODParser'); return parseMODFile(buffer, filename); },
      'Oktalyzer':          async () => { const { parseOktalyzerFile } = await import('./OktalyzerParser'); return parseOktalyzerFile(buffer, filename); },
      'MED':                async () => { const { parseMEDFile } = await import('./MEDParser'); return parseMEDFile(buffer, filename); },
      'SoundFX':            async () => { const { parseSoundFXFile } = await import('./SoundFXParser'); return parseSoundFXFile(buffer, filename); },
      'SoundMon':           async () => { const { parseSoundMonFile } = await import('./SoundMonParser'); return parseSoundMonFile(buffer, filename, 0); },
      'SoundMon2.0':        async () => { const { parseSoundMonFile } = await import('./SoundMonParser'); return parseSoundMonFile(buffer, filename, 0); },
      'SoundMon2.2':        async () => { const { parseSoundMonFile } = await import('./SoundMonParser'); return parseSoundMonFile(buffer, filename, 0); },
      'JamCracker':         async () => { const { parseJamCrackerFile } = await import('./JamCrackerParser'); return parseJamCrackerFile(buffer, filename); },
      'Quadra Composer':    async () => { const { parseQuadraComposerFile } = await import('./QuadraComposerParser'); return parseQuadraComposerFile(buffer, filename); },
      'FutureComposer1.3':  async () => { const { parseFCFile } = await import('./FCParser'); return parseFCFile(buffer, filename, 0); },
      'FutureComposer1.4':  async () => { const { parseFCFile } = await import('./FCParser'); return parseFCFile(buffer, filename, 0); },
      'FutureComposer-BSI': async () => { const { parseFCFile } = await import('./FCParser'); return parseFCFile(buffer, filename, 0); },
      'SIDMon1.0': async () => {
        const { parseSidMon1File } = await import('./SidMon1Parser');
        // SidMon 1 is a compiled Amiga binary; scan chip RAM for the SID-MON header
        // to find where UADE loaded it. Fallback to 0 if not found.
        let moduleBase = 0;
        try {
          const sidMonMagic = new TextEncoder().encode(' SID-MON BY R');
          moduleBase = await engine.scanMemoryForMagic(sidMonMagic);
          if (moduleBase < 0) moduleBase = 0;
        } catch { /* older WASM without scanMemoryForMagic, moduleBase stays 0 */ }
        return parseSidMon1File(buffer, filename, moduleBase);
      },
      'Fred': async () => {
        const { parseFredEditorFile } = await import('./FredEditorParser');
        // Fred is a compiled Amiga binary; try to locate it in chip RAM via a
        // common Fred header pattern — a BRA.W opcode (0x4EFA) near the start.
        let moduleBase = 0;
        try {
          const fredMagic = new Uint8Array([0x4E, 0xFA, 0x00]);
          const found = await engine.scanMemoryForMagic(fredMagic, 256 * 1024);
          if (found >= 0) moduleBase = found;
        } catch { /* older WASM without scanMemoryForMagic, moduleBase stays 0 */ }
        return parseFredEditorFile(buffer, filename, moduleBase);
      },
      'SIDMon2.0': async () => {
        const { parseSidMon2File } = await import('./SidMon2Parser');
        return parseSidMon2File(buffer, filename, 0);
      },
      'Mugician': async () => {
        const { parseDigitalMugicianFile } = await import('./DigitalMugicianParser');
        return parseDigitalMugicianFile(buffer, filename);
      },
      'MugicianII': async () => {
        const { parseDigitalMugicianFile } = await import('./DigitalMugicianParser');
        return parseDigitalMugicianFile(buffer, filename);
      },
      'Mugician II': async () => {
        const { parseDigitalMugicianFile } = await import('./DigitalMugicianParser');
        return parseDigitalMugicianFile(buffer, filename);
      },
      'DavidWhittaker': async () => {
        const { parseDavidWhittakerFile } = await import('./DavidWhittakerParser');
        // DavidWhittaker is a compiled Amiga binary; scan chip RAM for the
        // 0x47fa (lea x,a3) opcode to find where UADE loaded the module.
        // Fallback to 0 if scanMemoryForMagic is not available (older WASM).
        let moduleBase = 0;
        try {
          const dwMagic = new Uint8Array([0x47, 0xFA]);
          const found = await engine.scanMemoryForMagic(dwMagic, 256 * 1024);
          if (found >= 0) moduleBase = found;
        } catch { /* older WASM without scanMemoryForMagic, moduleBase stays 0 */ }
        return parseDavidWhittakerFile(buffer, filename, moduleBase);
      },
      'RobHubbard': async () => {
        const { parseRobHubbardFile } = await import('./RobHubbardParser');
        // Rob Hubbard is a compiled Amiga binary (relocatable). Scan chip RAM for
        // the distinctive 4-byte sequence at offset 28 of the module header:
        // 0x4E75 (RTS) + 0x41FA (LEA pc-relative) — highly specific to this player.
        // Fallback to 0 if scanMemoryForMagic is not available (older WASM).
        let moduleBase = 0;
        try {
          const rhMagic = new Uint8Array([0x4E, 0x75, 0x41, 0xFA]);
          const found = await engine.scanMemoryForMagic(rhMagic, 256 * 1024);
          if (found >= 0) moduleBase = found - 28; // magic is at offset 28 from module start
        } catch { /* older WASM without scanMemoryForMagic, moduleBase stays 0 */ }
        return parseRobHubbardFile(buffer, filename, moduleBase < 0 ? 0 : moduleBase);
      },
      'RobHubbard_ST': async () => {
        const { parseRobHubbardSTFile } = await import('./RobHubbardSTParser');
        // Rob Hubbard ST is a compiled Amiga binary. Scan chip RAM for the
        // first 4 bytes of the ST module header: 0x00407F40.
        // Fallback to 0 if scanMemoryForMagic is not available (older WASM).
        let moduleBase = 0;
        try {
          const rhstMagic = new Uint8Array([0x00, 0x40, 0x7F, 0x40]);
          const found = await engine.scanMemoryForMagic(rhstMagic, 256 * 1024);
          if (found >= 0) moduleBase = found;
        } catch { /* older WASM without scanMemoryForMagic, moduleBase stays 0 */ }
        return parseRobHubbardSTFile(buffer, filename, moduleBase);
      },
      // NOTE: UADE format name for Delta Music 1.0 is 'DeltaMusic' (from uade_wasm_get_format_name()).
      // DeltaMusic 1.0 loads at chip RAM address 0x000000, so no scanMemoryForMagic is needed.
      'DeltaMusic': async () => {
        const { parseDeltaMusic1File } = await import('./DeltaMusic1Parser');
        return parseDeltaMusic1File(buffer, filename);
      },
      // NOTE: UADE format name for Delta Music 2.0 is 'Delta Music 2' (from uade_wasm_get_format_name()).
      // DeltaMusic 2.0 loads at chip RAM address 0x000000, so no scanMemoryForMagic is needed.
      'Delta Music 2': async () => {
        const { parseDeltaMusic2File } = await import('./DeltaMusic2Parser');
        return parseDeltaMusic2File(buffer, filename);
      },
      'JochenHippel-CoSo': async () => {
        const { parseHippelCoSoFile } = await import('./HippelCoSoParser');
        // HippelCoSo is a compiled Amiga binary with a "COSO" magic at byte 0.
        // Scan chip RAM for those 4 bytes to find where UADE loaded the module.
        // Fallback to 0 if scanMemoryForMagic is not available (older WASM).
        let moduleBase = 0;
        try {
          const cosoMagic = new Uint8Array([0x43, 0x4F, 0x53, 0x4F]); // "COSO"
          const found = await engine.scanMemoryForMagic(cosoMagic);
          if (found >= 0) moduleBase = found;
        } catch { /* older WASM without scanMemoryForMagic, moduleBase stays 0 */ }
        return parseHippelCoSoFile(buffer, filename, moduleBase);
      },
      // NOTE: TFMX loads at chip RAM address 0 — no scanMemoryForMagic needed.
      // UADE may report the format as 'TFMX', 'TFMX-Pro', 'TFMX Pro', or 'TFMX 7-Voices'.
      // All variants use the same mdat file layout and are handled by parseTFMXFile.
      'TFMX': async () => {
        const { parseTFMXFile } = await import('./TFMXParser');
        return parseTFMXFile(buffer, filename);
      },
      'TFMX-Pro': async () => {
        const { parseTFMXFile } = await import('./TFMXParser');
        return parseTFMXFile(buffer, filename);
      },
      'TFMX Pro': async () => {
        const { parseTFMXFile } = await import('./TFMXParser');
        return parseTFMXFile(buffer, filename);
      },
      'TFMX 7-Voices': async () => {
        const { parseTFMXFile } = await import('./TFMXParser');
        return parseTFMXFile(buffer, filename);
      },
    };
    const route = NATIVE_ROUTES[fmt];
    if (route) {
      try {
        const nativeSong = await route();
        if (nativeSong) {
          console.log(`[UADEParser] '${fmt}' → native parser`);
          return nativeSong;
        }
      } catch (err) {
        console.warn(`[UADEParser] Native parser for '${fmt}' failed, falling back to UADE scan:`, err);
      }
    }
  }

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
  const SYNTHESIS_FORMATS = new Set<string>([
    // Digital Mugician variants are now handled by NATIVE_ROUTES (parseDigitalMugicianFile).
    // No synthesis-only formats remain that can't be natively parsed.
  ]);
  if (mode === 'enhanced' && SYNTHESIS_FORMATS.has(ext)) {
    console.warn(`[UADEParser] ${ext.toUpperCase()} uses synthesis waveforms; running per-channel isolated renders`);
    const classicSong = buildClassicSong(songName, ext, filename, buffer, metadata, activeScanRows, periodToNoteIndex);

    // Render each Paula channel in isolation so users get real waveforms for the
    // Sampler editor, even though these formats synthesize everything via 68k code.
    // Paula routing: Ch0→Left, Ch3→Left; Ch1→Right, Ch2→Right.
    const channelLabels = ['Ch0 (L)', 'Ch1 (R)', 'Ch2 (R)', 'Ch3 (L)'];
    const DURATION_MS = 2000;
    try {
      const renders = await Promise.allSettled([
        engine.isolateChannel(0, DURATION_MS),
        engine.isolateChannel(1, DURATION_MS),
        engine.isolateChannel(2, DURATION_MS),
        engine.isolateChannel(3, DURATION_MS),
      ]);

      let nextId = Math.max(...classicSong.instruments.map(i => i.id), 0) + 1;

      for (let ch = 0; ch < 4; ch++) {
        const result = renders[ch];
        if (result.status !== 'fulfilled') {
          console.warn(`[UADEParser] ${ext.toUpperCase()} channel ${ch} isolate render failed:`, (result as PromiseRejectedResult).reason);
          continue;
        }
        const { pcm: pcmBuf, sampleRate: sr, framesWritten } = result.value;
        if (!framesWritten) continue;

        // Convert Float32 [-1,1] → 8-bit signed Amiga PCM (stored as Uint8, sign bit intact)
        const f32 = new Float32Array(pcmBuf, 0, framesWritten);
        const pcm8 = new Uint8Array(framesWritten);
        for (let i = 0; i < framesWritten; i++) {
          const s8 = Math.round(Math.max(-1, Math.min(1, f32[i])) * 127);
          pcm8[i] = s8 < 0 ? s8 + 256 : s8;
        }

        classicSong.instruments.push(createSamplerInstrument(
          nextId++,
          `${ext.toUpperCase()} ${channelLabels[ch]}`,
          pcm8,
          64,  // full volume
          sr,
          0,   // no loop
          0,
        ));
      }
    } catch (err) {
      console.warn('[UADEParser] Isolated channel renders failed:', err);
    }

    return classicSong;
  }
  // Note: .fc files with FC13/FC14/SMOD magic are routed to parseFCFile via NATIVE_ROUTES above.
  // FC 2.0 (real PCM samples) does not carry those magic bytes and falls through to enhanced scan.

  // If enhanced scan data is available AND mode is 'enhanced', build editable song
  if (mode === 'enhanced' && activeEnhancedScan) {
    // Phase 3b: Try to read instrument names from Amiga chip RAM.
    // UADE's 68k CPU emulator memory still holds the loaded (possibly decompressed)
    // module, so names are readable even for packed variants where the file buffer
    // contains no readable name table.
    const chipRamNames = await tryReadChipRamNames(engine);

    const song = buildEnhancedSong(
      songName, ext, filename, buffer,
      { ...metadata, enhancedScan: activeEnhancedScan },
      activeScanRows, periodToNoteIndex,
      chipRamNames,
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
export function tryExtractInstrumentNames(buffer: ArrayBuffer, ext: string): string[] | null {
  if (buffer.byteLength < 64) return null;
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);

  /* ── Delitracker Custom (.cus, .cust, .custom) ───────────────────────── */
  // Delitracker Custom modules are compiled 68k Amiga executables bundling a
  // proprietary replayer with song data.  There is no static instrument name
  // table — only raw PCM pointers embedded in player code.  The files often
  // carry a "DELIRIUM" identifier string and Amiga OS version info, which can
  // fool the generic 22-byte scanner into returning false positives.
  if (ext === 'cus' || ext === 'cust' || ext === 'custom') return null;

  /* ── Richard Joseph Player (.rjp, .rj) ───────────────────────────────── */
  // The RJP format stores NO instrument names in the SNG file.
  // Sample descriptors are 32 bytes of pointers, loop offsets, and lengths —
  // no name field exists (confirmed by Richard Joseph Player_v2.asm: SampleInit
  // sets EPS_Adr, EPS_Length, EPS_Volume, EPS_Type, EPS_Flags, never EPS_Name).
  // Return null here to prevent the generic 22-byte scanner below from
  // misidentifying pointer data as ASCII name blocks.
  if (ext === 'rjp' || ext === 'rj') return null;

  /* ── Jason Page (.jpn, .jp, .jpnd) ───────────────────────────────────── */
  // Jason Page modules are compiled 68k executables.  There is no static
  // instrument name table — only PCM sample pointers embedded in player code.
  // Return null to prevent the generic scanner from misidentifying instruction
  // data as ASCII name blocks.
  if (ext === 'jpn' || ext === 'jp' || ext === 'jpnd') return null;

  /* ── Dave Lowe (.dl) ─────────────────────────────────────────────────── */
  // Dave Lowe modules are compiled 68k executables with no instrument name
  // table.  Return null so the generic scanner does not produce false positives.
  if (ext === 'dl') return null;

  /* ── Ben Daglish (.bd) ───────────────────────────────────────────────── */
  // Ben Daglish modules are compiled 68k executables with no instrument name
  // table.  Return null to prevent false positives from the generic scanner.
  if (ext === 'bd') return null;

  /* ── Wally Beben (.wb) ───────────────────────────────────────────────── */
  // Wally Beben modules are compiled 68k executables with no instrument name
  // table.  Return null to prevent false positives from the generic scanner.
  if (ext === 'wb') return null;

  /* ── Jason Brooke (.jb, .jcb, .jcbo) ────────────────────────────────── */
  // Jason Brooke modules are compiled 68k executables with no instrument name
  // table.  Return null to prevent false positives from the generic scanner.
  if (ext === 'jb' || ext === 'jcb' || ext === 'jcbo') return null;

  /* ── Jeroen Tel (.jt, .mon_old) ──────────────────────────────────────── */
  // Jeroen Tel modules are compiled 68k executables.  The instrument count is
  // extracted from a known binary offset but instrument names do not exist.
  // Return null to prevent the generic scanner from producing false positives.
  if (ext === 'jt' || ext === 'mon_old') return null;

  /* ── Mark Cooksey (.mc, .mcr, .mco) ─────────────────────────────────── */
  // Mark Cooksey modules are compiled 68k executables with no instrument name
  // table.  Return null to prevent false positives from the generic scanner.
  if (ext === 'mc' || ext === 'mcr' || ext === 'mco') return null;

  /* ── Dave Lowe New (.dln, .dl_deli) ─────────────────────────────────── */
  // Dave Lowe New modules use a binary packed data format.  There is no
  // instrument name table.  Return null to prevent the generic 22-byte scanner
  // from misidentifying packed offsets/lengths as ASCII name blocks.
  if (ext === 'dln' || ext === 'dl_deli') return null;

  /* ── David Whittaker (.dw, .dwold) ──────────────────────────────────── */
  // David Whittaker modules are compiled 68k executables with no instrument
  // name table.  Return null to prevent false positives from the generic scanner.
  if (ext === 'dw' || ext === 'dwold') return null;

  /* ── Jochen Hippel (.hip, .hip7) ─────────────────────────────────────── */
  // Jochen Hippel modules are compiled 68k executables with no instrument
  // name table.  Return null to prevent false positives from the generic scanner.
  if (ext === 'hip' || ext === 'hip7') return null;

  /* ── Rob Hubbard (.rh, .rho) ─────────────────────────────────────────── */
  // Rob Hubbard modules are compiled 68k executables with no instrument name
  // table.  Return null to prevent false positives from the generic scanner.
  if (ext === 'rh' || ext === 'rho') return null;

  /* ── Mark II (.mk2, .mkii, .mkiio) ──────────────────────────────────── */
  // Mark II modules are compiled 68k executables with no instrument name table.
  // Return null to prevent false positives from the generic scanner.
  if (ext === 'mk2' || ext === 'mkii' || ext === 'mkiio') return null;

  /* ── MaxTrax (.mxtx) ─────────────────────────────────────────────────── */
  // MaxTrax is a synthesis-only Amiga format with MXTX magic.  No PCM sample
  // name table exists — return null to prevent false positives.
  if (ext === 'mxtx') return null;

  /* ── Jochen Hippel CoSo / TFMX variants (.hipc, .soc, .sog, .s7g, .hst) */
  // These Jochen Hippel variants are compiled 68k executables (CoSo = "Code Sounds").
  // No instrument name table exists.
  if (ext === 'hipc' || ext === 'soc' || ext === 'sog' || ext === 's7g' || ext === 'hst') return null;

  /* ── Maniacs of Noise (.mon) ─────────────────────────────────────────── */
  // Maniacs of Noise modules are compiled 68k executables with no instrument
  // name table.  Return null to prevent false positives.
  if (ext === 'mon') return null;

  /* ── GlueMon (.glue, .gm) ────────────────────────────────────────────── */
  // GlueMon modules are packed Amiga executables with no instrument name table.
  if (ext === 'glue' || ext === 'gm') return null;

  /* ── Kim Christensen (.kim) ──────────────────────────────────────────── */
  // Kim Christensen modules are compiled 68k executables with no instrument
  // name table.
  if (ext === 'kim') return null;

  /* ── Kris Hatlelid (.kh) ─────────────────────────────────────────────── */
  // Kris Hatlelid modules are compiled 68k executables with no instrument name table.
  if (ext === 'kh') return null;

  /* ── FutureComposer (.fc, .fc13, .fc14, .sfc, .bfc, .bsi, .smod) ────── */
  // Future Composer formats use a wavetable synthesis approach.  The instrument
  // table contains waveform and envelope data, but no ASCII name fields.
  // Return null to prevent the generic scanner from misidentifying data as names.
  if (ext === 'fc' || ext === 'fc13' || ext === 'fc14' || ext === 'sfc' ||
      ext === 'bfc' || ext === 'bsi' || ext === 'smod' || ext === 'fc2' ||
      ext === 'fc3' || ext === 'fc4') return null;

  /* ── Fred Editor (.fred) ─────────────────────────────────────────────── */
  // Fred Editor is a synthesis-only format with no instrument name table.
  if (ext === 'fred') return null;

  /* ── SidMon (.sm, .sm2, .sm3, .sm4, .sid2) ──────────────────────────── */
  // SidMon formats are synthesis-only with no ASCII instrument name fields.
  if (ext === 'sm' || ext === 'sm2' || ext === 'sm3' || ext === 'sm4' || ext === 'sid2') return null;

  /* ── Digital Mugician (.dmu, .dmu2, .mug, .mug2) ────────────────────── */
  // Digital Mugician uses wavetable synthesis with no instrument name table.
  if (ext === 'dmu' || ext === 'dmu2' || ext === 'mug' || ext === 'mug2') return null;

  /* ── Laxity (.powt, .pt) ─────────────────────────────────────────────── */
  // Laxity modules are compiled 68k executables with no instrument name table.
  if (ext === 'powt' || ext === 'pt') return null;

  /* ── InStereo (.is, .is20) ───────────────────────────────────────────── */
  // InStereo modules use a binary format with no ASCII instrument name fields.
  if (ext === 'is' || ext === 'is20') return null;

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

  /* ── JamCracker (.jam, .jc) ──────────────────────────────────────────── */
  // Format spec: Reference Code/libxmp-master/docs/formats/JamCracker.txt
  // Header: "BeEp" magic + 2-byte sample count + N×40-byte sample entries.
  // Each entry: 31-byte name (null-terminated ASCII) + 1-byte flags + 4-byte size + 4-byte addr.
  if (ext === 'jam' || ext === 'jc') {
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic === 'BeEp' && bytes.length >= 6) {
      const sampleCount = view.getUint16(4, false);
      const ENTRY_STRIDE = 40;
      const ENTRY_START  = 6;   // first entry follows magic(4) + count(2)
      const NAME_LEN     = 31;
      const names: string[] = [];
      for (let i = 0; i < sampleCount; i++) {
        const base = ENTRY_START + i * ENTRY_STRIDE;
        if (base + NAME_LEN > bytes.length) break;
        let name = '';
        for (let j = 0; j < NAME_LEN; j++) {
          const c = bytes[base + j];
          if (c === 0) break;
          if (c < 0x20 || c > 0x7e) { name = ''; break; }
          name += String.fromCharCode(c);
        }
        const trimmed = name.trim();
        if (trimmed) names.push(trimmed);
      }
      if (names.length > 0) return names;
    }
  }

  /* ── TCB Tracker (.tcb) ───────────────────────────────────────────────── */
  // Format spec: Reference Code/libxmp-master/docs/formats/tcb-tracker.txt
  // Magic: "AN COOL." or "AN COOL!" at offset 0.
  // Instrument names: 16 × 8 bytes starting at offset 0x92, space-padded (no null terminator).
  if (ext === 'tcb') {
    if (bytes.length >= 0x92 + 16 * 8) {
      const magic6 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
      if (magic6 === 'AN COO') {
        const names: string[] = [];
        for (let i = 0; i < 16; i++) {
          const base = 0x92 + i * 8;
          let name = '';
          for (let j = 0; j < 8; j++) {
            const c = bytes[base + j];
            if (c === 0) break;
            if (c < 0x20 || c > 0x7e) { name = ''; break; }
            name += String.fromCharCode(c);
          }
          const trimmed = name.trim();
          if (trimmed) names.push(trimmed);
        }
        if (names.length > 0) return names;
      }
    }
  }

  /* ── Quadra Composer / EMOD (.emod, .qc) ─────────────────────────────── */
  // Format spec: Reference Code/libxmp-master/docs/formats/QuadraComposer.txt
  // IFF FORM-EMOD file. The EMIC chunk starts at offset 0x0C.
  // EMIC structure (offsets from start of EMIC data, after the 4-byte size field):
  //   +0    2 bytes  version
  //   +2   20 bytes  song name
  //   +22  20 bytes  composer
  //   +42   1 byte   tempo
  //   +43   1 byte   sample count (N)
  //   [N × 34-byte sample entries, starting at +44]
  //     +0   1 byte   sample number
  //     +1   1 byte   volume
  //     +2   2 bytes  sample length (words)
  //     +4  20 bytes  sample name  ← NAME HERE
  //     +24  1 byte   control (loop flag)
  //     +25  1 byte   finetune
  //     +26  2 bytes  repeat start (words)
  //     +28  2 bytes  repeat length (words)
  //     +30  4 bytes  sample offset (from file start)
  if (ext === 'emod' || ext === 'qc') {
    const FORM = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (FORM === 'FORM' && bytes.length >= 0x30) {
      const TYPE = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      const CHK  = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (TYPE === 'EMOD' && CHK === 'EMIC') {
        // EMIC chunk data starts at offset 20 (12 bytes FORM+size+type + 4 bytes EMIC tag + 4 bytes chunk size)
        const EMIC_DATA = 20;
        const sampleCount = bytes[EMIC_DATA + 43];
        const ENTRY_START = EMIC_DATA + 44;
        const ENTRY_SIZE  = 34;
        const NAME_OFF    = 4;
        const NAME_LEN    = 20;
        const names: string[] = [];
        for (let i = 0; i < sampleCount; i++) {
          const base = ENTRY_START + i * ENTRY_SIZE + NAME_OFF;
          if (base + NAME_LEN > bytes.length) break;
          const name = readFixedAscii(bytes, base, NAME_LEN);
          if (name) names.push(name);
        }
        if (names.length > 0) return names;
      }
    }
  }

  /* ── AMOS Music Bank (.abk) ───────────────────────────────────────────── */
  // Format spec: Reference Code/libxmp-master/docs/formats/AMOS_Music_Bank_format.txt
  // "AmBk" magic at offset 0. Main header starts at offset 0x14.
  // Main header[0..3] = offset to instruments section (from main header start).
  // Instruments section: 2-byte count + N × 32-byte entries.
  // Each entry: sample_off(4)+repeat_off(4)+loop_off(2)+loop_len(2)+volume(2)+len(2)+name(16)
  if (ext === 'abk') {
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic === 'AmBk' && bytes.length >= 0x20) {
      const MAIN_HDR    = 0x14;
      const instrRelOff = view.getUint32(MAIN_HDR + 0, false);
      const instrAbsOff = MAIN_HDR + instrRelOff;
      if (instrAbsOff + 2 > bytes.length) {
        // fall through to generic scanner
      } else {
        const instrCount = view.getUint16(instrAbsOff, false);
        const INSTR_DATA = instrAbsOff + 2;
        const STRIDE     = 32;
        const NAME_OFF   = 0x10;  // offset +16 within each 32-byte entry
        const NAME_LEN   = 16;
        const names: string[] = [];
        for (let i = 0; i < instrCount; i++) {
          const base = INSTR_DATA + i * STRIDE + NAME_OFF;
          if (base + NAME_LEN > bytes.length) break;
          const name = readFixedAscii(bytes, base, NAME_LEN);
          if (name) names.push(name);
        }
        if (names.length > 0) return names;
      }
    }
  }

  /* ── Oktalyzer (.okt, .okta) ─────────────────────────────────────────── */
  // Format: 8-byte "OKTASONG" magic followed by IFF-style chunks.
  // The SAMP chunk contains up to 36 sample headers, each 32 bytes:
  //   [0..19]  name (20 bytes, null-terminated)
  //   [20..23] length (u32BE)
  //   [24..25] loopStart (u16BE, ×2 for real offset)
  //   [26..27] loopLength (u16BE, ×2)
  //   [28..29] volume (u16BE, 0-64)
  //   [30..31] type (u16BE)
  // Reference: OpenMPT soundlib/Load_okt.cpp, struct OktSample
  if (ext === 'okt' || ext === 'okta') {
    if (bytes.length >= 16) {
      const magic = String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3],
                                         bytes[4],bytes[5],bytes[6],bytes[7]);
      if (magic === 'OKTASONG') {
        let pos = 8;
        while (pos + 8 <= bytes.length) {
          const tag = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
          const chunkSize = view.getUint32(pos + 4, false);
          pos += 8;
          if (tag === 'SAMP') {
            const count = Math.min(Math.floor(chunkSize / 32), 36);
            const names: string[] = [];
            for (let i = 0; i < count; i++) {
              const base = pos + i * 32;
              if (base + 20 > bytes.length) break;
              const name = readFixedAscii(bytes, base, 20);
              if (name) names.push(name);
            }
            if (names.length > 0) return names;
            break;
          }
          if (chunkSize === 0 || pos + chunkSize > bytes.length) break;
          pos += chunkSize;
        }
      }
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
  chipRamNames?: string[] | null,
): TrackerSong {
  const enhanced = metadata.enhancedScan!;

  // Prefer chip RAM names (accurate for packed/compressed formats where the file
  // buffer contains no readable name table) over file-buffer heuristic extraction.
  const extractedNames = chipRamNames ?? tryExtractInstrumentNames(buffer, ext);

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

    const instr = createSamplerInstrument(
      instrId,
      instrName,
      pcm,
      64, // Full volume
      sampleRate,
      sample.loopStart,
      loopEnd,
    );
    // Attach chip RAM address so SampleEditor can call write-back after edits.
    if (instr.sample) instr.sample.uadeSamplePtr = ptr;
    instruments.push(instr);
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
      rows: Array.from({ length: rowEnd - rowStart }, (_, rowIdx) => {
        const scanIdx = rowStart + rowIdx;
        if (scanIdx >= scanRows.length) {
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
      length: rowEnd - rowStart,
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
      rows: Array.from({ length: rowEnd - rowStart }, (_, rowIdx) => {
        const scanIdx = rowStart + rowIdx;
        if (scanIdx >= scanRows.length) {
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
      length: rowEnd - rowStart,
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
