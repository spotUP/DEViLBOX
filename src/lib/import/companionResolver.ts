/**
 * Which files beside a module belong WITH it.
 *
 * A two-file Amiga format is one module plus the file its player asks the
 * host for by name at init (DTP_ExtLoad — 42 of UADE's players). If that
 * file is absent the player dies in a way indistinguishable from "this
 * format is broken". DEViLBOX answered the question three different ways
 * depending on how the module arrived: a rich rule table in the MCP server,
 * a four-pair table in the file browser, nothing at all for a drag-drop.
 * Reported 2026-09-22 from a seven-song test: only TFMX loaded, and only when
 * both files were dropped by hand.
 *
 * This is the one answer. Pure over NAMES: the caller lists the directory
 * however it can (disk, manifest, server API, the files in a folder drop)
 * and fetches what comes back.
 *
 * Four shapes, in the order they are tried — tune-specific first:
 *
 *   1. shared stem, role first or last   mdat.<tune> + smpl.<tune>,
 *                                         dns.<tune> + smp.<tune>,
 *                                         <tune>.sng + <tune>.ins
 *   2. suffixed                           popelich-brutalo.adsc + …adsc.as
 *   3. named special cases                <base>.sdata, .kh + songplay,
 *                                         .sci + <3>patch.003
 *   4. sample subdirectories              instr/, Instruments/, Samples/
 *   5. shared bank                        smp.set — one file for every tune
 *                                         in the directory
 *
 * Two guards, each of which cost real time elsewhere (Up Rough, 2026-09-22):
 *
 *   * A companion never carries the module's own role. With `dns` not known
 *     as a role word the stem of `dns.starball title` collapsed to `dns`,
 *     every other dns.* SONG matched it, four unrelated tunes were embedded
 *     and the real sample bank left out. A confident wrong answer.
 *   * A shared bank is only shared when the tune has nothing of its own —
 *     `sdr.nobuddiesland end 2` owns `smp.nobuddiesland end 2` and must not
 *     take `smp.set`; `sdr.monsterbusiness 5` owns nothing and must.
 */

/**
 * Words that mark one half of a multi-file format rather than the tune.
 * Up Rough's set, plus every prefix and extension the MCP server's old rule
 * table knew. Lower case.
 */
export const ROLE_WORDS: ReadonlySet<string> = new Set([
  // TFMX
  'mdat', 'smpl', 'tfmx', 'tfx',
  // assorted trackers
  'sng', 'ins', 'instr', 'smp', 'samples', 'sdata', 'song', 'snd',
  // DynamicSynthesizer, SynthDream, SynthPack, AudioSculpture
  'dns', 'sdr', 'osp', 'adsc',
  // the server's prefix pairs
  'jpn', 'jpnd', 'thm', 'mfp', 'sjs', 'max', 'mcr', 'mcs', 'midi',
  // the server's extension pairs and suffixes
  'dum', '4v', 'set', 'kh', 'nt', 'l', 'n', 'sci',
]);

/**
 * What a module of a given role expects beside it. Used for the lone-file
 * prompt: "this is a TFMX module — also drop smpl.<tune>". A role that maps
 * to `smp.set` wants the shared bank; one that maps to `'.as'` wants its own
 * name plus that suffix.
 */
export const EXPECTED_PARTNER: Readonly<Record<string, string[]>> = {
  mdat: ['smpl'], smpl: ['mdat'], tfmx: ['smpl'], tfx: ['smpl'],
  dns: ['smp'], sdr: ['smp', 'smp.set'], osp: ['smp.set'],
  jpn: ['smp'], jpnd: ['smp'], thm: ['smp'], mfp: ['smp'], sjs: ['smp'], max: ['smp'],
  mcr: ['mcs'], mcs: ['mcr'], midi: ['smpl'],
  sng: ['ins'], dum: ['ins'], '4v': ['set'],
  adsc: ['.as'], kh: ['songplay'], sci: ['patch.003'],
};

/** The shared sample bank SynthDream and SynthPack keep per directory. */
export const SHARED_BANK = 'smp.set';

/**
 * Cap on SIBLING matches — a wrong stem can sweep a whole directory of other
 * songs, and sixteen is more than any two-file format wants.
 *
 * NOT applied to a sample subdirectory. Those files ARE the instrument set:
 * ZoundMonitor's Samples/ holds 51 files for six tunes, and a collector that
 * counted them staged the first sixteen alphabetically, which was usually
 * not the ones the song referenced — it died exactly like a missing
 * companion (Up Rough, 2026-09-22). A subdirectory is bounded only against
 * a pathological listing.
 */
