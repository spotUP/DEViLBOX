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
  // StoneTracker: SPM.<tune> song + SPS.<tune> samples (Aminet stonefree2 ships both halves)
  'spm', 'sps',
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
  spm: ['sps'], sps: ['spm'],
  dns: ['smp'], sdr: ['smp', 'smp.set'], osp: ['smp.set'],
  jpn: ['smp'], jpnd: ['smp'], thm: ['smp'], mfp: ['smp'], sjs: ['smp'], max: ['smp'],
  mcr: ['mcs'], mcs: ['mcr'], midi: ['smpl'],
  sng: ['ins'], dum: ['ins'], '4v': ['set'],
  adsc: ['.as'], kh: ['songplay'], sci: ['patch.003'],
};

/**
 * Directory names that hold instruments or samples, never songs (shape 4).
 * A song index skips what sits in them even when no module beside them
 * claims it - orphaned `instr/` and `instruments/` copies in the corpus.
 */
export const SAMPLE_DIR_NAMES: ReadonlySet<string> = new Set(['instr', 'instruments', 'samples']);

/** Whether `relPath` (any depth, `/`-separated) passes through a sample directory. */
export function isInSampleDirectory(relPath: string): boolean {
  const parts = relPath.split('/');
  return parts.slice(0, -1).some((d) => SAMPLE_DIR_NAMES.has(d.toLowerCase()));
}

/**
 * Files that sit in a song directory but are not songs. The DefleMask corpus
 * holds only `.dmf` modules; its folders also carry wavetable (`.dmw`), FM
 * patch (`.fdm`) and archive (`.zip`) assets that no format claims. The song
 * index offered them as an undetected row ("deflemask / CrazySoundEnginer" =
 * four zips) and the jukebox could not load it (2026-10-06).
 * `relPath` is `/`-separated, relative to public/data/songs.
 */
