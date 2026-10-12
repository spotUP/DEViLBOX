/**
 * DJRenderWorker — Offline audio renderer for DJ pre-rendering
 *
 * Hosts independent UADE + libopenmpt WASM instances, completely separate
 * from the playback audio thread. Renders tracker modules to stereo PCM
 * which is posted back as Float32Array transferables.
 *
 * Format routing:
 *   - C64 SID (PSID/RSID) → WebSID WASM engine (reSID, best accuracy)
 *   - AHX, HVL → HivelyTracker WASM engine
 *   - MOD + exotic Amiga formats → UADE engine
 *   - XM, IT, S3M + other PC formats → libopenmpt engine
 *
 * Protocol:
 *   Main → Worker:  { type: 'render', id, fileBuffer, filename, subsong? }
 *   Worker → Main:   { type: 'renderComplete', id, left, right, sampleRate, duration }
 *                  or { type: 'renderError', id, error }
 *   Worker → Main:   { type: 'renderProgress', id, progress }  (0-100)
 *   Main → Worker:  { type: 'init' }
 *   Worker → Main:   { type: 'ready' }
 */

import { encodeStemFlac } from '@/engine/dj/channelStemCodec';
import {
  ChannelScopeTrackBuilder, ChannelStemsBuilder, DECK_SCOPE_CHANNELS, DECK_STEM_CHANNELS, channelScopeTransferables,
  type ChannelScopeTrack,
} from '@/engine/dj/channelScopeTrack';
import { steadyPlayerCallHz, type PlayerCallSample } from '@/engine/dj/sidPlayerClock';
import { isSidFileBytes, type SidForcedPlayback } from '@/lib/sid/SIDHeaderParser';

// ── Types ────────────────────────────────────────────────────────────────────

/** A render: the stereo mix, and each channel's own signal where the engine has a per-channel tap. */
interface RenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  channelScopes?: ChannelScopeTrack;
  /** A SID's steady player call rate (sidPlayerClock.ts); undefined for every other format. */
  playerCallHz?: number;
}

interface RenderRequest {
  type: 'render';
  id: string;
  fileBuffer: ArrayBuffer;
  filename: string;
  subsong?: number;
  /** Max render duration in seconds (default: 600). Use shorter for analysis-only. */
  maxSeconds?: number;
  /** Render each channel's stem beside the mix (default true; the deck's channel mute needs them). */
  stems?: boolean;
  /**
   * Optional companion files to register in UADE's virtual filesystem BEFORE
   * loading the main module. Required for multi-file formats like TFMX
   * (mdat.<name> needs smpl.<name>) and other two-file players. Each entry
   * is passed to uade_wasm_add_extra_file() as-is.
   */
  companions?: Array<{ filename: string; buffer: ArrayBuffer }>;
  /** A SID: the chip model / clock SID Settings forces over the header (DJPipeline keys the cache on it). */
  sid?: SidForcedPlayback;
}

interface InitRequest {
  type: 'init';
}

interface RenderSidVoicesRequest {
  type: 'renderSidVoices';
  id: string;
  fileBuffer: ArrayBuffer;
  filename: string;
  subsong?: number;
}

type WorkerMessage = RenderRequest | InitRequest | RenderSidVoicesRequest;

// ── UADE extensions for format routing ───────────────────────────────────────
// Synced with UADE_EXTENSIONS in UADEParser.ts — the authoritative source.
// AHX is also here (UADE handles it); isHivelyFormat() takes priority for AHX/HVL.
const AMIGA_EXTENSIONS = new Set([
  // ProTracker MOD + variants handled better by UADE than libopenmpt
  'mod',
  // AProSys, ActionAmics, ADPCM, AM-Composer, AMOS, Anders Öland, ArtAndMagic
  'aam', 'abk', 'act', 'adpcm', 'adsc', 'agi', 'ahx', 'alp', 'amc',
  'ams', 'aon', 'aon4', 'aon8', 'aps', 'arp', 'ash', 'ast',
  // BenDaglish, BladePacker, Beathoven, Andrew Parton
  'bd', 'bds', 'bfc', 'bp', 'bp3', 'bsi', 'bss', 'bye',
  // Cinemaware, ChipTracker, CoreDesign, custom/CustomMade, Chuck Biscuits, CDFM
  'c67', 'cba', 'cin', 'cm', 'core', 'cus', 'cust', 'custom',
  // DariusZendeh, DaveLowe, DavidHanney, DavidWhittaker, DeltaMusic, Desire
  'dat', 'dh', 'digi', 'dl', 'dl_deli', 'dln', 'dlm1', 'dlm2',
  'dm', 'dm1', 'dm2', 'dmu', 'dmu2', 'dns', 'doda', 'dp',
  'dsc', 'dsr', 'dss', 'dsym', 'dum', 'dw', 'dwold', 'dz',
  // EarAche, EMS, FashionTracker, FutureComposer variants
  'ea', 'emod', 'ems', 'emsv6', 'ex',
  'fc', 'fc-bsi', 'fc13', 'fc14', 'fc2', 'fc3', 'fc4',
  // FMTracker, Fred, FredGray, FuturePlayer, ForgottenWorlds, FaceTheMusic
  'fmt', 'fp', 'fred', 'ftm', 'fw',
  // GlueMon, GMC, GraoumfTracker, EarAche
  'glue', 'gm', 'gmc', 'gt2', 'gtk', 'gv',
  // HowieDavies, JochenHippel (hip/hip7/hipc/hst/mcmd/sog/s7g)
  'hd', 'hip', 'hip7', 'hipc', 'hmc', 'hn', 'hot', 'hrt', 'hst',
  // ImagesMusicSystem, Infogrames, InStereo
  'iff', 'ims', 'in', 'is', 'is20',
  // JamCracker, JankoMrsicFlogel, JasonBrooke, JasonPage, JeroenTel, JesperOlsen
  'jam', 'jb', 'jc', 'jcb', 'jcbo', 'jd', 'jmf', 'jo', 'jp', 'jpn', 'jpnd',
  'jpo', 'jpold', 'js', 'jt',
  // Kim, KrisHatlelid, Laxity, LegglessMusicEditor
  'kh', 'kim', 'kris', 'lme',
  // ManiacsOfNoise (mon), Mark Cooksey, MarkII, MajorTom, MaxTrax, Maximum Effect
  'ma', 'max', 'mc', 'mcmd', 'mcmd_org', 'mco', 'mcr', 'md', 'mdat',
  'med', 'mfp', 'mg', 'mii', 'mk2', 'mkii', 'mkiio', 'ml',
  'mm4', 'mm8', 'mmdc', 'mms', 'mok', 'mon', 'mon_old', 'mosh',
  'mp', 'mp_id', 'mso', 'mtp2', 'mug', 'mug2', 'mus', 'mxtx',
  // Nick Pelling, NovoTrade, NTSP
  'npp', 'np', 'np1', 'np2', 'np3', 'ntp',
  // Octa-MED, OktaLyzer, onEscapee
  'octamed', 'okt', 'okta', 'one', 'osp',
  // PaulRobotham, PaulShields, PaulSummers, PaulTonge, PeterVerswyvelen
  'pap', 'pat', 'pha', 'pn', 'powt', 'prt', 'ps', 'psf', 'psa', 'pt', 'pt36',
  'ptm', 'puma', 'pvp',
  // QuadraComposer, Quartet
  'qc', 'qpa', 'qts',
  // RichardJoseph, RiffRaff, RobHubbard
  'rh', 'rho', 'riff', 'rj', 'rjp', 'rk', 'rkb',
  // SeanConnolly, SeanConran, SCUMM, SIDMon, Silmarils, SonicArranger
  's-c', 's7g', 'sa', 'sa-p', 'sa_old', 'sas', 'sb', 'sc', 'scn', 'scr',
  'sct', 'scumm', 'sdata', 'sdr', 'sfc',
  'sfx', 'sfx13', 'sfx20', 'sg', 'sid', 'sid1', 'sid2',
  'sjs', 'sm', 'sm1', 'sm2', 'sm3', 'smod', 'smp', 'smpro',
  'smus', 'smn', 'sndmon', 'sng', 'snk', 'snx', 'soc', 'sog', 'sonic',
  'spl', 'spm', 'sqt', 'ss', 'st', 'sun', 'sym', 'symmod', 'syn', 'synmod',
  // TCB, TFMX variants, ThomasHermann, TimFollin, TimeTracker, Titanics, etc.
  'tcb', 'tf', 'tfhd1.5', 'tfhd7v', 'tfhdpro', 'tfmx', 'tfmx1.5', 'tfmx7v',
  'tfmxpro', 'tfx', 'thm', 'thn', 'tiny', 'tits', 'tme', 'tmk',
  'tpu', 'trc', 'tro', 'tronic', 'tsm', 'tw', 'two',
  // UFO, BladePacker, VoodooSupreme, WallyBeben, YM, ZoundMonitor
  'uds', 'ufo', 'vss', 'wb', 'ym', 'ymst', 'zen',
  // DigiBooster Pro, Protracker4
  'dbm', 'mod3',
  // PTK-Prowiz packed formats
  'mod_doc', 'mod15', 'mod15_mst', 'mod15_st-iv', 'mod15_ust',
  'mod_ntk', 'mod_ntk1', 'mod_ntk2', 'mod_ntkamp', 'mod_flt4', 'mod_comp',
  'mod_adsc4',
  // Prowiz packed module variants
  '4v', 'ac1', 'ac1d', 'aval', 'chan', 'cp', 'cplx', 'crb', 'di', 'eu',
  'fc-m', 'fcm', 'ft', 'fuz', 'fuzz',
  'ice', 'it1', 'kef', 'kef7', 'krs', 'ksm', 'lax',
  'mexxmp', 'mpro', 'nr', 'nru', 'ntpk',
  'p10', 'p21', 'p30', 'p40a', 'p40b', 'p41a', 'p4x', 'p50a', 'p5a', 'p5x',
  'p60', 'p60a', 'p61', 'p61a', 'p6x', 'pin',
  'pm', 'pm0', 'pm01', 'pm1', 'pm10c', 'pm18a', 'pm2', 'pm20', 'pm4', 'pm40', 'pmz',
  'polk', 'pp10', 'pp20', 'pp21', 'pp30', 'ppk',
  'pr1', 'pr2', 'prom', 'pru', 'pru1', 'pru2', 'prun', 'prun1', 'prun2', 'pwr',
  'pyg', 'pygm', 'pygmy', 'skt', 'skyt', 'snt',
  'st2', 'st26', 'st30', 'star', 'stpk',
  'tp', 'tp1', 'tp2', 'tp3', 'un2', 'unic', 'unic2', 'wn', 'xan', 'xann',
]);

