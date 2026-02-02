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
// Image file extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Check if a file is an audio file
 */
function isAudioFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return AUDIO_EXTENSIONS.includes(ext);
}

/**
 * Check if a file is an image file
 */
function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if an image filename is likely a cover art
 */
function isLikelyCover(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.includes('cover') || 
         lower.includes('folder') || 
         lower.includes('front') || 
         lower.includes('artwork');
}

/**
 * Check if a file is a system or hidden file
 */
function isSystemFile(filename: string, path: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower === '.ds_store' || 
    lower === 'thumbs.db' || 
    lower.startsWith('._') || 
    path.includes('__MACOSX') ||
    filename.startsWith('.')
  );
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
  console.group('[SamplePackLoader] Loading directory...');
  console.log(`[SamplePackLoader] Total files received: ${files.length}`);
  
  const samples: Record<SampleCategory, SampleInfo[]> = {
    kicks: [], snares: [], hihats: [], claps: [], percussion: [],
    fx: [], bass: [], leads: [], pads: [], loops: [], vocals: [], other: [],
  };

  let packName = '';
  let coverImage: string | undefined;
  let potentialCovers: { file: File, priority: number }[] = [];
  const categories = new Set<SampleCategory>();

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = file.webkitRelativePath || file.name;
    
    if (isSystemFile(file.name, path)) {
      // console.log(`[SamplePackLoader] Skipping system file: ${path}`);
      continue;
    }

    const parts = path.split('/').filter(p => p.length > 0);
    const filename = parts[parts.length - 1];

    // Get pack name from root folder if possible
    if (parts.length > 1 && !packName) {
      packName = parts[0];
      console.log(`[SamplePackLoader] Detected pack name: ${packName}`);
    }

    // Handle potential cover image
    if (isImageFile(filename)) {
      const priority = isLikelyCover(filename) ? 2 : (parts.length <= 2 ? 1 : 0);
      console.log(`[SamplePackLoader] Found potential cover: ${filename} (priority ${priority})`);
      potentialCovers.push({ file, priority });
      continue;
    }

    // Skip non-audio files
    if (!isAudioFile(filename)) {
      // console.log(`[SamplePackLoader] Skipping non-audio: ${filename}`);
      continue;
    }

    // Determine category from folder structure
    let category: SampleCategory = 'other';
    if (parts.length >= 2) {
      // packName/category/sample.wav or packName/sample.wav
      const categoryFolder = parts.length >= 3 ? parts[parts.length - 2] : parts[1];
      category = folderToCategory(categoryFolder);
    }

    // Create blob URL for the sample
    try {
      const url = URL.createObjectURL(file);

      const sampleInfo: SampleInfo = {
        filename,
        name: cleanSampleName(filename),
        category,
        url,
      };

      samples[category].push(sampleInfo);
      categories.add(category);
    } catch (e) {
      console.error(`[SamplePackLoader] Failed to create blob URL for ${filename}:`, e);
    }
  }

  // Fallback pack name
  if (!packName) packName = 'Uploaded Pack';

  // Select best cover image
  if (potentialCovers.length > 0) {
    potentialCovers.sort((a, b) => b.priority - a.priority);
    try {
      coverImage = URL.createObjectURL(potentialCovers[0].file);
      console.log(`[SamplePackLoader] Selected cover: ${potentialCovers[0].file.name}`);
    } catch (e) {
      console.error('[SamplePackLoader] Failed to create cover blob URL:', e);
    }
  }

  // Calculate total count
  const sampleCount = Object.values(samples).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[SamplePackLoader] Successfully processed ${sampleCount} samples.`);
  console.groupEnd();

  if (sampleCount === 0) {
    throw new Error('No audio files found in the directory.');
  }

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
  console.group(`[SamplePackLoader] Loading ZIP: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  
  const samples: Record<SampleCategory, SampleInfo[]> = {
    kicks: [], snares: [], hihats: [], claps: [], percussion: [],
    fx: [], bass: [], leads: [], pads: [], loops: [], vocals: [], other: [],
  };

  let packName = file.name.replace(/\.zip$/i, '');
  let coverImage: string | undefined;
  let potentialCovers: { path: string, filename: string, priority: number }[] = [];
  const categories = new Set<SampleCategory>();

  try {
    // Load and parse ZIP
    console.log('[SamplePackLoader] Starting JSZip.loadAsync...');
    const zip = await JSZip.loadAsync(file);
    console.log('[SamplePackLoader] JSZip load complete.');

    // Process each file in the ZIP
    const entries = Object.entries(zip.files);
    console.log(`[SamplePackLoader] ZIP contains ${entries.length} entries.`);

    let entryCount = 0;
    for (const [path, zipEntry] of entries) {
      if (zipEntry.dir) continue;

      const parts = path.split('/').filter(p => p.length > 0);
      if (parts.length === 0) continue;
      
      const filename = parts[parts.length - 1];

      if (isSystemFile(filename, path)) continue;

      // Handle potential cover image
      if (isImageFile(filename)) {
        const priority = isLikelyCover(filename) ? 2 : (parts.length <= 2 ? 1 : 0);
        console.log(`[SamplePackLoader] Found ZIP cover candidate: ${path} (priority ${priority})`);
        potentialCovers.push({ path, filename, priority });
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
      try {
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
        entryCount++;
        
        if (entryCount % 50 === 0) {
          console.log(`[SamplePackLoader] Processed ${entryCount} audio files...`);
        }
      } catch (err) {
        console.error(`[SamplePackLoader] Failed to extract ${path}:`, err);
      }
    }

    // Select best cover image
    if (potentialCovers.length > 0) {
      potentialCovers.sort((a, b) => b.priority - a.priority);
      const bestCover = potentialCovers[0];
      const zipEntry = zip.files[bestCover.path];
      if (zipEntry) {
        try {
          const blob = await zipEntry.async('blob');
          coverImage = URL.createObjectURL(blob);
          console.log(`[SamplePackLoader] Extracted cover from ZIP: ${bestCover.path}`);
        } catch (e) {
          console.error('[SamplePackLoader] Failed to extract cover from ZIP:', e);
        }
      }
    }

    // Calculate total count
    const sampleCount = Object.values(samples).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[SamplePackLoader] ZIP processing complete. Total samples: ${sampleCount}`);
    console.groupEnd();

    if (sampleCount === 0) {
      throw new Error('No audio files found in the ZIP.');
    }

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
  } catch (error) {
    console.error('[SamplePackLoader] ZIP load error:', error);
    console.groupEnd();
    throw error;
  }
}
