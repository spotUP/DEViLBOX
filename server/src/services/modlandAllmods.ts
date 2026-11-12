/**
 * Pure parsing of the modland allmods.zip listing: the format whitelist and the
 * line parser. Kept free of package imports (adm-zip, sqlite) so the root
 * frontend type-check and tests can import it without server/node_modules.
 */

import path from 'path';
import { isSupportedFormat } from '../../../src/lib/import/formatFilenameMatcher';

// ── Format whitelist (modland folder name → file extension) ─────────────────

export const PLAYABLE_FORMATS: Record<string, string> = {
  // ── Standard tracker formats (libopenmpt / dedicated parsers) ──────────────
  'Protracker': 'mod',
  'Fasttracker': 'xm',
  'Fasttracker 2': 'xm',
  'Impulsetracker': 'it',
  'Screamtracker 3': 's3m',
  'Screamtracker 2': 'stm',
  'OpenMPT MPTM': 'mptm',
  'Composer 669': '669',
  'Digibooster': 'digi',
  'Digibooster Pro': 'dbm',
  'Farandole Composer': 'far',
  'Oktalyzer': 'okt',
  'Ultratracker': 'ult',
  'Multitracker': 'mtm',
  'OctaMED MMD0': 'med',
  'OctaMED MMD1': 'med',
  'OctaMED MMD2': 'med',
  'OctaMED MMD3': 'med',
  'OctaMED MMDC': 'mmdc',
  'Soundtracker': 'mod',
  'Soundtracker 2.6': 'mod',
  'Soundtracker Pro II': 'mod',
  'Digital Tracker MOD': 'mod',
  'Digital Tracker DTM': 'dtm',
  'Graoumf Tracker': 'gt2',
  'Graoumf Tracker 2': 'gt2',
  'HivelyTracker': 'hvl',
  'AHX': 'ahx',
  'Furnace': 'fur',

  // ── UADE exotic Amiga formats (130+ via 68k + Paula emulation) ─────────────
  // Folder names match ftp.modland.com/pub/modules/<Format>/

  // Jochen Hippel variants
  'Hippel': 'hip',
  'Hippel 7V': 'hip7',
  'Hippel COSO': 'hipc',
  'Hippel ST': 'hst',

  // StoneTracker: tune.spm + tune.sps sample bank. Without the folder here the .sps (not a
  // registered song extension) never reached the index, /modland/list did not show it, and the
  // online load fetched the song without its bank.
  'Stonetracker': 'spm',

  // TFMX variants (prefix-style: mdat.songname / smpl.songname)
  'TFMX': 'tfmx',
  'TFMX ST': 'mdst',

  // Future Composer variants
  'Future Composer 1.3': 'fc13',
  'Future Composer 1.4': 'fc14',
  'Future Composer BSI': 'bsi',

  // SIDMon / SoundMon
  'SidMon 1': 'sid1',
  'SidMon 2': 'sid2',
  'BP SoundMon 2': 'bp',
  'BP SoundMon 3': 'bp3',

  // Named composers / programmers
  'Ben Daglish': 'bd',
  'Ben Daglish SID': 'bds',
  'Dave Lowe': 'dl',
  'Dave Lowe New': 'dln',
  'David Hanney': 'dh',
  'David Whittaker': 'dw',
  'Dirk Bialluch': 'tpu',
  'Fred Gray': 'gray',
  'Howie Davies': 'hd',
  'Jason Brooke': 'jcb',
  'Jason Page': 'jp',
  'Jason Page Old': 'jp',
  'Jeroen Tel': 'jt',
  'Jesper Olsen': 'jo',
  'Janko Mrsic-Flogel': 'jmf',
  'Kim Christensen': 'kim',
  'Kris Hatlelid': 'kh',
  'Mark Cooksey': 'mc',
  'Mark Cooksey Old': 'mco',
  'Martin Walker': 'avp',
  'Mike Davies': 'md',
  'Paul Robotham': 'dat',
  'Paul Shields': 'ps',
  'Paul Summers': 'snk',
  'Paul Tonge': 'pat',
  'Peter Verswyvelen': 'pvp',
  'Pierre Adane Packer': 'pap',
  'Rob Hubbard': 'rh',
  'Rob Hubbard ST': 'rho',
  'Richard Joseph': 'rjp',
  'Ron Klaren': 'rk',
  'Sean Connolly': 'scn',
  'Sean Conran': 'scr',
  'Steve Barrett': 'sb',
  'Steve Turner': 'jpo',
  'Thomas Hermann': 'thm',
  'Tim Follin': 'tf',
  'Wally Beben': 'wb',
  'Major Tom': 'hn',
  'Anders Oland': 'hot',
  'Andrew Parton': 'bye',
  'Ashley Hogg': 'ash',
  'Darius Zendeh': 'dz',

  // Tracker/editor formats
  'FredMon': 'fred',
  'Sonic Arranger': 'sa',
  'JamCracker': 'jam',
  'Images Music System': 'ims',
  'Quadra Composer': 'emod',
  'ChipTracker': 'kris',
  'Pumatracker': 'puma',
  'TCB Tracker': 'tcb',
  'Pretracker': 'prt',
  'SynTracker': 'synmod',
  'Fashion Tracker': 'ex',
  'Time Tracker': 'tmk',
  'Tomy Tracker': 'sg',
  'Mark II': 'mkii',
  'Leggless Music Editor': 'lme',
  'Music Assembler': 'ma',
  'Music Editor': 'ml',

  // Synthesizer / sound system formats
  'Beathoven Synthesizer': 'bss',
  'Dynamic Synthesizer': 'dns',
  'Voodoo Supreme Synthesizer': 'vss',
  'Synth Dream': 'sdr',
  'Synth Pack': 'osp',
  'Professional Sound Artists': 'psa',
  'Sound Master': 'sm',
  'Sound Control': 'sc',
  'Sound Images': 'tw',
  'Sound Programming Language': 'spl',
  'SoundFX': 'sfx',
  'SoundFactory': 'psf',
  'SoundPlayer': 'sjs',
  'MultiMedia Sound': 'mms',
  'IFF-SMUS': 'smus',

  // Delta Music
  'Delta Music': 'dm1',
  'Delta Music 2': 'dm2',

  // Digital Mugician
  'Digital Mugician': 'dmu',
  'Digital Mugician 2': 'dmu2',

  // MusicMaker
  'MusicMaker V8': 'mm8',

  // Game-specific / studio formats
  'Art And Magic': 'aam',
  'Art Of Noise': 'aon',
  'Audio Sculpture': 'adsc',
  'Core Design': 'core',
  'Cinemaware': 'cin',
  'EarAche': 'ea',
  'Forgotten Worlds': 'fw',
  'GlueMon': 'glue',
  'GMC': 'gmc',
  'Infogrames': 'dum',
  'SCUMM': 'scumm',
  'Silmarils': 'mok',
  'Riff Raff': 'riff',
  'Maximum Effect': 'max',
  'Maniacs Of Noise': 'mon',
  'Desire': 'dsr',
  'Digital Sonix And Chrome': 'dsc',
  'Digital Sound Studio': 'dss',

  // Electronic Music System
  'Electronic Music System': 'ems',
  'Electronic Music System v6': 'emsv6',

  // InStereo
  'InStereo!': 'is',
  'InStereo! 2.0': 'is20',

  // Packer / system formats
  'Magnetic Fields Packer': 'mfp',
  'NovoTrade Packer': 'ntp',
  'Mosh Packer': 'mosh',
  'Nick Pelling Packer': 'npp',
  'Titanics Packer': 'tits',
  'Alcatraz Packer': 'alp',
  'Blade Packer': 'uds',
  'Speedy A1 System': 'sas',
  'Speedy System': 'ss',
  'Future Player': 'fp',
  'SUN-Tronic': 'sun',
  'Tronic': 'trc',
  'UFO': 'ufo',
  'AMOS': 'abk',
  'CustomMade': 'cust',
  'Delitracker Custom': 'custom',
  'Actionamics': 'ast',
  'AProSys': 'aps',
  'AM Composer': 'amc',
  'MMDC': 'mmdc',

  // Quartet variants
  'Quartet': 'qpa',
  'Quartet PSG': 'sqt',
  'Quartet ST': 'qts',

  // Special FX
  'Special FX': 'jd',
  'Special FX ST': 'doda',

  // YM / Sierra
  'YM-2149': 'ym',
  'Sierra AGI': 'agi',

  // Medley
  'Medley': 'mso',
};


// Line format: <filesize>\t<Format>/<Author>/<filename>
export const LINE_REGEX = /^\d+\t([^/]+)\/([^/]+)\/(.+)$/;

export interface ParsedEntry {
  format: string;
  author: string;
  filename: string;
  fullPath: string; // pub/modules/<Format>/<Author>/<filename>
  extension: string;
}

export function parseAllmodsLine(line: string): ParsedEntry | null {
  const match = line.match(LINE_REGEX);
  if (!match) return null;

  const [, format, author, filename] = match;
  const lowerFilename = filename.toLowerCase();
  const mappedExt = PLAYABLE_FORMATS[format];
  if (!mappedExt && !isSupportedFormat(lowerFilename)) return null;

  const ext = mappedExt ?? path.extname(lowerFilename).slice(1);
  if (!ext) return null;

  return {
    format,
    author,
    filename,
    fullPath: `pub/modules/${format}/${author}/${filename}`,
    extension: ext,
  };
}
