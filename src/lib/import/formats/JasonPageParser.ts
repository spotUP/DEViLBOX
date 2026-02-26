/**
 * JasonPageParser.ts — Jason Page Amiga music format native parser
 *
 * Jason Page composed music for many classic Amiga games including Gods,
 * Assassin, and Robocop 3. The player was written by Jason Page and adapted
 * by Wanted Team for EaglePlayer / DeliTracker. The module file is a compiled
 * 68k Amiga executable combining player code and music data.
 *
 * The format comes in three sub-variants, distinguished by binary signatures:
 *
 *   Format 1 (Old)
 *     - word[0] == 0x0002
 *     - bit 0 of byte[3] clear
 *     - word at offset 4: D1, must be even and non-zero
 *     - word at offset D1: must be 0x0000
 *     - Loop 23 iterations over words at offsets 2, 4, ..., 46:
 *         each word must be non-zero, bit 0 of low byte must be clear,
 *         and word must be > D0 (word at 0x30)
 *     - word at offset 0x2E: D0; A0 += D0
 *     - (A0) & 0x0F00 == 0x0F00  → old format (1)
 *
 *   Format 2 (New)
 *     - Same structural checks as Format 1
 *     - (A0) & 0x0F00 != 0x0F00  → new format (2)
 *
 *   Format 3 (Raw binary)
 *     - word[0] == 0x0000
 *     - dword at 0x80 == 0x00000000
 *     - dword at 0x84 == 0x00000CBE
 *     - dword at 0xCB6 == 0x000308BE
 *     - dword at 0xCBA == 0x000309BE
 *     - file must be at least 0xCBE bytes
 *
 * UADE eagleplayer.conf: JasonPage  prefixes=jpn,jpnd,jp
 * MI_MaxSamples = 32 (from InfoBuffer in the assembly source)
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/JasonPage/src/Jason Page_v5.s
 *   (DTP_Check2 routine, line 198; EP_SampleInit, line 115; InfoBuffer, line 282)
 * Reference parsers: JeroenTelParser.ts, MarkCookseyParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum file length required for Format 3 detection. */
const FORMAT3_MIN_SIZE = 0xcbe;

/**
 * Maximum sample count as declared in InfoBuffer:
 *   dc.l  MI_MaxSamples, 32
 */
const MAX_SAMPLES = 32;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Sub-variant detection ───────────────────────────────────────────────────

/**
 * Jason Page format variant. 1 = old, 2 = new, 3 = raw binary.
 */
type JasonPageVariant = 1 | 2 | 3;

/**
 * Check for Format 3 (raw binary).
 *
 * Mirrors the CheckAnother / Found branch in DTP_Check2 (line 241):
 *   tst.w   (A0)            ; must be 0x0000
 *   tst.l   $80(A0)         ; must be 0x00000000
 *   cmpi.l  #$00000CBE, $84(A0)
 *   cmpi.l  #$000308BE, $CB6(A0)
 *   cmpi.l  #$000309BE, $CBA(A0)
 */
function isFormat3(buf: Uint8Array): boolean {
  if (buf.length < FORMAT3_MIN_SIZE) return false;
  if (u16BE(buf, 0) !== 0x0000) return false;
  if (u32BE(buf, 0x80) !== 0x00000000) return false;
  if (u32BE(buf, 0x84) !== 0x00000cbe) return false;
  if (u32BE(buf, 0xcb6) !== 0x000308be) return false;
  if (u32BE(buf, 0xcba) !== 0x000309be) return false;
  return true;
}

/**
 * Check for Format 1 (old) or Format 2 (new).
 *
 * Mirrors the first branch in DTP_Check2 (line 198):
 *   cmpi.w  #2, (A0)            ; word[0] must be 0x0002
 *   btst    #0, 3(A0)           ; bit 0 of byte[3] must be clear
 *   move.w  4(A0), D1           ; D1 = word at offset 4
 *   btst    #0, D1              ; D1 must be even
 *   tst.w   0(A0,D1.W)          ; word at offset D1 must be zero
 *   move.w  $30(A0), D0         ; D0 = word at 0x30 (comparison baseline)
 *   lea     2(A0), A1           ; A1 = fileStart + 2
 *   moveq   #$16, D1            ; D1 = 22 (dbra → 23 iterations)
 *   NextWord loop (23 iterations):
 *     tst.w   (A1)              ; current word must be non-zero
 *     btst    #0, 1(A1)         ; bit 0 of low byte must be clear
 *     cmp.w   (A1)+, D0         ; D0 must be > word (ble → fail); advance A1 by 2
 *
 * After the loop, sub-variant is determined:
 *   move.w  $2E(A0), D0         ; D0 = word at 0x2E
 *   add.l   D0, A0              ; A0 = fileStart + D0
 *   move.w  (A0), D0
 *   and.w   #$0F00, D0
 *   cmp.w   #$0F00, D0          ; == → old (Format 1), != → new (Format 2)
 *
 * Returns 1, 2, or null if the checks do not pass.
 */