/** HivelyTracker formats — these have a dedicated WASM replayer, don't route to UADE */
const HIVELY_EXTENSIONS = new Set(['ahx', 'hvl']);

/** AdLib/OPL formats — AdPlug engine (covers ~30 sub-formats) */
const ADLIB_EXTENSIONS = new Set([
  'a2m', 'adl', 'amd', 'bam', 'cff', 'cmf', 'd00', 'dfm', 'dmo', 'dro', 
  'dtm', 'hsc', 'hsp', 'ksm', 'laa', 'lds', 'mkj', 'rad', 'raw', 'rol', 
  'sat', 'sci', 'sng',
]);

/** Console/Arcade music formats */
const CONSOLE_EXTENSIONS = new Set([
  // Nintendo
  'nsf', 'nsfe',        // NES
  'spc',                // SNES
  'gbs',                // Game Boy
  'gsf', 'minigsf',     // Game Boy Advance
  // Sega
  'vgm', 'vgz',         // Multi-platform video game music
  'gym',                // Genesis YM2612
]);

/** Atari/Retro Platform formats */
const RETRO_EXTENSIONS = new Set([
  'sc68', 'snd', 'sndh',  // Atari ST (SC68)
  'ay', 'psg',            // ZX Spectrum/Amstrad (AY-3-8910)
  'pt3',                  // Vortex Tracker (Spectrum)
  'kss',                  // MSX audio
  'mgs', 'bgm',           // MSX MuSICA
  'mdx',                  // Sharp X68000
  'pdx',                  // X68000 PCM (companion)
  'm', 'm2', 'mz',        // PC-98 PMD
  'sap', 'tm8',           // Atari 8-bit
  'rmt',                  // Atari RMT
  'prg',                  // Commodore Plus/4
  'mm',                   // SAM Coupé
]);

/** Modern synthesizer formats */
const SYNTH_EXTENSIONS = new Set([
  'sunvox',               // SunVox modular synth
  'v2m',                  // Farbrausch V2
  'wsm',                  // WaveSabre
  '4k',                   // 4klang
  'ftm', '0cc', 'dnm',    // FamiTracker
  'dmf',                  // DefleMask
  'fur',                  // Furnace
  'ct',                   // CheeseCutter
  'kt',                   // Klystrack
  'fmp',                  // FMPlayer
]);

/** Amiga formats that use prefix-based naming (e.g. cust.songname, mdat.songname).
 *  Must match UADE_ONLY_PREFIXES in UADEPrefixParsers.ts + TFMX/BP/Custom variants. */
const AMIGA_PREFIXES = new Set([
  // CustomMade / Delitracker Custom
  'cus', 'cust', 'custom',
  // TFMX and variants
  'mdat', 'smpl', 'tfhd1.5', 'tfhd7v', 'tfhdpro', 'tfmx1.5', 'tfmx7v', 'tfmxpro',
  // SoundMon / BPSoundMon
  'bp', 'smod',
  // DaveLowe
  'dl', 'dlw',
  // FutureComposer-BSI
  'bfc', 'bsi', 'fc-bsi',
  // ArtAndMagic, AMOS, Sierra-AGI
  'aam', 'abk', 'agi',
  // AshleyHogg, ActionAmics, BeathovenSynth
  'ah', 'ast', 'bss', 'bvs',
  // ChipTracker, CoreDesign
  'chip', 'cba', 'cd',
  // DynamicSynth, DariusZendeh
  'dns', 'dz', 'mkiio',
  // EarAche, EMS
  'ea', 'ems', 'emsv6',
  // ForgottenWorlds, FredMon, FuturePlayer2
  'fw', 'fredmon', 'fp2',
  // HowieDavies, MajorTom
  'hd', 'hn', 'thn', 'mtp2', 'arp',
  // JochenHippel
  'hip', 'mcmd', 'sog',
  // MarkII, MusiclineEditor
  'mk2', 'mkii', 'ml',
  // MaxTrax, Silmarils
  'mxt', 'mxtx', 'mok', 'sil',
  // NoiseTracker, NTSP, PaulSummers, Pokeynoise
  'nt', 'ntsp', 'psum', 'pn',
  // RiffRaff, SeanConnolly, RobHubbardST, RonKlaren
  'riff', 's-c', 'scn', 'sc2', 'rhst', 'rho', 'rkl',
  // SonicArranger variants
  'sa-p', 'lion', 'sa_old', 'sas',
  // SCUMM, SynthDream, SoundProgramming, SoundImages
  'scumm', 'sdr', 'spl', 'tw',
  // SUN-Tronic, SynTracker, StoneTracker
  'sun', 'synmod', 'st',
  // TimFollin, AHX-thx, TomyTracker, VoodooSupreme
  'tf', 'thx', 'tomy', 'vss',
]);

/** Detect C64 SID files by PSID/RSID magic bytes at offset 0.
 *  .sid extension is ambiguous: could be SIDMon (Amiga) or C64 PSID/RSID.
 *  C64 SID files have 'PSID' or 'RSID' at bytes 0-3. */
function isC64SID(fileBuffer: ArrayBuffer): boolean {
  return isSidFileBytes(fileBuffer);
}

/** Check if a filename should use UADE (Amiga formats) vs libopenmpt (PC formats) */
function isAmigaFormat(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  if (HIVELY_EXTENSIONS.has(ext)) return false; // handled by Hively renderer
  if (AMIGA_EXTENSIONS.has(ext)) return true;
  // Check prefix-based formats (cust.songname, mdat.songname, etc.)
  const prefix = lower.split('.')[0];
  return AMIGA_PREFIXES.has(prefix);
}

/** Check if a filename should use the HivelyTracker WASM renderer */
function isHivelyFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return HIVELY_EXTENSIONS.has(ext);
}

/** Check if a filename should use the AdPlug WASM renderer (AdLib/OPL) */
function isAdLibFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ADLIB_EXTENSIONS.has(ext);
}

/** Check if a filename should use a console/arcade game music renderer */
function isConsoleFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return CONSOLE_EXTENSIONS.has(ext);
}

/** Check if a filename should use a retro platform renderer */
function isRetroFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return RETRO_EXTENSIONS.has(ext);
}

/** Check if a filename should use a modern synthesizer renderer */
function isSynthFormat(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return SYNTH_EXTENSIONS.has(ext);
}

// ── UADE Engine State ────────────────────────────────────────────────────────

let uadeWasm: WebAssembly.Module | null = null;
let uadeWasmBinary: ArrayBuffer | null = null;
let uadeJsCode: string | null = null;
let uadeReady = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let uadeInstance: any = null;

async function initUADE(forceReinit = false): Promise<void> {
  if (uadeReady && !forceReinit) return;

  const baseUrl = self.location.origin;
  
  // Cache the WASM binary and JS code, but always create a fresh instance
  if (!uadeWasmBinary || !uadeJsCode) {
    const [wasmResponse, jsResponse] = await Promise.all([
      fetch(`${baseUrl}/uade/UADE.wasm`),
      fetch(`${baseUrl}/uade/UADE.js`),
    ]);

    uadeWasmBinary = await wasmResponse.arrayBuffer();
    let jsCode = await jsResponse.text();

    // Transform Emscripten glue for worker scope (same pattern as UADEEngine.ts)
    jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/uade/UADE.js"`);
    jsCode = jsCode.replace(/export\s+default\s+/g, 'var createUADE = ');
    jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, '');

    // Fix environment detection and mock document for worker scope
    jsCode = jsCode.replace(/ENVIRONMENT_IS_WEB\s*=\s*!0/g, 'ENVIRONMENT_IS_WEB=false');
    jsCode = jsCode.replace(/ENVIRONMENT_IS_WORKER\s*=\s*!1/g, 'ENVIRONMENT_IS_WORKER=true');
    jsCode = 'var document = { currentScript: { src: "' + baseUrl + '/uade/UADE.js" }, title: "" };\n' + jsCode;
    
    uadeJsCode = jsCode;
  }

  // Execute the glue code to get factory function - always fresh execution
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factory = new Function(uadeJsCode + '\n;return typeof createUADE !== "undefined" ? createUADE : Module;')();

  // Instantiate UADE WASM with a COPY of the binary (ensures fresh memory)
  uadeInstance = await factory({
    wasmBinary: uadeWasmBinary.slice(0), // Clone to ensure fresh instantiation
    print: (msg: string) => console.log('[DJRenderWorker/UADE]', msg),
    printErr: (msg: string) => console.warn('[DJRenderWorker/UADE]', msg),
  });

  // Initialize UADE engine (CRITICAL: Loading fails if this isn't called)
  const initRet = uadeInstance._uade_wasm_init(44100);
  if (initRet !== 0) {
    throw new Error(`uade_wasm_init failed with code ${initRet}`);
  }

  // Store compiled module for reference
  if (!uadeWasm) {
    uadeWasm = await WebAssembly.compile(uadeWasmBinary);
  }
  uadeReady = true;
  console.log('[DJRenderWorker] UADE engine initialized');
}

