/**
 * UnifiedFileLoader.ts
 * 
 * Single source of truth for loading ALL file formats in DEViLBOX.
 * Used by both file dialog (FileBrowser) and drag-and-drop (GlobalDragDropHandler).
 * 
 * Eliminates code duplication and ensures consistent behavior across load methods.
 */

import type { OpenOrigin } from '@/lib/song/openSong';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { notify } from '@/stores/useNotificationStore';
import { isSupportedFormat } from '@/lib/import/FormatRegistry';
import type { UADEMetadata } from '@engine/uade/UADEEngine';
import { suppressFormatChecks, restoreFormatChecks } from '@/lib/formatCompatibility';


export interface FileLoadOptions {
  /** Whether to preserve existing instruments (for additive imports like TD-3 in some UX flows) */
  preserveInstruments?: boolean;
  /** 0-based subsong index for multi-subsong formats (passed to parseModuleToSong) */
  subsong?: number;
  /** Pre-scanned UADE metadata — avoids a redundant scan when the dialog already ran one */
  uadeMetadata?: UADEMetadata;
  /** MIDI-specific import settings */
  midiOptions?: {
    quantize?: number;
    velocityToVolume?: boolean;
    defaultPatternLength?: number;
  };
  /** Companion files (e.g. Sonix .ss/.instr) for multi-file formats */
  companionFiles?: Map<string, ArrayBuffer>;
  /** TD-3: if true, clear existing patterns before importing */
  replacePatterns?: boolean;
  /** Who asked, for songs (default 'filebrowser'); decides whether the load may raise questions and whether it starts playing. */
  origin?: OpenOrigin;
}

export type FileLoadResult =
  | { success: true; message: string }
  | { success: false; error: string }
  | { success: 'pending-confirmation'; file: File };


/**
 * Load any supported file format.
 *
 * Songs go through openSong (the one door: classification, unload, routing,
 * phases); this function keeps the confirmation gates the dialogs wait on and
 * the non-song files (instruments, DB303 XML, audio samples).
 */
export async function loadFile(
  file: File,
  options: FileLoadOptions = {}
): Promise<FileLoadResult> {
  suppressFormatChecks(); // never show format dialogs during file load
  const filename = file.name.toLowerCase();

  try {
    const { classifySong, openSong } = await import('@/lib/song/openSong');
    const kind = await classifySong(file);
    if (kind) {
      // TD-3 pattern files need replace/append choice from user
      if (kind === 'td3' && options.replacePatterns === undefined) {
        const { useUIStore } = await import('@stores/useUIStore');
        useUIStore.getState().setPendingTD3File(file);
        return { success: 'pending-confirmation', file };
      }
      const result = await openSong(
        { kind: 'file', file, companions: options.companionFiles },
        {
          origin: options.origin ?? 'filebrowser',
          askForChoices: false, // loadFile opens the song as it is; the dialog step is openSong's, for the interactive callers
          subsong: options.subsong,
          uadeMetadata: options.uadeMetadata,
          midiOptions: options.midiOptions,
          td3: { replacePatterns: options.replacePatterns, preserveInstruments: options.preserveInstruments },
        },
      );
      return result.ok
        ? { success: true, message: result.message }
        : { success: false, error: `Failed to load ${file.name}: ${result.error}` };
    }

    // === NON-SONG FORMATS (additive/modify) ===

    // .dbi - DEViLBOX instrument
    if (filename.endsWith('.dbi')) {
      return await loadInstrumentFile(file);
    }

    // .sunsynth - SunVox patch → show instrument import dialog
    if (filename.endsWith('.sunsynth')) {
      const { useUIStore } = await import('@stores/useUIStore');
      useUIStore.getState().setPendingSunVoxFile(file);
      return { success: true, message: '' };
    }

    // .xml - DB303 preset or pattern
    if (filename.endsWith('.xml')) {
      return await loadXMLFile(file);
    }

    // Audio samples (.wav, .mp3, etc.)
    if (isAudioFile(filename)) {
      return await loadAudioSample(file);
    }

    return { success: false, error: `Unsupported file format: ${file.name}` };

  } catch (error) {
    console.error('[UnifiedFileLoader] Failed to load file:', error);
    return { success: false, error: `Failed to load ${file.name}: ${error}` };
  } finally {
    restoreFormatChecks();
  }
}

/**
 * Check if a file is a "song format" that replaces the entire project.
 */
export function isSongFormat(filename: string): boolean {
  return (
    filename.endsWith('.dbx') ||
    filename.endsWith('.mid') ||
    filename.endsWith('.midi') ||
    filename.endsWith('.sqs') ||
    filename.endsWith('.seq') ||
    filename.endsWith('.sunvox') ||
    isSupportedFormat(filename)
  );
}

/**
 * Check if a file is an audio sample.
 */
export function isAudioFile(filename: string): boolean {
  return /\.(wav|mp3|ogg|flac|aiff?|m4a|iff|8svx|vag|vb|spu)$/i.test(filename);
}
/**
 * Load a .dbi instrument file.
 */
