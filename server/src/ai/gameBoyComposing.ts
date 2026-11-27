// Single source for "what effect commands reach the Game Boy chip" (LR35902 APU) in a tracker-made song.
// Feeds the get_mcp_help topic "game-boy-composing" and docs/formats/game-boy-composing.md
// (kept equal by src/engine/furnace-dispatch/__tests__/gameBoyComposing.test.ts).
import { FurnaceDispatchPlatform } from '../../../src/engine/furnace-dispatch/platforms';
import { buildFurnaceComposingDoc, type FurnaceComposingChip } from './furnaceChipComposing';

export const GAME_BOY_COMPOSING_TOPIC = 'game-boy-composing';

export const GAME_BOY_CHIPS: readonly FurnaceComposingChip[] = [
  { name: 'Game Boy APU (2 pulse, 1 wavetable, 1 noise)', synthType: 'FurnaceGB', platform: FurnaceDispatchPlatform.GB },
];

export const GAME_BOY_COMPOSING_DOC = buildFurnaceComposingDoc('Game Boy', GAME_BOY_CHIPS);