/**
 * Write a companion file into UADE's virtual filesystem.
 * Must be called AFTER initUADE and BEFORE _uade_wasm_load.
 * Pattern mirrors the server-side renderer (server/src/routes/render.ts) and
 * the main-thread worklet's _addCompanionFile.
 */
function addUADECompanion(wasm: any, filename: string, buffer: ArrayBuffer): void {
  const data = new Uint8Array(buffer);
  const dataPtr = wasm._malloc(data.byteLength);
  if (!dataPtr) {
    console.warn(`[DJRenderWorker/UADE] malloc failed for companion: ${filename}`);
    return;
  }
  wasm.HEAPU8.set(data, dataPtr);

  const nameLen = filename.length * 3 + 1;
  const namePtr = wasm._malloc(nameLen);
  if (!namePtr) {
    wasm._free(dataPtr);
    console.warn(`[DJRenderWorker/UADE] malloc failed for companion name: ${filename}`);
    return;
  }
  wasm.stringToUTF8(filename, namePtr, nameLen);

  const ret = wasm._uade_wasm_add_extra_file(namePtr, dataPtr, data.byteLength);
  wasm._free(dataPtr);
  wasm._free(namePtr);

  if (ret === 0) {
    console.log(`[DJRenderWorker/UADE] Companion registered: ${filename} (${data.byteLength} bytes)`);
  } else {
    console.warn(`[DJRenderWorker/UADE] Failed to register companion: ${filename} (ret=${ret})`);
  }
}

async function renderWithUADE(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  id: string,
  companions?: Array<{ filename: string; buffer: ArrayBuffer }>,
  maxSeconds = 600,
  withStems = true,
): Promise<RenderResult> {
  const t0 = Date.now();
  const loaded = await loadUADE(fileBuffer, filename, companions);
  const result = await renderWithUADEContinue(loaded.wasm, loaded.safeFilename, subsong, id, maxSeconds);
  const track = result.channelScopes;
  if (!withStems || !track) return result;

  // Each Paula channel's stem: a solo pass per channel on a fresh instance
  // (one UADE instance cannot render twice), muted with the emulator's own
  // mask - applied before the A500 filter, so the stem is the channel as the
  // mix carries it. A channel the scope tap never heard is not rendered.
  const t1 = Date.now();
  const frames = result.left.length;
  const stems: Int16Array[] = [];
  for (let ch = 0; ch < 4; ch++) {
    if (!(track.scales[ch] > 0)) { stems.push(new Int16Array(0)); continue; }
    const solo = await loadUADE(fileBuffer, filename, companions);
    stems.push(await renderUADESoloPass(solo.wasm, subsong, 1 << ch, frames));
  }
  track.stems = stems;
  console.log(`[DJRenderWorker/UADE] stems: mix pass ${t1 - t0} ms, 4 solo passes ${Date.now() - t1} ms`);
  return result;
}

/** A fresh UADE instance with `fileBuffer` loaded (companions registered first). */
async function loadUADE(
  fileBuffer: ArrayBuffer,
  filename: string,
  companions?: Array<{ filename: string; buffer: ArrayBuffer }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ wasm: any; safeFilename: string }> {
  // Force fresh UADE instance for each render — the IPC state machine
  // gets corrupted after a render cycle and cannot be reused.
  uadeReady = false;
  uadeInstance = null;
  await initUADE(true); // Force complete reinitialization
  const wasm = uadeInstance;

  // Filename sanitization for 68k eagleplayers.
  //
  // Many eagleplayers have 32-char filename limits and break on SPACES or
  // path chars. But DOTS, HYPHENS, and UNDERSCORES are first-class in the
  // eagleplayer ecosystem — formats like `smod.loader.tune` use the `smod.`
  // prefix as the format signal, and stripping those dots kills prefix
  // detection. Previous pass used `[^a-zA-Z0-9]` which mangled `smod.x.y`
  // into `smod_x_y` (misidentified by UADE, caused "Expected score name"
  // exits at init).
  //
  // New rule: preserve `A-Z a-z 0-9 . - _`, replace everything else with `_`.
  // Keep the 20-char cap on the name portion to stay under the 32-char
  // player-filename limit with room for the extension.
  const baseName = filename.split(/[\\/]/).pop() || filename;
  const dotIdx = baseName.lastIndexOf('.');
  const ext = dotIdx !== -1 ? baseName.slice(dotIdx + 1).toLowerCase() : 'mod';
  const nameOnly = dotIdx !== -1 ? baseName.slice(0, dotIdx) : baseName;
  const safeName = nameOnly.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 20);
  // Some UADE eagleplayers identify their modules by filename PREFIX, not
  // extension. Files from Modland's Fred Editor directory arrive as
  // "<name>.fred" (extension) but UADE's Fred eagleplayer only triggers on
  // "fred.<name>" (prefix) — without this swap UADE bails with
  // "module check failed" / "Expected score name" before playback.
  const EXT_TO_PREFIX: Record<string, string> = {
    fred: 'fred',
  };
  const safeFilename = EXT_TO_PREFIX[ext]
    ? `${EXT_TO_PREFIX[ext]}.${safeName}`
    : `${safeName}.${ext}`;
  
  console.log(`[DJRenderWorker/UADE] Rendering ${filename} as ${safeFilename} (${fileBuffer.byteLength} bytes)${companions?.length ? ` with ${companions.length} companion(s)` : ''}`);

  // No stabilization delay needed when reiniting fresh each time

  // Register companion files BEFORE loading (TFMX mdat needs smpl, etc.)
  //
  // Do NOT sanitize the companion filename. UADE's eagleplayer requests the
  // smpl companion using the SAME base name as the mdat it's currently
  // playing. The main module's `safeName` regex only touches `nameOnly`
  // (the segment before the first dot) — for TFMX that's just the "mdat"
  // prefix, so the rest ("turrican 2 loading") is preserved verbatim.
  // If we sanitize the companion here ("smpl.turrican 2 loading" →
  // "smpl.turrican_2_loading"), UADE's request for "smpl.turrican 2 loading"
  // misses the virtual FS and playback fails with score-died / ret=-1.
  // Mirrors the main-thread worklet (public/uade/UADE.worklet.js) and the
  // server-side renderer, both of which store companions unchanged.
  const safeCompanions = companions ?? [];
  for (const cf of safeCompanions) {
    addUADECompanion(wasm, cf.filename, cf.buffer);
  }

  // Load the file into UADE WASM memory
  const fileSize = fileBuffer.byteLength;
  const filePtr = wasm._malloc(fileSize);
  const fileBytes = new Uint8Array(fileBuffer);
  wasm.HEAPU8.set(fileBytes, filePtr);

  // Create a filename in WASM memory
  const fnameLen = safeFilename.length * 3 + 1;
  const fnamePtr = wasm._malloc(fnameLen);
  wasm.stringToUTF8(safeFilename, fnamePtr, fnameLen);

  // Load the module (don't call stop() before load, it can confuse some players)
  let loadResult = wasm._uade_wasm_load(filePtr, fileSize, fnamePtr);

  if (loadResult !== 0) {
    console.warn(`[DJRenderWorker/UADE] First load failed (${loadResult}), force reinit and retry...`);
    // Force complete reinitialization - IPC buffers are corrupted
    wasm._free(filePtr);
    wasm._free(fnamePtr);
    uadeReady = false;
    uadeInstance = null;
    await initUADE(true);
    const wasm2 = uadeInstance;

    // Re-register companions on the fresh UADE instance — reinit wipes the
    // virtual FS, so a TFMX mdat retry would otherwise lose its smpl.
    for (const cf of safeCompanions) {
      addUADECompanion(wasm2, cf.filename, cf.buffer);
    }

    // Reallocate and retry
    const filePtr2 = wasm2._malloc(fileSize);
    wasm2.HEAPU8.set(fileBytes, filePtr2);
    const fnamePtr2 = wasm2._malloc(fnameLen);
    wasm2.stringToUTF8(safeFilename, fnamePtr2, fnameLen);

    loadResult = wasm2._uade_wasm_load(filePtr2, fileSize, fnamePtr2);
    wasm2._free(filePtr2);
    wasm2._free(fnamePtr2);

    if (loadResult !== 0) {
      throw new Error(`UADE failed to load ${safeFilename} (error: ${loadResult})`);
    }

    // Continue with the new wasm instance
    return { wasm: wasm2, safeFilename };
  }

  wasm._free(filePtr);
  wasm._free(fnamePtr);

  return { wasm, safeFilename };
}

