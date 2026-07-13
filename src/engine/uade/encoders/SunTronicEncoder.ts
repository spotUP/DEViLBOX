/**
 * SunTronicEncoder — registers the SunTronic V1.3 variable-length encoder.
 *
 * SunTronic V1.3 "Delirium" modules (.src/.pc) are 2-hunk AmigaOS executables
 * whose score is a per-(position, voice) command BYTE STREAM (notes, instrument
 * selects, 0x8B-0x9C commands, 0x00 row terminators — see SUN_CMD_ARGC). The
 * parser decodes each deduplicated track block into one carrier cell per stream
 * item (cutoff = item length, period/pan/resonance = exact source bytes) and
 * exposes a UADEVariablePatternLayout with blockRows/blockRawBytes.
 *
 * The encoder itself lives in SunTronicV13.ts (single source of truth for the
 * V1.3 byte layout, kept free of runtime imports so tools/suntronic-re/ can
 * import it directly); this module only performs the registry side-effect so
 * the round-trip harness and the live chip-RAM rewrite path can find it.
 *
 * Raw-rip SunTronic modules (.sun/.tsm, headerless 68k player code) have NO
 * layout at all — they are honest play-only stubs, never round-tripped.
 */

import { registerVariableEncoder } from '../UADEPatternEncoder';
import { sunTronicV13Encoder } from '@/lib/import/formats/SunTronicV13';

registerVariableEncoder(sunTronicV13Encoder);

export { sunTronicV13Encoder };