export const MAX_COMPANIONS = 16;
export const MAX_SUBDIR_FILES = 512;

export interface CompanionListing {
  /** Basenames in the module's own directory. May include the module. */
  siblings: string[];
  /** Listings of subdirectories of the module's directory, keyed by the name as listed. */
  subdirs?: Record<string, string[]>;
  /** Basenames of a `Samples/` directory beside the module's DIRECTORY (ZoundMonitor keeps it one level up). */
  parentSamples?: string[];
}

export interface CompanionResolution {
  /**
   * Names to REGISTER, tune-specific first — the paths the 68k player will
   * open, relative to the module (`smpl.jaguar`, `instr/perc1.x`,
   * `Samples/electom`).
   */
  companions: string[];
  /**
   * Where to READ each one, relative to the module's directory, when that
   * differs from the registered name. ZoundMonitor's `Samples/` can sit
   * beside the song's DIRECTORY: registered as `Samples/electom` (what the
   * replayer opens), read from `../Samples/electom`.
   */
  sources: Record<string, string>;
  /** True when the shared bank was taken because the tune owns nothing. */
  usedSharedBank: boolean;
}

export interface NameParts {
  /** The part that identifies the TUNE. Lower case. */
  stem: string;
  /** The role word, if the name carries one. Lower case. */
  role: string | null;
}

/** Split a basename into the tune part and the role part. */
export function splitName(name: string): NameParts {
  const base = name.split('/').pop() ?? name;
  const dot = base.indexOf('.');
  if (dot < 0) return { stem: base.toLowerCase(), role: null };
  const head = base.slice(0, dot).toLowerCase();
  const tail = base.slice(dot + 1).toLowerCase();
  // role-first: mdat.jaguar
  if (ROLE_WORDS.has(head)) return { stem: tail, role: head };
  // role-last: jaguar.smpl
  if (ROLE_WORDS.has(tail)) return { stem: head, role: tail };
  const last = base.lastIndexOf('.');
  return { stem: base.slice(0, last).toLowerCase(), role: null };
}

/** The part that identifies the tune rather than the role. */
export function stemOf(name: string): string {
  return splitName(name).stem;
}

function lower(s: string): string { return s.toLowerCase(); }

/**
 * Shape 1: a sibling with the same stem and a DIFFERENT role word.
 * The candidate must carry a role word — two songs that merely share a name
 * (`foo.mod`, `foo.xm`) are not companions.
 */
function sharedStem(module: NameParts, moduleName: string, siblings: string[]): string[] {
  const out: string[] = [];
  for (const s of siblings) {
    if (lower(s) === lower(moduleName)) continue;
    if (lower(s) === SHARED_BANK) continue;   // shape 5, decided last
    const parts = splitName(s);
    if (parts.role === null) continue;
    if (parts.stem !== module.stem) continue;
    if (module.role !== null && parts.role === module.role) continue;   // guard 1
    out.push(s);
  }
  return out;
}

/** Shape 2: the module's own name plus another extension. */
function suffixed(moduleName: string, siblings: string[]): string[] {
  const prefix = lower(moduleName) + '.';
  return siblings.filter(s => lower(s) !== lower(moduleName) && lower(s).startsWith(prefix));
}

/** Shape 3: the named special cases the server carried. */
function specialCases(moduleName: string, siblings: string[]): string[] {
  const out: string[] = [];
  const name = lower(moduleName);
  const find = (want: string): string | undefined => siblings.find(s => lower(s) === want);
  const dot = name.lastIndexOf('.');
  if (dot > 0) {
    const sdata = find(name.slice(0, dot) + '.sdata');
    if (sdata && lower(sdata) !== name) out.push(sdata);
  }
  if (name.endsWith('.kh')) {
    const songplay = find('songplay');
    if (songplay) out.push(songplay);
  }
  if (name.endsWith('.sci')) {
    const patch = find(name.slice(0, 3) + 'patch.003');
    if (patch) out.push(patch);
  }
  return out;
}