/**
 * One channel's stem: render `frames` frames with only the channels of
 * `activeMask` sounding, set up exactly like the mix pass.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderUADESoloPass(wasm: any, subsong: number, activeMask: number, frames: number): Promise<Int16Array> {
  if (subsong > 0) wasm._uade_wasm_set_subsong(subsong);
  wasm._uade_wasm_set_looping(0);
  await new Promise(resolve => setTimeout(resolve, 350)); // the mix pass's eagleplayer settle
  wasm._uade_wasm_mute_channels(activeMask);
  const CHUNK = 4096;
  const tmpL = wasm._malloc(CHUNK * 4);
  const tmpR = wasm._malloc(CHUNK * 4);
  const stem = new ChannelStemsBuilder(1);
  let done = 0;
  while (done < frames) {
    const ret = wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
    if (ret <= 0) break;
    const heap = wasm.HEAPF32 as Float32Array;
    const l = tmpL >> 2;
    const r = tmpR >> 2;
    const n = Math.min(CHUNK, frames - done);
    stem.push(n, (_c, i) => heap[l + i], (_c, i) => heap[r + i]);
    done += n;
  }
  wasm._free(tmpL);
  wasm._free(tmpR);
  return stem.finish(frames)[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderWithUADEContinue(
  wasm: any,
  safeFilename: string,
  subsong: number,
  id: string,
  maxSeconds = 600,
): Promise<RenderResult> {
  // Set subsong if specified
  if (subsong > 0) {
    wasm._uade_wasm_set_subsong(subsong);
  }

  // Disable looping for offline render (this is correct behavior)
  // Some MODs have early loop points, but they should still render their full arrangement first
  // We'll rely on the silence detector to stop at the natural end
  wasm._uade_wasm_set_looping(0);

  // Give eagleplayer time to fully initialize after load + config changes
  await new Promise(resolve => setTimeout(resolve, 350));

  postProgress(id, 10);

  // Render loop
  const sampleRate = 44100;
  const CHUNK = 4096;
  const maxFrames = sampleRate * maxSeconds;

  const tmpL = wasm._malloc(CHUNK * 4);
  const tmpR = wasm._malloc(CHUNK * 4);

  // Paula's 4 channels, from the emulator's per-channel FIFO (the tap the
  // tracker scopes stream from, UADE.worklet.js). The FIFO is consumed at the
  // pace of the main output, so its samples line up with the mix; drain what
  // the load left in it first. The FIFO holds at most 8192 frames.
  const CH_FIFO = 8192;
  const hasChannelTap = typeof wasm._uade_wasm_read_channel_samples === 'function';
  const chPtrs: number[] = hasChannelTap ? [0, 1, 2, 3].map(() => wasm._malloc(CH_FIFO * 4)) : [];
  const scopes = hasChannelTap ? new ChannelScopeTrackBuilder(4, sampleRate) : null;
  const readChannels = (max: number): number =>
    wasm._uade_wasm_read_channel_samples(chPtrs[0], chPtrs[1], chPtrs[2], chPtrs[3], max);
  if (hasChannelTap) readChannels(CH_FIFO);

  const audioChunks: { left: Float32Array; right: Float32Array }[] = [];
  let totalFrames = 0;
  let trailingSilenceFrames = 0;
  const SILENCE_THRESHOLD = 0.0001;
  const MAX_SILENCE_SECONDS = 4;  // Allow more silence before stopping (MODs can have gaps)
  const MIN_RENDER_SECONDS = 1; // Minimum render time before considering silence

  while (totalFrames < maxFrames) {
    // uade_wasm_render returns: 1 = success (buffer filled), 0 = song ended, -1 = error
    // It does NOT return the number of frames! The buffer is always filled with CHUNK frames on success.
    const ret = wasm._uade_wasm_render(tmpL, tmpR, CHUNK);
    
    if (ret === 0) {
      // Song ended naturally
      console.log(`[DJRenderWorker/UADE] Song ended at ${totalFrames} frames (${(totalFrames/sampleRate).toFixed(1)}s)`);
      break;
    }
    
    if (ret < 0) {
      console.warn(`[DJRenderWorker/UADE] Render error (ret=${ret}) at ${totalFrames} frames`);
      break;
    }

    if (totalFrames === 0) {
      console.log(`[DJRenderWorker/UADE] First audio chunk received (${CHUNK} frames)`);
    }

    // Copy CHUNK frames from WASM heap (ret=1 means success, buffer has CHUNK frames)
    const leftData = new Float32Array(CHUNK);
    const rightData = new Float32Array(CHUNK);
    const heapL = new Float32Array(wasm.HEAPF32.buffer, tmpL, CHUNK);
    const heapR = new Float32Array(wasm.HEAPF32.buffer, tmpR, CHUNK);
    leftData.set(heapL);
    rightData.set(heapR);

    // Check for trailing silence to detect natural song end
    let isSilent = true;
    for (let i = 0; i < CHUNK; i++) {
      if (Math.abs(leftData[i]) > SILENCE_THRESHOLD || Math.abs(rightData[i]) > SILENCE_THRESHOLD) {
        isSilent = false;
        break;
      }
    }

    if (isSilent && totalFrames > 0) {
      trailingSilenceFrames += CHUNK;
      if (totalFrames > sampleRate * MIN_RENDER_SECONDS && 
          trailingSilenceFrames > sampleRate * MAX_SILENCE_SECONDS) {
        console.log(`[DJRenderWorker/UADE] Stopping render due to ${MAX_SILENCE_SECONDS}s trailing silence at ${(totalFrames/sampleRate).toFixed(2)}s`);
        break;
      }
    } else {
      trailingSilenceFrames = 0;
    }

    if (scopes) {
      const n = readChannels(CHUNK);
      const heap = wasm.HEAPF32 as Float32Array;
      const bases = chPtrs.map((p) => p >> 2);
      scopes.push(n, (ch, i) => heap[bases[ch] + i]);
    }

    audioChunks.push({ left: leftData, right: rightData });
    totalFrames += CHUNK;

    // Progress: 10-80% during render
    if (totalFrames % (sampleRate * 5) < CHUNK) {
      const pct = Math.min(80, 10 + (totalFrames / maxFrames) * 70);
      postProgress(id, pct);
    }
  }

  wasm._free(tmpL);
  wasm._free(tmpR);
  for (const p of chPtrs) wasm._free(p);

  if (totalFrames === 0) {
    throw new Error(`UADE rendered 0 frames for ${safeFilename}`);
  }

  // Concatenate chunks
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of audioChunks) {
    left.set(chunk.left, offset);
    right.set(chunk.right, offset);
    offset += chunk.left.length;
  }

  postProgress(id, 85);

  // Debug: check audio quality
  let nonZero = 0;
  let maxAmp = 0;
  for (let i = 0; i < Math.min(left.length, 44100); i++) {
    const amp = Math.abs(left[i]) + Math.abs(right[i]);
    if (amp > 0.0001) nonZero++;
    if (amp > maxAmp) maxAmp = amp;
  }
  console.log(`[DJRenderWorker/UADE] ${safeFilename} rendered: ${totalFrames} frames (${(totalFrames/sampleRate).toFixed(1)}s), nonZero: ${nonZero}/${Math.min(totalFrames, 44100)}, maxAmp: ${maxAmp.toFixed(4)}`);

  return { left, right, sampleRate, channelScopes: scopes?.finish() };
}

// ── Hively Engine State ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hivelyInstance: any = null;
let hivelyReady = false;

async function initHively(): Promise<void> {
  if (hivelyReady) return;

  const baseUrl = self.location.origin;
  const [wasmResponse, jsResponse] = await Promise.all([
    fetch(`${baseUrl}/hively/Hively.wasm`),
    fetch(`${baseUrl}/hively/Hively.js`),
  ]);

  const wasmBinary = await wasmResponse.arrayBuffer();
  let jsCode = await jsResponse.text();

  // Transform Emscripten glue for worker scope
  jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/hively/Hively.js"`);
  jsCode = jsCode.replace(/export\s+default\s+/g, 'var createHively = ');
  jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, '');
  jsCode = jsCode.replace(/ENVIRONMENT_IS_WEB\s*=\s*!0/g, 'ENVIRONMENT_IS_WEB=false');
  jsCode = jsCode.replace(/ENVIRONMENT_IS_WORKER\s*=\s*!1/g, 'ENVIRONMENT_IS_WORKER=true');
  // Export HEAPU8/HEAPF32 on Module (modern Emscripten keeps them closure-local)
  jsCode = jsCode.replace(
    'moduleRtn=Module',
    'Module.HEAPU8=HEAPU8;Module.HEAPF32=HEAPF32;moduleRtn=Module',
  );
  jsCode = 'var document = { currentScript: { src: "' + baseUrl + '/hively/Hively.js" }, title: "" };\n' + jsCode;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factory = new Function(jsCode + '\n;return typeof createHively !== "undefined" ? createHively : Module;')();

  hivelyInstance = await factory({
    wasmBinary,
    print: (msg: string) => console.log('[DJRenderWorker/Hively]', msg),
    printErr: (msg: string) => console.warn('[DJRenderWorker/Hively]', msg),
  });

  hivelyInstance._hively_init(44100);
  hivelyReady = true;
  console.log('[DJRenderWorker] Hively engine initialized');
}

async function renderWithHively(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  id: string,
  withStems = true,
): Promise<RenderResult> {
  await initHively();
  const wasm = hivelyInstance;
  const sampleRate = 44100;

  // Copy tune data to WASM heap
  const data = new Uint8Array(fileBuffer);
  const ptr = wasm._malloc(data.length);
  wasm.HEAPU8.set(data, ptr);

  const ok = wasm._hively_load_tune(ptr, data.length, 2); // defStereo=2
  wasm._free(ptr);

  if (!ok) {
    throw new Error(`Hively failed to load ${filename}`);
  }

  console.log(`[DJRenderWorker/Hively] Loaded ${filename} — positions: ${wasm._hively_get_positions()}, channels: ${wasm._hively_get_channels()}`);

  if (subsong > 0) {
    wasm._hively_init_subsong(subsong);
  }

  postProgress(id, 10);

  // Allocate decode buffers (one frame = sampleRate/50 samples)
  const frameSamples = Math.floor(sampleRate / 50);
  const floatBytes = frameSamples * 4;
  const decodePtrL = wasm._malloc(floatBytes);
  const decodePtrR = wasm._malloc(floatBytes);

  // Render all frames until song end (max 10 minutes safety limit)
  const maxFrames = sampleRate * 600;
  const chunks: { left: Float32Array; right: Float32Array }[] = [];
  let totalFrames = 0;
  const positions = wasm._hively_get_positions();
  let lastProgressPct = 10;

  // Each channel's own signal: the split render the Hively worklet uses for
  // its scopes (Hively.worklet.js) - tick once, render the mix, then re-render
  // the same frame once per channel with only that channel audible.
  const hasSplit = typeof wasm._hively_tick_frame === 'function'
    && typeof wasm._hively_render_frame === 'function'
    && typeof wasm._hively_set_channel_gain === 'function';
  const tuneChannels: number = wasm._hively_get_channels ? wasm._hively_get_channels() : 4;
  // One split render per channel the tune has (up to DECK_SCOPE_CHANNELS): its scope, and its
  // stem (stereo) for the first DECK_STEM_CHANNELS.
  const soloChannels = hasSplit ? Math.min(tuneChannels, DECK_SCOPE_CHANNELS) : 0;
  const scopes = soloChannels > 0 ? new ChannelScopeTrackBuilder(soloChannels, sampleRate) : null;
  const stemChannels = withStems ? Math.min(soloChannels, DECK_STEM_CHANNELS) : 0;
  const stems = stemChannels > 0 ? new ChannelStemsBuilder(stemChannels) : null;
  const soloL: Float32Array[] = Array.from({ length: soloChannels }, () => new Float32Array(frameSamples * 2));
  const soloR: Float32Array[] = Array.from({ length: soloChannels }, () => new Float32Array(frameSamples * 2));
  const setGains = (only: number): void => {
    for (let c = 0; c < tuneChannels; c++) wasm._hively_set_channel_gain(c, only < 0 || c === only ? 1.0 : 0.0);
  };

  while (totalFrames < maxFrames) {
    if (wasm._hively_is_song_end()) break;

    let samples: number;
    if (scopes) {
      wasm._hively_tick_frame();
      wasm._hively_save_voice_positions();
      setGains(-1);
      samples = wasm._hively_render_frame(decodePtrL, decodePtrR);
      if (samples > 0) {
        // The mix is read below; keep it out of the way of the solo renders.
        const heap = wasm.HEAPF32 as Float32Array;
        const mixL = heap.slice(decodePtrL >> 2, (decodePtrL >> 2) + samples);
        const mixR = heap.slice(decodePtrR >> 2, (decodePtrR >> 2) + samples);
        let n = samples;
        for (let ch = 0; ch < soloChannels; ch++) {
          wasm._hively_restore_voice_positions();
          setGains(ch);
          const got = wasm._hively_render_frame(decodePtrL, decodePtrR);
          const h = wasm.HEAPF32 as Float32Array;
          const oL = decodePtrL >> 2;
          const oR = decodePtrR >> 2;
          n = Math.min(n, Math.max(0, got));
          if (soloL[ch].length < got) { soloL[ch] = new Float32Array(got); soloR[ch] = new Float32Array(got); }
          for (let i = 0; i < got; i++) { soloL[ch][i] = h[oL + i]; soloR[ch][i] = h[oR + i]; }
        }
        setGains(-1);
        (wasm.HEAPF32 as Float32Array).set(mixL, decodePtrL >> 2);
        (wasm.HEAPF32 as Float32Array).set(mixR, decodePtrR >> 2);
        scopes.push(samples, (ch, i) => (i < n ? (soloL[ch][i] + soloR[ch][i]) * 0.5 : 0));
        stems?.push(samples, (ch, i) => (i < n ? soloL[ch][i] : 0), (ch, i) => (i < n ? soloR[ch][i] : 0));
      }
    } else {
      samples = wasm._hively_decode_frame(decodePtrL, decodePtrR);
    }
    if (samples <= 0) break;

    const heapF32 = wasm.HEAPF32;
    const offsetL = decodePtrL >> 2;
    const offsetR = decodePtrR >> 2;

    const chunkL = new Float32Array(samples);
    const chunkR = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      chunkL[i] = heapF32[offsetL + i];
      chunkR[i] = heapF32[offsetR + i];
    }

    chunks.push({ left: chunkL, right: chunkR });
    totalFrames += samples;

    // Report progress based on position
    if (positions > 0) {
      const pos = wasm._hively_get_position();
      const pct = Math.round(10 + (pos / positions) * 75);
      if (pct > lastProgressPct) {
        postProgress(id, pct);
        lastProgressPct = pct;
      }
    }
  }

  wasm._free(decodePtrL);
  wasm._free(decodePtrR);
  wasm._hively_free_tune();

  // Concatenate chunks
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of chunks) {
    left.set(chunk.left, offset);
    right.set(chunk.right, offset);
    offset += chunk.left.length;
  }

  postProgress(id, 85);
  console.log(`[DJRenderWorker/Hively] Rendered ${filename}: ${(totalFrames / sampleRate).toFixed(1)}s, ${chunks.length} frames`);
  const track = scopes?.finish();
  if (track && stems) track.stems = stems.finish(totalFrames);
  return { left, right, sampleRate, channelScopes: track };
}

// ── WebSID (C64 SID) Engine State ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sidModule: any = null;
let sidReady = false;

async function initSID(): Promise<void> {
  if (sidReady) return;

  const baseUrl = self.location.origin;

  // Fetch backend JS, WASM binary, and C64 ROMs in parallel
  const [jsResponse, wasmResponse, romsResponse] = await Promise.all([
    fetch(`${baseUrl}/deepsid/backend_websid.js`),
    fetch(`${baseUrl}/deepsid/websid.wasm`),
    fetch(`${baseUrl}/deepsid/c64roms.js`),
  ]);

  let jsCode = await jsResponse.text();
  const wasmBinary = await wasmResponse.arrayBuffer();
  const romsCode = await romsResponse.text();

  // Extract the Emscripten IIFE (between the module config and the adapter class).
  // The IIFE: `var backend_SID = (function(Module) { ... })(window.spp_backend_state_SID);`
  // We need to:
  // 1. Shim window.* references
  // 2. Provide wasmBinary to skip fetch
  // 3. Return the Module with all exports

  // Replace window references in the outer wrapper
  jsCode = jsCode.replace(
    /\(function\(\)\{.*?window\.printErr.*?\}\)\(\);/s,
    '// console shim removed for worker'
  );

  // Replace the Module config with one that includes wasmBinary
  // The original object has nested braces (locateFile function), so use [\s\S]+? to match across lines
  jsCode = jsCode.replace(
    /window\.spp_backend_state_SID\s*=\s*\{[\s\S]+?\n\};/,
    `window.spp_backend_state_SID = {
      wasmBinary: __sidWasmBinary__,
      locateFile: function(path) { return "${baseUrl}/deepsid/" + path; },
      notReady: true,
      adapterCallback: function(){}
    };`
  );

  // Replace the onRuntimeInitialized setter (uses .bind(window...))
  jsCode = jsCode.replace(
    /window\.spp_backend_state_SID\["onRuntimeInitialized"\]\s*=\s*function\(\)\s*\{[^}]+\}\.bind\([^)]+\);/,
    `window.spp_backend_state_SID["onRuntimeInitialized"] = function() {
      this.notReady = false;
      this.adapterCallback();
    }.bind(window.spp_backend_state_SID);`
  );

  // Remove the adapter class and everything after (we don't need it)
  const adapterIdx = jsCode.indexOf('class SIDBackendAdapter');
  if (adapterIdx > 0) {
    jsCode = jsCode.substring(0, adapterIdx);
  }

  // Wrap everything with window/document shims and execute
  const wrappedCode = `
    var window = self;
    var document = { currentScript: { src: "${baseUrl}/deepsid/backend_websid.js" }, title: "" };
    window.console = { log: function(){}, warn: function(){}, error: function(){} };
    window.printErr = function(){};
    window.sid_measure_runs = 0;
    window.sid_measure_sum = 0;
    window.sid_measure = 0;
    window.sid_measure_avg_runs = 0;
    window.sid_measure_avg_sum = 0;
    window.sid_measure_avg = 0;
    var __sidWasmBinary__ = this.__wasmBin__;
    ${romsCode.replace(/window\./g, 'self.')}
    ${jsCode}
    return typeof backend_SID !== 'undefined' ? backend_SID : null;
  `;

  // Execute in a function scope, providing wasmBinary via 'this'
  const factory = new Function(wrappedCode);
  const result = factory.call({ __wasmBin__: new Uint8Array(wasmBinary) });

  if (!result || !result.Module) {
    throw new Error('WebSID module failed to initialize');
  }

  sidModule = result.Module;

  // Wait for runtime initialization if needed
  if (sidModule.calledRun) {
    sidReady = true;
  } else {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSID init timeout')), 10000);
      const origCallback = sidModule.onRuntimeInitialized;
      sidModule.onRuntimeInitialized = () => {
        clearTimeout(timeout);
        if (origCallback) origCallback();
        sidReady = true;
        resolve();
      };
    });
  }

  console.log('[DJRenderWorker] WebSID engine initialized');
}

/**
 * Load a SID file into the WebSID instance (with the C64 ROMs when present).
 * scopeEnabled: WebSID records each voice's output as a trace stream beside
 * the audio buffer (the DeepSID scopes' source).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSidFile(mod: any, fileBuffer: ArrayBuffer, filename: string, subsong: number, sampleRate: number, scopeEnabled: boolean, forced: SidForcedPlayback = {}): void {
  // Copy SID file data to WASM heap
  const data = new Uint8Array(fileBuffer);
  const buf = mod._malloc(data.length);
  mod.HEAPU8.set(data, buf);

  // emu_load_file(filename, buf, len, sampleRate, procBufSize, scopeEnabled, basicBuf, charBuf, kernalBuf, enableMd5)
  // ROMs: decode from base64 globals if available
  let basicBuf = 0, charBuf = 0, kernalBuf = 0;
  const ROM_SIZE = 0x2000;
  const CHAR_ROM_SIZE = 0x1000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = self as any;
  if (g.C64_BASIC_ROM) {
    const rom = base64ToUint8Array(g.C64_BASIC_ROM);
    basicBuf = mod._malloc(ROM_SIZE);
    mod.HEAPU8.set(rom.subarray(0, ROM_SIZE), basicBuf);
  }
  if (g.C64_CHAR_ROM) {
    const rom = base64ToUint8Array(g.C64_CHAR_ROM);
    charBuf = mod._malloc(CHAR_ROM_SIZE);
    mod.HEAPU8.set(rom.subarray(0, CHAR_ROM_SIZE), charBuf);
  }
  if (g.C64_KERNAL_ROM) {
    const rom = base64ToUint8Array(g.C64_KERNAL_ROM);
    kernalBuf = mod._malloc(ROM_SIZE);
    mod.HEAPU8.set(rom.subarray(0, ROM_SIZE), kernalBuf);
  }

  const procBufSize = 8192; // processing buffer size (samples per compute call)
  const ret = mod.ccall('emu_load_file', 'number',
    ['string', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
    [filename, buf, data.length, sampleRate, procBufSize, scopeEnabled ? 1 : 0, basicBuf, charBuf, kernalBuf, 0]);

  mod._free(buf);
  if (kernalBuf) mod._free(kernalBuf);
  if (charBuf) mod._free(charBuf);
  if (basicBuf) mod._free(basicBuf);

  if (ret !== 0) {
    throw new Error(`WebSID failed to load ${filename} (code ${ret})`);
  }

  // A forced clock before the track starts: the start (emu_set_subsong) sets CIA / VIC / SID up on it.
  if (forced.clock) mod.ccall('emu_set_ntsc', null, ['number'], [forced.clock === 'NTSC' ? 1 : 0]);

  // Set subsong
  if (subsong >= 0) {
    mod.ccall('emu_set_subsong', 'number', ['number'], [subsong]);
  }

  // A forced model after the track start, as the live WebSID engine applies it (ScriptNodePlayerEngine.setChipModel).
  if (forced.chipModel) mod.ccall('emu_set_6581', 'number', ['number'], [forced.chipModel === '6581' ? 1 : 0]);
}

/**
 * The WebSID trace stream of a song voice. WebSID traces 4 streams per chip -
 * its 3 voices and the chip's digi (volume-register sample) output - so song
 * voice k (3 per chip: chip k / 3, voice k % 3) is stream (k / 3) * 4 + k % 3.
 */
