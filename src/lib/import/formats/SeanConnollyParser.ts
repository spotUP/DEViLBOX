/**
 * SeanConnollyParser.ts — Sean Connolly EMS format native stub parser
 *
 * Sean Connolly's Amiga music uses the EMS (Electronic Music System) format,
 * versions V3.01, V3.18, and V5.xx (4 voices). The format is a self-contained
 * 68k binary with the player and music data fused into one executable, with an
 * embedded text header at the beginning of the file.
 *
 * Detection:
 *   The file begins with one or more BRA.L/BRA.W (branch) instructions:
 *     0x60 0x00 xx xx  — BRA.W (any 2-byte displacement)
 *   Followed immediately by a readable text block that includes the song title
 *   and composer credit (e.g. "Surf Ninjas music & player by Sean Connolly.").
 *   The text is null-terminated and may span several hundred bytes.
 *
 * UADE eagleplayer prefix: scn.*
 *
 * Pattern data is not extractable from the compiled binary without deep reverse
 * engineering of the EMS format's data structures. This parser creates a metadata
 * stub with the correct song title (extracted from the embedded text header) and
 * four placeholder instruments representing the four EMS voices.
 * Audio is always delegated to UADE classic streaming.
 *
 * References:
 *   docs/formats/Replayers/eagleplayers/Sean Connolly/EP_SConnolly.readme
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Return true if the buffer looks like a Sean Connolly EMS module.
 *
 * Heuristic: starts with BRA.L (0x60 0x00) followed within the first 0x20 bytes
 * by readable ASCII text (the embedded title/credit block).
 */
export function isSeanConnollyFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 0x30) return false;
  // Must start with BRA.W (0x60 0x00) — the first branch to the player init
  if (buf[0] !== 0x60 || buf[1] !== 0x00) return false;
  // Within the first 0x30 bytes there should be readable ASCII text
  // (the embedded song description / credits block)
  let hasText = false;
  for (let i = 4; i < 0x30 && i < buf.length; i++) {
    if (buf[i] >= 0x20 && buf[i] <= 0x7E) { hasText = true; break; }
  }
  return hasText;
}

// ── Title extraction ──────────────────────────────────────────────────────────

/**
 * Extract the song title from the embedded text header.
 *
 * The EMS binary starts with several BRA instructions (0x60 0x00 xx xx each),
 * followed by the embedded text block. The text typically reads:
 *   "<song> music & player by Sean Connolly. (C) '93 Creative Edge."
 * We extract everything up to the first period or newline as the title.
 */
function extractTitle(buf: Uint8Array, fallback: string): string {
  // Find the start of a readable text block (skip branch instructions at the top).
  // The EMS binary starts with multiple BRA.W instructions (0x60 0x00 xx xx each).
  // 0x60 is the ASCII backtick which is printable, so we need at least 6 consecutive
  // printable chars to distinguish real text from stray instruction bytes.
  let textStart = -1;
  for (let i = 2; i < Math.min(0x40, buf.length); i++) {
    if (buf[i] < 0x20 || buf[i] > 0x7E) continue;
    // Measure run length from here
    let runLen = 0;
    while (i + runLen < buf.length && buf[i + runLen] >= 0x20 && buf[i + runLen] <= 0x7E) runLen++;
    if (runLen >= 6) { textStart = i; break; }
  }
  if (textStart < 0) return fallback;

  // Read until NUL, newline, or end of readable block
  let raw = '';
  for (let i = textStart; i < Math.min(textStart + 512, buf.length); i++) {
    const c = buf[i];
    if (c === 0) break;
    raw += String.fromCharCode(c);
  }
  raw = raw.trim();
  if (!raw) return fallback;

  // Try to extract just the song title before "music", "Music", or " by "
  const musicIdx = raw.toLowerCase().indexOf(' music');
  if (musicIdx > 2) return raw.slice(0, musicIdx).trim();

  // Fallback: first sentence (up to first period or newline)
  const dotIdx = raw.indexOf('.');
  if (dotIdx > 2) return raw.slice(0, dotIdx).trim();

  return raw.slice(0, 64).trim() || fallback;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Sean Connolly EMS module into a TrackerSong.
 *
 * Extracts the embedded song title and creates a 4-voice placeholder TrackerSong.
 * Audio is always delegated to UADE classic streaming via injectUADE: true.
 *
 * @param buffer   Raw file bytes
 * @param filename Original filename (used as fallback title)
 */
export function parseSeanConnollyFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSeanConnollyFormat(buf)) throw new Error('Not a Sean Connolly EMS module');

  const NUM_CHANNELS = 4;
  const NUM_INSTRUMENTS = 4;

  // ── Module name ─────────────────────────────────────────────────────────────
  const baseName   = (filename.split('/').pop() ?? filename).replace(/^scn\./i, '').replace(/\.scn$/i, '');
  const songTitle  = extractTitle(buf, baseName);

  // ── Instruments ─────────────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = Array.from({ length: NUM_INSTRUMENTS }, (_, i) => ({
    id:        i + 1,
    name:      `Voice ${i + 1}`,
    type:      'synth' as const,
    synthType: 'Synth' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig));

  // ── Single placeholder pattern ───────────────────────────────────────────────
  const ROWS = 64;
  const emptyRow = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

  const pattern = {
    id:     'pattern-0',
    name:   'Pattern 0',
    length: ROWS,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Voice ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color:        null,
      rows:         Array.from({ length: ROWS }, emptyRow),
    })),
    importMetadata: {
      sourceFormat:            'MOD' as const,
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    1,
      originalInstrumentCount: NUM_INSTRUMENTS,
    },
  };

  return {
    name:            `${songTitle} [Sean Connolly EMS]`,
    format:          'MOD' as TrackerFormat,
    patterns:        [pattern],
    instruments,
    songPositions:   [0],
    songLength:      1,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
