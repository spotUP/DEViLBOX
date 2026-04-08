/**
 * UADEPrefixParsers — UADE-only prefix-based format routing + catch-all
 *
 * Handles ~60 Amiga formats identified by filename prefix (e.g., "bd.", "hot.", "cust.")
 * that have no native parser — they go directly to UADE.
 * Also includes the UADE catch-all for formats detected by magic bytes.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import { getBasename } from './withFallback';

/**
 * UADE-only prefix formats with no native parser.
 * All eagleplayer.conf prefix= entries not covered by native parsers.
 */
const UADE_ONLY_PREFIXES = [
  // ArtAndMagic, AMOS, Sierra-AGI
  'aam.', 'abk.', 'agi.',
  // AshleyHogg
  'ah.',
  // ActionAmics (prefix form), BeathovenSynthesizer
  'ast.', 'bss.', 'bvs.',
  // ChipTracker (Chuck Biscuits Archive)
  'chip.', 'cba.',
  // CoreDesign
  'cd.',
  // FutureComposer-BSI, custom
  'bfc.', 'bsi.', 'fc-bsi.', 'cus.', 'cust.', 'custom.',
  // DaveLowe WTD variant
  'dlw.',
  // DynamicSynthesizer, DariusZendeh (DavidHanney handled by DavidHanneyParser)
  'dns.', 'dz.', 'mkiio.',
  // EarAche, EMS (mg.* was GlueMon alias — handled by GlueMonParser; ea.* = EarAche still UADE)
  'ea.', 'ems.', 'emsv6.',
  // ForgottenWorlds (GlueMon handled by GlueMonParser)
  'fw.',
  // FredEditor/Monitor (fredmon prefix)
  'fredmon.',
  // FuturePlayer2 (fp2 prefix, also pat. follin)
  'fp2.',
  // HowieDavies, MajorTom variants
  'hd.', 'hn.', 'thn.', 'mtp2.', 'arp.',
  // JochenHippel base (hip.*, mcmd.*, sog.*) — different from CoSo and 7V
  'hip.', 'mcmd.', 'sog.',
  // MarkII, MusiclineEditor (MikeDavies handled by AmigaFormatParsers with classic mode)
  'mk2.', 'mkii.', 'ml.',
  // MaxTrax
  'mxt.',
  // Silmarils
  'mok.', 'sil.',
  // NoiseTracker/ProTracker variant
  'nt.',
  // NTSP
  'ntsp.',
  // PaulSummers
  'psum.',
  // Pokeynoise
  'pn.',
  // RiffRaff, SeanConnolly (sc2 = SeanConnolly2)
  'riff.', 's-c.', 'scn.', 'sc2.',
  // RobHubbardST
  'rhst.', 'rho.',
  // RonKlaren
  'rkl.',
  // SonicArranger variants, SpeedyA1System
  'sa-p.', 'lion.', 'sa_old.', 'sas.',
  // SCUMM, SynthDream
  'scumm.', 'sdr.',
  // SoundProgrammingLanguage, SoundImages
  'spl.', 'tw.',
  // SUN-Tronic, SynTracker, StoneTracker
  'sun.', 'synmod.', 'st.',
  // TimFollin
  'tf.',
  // AHX thx prefix (AbyssHighestExperience — thx.* prefix form of AHX)
  'thx.',
  // TFMX variant prefixes (all handled by UADE)
  'tfhd1.5.', 'tfhd7v.', 'tfhdpro.', 'tfmx1.5.', 'tfmx7v.', 'tfmxpro.',
  // TomyTracker
  'tomy.',
  // VoodooSupremeSynthesizer
  'vss.',
  // ── PTK-Prowiz packed MOD formats ──────────────────────────────────────
  // All these go through UADE's PTK-Prowiz replayer (ProWizard unpacker).
  // Noisepacker
  'np.', 'np1.', 'np2.', 'noisepacker2.', 'np3.', 'noisepacker3.',
  // ProPacker / PowerPacker
  'pp10.', 'pp20.', 'pp21.', 'pp30.', 'ppk.',
  // The Player
  'p10.', 'p21.', 'p30.', 'p40a.', 'p40b.', 'p41a.', 'p4x.',
  'p50a.', 'p5a.', 'p5x.', 'p60.', 'p60a.', 'p61.', 'p61a.', 'p6x.',
  // ProRunner
  'pr1.', 'pr2.', 'pru.', 'pru1.', 'pru2.', 'prun.', 'prun1.', 'prun2.',
  // Promizer
  'pm.', 'pm0.', 'pm01.', 'pm1.', 'pm10c.', 'pm18a.', 'pm2.', 'pm20.', 'pm4.', 'pm40.', 'pmz.',
  // Tracker Packer
  'tp.', 'tp1.', 'tp2.', 'tp3.',
  // SKYT / Startrekker Packer
  'skt.', 'skyt.', 'star.', 'stpk.',
  // Heatseeker, ICE, Kefrens, Fuzac, Channel Players, Xann, PhaPacker, Zen
  'hrt.', 'hrt!.', 'ice.', 'kef.', 'kef7.', 'fuz.', 'fuzz.', 'chan.',
  'xan.', 'xann.', 'pha.', 'zen.',
  // UNIC
  'unic.', 'unic2.', 'un2.',
  // Other PTK-Prowiz variants
  '!pm!.', 'ac1.', 'ac1d.', 'aval.', 'cp.', 'cplx.', 'crb.', 'di.',
  'eu.', 'fc-m.', 'fcm.', 'ft.', 'gv.', 'hmc.',
  'it1.', 'lax.', 'mexxmp.', 'mpro.',
  'nr.', 'nru.', 'ntpk.',
  'pin.', 'polk.', 'prom.', 'pwr.', 'pyg.', 'pygm.', 'pygmy.',
  'snt.', 'snt!.', 'st2.', 'st26.', 'st30.', 'wn.',
  // SGT (Graoumf Tracker alias)
  'sgt.',
  // NTP1 (NewtronPacker variant)
  'ntp1.',
] as const;

