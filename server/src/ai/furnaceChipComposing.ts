// Shared builder for the per-family "what effect commands reach the chip" help topics of tracker-made songs on
// Furnace chips (genesis-composing, game-boy-composing). Every chip line comes from the same tables the live path
// reads, so a topic cannot drift from the engine:
//   cell effect -> TrackerReplayer.routeRowToChip -> TICK_STEPPED_EFFECTS (furnaceTick stepper) or
//   ToneEngine.applyFurnaceCellEffect -> FurnaceDispatchEngine.applyEffect -> FurnaceEffectRouter.routeEffect
//   -> standard switch (00 to 0D) or routePlatformEffect (furnaceEffectTableFor(platform): the platform's map or its STAND_INS chip's map, [] when absent).
// Imported .fur / .dmf songs play through Furnace's own sequencer instead, where every Furnace effect works.
import { FURNACE_EFFECT_TEXT } from '../../../src/engine/furnace-dispatch/furnaceEffectTable.gen';
import { furnaceEffectTableFor } from '../../../src/engine/furnace-dispatch/synthPlatforms';

export interface FurnaceComposingChip {
  /** Heading text: chip and channel kinds. */
  name: string;
  /** Synth type of the instrument the composer creates (create_instrument synthType). */
  synthType: string;
  /** Platform the synth addresses (SYNTH_TO_DISPATCH[synthType]). */
  platform: number;
  /** Platform whose Furnace effect text names this chip's codes, when the addressed platform has no text of its own (a compound system such as GENESIS). */
  textPlatform?: number;
}

/** Effects the furnaceTick stepper runs per tick (FurnaceTickEffects.ts:102 TICK_STEPPED_EFFECTS), plus 08 and 0C. */
export const FURNACE_STANDARD_EFFECTS = [
  { effTyp: 0x00, code: '0xy', does: 'Arpeggio (base, +x, +y semitones). E0xx sets the arpeggio speed in ticks.', stepped: true },
  { effTyp: 0x01, code: '1xx', does: 'Pitch slide up.', stepped: true },
  { effTyp: 0x02, code: '2xx', does: 'Pitch slide down.', stepped: true },
  { effTyp: 0x03, code: '3xx', does: 'Tone portamento to the note on the row.', stepped: true },
  { effTyp: 0x04, code: '4xy', does: 'Vibrato (x speed, y depth).', stepped: true },
  { effTyp: 0x05, code: '5xy', does: 'Vibrato plus volume slide.', stepped: true },
  { effTyp: 0x06, code: '6xy', does: 'Portamento plus volume slide.', stepped: true },
  { effTyp: 0x07, code: '7xy', does: 'Tremolo.', stepped: true },
  { effTyp: 0x0a, code: 'Axy', does: 'Volume slide (x up, y down).', stepped: true },
  { effTyp: 0xe1, code: 'E1xy', does: 'Note slide up (x speed, y semitones).', stepped: true },
  { effTyp: 0xe2, code: 'E2xy', does: 'Note slide down (x speed, y semitones).', stepped: true },
  { effTyp: 0xe5, code: 'E5xx', does: 'Fine pitch (80 is centre).', stepped: true },
  { effTyp: 0x08, code: '8xy', does: 'Panning (x left, y right, 0 to F).', stepped: false },
  { effTyp: 0x0c, code: 'Cxx', does: 'Volume 00 to 40 (hex), scaled to the chip maximum. The volume column works too.', stepped: false },
] as const;

/** Cell effects the tracker keeps for song flow (furnaceCellEffects.ts:13 TRACKER_OWNED_EFFECTS). */
export const FURNACE_SONG_EFFECTS = [
  { code: 'Fxx', does: 'Speed (01 to 1F) or BPM (20 to FF).' },
  { code: 'Bxx', does: 'Jump to order position xx.' },
  { code: 'Dxx', does: 'Break to row xx of the next pattern.' },
] as const;

/**
 * Furnace global effects with no tracker-cell path: not in TICK_STEPPED_EFFECTS, not in the router's standard
 * switch (FurnaceEffectRouter.ts:111-181), so routePlatformEffect drops them unless the chip table has the code.
 */
