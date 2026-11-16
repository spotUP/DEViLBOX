// Audio-RAM budget of the Terrific Audio Driver (SNES): one calculation for the export and the Memory Composition view.
// The driver size is read from the vendored driver's own memory map, never copied.
import memmap from '../../../../tad-wasm/audio-driver/src/common-memmap.inc?raw';

export const TAD_AUDIO_RAM_BYTES = 65536;
/** Smallest song and echo buffer the TAD compiler reserves next to the common data (tad-compiler "MAX_COMMON_DATA_SIZE"). */
const TAD_MIN_SONG_BYTES = 128;
const TAD_MIN_ECHO_BYTES = 256;
/** Bytes per echo delay step (16 ms). */
export const SNES_ECHO_BYTES_PER_STEP = 2048;

function driverBytes(src: string): number {
  // `COMMON_DATA_ADDR = $1200 - 24`: the common data starts where the resident driver ends.
  const m = /^COMMON_DATA_ADDR\s*=\s*\$([0-9a-fA-F]+)\s*(?:-\s*(\d+))?/m.exec(src);
  if (!m) throw new Error('COMMON_DATA_ADDR not found in common-memmap.inc');
  return parseInt(m[1], 16) - Number(m[2] ?? 0);
}
/** Resident TAD driver: 4584 bytes. */
export const TAD_DRIVER_BYTES = driverBytes(memmap);
/** Most the common data (samples, header, directory, instruments) may use: 60568 bytes. */
export const TAD_MAX_COMMON_DATA_BYTES = TAD_AUDIO_RAM_BYTES - TAD_DRIVER_BYTES - TAD_MIN_SONG_BYTES - TAD_MIN_ECHO_BYTES;

export interface TadAudioRamParts {
  /** Common data: samples + header + directory + instruments. */
  commonBytes: number;
  /** Largest song's data. */
  songBytes: number;
  /** Echo buffer; null when the compiler did not report it. */
  echoBytes: number | null;
}

export interface TadAudioRamRow { id: 'driver' | 'common' | 'song' | 'echo' | 'free'; label: string; bytes: number }

export interface TadAudioRamBudget {
  rows: TadAudioRamRow[];
  usedBytes: number;
  /** Bytes past 64 KB (0 when it fits). */
  overBytes: number;
  /** Bytes the common data is past its own cap. */
  commonOverBytes: number;
  over: boolean;
}

export function tadAudioRamBudget(p: TadAudioRamParts): TadAudioRamBudget {
  const echo = p.echoBytes ?? 0;
  const usedBytes = TAD_DRIVER_BYTES + p.commonBytes + p.songBytes + echo;
  const rows: TadAudioRamRow[] = [
    { id: 'driver', label: 'TAD driver', bytes: TAD_DRIVER_BYTES },
    { id: 'common', label: 'Common data (samples and instruments)', bytes: p.commonBytes },
    { id: 'song', label: 'Song data', bytes: p.songBytes },
    { id: 'echo', label: 'Echo buffer', bytes: echo },
    { id: 'free', label: 'Free space', bytes: Math.max(0, TAD_AUDIO_RAM_BYTES - usedBytes) },
  ];
  const commonOverBytes = Math.max(0, p.commonBytes - TAD_MAX_COMMON_DATA_BYTES);
  const overBytes = Math.max(0, usedBytes - TAD_AUDIO_RAM_BYTES);
  return { rows, usedBytes, overBytes, commonOverBytes, over: overBytes > 0 || commonOverBytes > 0 };
}

/** The compiler's failure log ("common data (samples + sfx): N bytes", "song_data: N bytes", "echo buffer: N bytes"). */
export function tadAudioRamFromLog(log: string): TadAudioRamParts | null {
  const n = (re: RegExp) => { const m = re.exec(log); return m ? Number(m[1]) : null; };
  const commonBytes = n(/common data[^:]*:\s*(\d+) bytes/), songBytes = n(/song_data:\s*(\d+) bytes/);
  return commonBytes === null || songBytes === null ? null : { commonBytes, songBytes, echoBytes: n(/echo buffer:\s*(\d+) bytes/) };
}

/** One sentence naming the overshoot, for toasts, the export dialog and the README. */
export function tadAudioRamWarning(b: TadAudioRamBudget): string | null {
  if (!b.over) return null;
  const parts = [b.overBytes > 0 && `${b.overBytes} bytes past the ${TAD_AUDIO_RAM_BYTES} byte Audio-RAM`, b.commonOverBytes > 0 && `common data ${b.commonOverBytes} bytes past its ${TAD_MAX_COMMON_DATA_BYTES} byte limit`].filter(Boolean);
  return `Over the SNES Audio-RAM budget: ${parts.join('; ')}.`;
}
