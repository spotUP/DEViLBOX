/**
 * Audio file detection and utility helpers for DJ mode.
 */

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.aif', '.aiff', '.opus', '.wma',
]);

/**
 * Check if a filename is a recognized audio file format.
 */
export function isAudioFile(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * Get a human-readable format name from extension.
 */
export function getAudioFormatName(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.mp3': return 'MP3';
    case '.wav': return 'WAV';
    case '.flac': return 'FLAC';
    case '.ogg': return 'OGG Vorbis';
    case '.aac': return 'AAC';
    case '.m4a': return 'AAC/M4A';
    case '.aif': case '.aiff': return 'AIFF';
    case '.opus': return 'Opus';
    case '.wma': return 'WMA';
    default: return 'Audio';
  }
}

/**
 * Format seconds as MM:SS.
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds as MM:SS.ms (with centiseconds).
 */
export function formatTimePrecise(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}