async function loadInstrumentFile(file: File): Promise<FileLoadResult> {
  try {
    // Import and add to project
    const { importInstrument } = await import('@/lib/export/exporters');
    const result = await importInstrument(file);
    const instrument = result?.instrument;

    if (!instrument) {
      return { success: false, error: 'Invalid instrument file' };
    }

    useInstrumentStore.getState().addInstrument(instrument);

    return {
      success: true,
      message: `Imported instrument: ${instrument.name}`
    };
  } catch (error) {
    return { success: false, error: `Failed to load instrument: ${error}` };
  }
}

/**
 * Load a .xml file (DB303 preset or pattern).
 */
async function loadXMLFile(file: File): Promise<FileLoadResult> {
  try {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    // Check if it's a DB303 preset or pattern
    if (xmlDoc.querySelector('open303preset')) {
      return await loadDB303Preset(xmlDoc);
    }

    if (xmlDoc.querySelector('db303pattern')) {
      return await loadDB303Pattern(xmlDoc, file.name);
    }

    return { success: false, error: 'Unrecognized XML format' };
  } catch (error) {
    return { success: false, error: `Failed to parse XML: ${error}` };
  }
}

/**
 * Load a DB303 preset from XML.
 */
async function loadDB303Preset(xmlDoc: Document): Promise<FileLoadResult> {
  const { parseDb303Preset } = await import('@/lib/import/Db303PresetConverter');
  const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');

  const preset = parseDb303Preset(xmlDoc.documentElement.outerHTML);

  // Find or create TB-303 instrument
  let tb303 = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
  if (!tb303) {
    tb303 = createDefaultTB303Instrument();
    useInstrumentStore.getState().addInstrument(tb303);
  }

  // Apply preset
  const updatedConfig = { ...tb303, tb303: { ...tb303.tb303, ...preset } };
  useInstrumentStore.getState().updateInstrument(tb303.id, updatedConfig);

  return {
    success: true,
    message: `Applied DB303 preset to ${tb303.name}`
  };
}

/**
 * Load a DB303 pattern from XML.
 */
async function loadDB303Pattern(xmlDoc: Document, filename: string): Promise<FileLoadResult> {
  const { parseDb303Pattern } = await import('@/lib/import/Db303PatternConverter');
  const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');

  const result = parseDb303Pattern(xmlDoc.documentElement.outerHTML, filename, 1);
  const pattern = result.pattern;
  const tempo = result.tempo;

  // Find or create TB-303 instrument
  let tb303 = useInstrumentStore.getState().instruments.find(i => i.synthType === 'TB303');
  if (!tb303) {
    tb303 = createDefaultTB303Instrument();
    useInstrumentStore.getState().addInstrument(tb303);
  }

  // Update pattern with correct instrument ID
  pattern.channels[0].instrumentId = tb303.id;

  // Append pattern to project
  const { loadPatterns, setPatternOrder, setCurrentPattern } = useTrackerStore.getState();
  const existingPatterns = useTrackerStore.getState().patterns;
  loadPatterns([...existingPatterns, pattern]);
  setCurrentPattern(existingPatterns.length);

  // Set pattern order to loop only the imported pattern
  setPatternOrder([existingPatterns.length]);

  // Apply tempo if present
  if (tempo !== undefined) {
    useTransportStore.getState().setBPM(tempo);
  }

  return {
    success: true,
    message: `Imported DB303 pattern: ${pattern.name}`
  };
}

/**
 * Load an audio sample file.
 */
async function loadAudioSample(file: File): Promise<FileLoadResult> {
  try {
    const { getDevilboxAudioContext } = await import('@/utils/audio-context');
    const audioCtx = getDevilboxAudioContext();
    const arrayBuf = await file.arrayBuffer();

    let audioBuffer: AudioBuffer;
    let sampleName = file.name.replace(/\.[^.]+$/, '').slice(0, 22);

    // PS1 SPU ADPCM formats need custom decoding (browser can't decode natively)
    const { isSpuFormat, decodeSpuAdpcm } = await import('@/lib/import/formats/SpuAdpcmDecoder');
    if (isSpuFormat(file.name, arrayBuf)) {
      const decoded = decodeSpuAdpcm(arrayBuf, file.name);
      if (decoded.pcm.length === 0) {
        return { success: false, error: `SPU ADPCM file is empty: ${file.name}` };
      }
      audioBuffer = audioCtx.createBuffer(1, decoded.pcm.length, decoded.sampleRate);
      audioBuffer.copyToChannel(new Float32Array(decoded.pcm), 0);
      if (decoded.name) sampleName = decoded.name.slice(0, 22);
    } else {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
    }

    const newId = useInstrumentStore.getState().createInstrument({
      name: sampleName,
      synthType: 'Sampler',
      sample: {
        audioBuffer: arrayBuf,
        url: '',
        baseNote: 'C4',
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: audioBuffer.length,
        reverse: false,
        playbackRate: 1,
        sampleRate: audioBuffer.sampleRate,
      },
    });

    useInstrumentStore.getState().setCurrentInstrument(newId);
    notify.success(`Created sample instrument: ${sampleName}`);

    return {
      success: true,
      message: `Imported audio sample as instrument ${newId}: ${sampleName}`
    };
  } catch (_error) {
    notify.info(`Audio sample: ${file.name} — Could not auto-import. Open instrument editor to add manually.`);
    return {
      success: true,
      message: `Recognized audio sample: ${file.name} (manual import required)`
    };
  }
}