export function isNonSongAsset(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  if (/\.(dmw|dmp)$/.test(lower)) return true;
  return lower.startsWith('deflemask/') && !lower.endsWith('.dmf');
}

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
  // Infogrames: the player asks for '<tune>.ins' and, missing it, for the
  // shared bank named without the tune's last letter - bob4e.dum loads
  // '/uade/bob4e.ins' then '/uade/bob4.ins' (Modland ships bob4.ins for the set).
  if (name.endsWith('.dum')) {
    const stem = name.slice(0, -4);
    if (!find(stem + '.ins') && stem.length > 1) {
      const shared = find(stem.slice(0, -1) + '.ins');
      if (shared) out.push(shared);
    }
  }
  if (name.endsWith('.sci')) {
    const patch = find(name.slice(0, 3) + 'patch.003');
    if (patch) out.push(patch);
  }
  // Wanted Team: both eagleplayers read their replay code from a file that
  // ships WITH the module, under one fixed name, and both readmes say so in
  // the same words — "must be called 'WantedTeam.bin' and must be stored in
  // the same directory as the module"
  // (uade-3.05/amigasrc/players/wanted_team/*/EP_*.readme).
  //
  // Named here and not in EXPECTED_PARTNER because that table's entries are
  // PREFIXES joined to the tune name; this one is a constant, like songplay.
  if (name.startsWith('jo.') || name.startsWith('pat.') ||
      name.endsWith('.jo') || name.endsWith('.pat')) {
    const wanted = find('wantedteam.bin');
    if (wanted) out.push(wanted);
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
        // Sonix names instruments freely: `.instr`, `.ss`, or no extension at
        // all (CREATION/Instruments/LEDchord). Anything else in there is
        // Workbench litter (`.info`).
        if (f.includes('.') && !/\.(instr|ss)$/i.test(f)) continue;
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
  // MusicMaker: the song `<tune>.sdata` keeps its instruments in `<tune>.i`
  // (unpacked) or `<tune>.ip` (packed). The player picks the codec by the
  // name it finds (MusicMaker4/8.asm Loadexternal: `.i` first, then `.ip`),
  // so the file keeps its own name: handing `.ip` bytes over as `.i` made the
  // player read packed codes as raw samples (moveback sounded wrong,
  // 2026-10-05). The editor's side files (`.ip.n` names, `.ip.l` list) belong
  // to the song too.
  const mm = /^(.*)\.sdata$/i.exec(moduleName);
  if (mm) {
    const stem = mm[1].toLowerCase();
    for (const n of listing.siblings) {
      const lower = n.toLowerCase();
      const own = lower === `${stem}.i` || lower === `${stem}.ip` || lower.startsWith(`${stem}.i.`) || lower.startsWith(`${stem}.ip.`);
      if (own && !companions.includes(n)) companions.push(n);
    }
  }
  // Paul Robotham: the player opens `<song>.SSD`; collections ship one shared
  // bank per game (`mdtest.ssd` beside every Dawn Patrol `.dat`). With exactly
  // one `.ssd` in the folder and no per-song one, register it under the name
  // the player asks for (2026-10-05).
  const pr = /^(.*)\.dat$/i.exec(moduleName);
  if (pr) {
    const asked = `${pr[1]}.SSD`;
    const own = listing.siblings.find((n) => n.toLowerCase() === asked.toLowerCase());
    const banks = listing.siblings.filter((n) => /\.ssd$/i.test(n));
    if (!own && banks.length === 1 && !companions.includes(asked)) { companions.push(asked); sources[asked] = banks[0]; }
  }
  // Euphony (FM Towns): the song's header names an FM voice bank (`<name>.fmb`)
  // and a PCM bank (`<name>.pmb`) the player opens beside it (eupplay.cpp).
  // The name lives in the file, not its name, so every bank in the folder
  // goes along and the player picks by the header (modland keeps one song
  // per folder with its banks: Euphony/Aya/Mondschein/ fmtone2.fmb piano.pmb).
  if (/\.eup$/i.test(moduleName)) {
    for (const n of listing.siblings) {
      if (/\.(fmb|pmb)$/i.test(n) && !companions.includes(n)) companions.push(n);
    }
  }
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

/**
 * The files in a listing that are COMPANIONS of another listed module, as
 * paths relative to the directory (`smpl.jaguar`, `instruments/Saxophone.ss`).
 *
 * A song index must not offer these as songs: the jukebox listed SMUS
 * instrument files and the `.ins` half of an Infogrames pair, and each one
 * "failed to load" (ledger F11, F12). A file is a companion when some other
 * module in the listing resolves it - unless the two claim each other (the
 * `.dum`/`.ins` pair does) and `keepAsModule(file)` says this one is a song
 * in its own right; the caller answers that from the format registry.
 */
export function companionFilesIn(listing: CompanionListing, keepAsModule: (name: string) => boolean = () => false): Set<string> {
  const claimedBy = new Map<string, Set<string>>();
  for (const module of listing.siblings) {
    const res = resolveCompanions(module, listing);
    for (const registered of res.companions) {
      // The file on disk is the read-from source when it differs (a shared `.ssd` as `<song>.SSD`).
      const c = res.sources[registered] ?? registered;
      if (lower(c) === lower(module)) continue;
      (claimedBy.get(c) ?? claimedBy.set(c, new Set()).get(c)!).add(module);
    }
  }
  const out = new Set<string>();
  for (const [file, claimants] of claimedBy) {
    const own = resolveCompanions(file, listing);
    const ownFiles = own.companions.map((c) => own.sources[c] ?? c);
    const mutual = listing.siblings.includes(file)
      && [...claimants].every((m) => ownFiles.includes(m));
    if (mutual && keepAsModule(file)) continue;
    out.add(file);
  }
  return out;
}


/**
 * Roles whose player cannot start without the partner file: UADE answers a
 * lone one with "file not found '/uade/SMP.<tune>'" / "'/uade/<tune>.ins'".
 * Only formats confirmed that way belong here; roles with a shared-bank
 * fallback or a single-file variant (TFMX `mdat`) stay out.
 */
export const PARTNER_REQUIRED_ROLES: ReadonlySet<string> = new Set(['jpn', 'jpnd', 'dum']);

/**
 * Files in a listing that cannot play because the other half is not there:
 *
 *   * a module of a PARTNER_REQUIRED_ROLES role with nothing resolved beside
 *     it (`jpn.virocop-14` with no `smp.virocop-14`, `bob4e.dum` with no
 *     `bob4e.ins`);
 *   * a StarTrekker `<module>.nt` whose `<module>` is not listed. The `.nt`
 *     holds synth data only; offered alone UADE says "Cannot play file".
 *
 * A song index must not offer these as songs (jukebox, 2026-10-06). The
 * partner is absent from the corpus, so no loader can supply it.
 */
export function partnerlessFilesIn(listing: CompanionListing): Set<string> {
  const out = new Set<string>();
  const names = new Set(listing.siblings.map(lower));
  for (const file of listing.siblings) {
    const { role } = splitName(file);
    if (role !== null && PARTNER_REQUIRED_ROLES.has(role)
      && resolveCompanions(file, listing).companions.length === 0) out.add(file);
    const owner = /^(.+)\.nt$/i.exec(file);
    if (owner && !names.has(lower(owner[1]))) out.add(file);
  }
  return out;
}
