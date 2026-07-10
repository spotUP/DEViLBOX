import { preProcess } from '../src/preprocess.js';

// Regression: struct-size LABELs must ignore fields inside inactive conditional
// blocks. MaxTrax's VoiceData wraps 3 APTR fields in `ifne FASTSOUND` (FASTSOUND=0),
// so voice_sizeof is 52 — NOT 64. collectPreConsts used to count the inactive
// fields, computing 64 (a power of two), which made the SCALE macro's
// `ifeq (\1&(\1-1))` power-of-2 test fire and emit NOTHING for
// `SCALE voice_sizeof,dN` — collapsing every voice index to 0 (all notes on ch0)
// and producing out-of-bounds pointer reads at render time.

const VOICE_STRUCT = `
FASTSOUND\tequ\t0
\tSTRUCTURE\tVoiceData,0
\tAPTR\tvoice_Channel
\tAPTR\tvoice_Patch
\tAPTR\tvoice_Envelope
\tLONG\tvoice_UniqueID
\tLONG\tvoice_LastTicks
\tLONG\tvoice_TicksLeft
\tLONG\tvoice_PortaTicks
\tLONG\tvoice_IncrVolume
\tLONG\tvoice_PeriodOffset
\tifne FASTSOUND
\tAPTR\tvoice_CurFastIOB
\tAPTR\tvoice_NextFastIOB
\tAPTR\tvoice_FastBuffer
\tendc
\tWORD\tvoice_EnvelopeLeft
\tWORD\tvoice_NoteVolume
\tWORD\tvoice_BaseVolume
\tWORD\tvoice_LastPeriod
\tBYTE\tvoice_BaseNote
\tBYTE\tvoice_EndNote
\tBYTE\tvoice_Number
\tBYTE\tvoice_Link
\tBYTE\tvoice_Priority
\tBYTE\tvoice_Status
\tBYTE\tvoice_Flags
\tBYTE\tvoice_LastVolume
\tLABEL\tvoice_sizeof
`;

const SCALE_MACRO = `
SCALE\t\tmacro
\tifeq\t(\\1&(\\1-1))
\tifeq\t\\1-2
\t\tadd.w\t\\2,\\2
\tendc
\tifeq\t\\1-4
\t\tadd.w\t\\2,\\2
\t\tadd.w\t\\2,\\2
\tendc
\tifeq\t\\1-8
\t\tlsl.w\t#3,\\2
\tendc
\tifeq\t\\1-16
\t\tlsl.w\t#4,\\2
\tendc
\tifeq\t\\1-32
\t\tlsl.w\t#5,\\2
\tendc
\telse
\t\tmulu.w\t#\\1,\\2
\tendc
\tendm
`;

test('struct-size LABEL ignores fields in inactive ifne block (voice_sizeof=52 not 64)', () => {
  const out = preProcess(VOICE_STRUCT);
  // voice_LastVolume is the last real byte field; sizeof follows it.
  expect(out).toMatch(/voice_Priority\s+equ\s+48/);
  expect(out).toMatch(/voice_Status\s+equ\s+49/);
  expect(out).toMatch(/voice_sizeof\s+equ\s+52/);
  // The inactive FASTSOUND fields must not appear at all.
  expect(out).not.toMatch(/voice_CurFastIOB/);
});

test('SCALE by a non-power-of-2 struct size emits mulu (not a dropped power-of-2 shift)', () => {
  const src = `${VOICE_STRUCT}${SCALE_MACRO}\nstart:\n\tSCALE\tvoice_sizeof,d2\n`;
  const out = preProcess(src);
  expect(out).toMatch(/mulu\.w\s+#voice_sizeof,d2/i);
  // Must NOT have silently emitted a shift/add or nothing.
  expect(out).not.toMatch(/add\.w\s+d2,d2/i);
  expect(out).not.toMatch(/lsl\.w/i);
});

// Regression: STRUCTURE fields annotated with C-style /* ... */ comments (as
// maxtrax.i does) must still parse. stripComment used to strip only `;` line
// comments, so `WORD mxtx_TotalScores /* total ... */` failed the field regex
// (which requires end-of-line after the label) and did NOT advance SOFFSET.
// The comment-less APTR func pointers (OpenFunc/ReadFunc/CloseFunc) then
// computed their EQU from a stale offset of 0, so mxtx_ReadFunc collapsed to 4
// — COLLIDING with mxtx_Flags (also 4). A BSET on mxtx_Flags (set when the
// song's velocity flag is on, e.g. darkseed) then overwrote the ReadFunc
// pointer, and the next indirect ReadFunc call read a garbage function pointer
// -> WASM "table index is out of bounds" at load -> the song was silent.
const MAXTRAX_INFO_STRUCT = `
\tSTRUCTURE\tMaxTraxInfo,0
\t\tWORD\tmxtx_TotalScores\t\t\t/* total number of scores\t*/
\t\tBYTE\tmxtx_Volume\t\t\t\t\t/* programmatic volume\t\t*/
\t\tBYTE\tmxtx_SyncValue\t\t\t\t/* last sync value\t\t\t*/
\t\tBYTE\tmxtx_Flags\t\t\t\t\t/* communication flags\t\t*/
\t\tBYTE\tmxtx_Changed\t\t\t\t/* set to 1 for change\t\t*/
\t\tAPTR\tmxtx_OpenFunc
\t\tAPTR\tmxtx_ReadFunc
\t\tAPTR\tmxtx_CloseFunc
\t\tSTRUCT\tmxtx_Priority,16\t\t\t; current priorities
\t\tLABEL\tmxtx_sizeof
`;

test('STRUCTURE fields with C-style /* */ comments advance the offset (mxtx_ReadFunc=10, no collision)', () => {
  const out = preProcess(MAXTRAX_INFO_STRUCT);
  // Byte fields precede the func pointers.
  expect(out).toMatch(/mxtx_Flags\s+equ\s+4/);
  // The three APTR func pointers must land AFTER the 6 header bytes, 4 apart.
  expect(out).toMatch(/mxtx_OpenFunc\s+equ\s+6/);
  expect(out).toMatch(/mxtx_ReadFunc\s+equ\s+10/);
  expect(out).toMatch(/mxtx_CloseFunc\s+equ\s+14/);
  expect(out).toMatch(/mxtx_Priority\s+equ\s+18/);
  expect(out).toMatch(/mxtx_sizeof\s+equ\s+34/);
  // The collision the bug produced: ReadFunc must NOT alias Flags at offset 4.
  expect(out).not.toMatch(/mxtx_ReadFunc\s+equ\s+4/);
  // Comment words must not leak in as spurious EQU symbols (number/scores/flags/…).
  expect(out).not.toMatch(/^\s*(number|scores|volume|sync|value|flags|change|for)\s+equ/im);
});