function detectFormat12(buf: Uint8Array): 1 | 2 | null {
  // Minimum bytes needed: loop reads words at offsets 2..46 (46+2=48 bytes),
  // plus we need offset 0x30 (48 bytes), offset 0x2E, and then up to
  // fileStart + word[0x2E] + 2.  We gate on specific reads below.
  if (buf.length < 50) return null;

  // word[0] must be 0x0002
  if (u16BE(buf, 0) !== 0x0002) return null;

  // bit 0 of byte[3] must be clear
  if ((buf[3] & 0x01) !== 0) return null;

  // D1 = word at offset 4; must be even and non-zero
  const d1Initial = u16BE(buf, 4);
  if (d1Initial === 0) return null;
  if ((d1Initial & 0x01) !== 0) return null;

  // word at offset d1Initial must be 0x0000
  if (d1Initial + 1 >= buf.length) return null;
  if (u16BE(buf, d1Initial) !== 0x0000) return null;

  // D0 = word at 0x30 (comparison baseline)
  if (0x30 + 1 >= buf.length) return null;
  const d0Baseline = u16BE(buf, 0x30);

  // NextWord loop: 23 iterations over words at offsets 2, 4, 6, ..., 46
  // A1 starts at offset 2; each iteration reads (A1)+ advancing by 2
  for (let i = 0; i < 23; i++) {
    const off = 2 + i * 2;
    if (off + 1 >= buf.length) return null;

    const word = u16BE(buf, off);

    // tst.w (A1) — must be non-zero
    if (word === 0x0000) return null;

    // btst #0, 1(A1) — bit 0 of low byte must be clear
    if ((buf[off + 1] & 0x01) !== 0) return null;

    // cmp.w (A1)+, D0 / ble CheckAnother — D0 must be strictly greater than word
    if (d0Baseline <= word) return null;
  }

  // Determine old vs new sub-variant
  // move.w $2E(A0), D0  →  D0 = word at offset 0x2E
  if (0x2e + 1 >= buf.length) return null;
  const disp = u16BE(buf, 0x2e);

  // add.l D0, A0  →  dest = fileStart + disp
  const dest = disp;
  if (dest + 1 >= buf.length) return null;

  const destWord = u16BE(buf, dest);

  // and.w #$0F00, D0 / cmp.w #$0F00, D0
  if ((destWord & 0x0f00) === 0x0f00) {
    return 1; // old format
  }
  return 2; // new format
}

/**
 * Detect the Jason Page sub-variant of the given buffer.
 *
 * Format 3 is tried first because its signature constants are highly specific
 * and unambiguous. Formats 1/2 are tried next.
 */
function detectVariant(buf: Uint8Array): JasonPageVariant | null {
  if (isFormat3(buf)) return 3;
  const f12 = detectFormat12(buf);
  if (f12 !== null) return f12;
  return null;
}

// ── Prefix helpers ──────────────────────────────────────────────────────────

/**
 * Return the basename of the path (last component after / or \).
 */
function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/**
 * Return true if `name` starts with a known Jason Page UADE prefix
 * (case-insensitive):  jpn.  jpnd.  jp.
 */
function hasJasonPagePrefix(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('jpn.') || lower.startsWith('jpnd.') || lower.startsWith('jp.');
}

/**
 * Strip the Jason Page prefix from a basename to derive the module title.
 */
function stripPrefix(name: string): string {
  return (
    name
      .replace(/^jpnd\./i, '')
      .replace(/^jpn\./i, '')
      .replace(/^jp\./i, '') || name
  );
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Jason Page format module.
 *
 * When `filename` is provided the basename is checked against the UADE prefixes
 * (jpn., jpnd., jp.). If a prefix does not match, detection returns false
 * immediately to avoid false positives from unrelated formats.
 *
 * The binary detection is always performed regardless of filename.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isJasonPageFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  if (filename !== undefined) {
    if (!hasJasonPagePrefix(basename(filename))) return false;
  }

  return detectVariant(buf) !== null;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Jason Page module file into a TrackerSong.
 *
 * Jason Page modules are compiled 68k Amiga executables; there is no public
 * specification of the internal layout beyond what the EaglePlayer detection
 * code reveals. This parser creates a metadata-only TrackerSong with up to 32
 * placeholder instruments (MI_MaxSamples from the assembly InfoBuffer).
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseJasonPageFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  const variant = detectVariant(buf);

  if (variant === null) {
    throw new Error('Not a Jason Page module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const base = basename(filename);
  const moduleName = stripPrefix(base) || base;

  // ── Variant label ─────────────────────────────────────────────────────────

  const variantLabel =
    variant === 1 ? 'Old (Format 1)' :
    variant === 2 ? 'New (Format 2)' :
                    'Raw (Format 3)';

  // ── Instrument placeholders ───────────────────────────────────────────────
  //
  // MI_MaxSamples = 32 (declared in InfoBuffer, line 282 of the assembly).
  // The exact count requires emulating the 68k player init routine to walk
  // internal data structures; we use the documented maximum as placeholders
  // so that the TrackerSong can represent any module in this format family.

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < MAX_SAMPLES; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Empty pattern (placeholder — UADE handles actual audio) ───────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: MAX_SAMPLES,
    },
  };

  return {
    name: `${moduleName} [Jason Page ${variantLabel}]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