function sidTraceStreamOfVoice(voice: number): number {
  return Math.floor(voice / 3) * 4 + (voice % 3);
}

async function renderWithSID(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  id: string,
  withStems = true,
  maxSeconds?: number,
  forced: SidForcedPlayback = {},
): Promise<RenderResult> {
  await initSID();
  const mod = sidModule;
  const sampleRate = 44100;
  const t0 = Date.now();
  loadSidFile(mod, fileBuffer, filename, subsong, sampleRate, true, forced);

  postProgress(id, 10);

  // Get max position for progress reporting
  const maxPos = mod.ccall('emu_get_max_position', 'number');

  // Render audio: each compute call produces ~1 frame (50/60Hz).
  // SIDs loop forever, so render for a fixed duration (3 minutes default, up to 5 if still playing).
  const maxDuration = Math.min(180, maxSeconds ?? 180); // 3 minutes, or a preview's cap
  const maxFrames = sampleRate * maxDuration;
  const chunks: { left: Float32Array; right: Float32Array }[] = [];
  let totalFrames = 0;
  let lastProgressPct = 10;
  let songEnded = false;
  const hasTrace = typeof mod._emu_get_trace_streams === 'function' && typeof mod._emu_number_trace_streams === 'function';
  // One scope per voice the song has: 3 per SID chip (the chip's digi stream is not a voice).
  const voices = hasTrace
    ? Math.min(DECK_SCOPE_CHANNELS, mod._emu_sid_count() * 3, Math.floor(mod._emu_number_trace_streams() / 4) * 3)
    : 0;
  const scopes = voices > 0 ? new ChannelScopeTrackBuilder(voices, sampleRate) : null;
  // Every voice's stem from this same pass (WebSID emu_enable_stems: each voice's share of the
  // output, so the stems sum to the mix). One solo re-render per voice made a 3SID render
  // 1 + 8 full emulations and ran into the pipeline's 180 s task timeout.
  const stemVoices = withStems && scopes && typeof mod._emu_enable_stems === 'function' ? Math.min(voices, DECK_STEM_CHANNELS) : 0;
  if (stemVoices > 0) mod._emu_enable_stems(1);
  const stems = stemVoices > 0 ? new ChannelStemsBuilder(stemVoices) : null;
  const clock: PlayerCallSample[] = [];
  const hasClock = typeof mod._emu_get_irq_calls === 'function';

  while (totalFrames < maxFrames && !songEnded) {
    // emu_compute_audio_samples returns >0 when song ends
    const ended = mod._emu_compute_audio_samples();
    if (ended) {
      songEnded = true;
      break;
    }

    // Get the audio buffer (Int16 interleaved stereo)
    const audioBufPtr = mod._emu_get_audio_buffer() >> 1; // byte offset → Int16 index
    const numSamples = mod._emu_get_audio_buffer_length();

    if (numSamples <= 0) continue;

    // numSamples = frames per channel (not total interleaved samples)
    // Audio buffer is stereo interleaved Int16: [L0, R0, L1, R1, ...]
    const framesThisChunk = numSamples;
    const chunkL = new Float32Array(framesThisChunk);
    const chunkR = new Float32Array(framesThisChunk);

    for (let i = 0; i < framesThisChunk; i++) {
      chunkL[i] = mod.HEAP16[audioBufPtr + i * 2] / 32768.0;
      chunkR[i] = mod.HEAP16[audioBufPtr + i * 2 + 1] / 32768.0;
    }

    chunks.push({ left: chunkL, right: chunkR });
    totalFrames += framesThisChunk;
    if (hasClock) clock.push({ calls: mod._emu_get_irq_calls() >>> 0, lastCallCycle: mod._emu_get_irq_last_cycle() >>> 0 });

    if (stems) {
      // One interleaved stereo Int16 buffer per voice (chip c voice k at c*3+k = the song channel).
      const table = mod._emu_get_stem_buffers() >> 2;
      const heap32 = mod.HEAP32 as Int32Array;
      const heap16 = mod.HEAP16 as Int16Array;
      const bases = Array.from({ length: stemVoices }, (_, v) => heap32[table + v] >> 1);
      stems.push(framesThisChunk, (v, i) => heap16[bases[v] + i * 2] / 32768, (v, i) => heap16[bases[v] + i * 2 + 1] / 32768);
    }

    if (scopes) {
      // An array of pointers to one Int16 stream per voice, numSamples long.
      const table = mod._emu_get_trace_streams() >> 2;
      const heap32 = mod.HEAP32 as Int32Array;
      const heap16 = mod.HEAP16 as Int16Array;
      const bases = Array.from({ length: voices }, (_, v) => heap32[table + sidTraceStreamOfVoice(v)] >> 1);
      scopes.push(framesThisChunk, (v, i) => heap16[bases[v] + i] / 32768);
    }

    // Progress based on position or time
    if (maxPos > 0) {
      const curPos = mod.ccall('emu_get_current_position', 'number');
      const pct = Math.round(10 + (curPos / maxPos) * 75);
      if (pct > lastProgressPct) {
        postProgress(id, pct);
        lastProgressPct = pct;
      }
    } else {
      const pct = Math.round(10 + (totalFrames / maxFrames) * 75);
      if (pct > lastProgressPct) {
        postProgress(id, pct);
        lastProgressPct = pct;
      }
    }
  }

  const playerCallHz = hasClock ? steadyPlayerCallHz(clock, mod._emu_get_clock_rate() >>> 0) : undefined;
  // Teardown the SID instance
  if (stemVoices > 0) mod._emu_enable_stems(0);
  mod._emu_teardown();

  if (totalFrames === 0) {
    throw new Error(`WebSID rendered 0 frames for ${filename}`);
  }

  // Concatenate chunks
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of chunks) {
    left.set(chunk.left, offset);
    right.set(chunk.right, offset);
    offset += chunk.left.length;
  }

  postProgress(id, 85);
  console.log(`[DJRenderWorker/WebSID] Rendered ${filename}: ${(totalFrames / sampleRate).toFixed(1)}s, ${chunks.length} frames, songEnded: ${songEnded}`);
  const track = scopes?.finish();
  if (track && stems) {
    const voiceStems = stems.finish(totalFrames);
    track.stems = voiceStems.map((st, v) => (track.scales[v] > 0 ? st : new Int16Array(0)));
  }
  console.log(`[DJRenderWorker/WebSID] one pass with ${stemVoices} stems: ${Date.now() - t0} ms, player ${playerCallHz?.toFixed(4) ?? '-'} Hz`);
  return { left, right, sampleRate, channelScopes: track, playerCallHz };
}

