// Shared builder for the "private effect block" help topics: turns a format's own effect table
// (the *EffectGlyphs.ts the grid renderer imports) into rows and text. Nothing is retyped here: names,
// effTyp numbers and glyphs come from the imported tables; the parameter meaning comes from a table only
// where the editor has one (Tony Williams, JayTrax), else the row says it is not documented.
export const PARAM_NOT_DOCUMENTED = 'parameter meaning not documented';

export interface EffectBlockRow {
  effTyp: number;
  glyph: string;
  name: string;
  /** Parameter meaning from a table, or PARAM_NOT_DOCUMENTED. */
  parameter: string;
}

export interface EffectBlock {
  /** Registry format ids whose parser or grid writes this block. */
  formats: readonly string[];
  title: string;
  /** Other formats that import the same glyph file (shared ids), if any. */
  alsoUsedBy?: readonly string[];
  rows: readonly EffectBlockRow[];
}

/** 'portaLines' -> 'porta lines'. */
export const wordsOf = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

/** Rows from an `as const` id object (name = its key) and the glyph map. */
export function rowsFromFx(fx: Record<string, number>, glyphs: Record<number, string>, meanings?: (effTyp: number) => string | undefined): EffectBlockRow[] {
  return Object.entries(fx)
    .filter(([, v]) => typeof v === 'number')
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => ({ effTyp: v, glyph: glyphs[v] ?? '?', name: wordsOf(k), parameter: meanings?.(v) ?? PARAM_NOT_DOCUMENTED }));
}

/** Rows from a names array in id order starting at `base`. */
export function rowsFromNames(names: readonly string[], base: number, glyphs: Record<number, string>, meanings?: (effTyp: number) => string | undefined): EffectBlockRow[] {
  return names.map((n, i) => ({ effTyp: base + i, glyph: glyphs[base + i] ?? '?', name: n, parameter: meanings?.(base + i) ?? PARAM_NOT_DOCUMENTED }));
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

export function renderBlock(b: EffectBlock): string {
  const lines = b.rows.map((r) => `- effTyp ${r.effTyp} (${hex(r.effTyp)}), grid ${r.glyph}xx: ${r.name}. Parameter: ${r.parameter}.`);
  const also = b.alsoUsedBy?.length ? `\nAlso written by: ${b.alsoUsedBy.join(', ')} (same ids).` : '';
  return `### ${b.title}\n\nFormats: ${b.formats.join(', ')}.${also}\n\n${lines.join('\n')}\n`;
}

export function renderBlocks(blocks: readonly EffectBlock[]): string {
  return blocks.map(renderBlock).join('\n');
}