/** Shape 4: sample subdirectories, relative paths preserved. */
function subdirectories(moduleName: string, listing: CompanionListing, sources: Record<string, string>): string[] {
  const out: string[] = [];
  const name = lower(moduleName);
  const subdirs = listing.subdirs ?? {};
  const dirNamed = (want: string): [string, string[]] | undefined => {
    for (const [dir, files] of Object.entries(subdirs)) {
      if (lower(dir) === want) return [dir, files];
    }
    return undefined;
  };
  // SunTronic keeps its instruments in instr/*.x; any module may own one.
  const instr = dirNamed('instr');
  if (instr) for (const f of instr[1]) if (f.endsWith('.x')) out.push(`${instr[0]}/${f}`);
  // Sonix / smus / tiny keep them in Instruments/.
  if (/\.(smus|snx|tiny)$|^(smus|snx|tiny)\./.test(name)) {
    const instruments = dirNamed('instruments');
    if (instruments) {
      for (const f of instruments[1]) {
        if (f.startsWith('.')) continue;
        if (!/\.(instr|ss)$/i.test(f)) continue;
        out.push(`${instruments[0]}/${f}`);
      }
    }
  }
  // ZoundMonitor .sng: Samples/ beside the song, or beside the song's directory.
  if (name.endsWith('.sng')) {
    const samples = dirNamed('samples');
    if (samples) {
      for (const f of samples[1]) if (!f.startsWith('.')) out.push(`${samples[0]}/${f}`);
    } else if (listing.parentSamples) {
      for (const f of listing.parentSamples) {
        if (f.startsWith('.')) continue;
        out.push(`Samples/${f}`);
        sources[`Samples/${f}`] = `../Samples/${f}`;
      }
    }
  }
  return out;
}

/**
 * Shape 5: the shared bank — only when the tune owns nothing (guard 2), and
 * only when no OTHER sibling carries the module's stem, which would mean a
 * tune-specific companion exists that the rules above failed to name.
 */
function sharedBank(module: NameParts, moduleName: string, siblings: string[], ownFound: boolean): string | null {
  if (ownFound) return null;
  if (lower(moduleName) === SHARED_BANK) return null;
  const bank = siblings.find(s => lower(s) === SHARED_BANK);
  if (!bank) return null;
  for (const s of siblings) {
    if (lower(s) === lower(moduleName) || lower(s) === SHARED_BANK) continue;
    if (splitName(s).stem === module.stem) return null;
  }
  return bank;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = lower(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** The companions a module should be registered with, tune-specific first. */
export function resolveCompanions(moduleName: string, listing: CompanionListing): CompanionResolution {
  const module = splitName(moduleName);
  const sources: Record<string, string> = {};
  const ownSiblings = dedupe([
    ...sharedStem(module, moduleName, listing.siblings),
    ...suffixed(moduleName, listing.siblings),
    ...specialCases(moduleName, listing.siblings),
  ]).slice(0, MAX_COMPANIONS);
  const ownSubdirs = dedupe(subdirectories(moduleName, listing, sources)).slice(0, MAX_SUBDIR_FILES);
  const own = dedupe([...ownSiblings, ...ownSubdirs]);
  const bank = sharedBank(module, moduleName, listing.siblings, own.length > 0);
  const companions = bank ? [...own, bank] : own;
  const kept = new Set(companions);
  for (const key of Object.keys(sources)) if (!kept.has(key)) delete sources[key];
  return { companions, sources, usedSharedBank: bank !== null };
}

/**
 * Turn a flat list of paths relative to the module (what a folder drop or a
 * recursive listing gives) into the listing the resolver reads: top-level
 * names as siblings, one level of subdirectories by name.
 */
export function listingFromRelativePaths(relativePaths: string[]): CompanionListing {
  const siblings: string[] = [];
  const subdirs: Record<string, string[]> = {};
  for (const rel of relativePaths) {
    const slash = rel.indexOf('/');
    if (slash < 0) { siblings.push(rel); continue; }
    const dir = rel.slice(0, slash);
    const rest = rel.slice(slash + 1);
    if (rest.includes('/')) continue;   // deeper than one level: no shape lives there
    (subdirs[dir] ??= []).push(rest);
  }
  return { siblings, subdirs };
}

/**
 * What a lone module's format is expected to want beside it — for the
 * prompt when a single file is dropped and nothing can be looked for.
 * Empty when the name carries no known role.
 */
export function expectedCompanionNames(moduleName: string): string[] {
  const { role } = splitName(moduleName);
  if (role === null) return [];
  const partners = EXPECTED_PARTNER[role];
  if (!partners) return [];
  const base = moduleName.split('/').pop() ?? moduleName;
  const roleFirst = lower(base).startsWith(role + '.');
  // Keep the tune's original casing for the prompt.
  const tune = roleFirst ? base.slice(role.length + 1) : base.slice(0, base.length - role.length - 1);
  return partners.map(p => {
    if (p === SHARED_BANK) return SHARED_BANK;
    if (p.startsWith('.')) return base + p;
    if (p === 'songplay') return 'songplay';
    if (p === 'patch.003') return base.slice(0, 3) + 'patch.003';
    return roleFirst ? `${p}.${tune}` : `${tune}.${p}`;
  });
}