/**
 * Render each of the 3 SID voices in isolation for CED instrument classification.
 *
 * Uses `emu_enable_voice(sidIdx, voice, on)` — available in WebSID WASM — to
 * silence the two voices we don't want, then renders 2 seconds. Three passes
 * total. Each pass reloads the SID file to reset music state.
 *
 * Returns 3 Float32Arrays (one per voice) at 44100 Hz mono.
 */
async function renderSidVoices(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
): Promise<Float32Array[]> {
  await initSID();
  const mod = sidModule;
  const sampleRate = 44100;
  const durationSec = 2.0;
  const targetFrames = Math.floor(sampleRate * durationSec);
  const results: Float32Array[] = [];

  for (let activeVoice = 0; activeVoice < 3; activeVoice++) {
    // Load / reload the SID file for each voice pass
    const data = new Uint8Array(fileBuffer);
    const buf = mod._malloc(data.length);
    mod.HEAPU8.set(data, buf);
    const ret = mod.ccall('emu_load_file', 'number',
      ['string', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [filename, buf, data.length, sampleRate, 8192, 0, 0, 0, 0, 0]);
    mod._free(buf);
    if (ret !== 0) break;

    if (subsong >= 0) {
      mod.ccall('emu_set_subsong', 'number', ['number'], [subsong]);
    }

    // Mute all voices except activeVoice (sidIdx=0 for single-chip SID files)
    for (let v = 0; v < 3; v++) {
      mod.ccall('emu_enable_voice', 'number', ['number', 'number', 'number'],
        [0, v, v === activeVoice ? 1 : 0]);
    }

    const chunks: Float32Array[] = [];
    let totalFrames = 0;

    while (totalFrames < targetFrames) {
      const ended = mod._emu_compute_audio_samples();
      const audioBufPtr = mod._emu_get_audio_buffer() >> 1;
      const numSamples = mod._emu_get_audio_buffer_length();
      if (numSamples <= 0) { if (ended) break; continue; }

      const remaining = targetFrames - totalFrames;
      const take = Math.min(numSamples, remaining);
      const chunk = new Float32Array(take);
      for (let i = 0; i < take; i++) {
        // Stereo interleaved — take left channel only
        chunk[i] = mod.HEAP16[audioBufPtr + i * 2] / 32768.0;
      }
      chunks.push(chunk);
      totalFrames += take;
      if (ended) break;
    }

    mod._emu_teardown();

    const voicePcm = new Float32Array(totalFrames);
    let off = 0;
    for (const c of chunks) { voicePcm.set(c, off); off += c.length; }
    results.push(voicePcm);
  }

  return results;
}

/** Decode a base64 string to Uint8Array */
function base64ToUint8Array(b64: string): Uint8Array {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

// ── libopenmpt Engine State ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let openmptLib: any = null;
let openmptReady = false;

async function initLibopenmpt(): Promise<void> {
  if (openmptReady) return;

  const baseUrl = self.location.origin;

  // Fetch the libopenmpt emscripten glue (which embeds the WASM as data URL)
  const jsResponse = await fetch(`${baseUrl}/chiptune3/libopenmpt.worklet.js`);
  let jsCode = await jsResponse.text();

  // Transform for worker scope — strip ESM syntax
  jsCode = jsCode.replace(/export\s+default\s+/g, 'var createLibopenmpt = ');
  jsCode = jsCode.replace(/export\s*\{[^}]*\}/g, '');
  jsCode = jsCode.replace(/import\.meta\.url/g, `"${baseUrl}/chiptune3/libopenmpt.worklet.js"`);

  // Execute to get factory
  const factory = new Function(jsCode + '\n;return typeof createLibopenmpt !== "undefined" ? createLibopenmpt : Module;')();

  openmptLib = await factory();
  openmptReady = true;
  console.log('[DJRenderWorker] libopenmpt engine initialized');
}

/** Helper: write ASCII string to WASM stack */
function asciiToStack(lib: { stackAlloc: (n: number) => number; HEAPU8: Uint8Array }, str: string): number {
  const ptr = lib.stackAlloc(str.length + 1);
  for (let i = 0; i < str.length; i++) {
    lib.HEAPU8[ptr + i] = str.charCodeAt(i);
  }
  lib.HEAPU8[ptr + str.length] = 0;
  return ptr;
}

async function renderWithLibopenmpt(
  fileBuffer: ArrayBuffer,
  filename: string,
  id: string,
  maxSeconds = 600,
  withStems = true,
): Promise<RenderResult> {
  await initLibopenmpt();
  const lib = openmptLib;

  postProgress(id, 10);

  // Allocate and copy file data into WASM heap
  const fileBytes = new Uint8Array(fileBuffer);
  const filePtr = lib._malloc(fileBytes.length);
  lib.HEAPU8.set(fileBytes, filePtr);

  // Create module
  const modulePtr = lib._openmpt_module_create_from_memory(filePtr, fileBytes.length, 0, 0, 0);
  lib._free(filePtr);

  if (!modulePtr) {
    throw new Error(`libopenmpt failed to load ${filename}`);
  }

  // Configure render
  const sampleRate = 44100;
  lib._openmpt_module_set_repeat_count(modulePtr, 0); // Play once, no repeat

  // Set Amiga resampler emulation for MOD-like formats
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mod' || ext === 'nst' || ext === 'stk' || ext === 'm15') {
    const stack = lib.stackSave();
    lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, 'render.resampler.emulate_amiga'), asciiToStack(lib, '1'));
    lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, 'render.resampler.emulate_amiga_type'), asciiToStack(lib, 'a1200'));
    lib.stackRestore(stack);
  }

  // Set stereo separation to 100%
  lib._openmpt_module_set_render_param(modulePtr, 2 /* SEPARATION */, 100);

  postProgress(id, 15);

  // Render in chunks
  const CHUNK = 4096;
  const leftPtr = lib._malloc(CHUNK * 4);
  const rightPtr = lib._malloc(CHUNK * 4);

  // Each channel's own signal: one solo instance per channel, the way the
  // libopenmpt worklet feeds its scopes (chiptune3.worklet.js createOscInstance_),
  // rendered in lockstep with the main module.
  // One solo per channel the module has (up to DECK_SCOPE_CHANNELS): its scope, and its stem
  // (stereo, the whole output chain) for the first DECK_STEM_CHANNELS.
  const solos = createLibopenmptSolos(lib, fileBytes, ext, CHUNK, DECK_SCOPE_CHANNELS);
  const scopes = solos.length > 0 ? new ChannelScopeTrackBuilder(solos.length, sampleRate) : null;
  const stemChannels = withStems ? Math.min(solos.length, DECK_STEM_CHANNELS) : 0;
  const stems = stemChannels > 0 ? new ChannelStemsBuilder(stemChannels) : null;

  const chunks: { left: Float32Array; right: Float32Array }[] = [];
  let totalFrames = 0;
  const MAX_FRAMES = sampleRate * maxSeconds;

  while (totalFrames < MAX_FRAMES) {
    const rendered = lib._openmpt_module_read_float_stereo(modulePtr, sampleRate, CHUNK, leftPtr, rightPtr);
    if (rendered <= 0) break;

    const leftData = new Float32Array(rendered);
    const rightData = new Float32Array(rendered);
    leftData.set(new Float32Array(lib.HEAPF32.buffer, leftPtr, rendered));
    rightData.set(new Float32Array(lib.HEAPF32.buffer, rightPtr, rendered));

    chunks.push({ left: leftData, right: rightData });
    totalFrames += rendered;

    if (scopes) {
      const counts = solos.map((solo) => Math.max(0, lib._openmpt_module_read_float_stereo(solo.modulePtr, sampleRate, rendered, solo.leftPtr, solo.rightPtr)));
      const heap = lib.HEAPF32 as Float32Array;
      scopes.push(rendered, (ch, i) => (i < counts[ch]
        ? (heap[(solos[ch].leftPtr >> 2) + i] + heap[(solos[ch].rightPtr >> 2) + i]) * 0.5
        : 0));
      stems?.push(rendered,
        (ch, i) => (i < counts[ch] ? heap[(solos[ch].leftPtr >> 2) + i] : 0),
        (ch, i) => (i < counts[ch] ? heap[(solos[ch].rightPtr >> 2) + i] : 0));
    }

    if (totalFrames % (sampleRate * 5) < CHUNK) {
      const pct = Math.min(80, 15 + (totalFrames / MAX_FRAMES) * 65);
      postProgress(id, pct);
    }
  }

  lib._free(leftPtr);
  lib._free(rightPtr);
  lib._openmpt_module_destroy(modulePtr);
  for (const solo of solos) {
    lib._openmpt_module_ext_destroy(solo.extPtr);
    lib._free(solo.leftPtr);
    lib._free(solo.rightPtr);
  }

  if (totalFrames === 0) {
    throw new Error(`libopenmpt rendered 0 frames for ${filename}`);
  }

  // Concatenate
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  let offset = 0;
  for (const chunk of chunks) {
    left.set(chunk.left, offset);
    right.set(chunk.right, offset);
    offset += chunk.left.length;
  }

  postProgress(id, 85);
  const track = scopes?.finish();
  if (track && stems) track.stems = stems.finish(totalFrames);
  return { left, right, sampleRate, channelScopes: track };
}

