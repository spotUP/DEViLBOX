/**
 * DX7 patch library — curated, attributed .syx banks shipped in public/data/sysex/dx7/.
 *
 * The manifest lists each bank with its author/compiler, source URL, licence and voice names.
 * Bank bytes are parsed by dx7sysex.ts (the same parser the file import uses).
 * See public/data/sysex/ATTRIBUTION.md for the human-readable credits.
 */

export const DX7_LIBRARY_DIR = 'data/sysex/dx7/';

export interface DX7LibraryBank {
  collection?: string;
  file: string;
  name: string;
  author: string;
  source: string;
  licence: string;
  voiceCount: number;
  voices: string[];
}

export interface DX7LibraryManifest {
  version: number;
  banks: DX7LibraryBank[];
}

export interface DX7LibraryVoice {
  bank: DX7LibraryBank;
  index: number;
  name: string;
}

let manifestPromise: Promise<DX7LibraryManifest | null> | null = null;

function baseUrl(): string {
  return import.meta.env.BASE_URL || '/';
}

export function dx7LibraryUrl(file: string): string {
  return `${baseUrl()}${DX7_LIBRARY_DIR}${file}`;
}

/** Fetch (once) the library manifest. Null when it cannot be loaded. */
export function fetchDX7LibraryManifest(): Promise<DX7LibraryManifest | null> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const resp = await fetch(dx7LibraryUrl('manifest.json'));
        if (!resp.ok) return null;
        return (await resp.json()) as DX7LibraryManifest;
      } catch {
        return null;
      }
    })();
    manifestPromise.then(m => { if (!m) manifestPromise = null; });
  }
  return manifestPromise;
}

/** Fetch the raw bytes of one library bank. */
export async function fetchDX7LibraryBank(file: string): Promise<ArrayBuffer> {
  const resp = await fetch(dx7LibraryUrl(file));
  if (!resp.ok) throw new Error(`Failed to fetch DX7 library bank ${file}`);
  return resp.arrayBuffer();
}

/** Select value for one library voice: "<file>#<index>". */
export function dx7LibraryValue(file: string, index: number): string {
  return `${file}#${index}`;
}

export function parseDX7LibraryValue(value: string): { file: string; index: number } | null {
  const at = value.lastIndexOf('#');
  if (at < 0) return null;
  const index = Number(value.slice(at + 1));
  return Number.isInteger(index) && index >= 0 && index < 32 ? { file: value.slice(0, at), index } : null;
}

/** Voice names grouped by bank, in the shape CustomSelect takes (one group per bank). */
export function dx7LibrarySelectGroups(manifest: DX7LibraryManifest) {
  return manifest.banks.map(bank => ({
    label: bank.name,
    options: bank.voices.map((name, i) => ({
      value: dx7LibraryValue(bank.file, i),
      label: `${i + 1}. ${name}`,
    })),
  }));
}

export interface DX7LibraryMatch {
  bank: DX7LibraryBank;
  /** Voice indices (0..31) of the bank to list: all of them when the bank itself matches, else the voices that match. */
  voices: number[];
}

/**
 * The library narrowed by a filter box: every whitespace-separated word must appear (case-insensitive) in the bank
 * name, collection, author or voice name. A bank whose own text matches every word lists all its voices; otherwise only
 * the voices that match together with the bank text ("dexed bass" finds the bass voices of the Dexed banks).
 */
export function filterDX7Library(banks: readonly DX7LibraryBank[], query: string): DX7LibraryMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = (b: DX7LibraryBank) => b.voices.map((_, i) => i);
  if (words.length === 0) return banks.map(bank => ({ bank, voices: all(bank) }));
  const matches: DX7LibraryMatch[] = [];
  for (const bank of banks) {
    const bankText = `${bank.name} ${bank.collection ?? ''} ${bank.author}`.toLowerCase();
    if (words.every(w => bankText.includes(w))) { matches.push({ bank, voices: all(bank) }); continue; }
    const voices: number[] = [];
    bank.voices.forEach((name, i) => {
      const text = `${bankText} ${name.toLowerCase()}`;
      if (words.every(w => text.includes(w))) voices.push(i);
    });
    if (voices.length > 0) matches.push({ bank, voices });
  }
  return matches;
}