export const FURNACE_GLOBAL_CANDIDATES = [
  { effTyp: 0x09, code: '09xx', name: 'Groove / speed 1' },
  { effTyp: 0xe3, code: 'E3xx', name: 'Vibrato shape' },
  { effTyp: 0xe4, code: 'E4xx', name: 'Vibrato range' },
  { effTyp: 0xe8, code: 'E8xy', name: 'Delayed legato up' },
  { effTyp: 0xe9, code: 'E9xy', name: 'Delayed legato down' },
  { effTyp: 0xea, code: 'EAxx', name: 'Legato' },
  { effTyp: 0xeb, code: 'EBxx', name: 'Sample bank' },
  { effTyp: 0xec, code: 'ECxx', name: 'Note cut' },
  { effTyp: 0xed, code: 'EDxx', name: 'Note delay' },
  { effTyp: 0xee, code: 'EExx', name: 'External command' },
  { effTyp: 0xef, code: 'EFxx', name: 'Global pitch' },
  { effTyp: 0xf0, code: 'F0xx', name: 'Set BPM' },
  { effTyp: 0xf1, code: 'F1xx', name: 'Single tick pitch up' },
  { effTyp: 0xf2, code: 'F2xx', name: 'Single tick pitch down' },
  { effTyp: 0xf3, code: 'F3xx', name: 'Fine volume slide up' },
  { effTyp: 0xf4, code: 'F4xx', name: 'Fine volume slide down' },
  { effTyp: 0xf8, code: 'F8xx', name: 'Single tick volume up' },
  { effTyp: 0xf9, code: 'F9xx', name: 'Single tick volume down' },
  { effTyp: 0xfa, code: 'FAxx', name: 'Fast volume slide' },
  { effTyp: 0xfc, code: 'FCxx', name: 'Note release' },
  { effTyp: 0xff, code: 'FFxx', name: 'Stop song' },
] as const;

const hex = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');

/** Chip codes that really reach the chip: keys of the addressed platform's table, any map. */
export function wiredChipCodes(platform: number): number[] {
  const t = furnaceEffectTableFor(platform);
  if (!t) return [];
  return [...new Set([...Object.keys(t.pre), ...Object.keys(t.effect), ...Object.keys(t.post)].map(Number))].sort((a, b) => a - b);
}

function effectText(platform: number, code: number): string {
  const t = FURNACE_EFFECT_TEXT[platform];
  return t?.effect[code] ?? t?.post[code] ?? t?.pre[code] ?? '(no text)';
}

function chipSection(c: FurnaceComposingChip): string {
  const head = `## ${c.name}\nInstrument synthType ${c.synthType}, platform ${c.platform}.`;
  const wired = wiredChipCodes(c.platform);
  const textId = c.textPlatform ?? c.platform;
  if (wired.length) return `${head}\n${wired.map((n) => `- effTyp ${n} (${hex(n)}xx): ${effectText(textId, n)}`).join('\n')}`;
  const t = FURNACE_EFFECT_TEXT[textId];
  const codes = t ? [...new Set([...Object.keys(t.pre), ...Object.keys(t.effect), ...Object.keys(t.post)].map(Number))].sort((a, b) => a - b) : [];
  return `${head}\nNOT WIRED: platform ${c.platform} has no FURNACE_EFFECT_TABLE entry and no STAND_INS chip with one, so FurnaceEffectRouter.routePlatformEffect returns [] (src/engine/furnace-dispatch/FurnaceEffectRouter.ts:205). These Furnace codes of the chip are dropped in a tracker-made song; only the standard effects above reach it:\n${codes.map((n) => `- effTyp ${n} (${hex(n)}xx): ${effectText(textId, n)}`).join('\n') || '- (none)'}`;
}

function notWired(chips: readonly FurnaceComposingChip[]): string {
  return FURNACE_GLOBAL_CANDIDATES.map((g) => {
    const on = chips.filter((c) => wiredChipCodes(c.platform).includes(g.effTyp)).map((c) => c.synthType);
    return on.length ? `- ${g.code} (${g.name}): only reaches ${on.join(', ')} through the chip table.` : `- ${g.code} (${g.name}, effTyp ${g.effTyp}): dropped.`;
  }).join('\n');
}

export function buildFurnaceComposingDoc(title: string, chips: readonly FurnaceComposingChip[]): string {
  return `# Composing ${title} songs with effect commands

Applies to tracker-made songs with Furnace instruments. Imported .fur and .dmf songs play through Furnace's own sequencer, where every Furnace effect works. Write effects as effTyp (the Furnace effect number, two hex digits of the code) and eff (the parameter byte, or x and y nibbles). A parameter of 0 reuses the last parameter of that effect on the channel.

## Effects that reach every chip below
${FURNACE_STANDARD_EFFECTS.map((e) => `- ${e.code} (effTyp ${e.effTyp}): ${e.does}`).join('\n')}

## Effects that steer the song only
${FURNACE_SONG_EFFECTS.map((e) => `- ${e.code}: ${e.does}`).join('\n')}

${chips.map(chipSection).join('\n\n')}

## Furnace effects that do NOT reach the chip from a tracker cell
Not in TICK_STEPPED_EFFECTS (src/engine/furnace-dispatch/FurnaceTickEffects.ts:102), not in the router's standard switch (src/engine/furnace-dispatch/FurnaceEffectRouter.ts:107-188); routePlatformEffect drops them (FurnaceEffectRouter.ts:216-217) unless the chip table has the code.
${notWired(chips)}

## What to do instead
- Note cut: put a note-off on the row, or Cxx with 00.
- Note delay: place the note one row later at a higher speed.
- Fine slides: use 1xx, 2xx or Axy with small parameters.
`;
}