/**
 * Map non-standard file extensions to the correct UADE eagleplayer prefix.
 * Many Amiga formats use different names in file extensions vs. UADE's eagleplayer.conf.
 * e.g. ".bvs" files need UADE prefix "bss." (BeathovenSynthesizer).
 */
const EXT_TO_UADE_PREFIX: Record<string, string> = {
  'ah':       'ash',       // Ashley Hogg → eagleplayer prefix "ash"
  'bvs':      'bss',       // Beathoven Synth v2 → "bss" (BeathovenSynthesizer)
  'cd':       'core',      // Core Design → "core"
  'chip':     'kris',      // ChipTracker → "kris"
  'dlw':      'dl',        // Dave Lowe WTD → "dl" (DaveLowe)
  'fp2':      'fp',        // Future Player 2 → "fp" (FuturePlayer)
  'fredmon':  'fred',      // Fred Editor Monitor → "fred"
  'mxt':      'mxt',       // MaxTrax (no eagleplayer — uses content detection)
  'nt':       'mod',       // NoiseTracker → "mod" (PTK-Prowiz)
  'ntsp':     'two',       // NTSP → "two" (NTSP-system)
  'psum':     'snk',       // Paul Summers → "snk"
  'rhst':     'rho',       // Rob Hubbard ST → "rho"
  'rkl':      'rkl',       // Ron Klaren (no eagleplayer entry — content detection)
  'sc2':      'scn',       // Sean Connolly 2 → "scn"
  'sil':      'mok',       // Silmarils v2 → "mok"
  'tomy':     'sg',        // TomyTracker → "sg"
  'tme':      'tme',       // TheMusicalEnlightenment → "tme"
  'unic':     'unic',      // UNIC Tracker → "unic" (in PTK-Prowiz list)
  'ins':      'ins',       // InStereo! → "ins"
  // PTK-Prowiz packed format extension aliases
  'p22a':     'p21',       // ProPacker 2.2a → p21 prefix
  'p30a':     'p30',       // ProPacker 3.0a → p30
  'pp':       'ppk',       // PowerPacker → ppk
  'pru2':     'pru2',      // ProRunner 2 → pru2
  'p40a':     'p40a',      // The Player 4.0a → p40a
  'smp':      'pru1',      // ProRunner .smp variant
  'ntp1':     'ntp1',      // NewtronPacker v1
};

/**
 * Try to route a file to UADE via prefix matching or catch-all detection.
 * Returns TrackerSong or null if not matched.
 */
export async function tryUADEPrefixParse(
  buffer: ArrayBuffer,
  filename: string,
  originalFileName: string,
  prefs: FormatEnginePreferences,
  subsong: number,
  preScannedMeta?: UADEMetadata,
): Promise<TrackerSong | null> {
  const base = getBasename(filename);

  // ── UADE-only prefix formats (matches both prefix.name and name.prefix) ──
  const ext = base.slice(base.lastIndexOf('.') + 1);
  const matchedPrefix = UADE_ONLY_PREFIXES.find(p => base.startsWith(p) || p === `${ext}.`);
  if (matchedPrefix) {
    // Normalize extension-form filename to prefix form so UADE selects the right replayer.
    // e.g. "deepspace.mk2" → "mk2.deepspace" (UADE keys off the filename prefix).
    let uadeFileName = originalFileName;
    if (!base.startsWith(matchedPrefix)) {
      const dot = base.lastIndexOf('.');
      if (dot > 0) {
        // Check if this extension needs mapping to a different UADE prefix
        const uadePrefix = EXT_TO_UADE_PREFIX[ext] || ext;
        const namePart = base.slice(0, dot);
        uadeFileName = `${uadePrefix}.${namePart}`;
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, uadeFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── UADE catch-all: 130+ exotic Amiga formats ───────────────────────────
  const { isUADEFormat, parseUADEFile } = await import('@lib/import/formats/UADEParser');
  if (isUADEFormat(filename)) {
    return await parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  return null;
}
