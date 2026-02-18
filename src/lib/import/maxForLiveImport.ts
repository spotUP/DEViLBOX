/**
 * Max for Live Sample Import
 *
 * Import samples from Max for Live device folders and libraries.
 * Supports:
 * - Scanning M4L device folders for samples
 * - Parsing sample metadata (root note, loop points)
 * - Creating DEViLBOX sample packs from M4L libraries
 */

import type { SamplePack, SampleInfo, SampleCategory } from '@typedefs/samplePack';

export interface MaxForLiveSample {
  name: string;
  path: string;
  buffer: AudioBuffer;
  rootNote?: string;      // e.g., "C4"
  loopStart?: number;     // In samples
  loopEnd?: number;       // In samples
  loopEnabled?: boolean;
}

export interface MaxForLiveDevice {
  name: string;
  path: string;
  samples: MaxForLiveSample[];
  presets?: Record<string, any>;
}

/**
 * Parse root note from filename
 * Common patterns:
 * - "kick_C2.wav"
 * - "bass-C#3.wav"
 * - "snare_D4.aif"
 * - "sample_60.wav" (MIDI note number)
 */
export function parseRootNoteFromFilename(filename: string): string | null {
  // Remove extension
  const name = filename.replace(/\.(wav|aif|aiff|mp3|ogg|flac)$/i, '');

  // Pattern 1: Note name (C, C#, Db, D, etc.) + octave (0-9)
  const noteMatch = name.match(/([A-G][#b]?)(\d)/i);
  if (noteMatch) {
    const note = noteMatch[1].toUpperCase();
    const octave = noteMatch[2];
    return `${note}${octave}`;
  }

  // Pattern 2: MIDI note number (0-127)
  const midiMatch = name.match(/\b(\d{1,3})\b/);
  if (midiMatch) {
    const midi = parseInt(midiMatch[1]);
    if (midi >= 0 && midi <= 127) {
      return midiNoteToNoteName(midi);
    }
  }

  return null;
}

/**
 * Convert MIDI note number to note name
 * 60 = C4, 61 = C#4, etc.
 */
export function midiNoteToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}${octave}`;
}

/**
 * Categorize sample based on filename
 * Common M4L sample categories:
 * - Kicks
 * - Snares
 * - Hats (hi-hat, closed hat, open hat)
 * - Percussion (clap, rim, etc.)
 * - Bass
 * - Lead
 * - Pad
 * - FX
 */
export function categorizeSample(filename: string): SampleCategory {
  const lower = filename.toLowerCase();

  // Drums
  if (lower.includes('kick') || lower.includes('bd') || lower.includes('bassdrum')) {
    return 'kicks';
  }
  if (lower.includes('snare') || lower.includes('sd')) {
    return 'snares';
  }
  if (lower.includes('hat') || lower.includes('hh') || lower.includes('hihat')) {
    return 'hats';
  }
  if (lower.includes('clap') || lower.includes('snap') || lower.includes('rim') ||
      lower.includes('perc') || lower.includes('shaker') || lower.includes('conga')) {
    return 'percussion';
  }
  if (lower.includes('cymbal') || lower.includes('crash') || lower.includes('ride')) {
    return 'cymbals';
  }

  // Melodic
  if (lower.includes('bass')) {
    return 'bass';
  }
  if (lower.includes('lead') || lower.includes('synth')) {
    return 'synths';
  }
  if (lower.includes('pad') || lower.includes('string') || lower.includes('choir')) {
    return 'pads';
  }
  if (lower.includes('piano') || lower.includes('key') || lower.includes('organ')) {
    return 'keys';
  }

  // FX
  if (lower.includes('fx') || lower.includes('sfx') || lower.includes('riser') ||
      lower.includes('sweep') || lower.includes('noise')) {
    return 'fx';
  }

  // Vocals
  if (lower.includes('vocal') || lower.includes('voice') || lower.includes('vox')) {
    return 'vocals';
  }

  // Default to loops
  return 'loops';
}

/**
 * Load audio file and create AudioBuffer
 */
export async function loadAudioFile(file: File): Promise<AudioBuffer> {
  const audioContext = new AudioContext();
  const arrayBuffer = await file.arrayBuffer();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch (error) {
    throw new Error(`Failed to decode audio file ${file.name}: ${error}`);
  }
}

/**
 * Scan directory for audio files
 * Supports drag-and-drop of M4L device folders
 */
export async function scanDirectoryForSamples(
  items: FileSystemEntry[]
): Promise<File[]> {
  const audioFiles: File[] = [];
  const validExtensions = ['.wav', '.aif', '.aiff', '.mp3', '.ogg', '.flac'];

  async function traverseEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });

      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
      if (validExtensions.includes(ext)) {
        audioFiles.push(file);
      }
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();

      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

      for (const childEntry of entries) {
        await traverseEntry(childEntry);
      }
    }
  }

  for (const item of items) {
    await traverseEntry(item);
  }

  return audioFiles;
}

/**
 * Create SamplePack from M4L device folder
 */
export async function createSamplePackFromDirectory(
  files: File[],
  packName: string
): Promise<SamplePack> {
  // Group samples by category
  const categorized = new Map<SampleCategory, SampleInfo[]>();

  for (const file of files) {
    try {
      // Load audio buffer
      const buffer = await loadAudioFile(file);

      // Parse metadata
      const rootNote = parseRootNoteFromFilename(file.name);
      const category = categorizeSample(file.name);

      // Create data URL
      const dataUrl = await fileToDataUrl(file);

      // Create sample info
      const sampleInfo: SampleInfo = {
        name: file.name.replace(/\.[^.]+$/, ''), // Remove extension
        url: dataUrl,
        category,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        rootNote: rootNote || undefined,
        tags: [],
      };

      // Add to category
      if (!categorized.has(category)) {
        categorized.set(category, []);
      }
      categorized.get(category)!.push(sampleInfo);
    } catch (error) {
      console.warn(`Failed to load sample ${file.name}:`, error);
    }
  }

  // Convert to SamplePack format
  const samples: Record<SampleCategory, SampleInfo[]> = {} as any;
  const categories: SampleCategory[] = [];

  categorized.forEach((sampleList, category) => {
    samples[category] = sampleList;
    categories.push(category);
  });

  return {
    id: `m4l_${Date.now()}`,
    name: packName,
    categories,
    samples,
    totalSamples: files.length,
    isUserPack: true,
  };
}

/**
 * Convert File to Data URL
 */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Detect if directory is a Max for Live device folder
 * M4L devices typically have:
 * - .amxd file (device file)
 * - samples/ or audio/ folder
 * - presets/ folder (optional)
 */
export function isMaxForLiveDevice(files: File[]): boolean {
  const hasAmxd = files.some(f => f.name.endsWith('.amxd'));
  const hasSamplesFolder = files.some(f =>
    f.webkitRelativePath?.toLowerCase().includes('/samples/') ||
    f.webkitRelativePath?.toLowerCase().includes('/audio/')
  );

  return hasAmxd || hasSamplesFolder;
}

/**
 * Extract device name from folder structure
 */
export function extractDeviceName(files: File[]): string {
  // Try to get from .amxd filename
  const amxdFile = files.find(f => f.name.endsWith('.amxd'));
  if (amxdFile) {
    return amxdFile.name.replace('.amxd', '');
  }

  // Try to get from folder name
  const firstFile = files[0];
  if (firstFile?.webkitRelativePath) {
    const parts = firstFile.webkitRelativePath.split('/');
    return parts[0] || 'M4L Device';
  }

  return 'M4L Device';
}