interface LibopenmptSolo { extPtr: number; modulePtr: number; leftPtr: number; rightPtr: number }

/**
 * One libopenmpt instance per shown channel, every other channel muted
 * through the 'interactive' interface before the first tick, configured like
 * the main render. Empty when the build has no ext API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createLibopenmptSolos(lib: any, fileBytes: Uint8Array, ext: string, chunk: number, maxChannels: number): LibopenmptSolo[] {
  if (!lib._openmpt_module_ext_create_from_memory || !lib._openmpt_module_ext_get_interface || !lib.wasmTable) return [];
  const solos: LibopenmptSolo[] = [];
  let numChannels = 0;
  for (let ch = 0; ch < maxChannels; ch++) {
    if (numChannels > 0 && ch >= numChannels) break;
    const filePtr = lib._malloc(fileBytes.length);
    lib.HEAPU8.set(fileBytes, filePtr);
    const extPtr = lib._openmpt_module_ext_create_from_memory(filePtr, fileBytes.length, 0, 0, 0, 0, 0, 0, 0);
    lib._free(filePtr);
    if (!extPtr) break;
    const modulePtr = lib._openmpt_module_ext_get_module(extPtr);
    // set_channel_mute_status is the 11th pointer of the 'interactive' interface struct (16 pointers).
    const ifacePtr = lib._malloc(64);
    lib.HEAPU8.fill(0, ifacePtr, ifacePtr + 64);
    const stack = lib.stackSave();
    const ok = lib._openmpt_module_ext_get_interface(extPtr, asciiToStack(lib, 'interactive'), ifacePtr, 64);
    lib.stackRestore(stack);
    const muteFunc = ok ? lib.HEAPU32[(ifacePtr + 40) >> 2] : 0;
    lib._free(ifacePtr);
    if (!modulePtr || !muteFunc) { lib._openmpt_module_ext_destroy(extPtr); break; }
    numChannels = lib._openmpt_module_get_num_channels(modulePtr);
    if (ch >= numChannels) { lib._openmpt_module_ext_destroy(extPtr); break; }
    const mute = lib.wasmTable.get(muteFunc);
    for (let c = 0; c < numChannels; c++) mute(extPtr, c, c === ch ? 0 : 1);
    lib._openmpt_module_set_repeat_count(modulePtr, 0);
    lib._openmpt_module_set_render_param(modulePtr, 2 /* SEPARATION */, 100);
    if (ext === 'mod' || ext === 'nst' || ext === 'stk' || ext === 'm15') {
      const st = lib.stackSave();
      lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, 'render.resampler.emulate_amiga'), asciiToStack(lib, '1'));
      lib._openmpt_module_ctl_set(modulePtr, asciiToStack(lib, 'render.resampler.emulate_amiga_type'), asciiToStack(lib, 'a1200'));
      lib.stackRestore(st);
    }
    solos.push({ extPtr, modulePtr, leftPtr: lib._malloc(chunk * 4), rightPtr: lib._malloc(chunk * 4) });
  }
  return solos;
}

