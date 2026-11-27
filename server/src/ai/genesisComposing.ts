// Single source for "what effect commands reach the Sega Genesis / Mega Drive chips" (YM2612 FM + SN76489 PSG) in a
// tracker-made song. Feeds the get_mcp_help topic "genesis-composing" and docs/formats/genesis-composing.md
// (kept equal by src/engine/furnace-dispatch/__tests__/genesisComposing.test.ts).
import { FurnaceDispatchPlatform } from '../../../src/engine/furnace-dispatch/platforms';
import { buildFurnaceComposingDoc, type FurnaceComposingChip } from './furnaceChipComposing';

export const GENESIS_COMPOSING_TOPIC = 'genesis-composing';

export const GENESIS_CHIPS: readonly FurnaceComposingChip[] = [
  { name: 'YM2612 (FM, 6 channels)', synthType: 'FurnaceOPN', platform: FurnaceDispatchPlatform.GENESIS, textPlatform: FurnaceDispatchPlatform.YM2612 },
  { name: 'SN76489 (PSG: 3 square, 1 noise)', synthType: 'FurnacePSG', platform: FurnaceDispatchPlatform.SMS },
];

export const GENESIS_COMPOSING_DOC = buildFurnaceComposingDoc('Sega Genesis / Mega Drive', GENESIS_CHIPS);
