// Single source for "what effect commands reach the NES-family chips": generated from the same Furnace sysDef.cpp
// strings the editor's effect picker uses (FURNACE_EFFECT_TEXT), so the help topic cannot drift from the editor.
// effTyp is Furnace's own effect number (10xy is effTyp 0x10).
import { FURNACE_EFFECT_TEXT } from '../../../src/engine/furnace-dispatch/furnaceEffectTable.gen';
import { FurnaceDispatchPlatform } from '../../../src/engine/furnace-dispatch/platforms';

export const NES_COMPOSING_TOPIC = 'nes-composing';

const CHIPS = [
  { name: '2A03 (NES: pulse 1, pulse 2, triangle, noise, DPCM)', id: FurnaceDispatchPlatform.NES },
  { name: 'VRC6 (pulse, pulse, saw)', id: FurnaceDispatchPlatform.VRC6 },
  { name: 'MMC5 (pulse, pulse, PCM)', id: FurnaceDispatchPlatform.MMC5 },
  { name: 'FDS (wavetable with modulation)', id: FurnaceDispatchPlatform.FDS },
  { name: 'N163 (wavetable, up to 8 channels)', id: FurnaceDispatchPlatform.N163 },
  { name: 'VRC7 (OPLL FM)', id: FurnaceDispatchPlatform.VRC7 },
] as const;

function chipSection(id: number): string {
  const t = FURNACE_EFFECT_TEXT[id];
  if (!t) return '- (no chip effects)';
  const lines = [...Object.entries(t.effect), ...Object.entries(t.post), ...Object.entries(t.pre)].map(([n, text]) => `- effTyp ${n}: ${text}`);
  return lines.length ? lines.join('\n') : '- (no chip effects)';
}

export const NES_COMPOSING_DOC = `# Composing NES-family songs with effect commands

Effects are written as effTyp (Furnace effect number, the two hex digits of the code) and eff (the parameter byte, or x and y nibbles). Volume is Cxx (effTyp 12), arpeggio 0xy, slides 1xx to 4xx, Fxx speed; these work on every chip. Each chip below lists its own codes, taken from Furnace's own effect text.

${CHIPS.map((c) => `## ${c.name}\n${chipSection(c.id)}`).join('\n\n')}
`;
