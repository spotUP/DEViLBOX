/**
 * SamplePackLoader - Utility for loading sample packs from directories or ZIP files
 */

import JSZip from 'jszip';
import type { SamplePack, SampleInfo, SampleCategory } from '@typedefs/samplePack';

// Known category folder names (case-insensitive)
const CATEGORY_MAPPINGS: Record<string, SampleCategory> = {
  kicks: 'kicks',
  kick: 'kicks',
  bd: 'kicks',
  bassdrum: 'kicks',
  'bass drum': 'kicks',
  snares: 'snares',
  snare: 'snares',
  sd: 'snares',
  hihats: 'hihats',
  hihat: 'hihats',
  'hi-hats': 'hihats',
  'hi-hat': 'hihats',
  hh: 'hihats',
  claps: 'claps',
  clap: 'claps',
  cp: 'claps',
  percussion: 'percussion',
  perc: 'percussion',
  fx: 'fx',
  effects: 'fx',
  sfx: 'fx',
  bass: 'bass',
  leads: 'leads',
  lead: 'leads',
  pads: 'pads',
  pad: 'pads',
  loops: 'loops',
  loop: 'loops',
  vocals: 'vocals',
  vocal: 'vocals',
  vox: 'vocals',
  toms: 'percussion',
  tom: 'percussion',
  cymbals: 'hihats',
  cymbal: 'hihats',
  rides: 'hihats',
  ride: 'hihats',
  crash: 'hihats',
  open: 'hihats',
  closed: 'hihats',
  oh: 'hihats',
  ch: 'hihats',
};

// Audio file extensions
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.aiff', '.aif'];

/**
 * Check if a file is an audio file
 */
function isAudioFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Map folder name to category
 */
function folderToCategory(folderName: string): SampleCategory {
  const normalized = folderName.toLowerCase().trim();
  return CATEGORY_MAPPINGS[normalized] || 'other';
}

/**
 * Clean up filename for display
 */
function cleanSampleName(filename: string): string {
  const nameWithoutExt = filename.replace(/\.(wav|mp3|ogg|flac|aiff|aif)$/i, '');
  return nameWithoutExt
    .replace(/^(BD|SD|CH|OH|CYM|BB|FX|TOM|CLAP|CLAVE|CONGA|COW|BELL|BONGO|RIM|SHAKE|SNAP|TABLA|TAMB|LAZ)_?/i, '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || nameWithoutExt;
}

/**
 * Load sample pack from a directory (File[] from webkitdirectory input)
 */
export async function loadSamplePackFromDirectory(files: FileList): Promise<SamplePack> {
  const samples: Record<SampleCategory, SampleInfo[]> = {
    kicks: [], snares: [], hihats: [], claps: [], percussion: [],
    fx: [], bass: [], leads: [], pads: [], loops: [], vocals: [], other: [],
  };

  let packName = 'Uploaded Pack';
  let coverImage: string | undefined;
  const categories = new Set<SampleCategory>();

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');

    // Get pack name from root folder
    if (parts.length > 0 && packName === 'Uploaded Pack') {
      packName = parts[0];
    }

    // Handle cover image
    if (file.name.toLowerCase() === 'cover.png' || file.name.toLowerCase() === 'cover.jpg') {
      coverImage = URL.createObjectURL(file);
      continue;
    }

    // Skip non-audio files
    if (!isAudioFile(file.name)) continue;

    // Determine category from folder structure
    let category: SampleCategory = 'other';
    if (parts.length >= 2) {
      // packName/category/sample.wav or packName/sample.wav
      const categoryFolder = parts.length >= 3 ? parts[parts.length - 2] : parts[1];
      category = folderToCategory(categoryFolder);
    }

    // Create blob URL for the sample
    const url = URL.createObjectURL(file);

    const sampleInfo: SampleInfo = {
      filename: file.name,
      name: cleanSampleName(file.name),
      category,
      url,
    };

    samples[category].push(sampleInfo);
    categories.add(category);
  }

  // Calculate total count
  const sampleCount = Object.values(samples).reduce((sum, arr) => sum + arr.length, 0);

  return {
    id: `user-${Date.now()}`,
    name: packName,
    author: 'User Upload',
    description: `User-uploaded sample pack with ${sampleCount} samples`,
    coverImage,
    basePath: '',
    categories: Array.from(categories).filter(cat => samples[cat].length > 0),
    samples,
    sampleCount,
    isUserUploaded: true,
  };
}

/**
 * Load sample pack from a ZIP file
 */
export async function loadSamplePackFromZip(file: File): Promise<SamplePack> {
  const samples: Record<SampleCategory, SampleInfo[]> = {
    kicks: [], snares: [], hihats: [], claps: [], percussion: [],
    fx: [], bass: [], leads: [], pads: [], loops: [], vocals: [], other: [],
  };

  const packName = file.name.replace(/\.zip$/i, '');
  let coverImage: string | undefined;
  const categories = new Set<SampleCategory>();

  // Load and parse ZIP
  const zip = await JSZip.loadAsync(file);

  // Process each file in the ZIP
  const entries = Object.entries(zip.files);
  for (const [path, zipEntry] of entries) {
    if (zipEntry.dir) continue;

    const parts = path.split('/').filter(p => p.length > 0);
    const filename = parts[parts.length - 1];

    // Handle cover image
    if (filename.toLowerCase() === 'cover.png' || filename.toLowerCase() === 'cover.jpg') {
      const blob = await zipEntry.async('blob');
      coverImage = URL.createObjectURL(blob);
      continue;
    }

    // Skip non-audio files
    if (!isAudioFile(filename)) continue;

    // Determine category from folder structure
    let category: SampleCategory = 'other';
    if (parts.length >= 2) {
      const categoryFolder = parts[parts.length - 2];
      category = folderToCategory(categoryFolder);
    }

    // Extract file and create blob URL
    const blob = await zipEntry.async('blob');
    const url = URL.createObjectURL(blob);

    const sampleInfo: SampleInfo = {
      filename,
      name: cleanSampleName(filename),
      category,
      url,
    };

    samples[category].push(sampleInfo);
    categories.add(category);
  }

  // Calculate total count
  const sampleCount = Object.values(samples).reduce((sum, arr) => sum + arr.length, 0);

  return {
    id: `user-${Date.now()}`,
    name: packName,
    author: 'User Upload',
    description: `User-uploaded sample pack with ${sampleCount} samples`,
    coverImage,
    basePath: '',
    categories: Array.from(categories).filter(cat => samples[cat].length > 0),
    samples,
    sampleCount,
    isUserUploaded: true,
  };
}