// ── Message Handling ─────────────────────────────────────────────────────────

function postProgress(id: string, progress: number): void {
  (self as unknown as Worker).postMessage({ type: 'renderProgress', id, progress: Math.round(progress) });
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      // Lazy init — engines are initialized on first render request
      (self as unknown as Worker).postMessage({ type: 'ready' });
      break;
    }

    case 'render': {
      const { id, fileBuffer, filename, subsong = 0, companions, maxSeconds, stems = true, sid } = msg;
      try {
        let result: RenderResult;

        // Format routing with priority order:
        // 1. C64 SID (magic number detection)
        // 2. Hively (AHX/HVL)
        // 3. AdLib/OPL (AdPlug)
        // 4. Console/Arcade (NSF, SPC, VGM, etc.)
        // 5. Retro platforms (Atari, MSX, X68000, PC-98, etc.)
        // 6. Modern synthesizers (SunVox, V2, WaveSabre, etc.)
        // 7. Amiga formats (UADE)
        // 8. Everything else (libopenmpt fallback)

        if (isC64SID(fileBuffer)) {
          result = await renderWithSID(fileBuffer, filename, subsong, id, stems, maxSeconds, sid);
        } else if (isHivelyFormat(filename)) {
          result = await renderWithHively(fileBuffer, filename, subsong, id, stems);
        } else if (isAdLibFormat(filename)) {
          // TODO: Implement renderWithAdPlug()
          throw new Error('AdLib/OPL formats not yet supported in DJ renderer (use main tracker)');
        } else if (isConsoleFormat(filename)) {
          // TODO: Implement console renderers (NSF, SPC, VGM, etc.)
          throw new Error('Console formats not yet supported in DJ renderer (use main tracker)');
        } else if (isRetroFormat(filename)) {
          // TODO: Implement retro platform renderers (SC68, PT3, KSS, etc.)
          throw new Error('Retro platform formats not yet supported in DJ renderer (use main tracker)');
        } else if (isSynthFormat(filename)) {
          // TODO: Implement synthesizer renderers (SunVox, V2, WaveSabre, etc.)
          throw new Error('Synthesizer formats not yet supported in DJ renderer (use main tracker)');
        } else if (isAmigaFormat(filename)) {
          result = await renderWithUADE(fileBuffer, filename, subsong, id, companions, maxSeconds, stems);
        } else {
          result = await renderWithLibopenmpt(fileBuffer, filename, id, maxSeconds, stems);
        }

        const duration = result.left.length / result.sampleRate;

        // The stems ship and cache as lossless FLAC (channelStemCodec.ts), encoded here, off the main thread.
        const track = result.channelScopes;
        if (track?.stems) {
          const flac: Uint8Array[] = [];
          for (const st of track.stems) flac.push(await encodeStemFlac(st, result.sampleRate));
          track.flacStems = flac;
          delete track.stems;
        }

        postProgress(id, 95);

        // Transfer ownership of the Float32Arrays for zero-copy
        (self as unknown as Worker).postMessage(
          {
            type: 'renderComplete',
            id,
            left: result.left,
            right: result.right,
            sampleRate: result.sampleRate,
            duration,
            channelScopes: result.channelScopes,
            playerCallHz: result.playerCallHz,
          },
          [result.left.buffer, result.right.buffer, ...channelScopeTransferables(result.channelScopes)],
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[DJRenderWorker] Render failed for ${filename}:`, errorMsg);
        (self as unknown as Worker).postMessage({ type: 'renderError', id, error: errorMsg });
      }
      break;
    }

    case 'renderSidVoices': {
      const { id, fileBuffer, filename, subsong = 0 } = msg;
      try {
        const voices = await renderSidVoices(fileBuffer, filename, subsong);
        (self as unknown as Worker).postMessage(
          { type: 'sidVoicesReady', id, voices, sampleRate: 44100 },
          voices.map(v => v.buffer),
        );
      } catch (err) {
        (self as unknown as Worker).postMessage({ type: 'renderError', id, error: String(err) });
      }
      break;
    }
  }
};

// Signal ready immediately (engines init lazily on first render)
(self as unknown as Worker).postMessage({ type: 'ready' });
