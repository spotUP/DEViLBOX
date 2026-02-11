/**
 * NKS File Format Parser/Writer
 *
 * Implements the official NKSF preset file format per NKS SDK v2.0.2 Section 17:
 * - RIFF container with "NIKS" form type
 * - msgpack-encoded chunks (NISI, NICA, PLID)
 * - Raw binary PCHK chunk for plugin state
 * - 2-byte word alignment per RIFF spec
 */

import type { NKSPreset, NKSPresetMetadata } from './types';
import { NKS_CONSTANTS } from './types';
import { msgpackEncode, msgpackDecode } from './msgpack';

// RIFF FOURCC constants (ASCII encoded as big-endian uint32)
const FOURCC_RIFF = 0x52494646; // "RIFF"
const FOURCC_NIKS = 0x4E494B53; // "NIKS"
const FOURCC_NISI = 0x4E495349; // "NISI" - NI Sound Info
const FOURCC_NICA = 0x4E494341; // "NICA" - NI Controller Assignments
const FOURCC_PCHK = 0x5043484B; // "PCHK" - Plugin Data Chunk
const FOURCC_PLID = 0x504C4944; // "PLID" - Plugin Info

// Chunk versions per spec
const CHUNK_VERSION = 1;

/**
 * NICA parameter assignment (per NKS spec Section 17.10)
 *
 * Each assignment represents one encoder (knob) on an 8-encoder page.
 * The "ni8" key in the NICA chunk contains pages of 8 assignments each.
 *
 * Fields:
 * - id: Plugin parameter ID. Encoder is unassigned if this key is absent.
 * - name: Display name for the parameter.
 * - section: Section label. Starts a new visual section on the display.
 *   Ends at the next encoder that has a section name.
 * - autoname: If true, use the name reported by the plugin host instead
 *   of the static name field (default: false).
 * - vflag: If true, show the parameter value instead of name on the
 *   display (default: false). Useful for discrete selectors.
 */
export interface NICAssignment {
  id?: number;       // Plugin parameter ID (omit for unassigned encoder)
  name: string;      // Display name
  section?: string;  // Section label (starts a new section on display)
  autoname?: boolean; // Use plugin-reported name instead (default: false)
  vflag?: boolean;   // Show value instead of name on display (default: false)
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Parse .nksf preset file (RIFF/NIKS format)
 * Also supports legacy DEViLBOX format for backward compatibility.
 */
export async function parseNKSF(buffer: ArrayBuffer): Promise<NKSPreset> {
  const view = new DataView(buffer);
  const firstFourCC = view.getUint32(0, false);

  // Check if this is a proper RIFF/NIKS file or legacy DEViLBOX format
  if (firstFourCC === FOURCC_RIFF) {
    return parseRIFFNKSF(buffer);
  } else if (firstFourCC === NKS_CONSTANTS.MAGIC_NKSF) {
    return parseLegacyNKSF(buffer);
  } else {
    throw new Error('Invalid NKSF file: unrecognized header');
  }
}

/**
 * Parse official RIFF/NIKS format per NKS SDK spec
 */
function parseRIFFNKSF(buffer: ArrayBuffer): NKSPreset {
  const view = new DataView(buffer);
  let offset = 0;

  // File header: RIFF(4) + fileSize(4 LE) + NIKS(4)
  const riffMagic = view.getUint32(offset, false);
  if (riffMagic !== FOURCC_RIFF) throw new Error('Invalid RIFF header');
  offset += 4;

  const fileSize = view.getUint32(offset, true); // LE per RIFF spec
  offset += 4;

  const formType = view.getUint32(offset, false);
  if (formType !== FOURCC_NIKS) throw new Error('Invalid NIKS form type');
  offset += 4;

  const metadata: Partial<NKSPresetMetadata> = {
    vendor: NKS_CONSTANTS.VENDOR_ID,
    uuid: NKS_CONSTANTS.PLUGIN_UUID,
    version: '1.0',
  };
  const parameters: Record<string, number> = {};
  let pluginBlob: ArrayBuffer | undefined;
  let controllerAssignments: NICAssignment[][] | undefined;

  // Parse RIFF chunks
  const endOffset = Math.min(8 + fileSize, buffer.byteLength);
  while (offset + 8 <= endOffset) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true); // LE
    offset += 8;

    // Each NI chunk has a version uint32 after the standard RIFF header
    const chunkDataEnd = offset + chunkSize;

    switch (chunkId) {
      case FOURCC_NISI: {
        // NI Sound Info - msgpack MAP (skip 4-byte chunk version)
        const msgpackData = new Uint8Array(buffer, offset + 4, chunkSize - 4);
        try {
          const decoded = msgpackDecode(msgpackData) as Record<string, unknown>;
          if (decoded.name) metadata.name = String(decoded.name);
          if (decoded.vendor) metadata.vendor = String(decoded.vendor);
          if (decoded.author) metadata.author = String(decoded.author);
          if (decoded.comment) metadata.comment = String(decoded.comment);
          if (decoded.deviceType) metadata.deviceType = String(decoded.deviceType);
          if (decoded.UUID) metadata.uuid = String(decoded.UUID);
          if (Array.isArray(decoded.bankchain)) {
            metadata.bankChain = decoded.bankchain.map(String).slice(0, 3); // Max 3 per spec
          }
          if (Array.isArray(decoded.types)) {
            // types is [[type, subtype], ...] per SDK Section 17.9
            metadata.types = (decoded.types as unknown[]).map(pair =>
              Array.isArray(pair) ? pair.map(String) : [String(pair), ''],
            );
          }
          if (Array.isArray(decoded.Character)) {
            metadata.modes = decoded.Character.map(String);
          }
        } catch (e) {
          console.warn('[NKS] Failed to decode NISI chunk:', e);
        }
        break;
      }

      case FOURCC_NICA: {
        // NI Controller Assignments - msgpack MAP with "ni8" key (skip 4-byte chunk version)
        const msgpackData = new Uint8Array(buffer, offset + 4, chunkSize - 4);
        try {
          const decoded = msgpackDecode(msgpackData) as Record<string, unknown>;
          if (decoded.ni8 && Array.isArray(decoded.ni8)) {
            controllerAssignments = decoded.ni8 as NICAssignment[][];
            // Extract parameter values from assignments
            for (const page of controllerAssignments) {
              if (!Array.isArray(page)) continue;
              for (const assignment of page) {
                if (assignment && typeof assignment === 'object' && 'id' in assignment) {
                  // Store with numeric index as key
                  parameters[`param.${assignment.id}`] = 0; // Value comes from PCHK
                }
              }
            }
          }
        } catch (e) {
          console.warn('[NKS] Failed to decode NICA chunk:', e);
        }
        break;
      }

      case FOURCC_PLID: {
        // Plugin Info - msgpack MAP with VST.magic or VST3.uid (skip 4-byte chunk version)
        const msgpackData = new Uint8Array(buffer, offset + 4, chunkSize - 4);
        try {
          const decoded = msgpackDecode(msgpackData) as Record<string, unknown>;
          // Store plugin ID info in metadata for round-trip
          if (decoded['VST.magic'] !== undefined) {
            metadata.vstMagic = Number(decoded['VST.magic']);
          }
          if (Array.isArray(decoded['VST3.uid']) && decoded['VST3.uid'].length === 4) {
            metadata.vst3Uid = decoded['VST3.uid'].map(Number) as [number, number, number, number];
          }
        } catch (e) {
          console.warn('[NKS] Failed to decode PLID chunk:', e);
        }
        break;
      }

      case FOURCC_PCHK: {
        // Plugin Data - raw bytes (no msgpack, skip 4-byte chunk version)
        pluginBlob = buffer.slice(offset + 4, chunkDataEnd);
        break;
      }

      default:
        console.warn(`[NKS] Unknown RIFF chunk: "${fourccToString(chunkId)}"`);
    }

    // Advance to next chunk (aligned to 2-byte boundary per RIFF spec)
    offset = chunkDataEnd;
    if (offset % 2 !== 0) offset++;
  }

  return {
    metadata: metadata as NKSPresetMetadata,
    parameters,
    blob: pluginBlob,
  };
}

/**
 * Parse legacy DEViLBOX format (pre-RIFF) for backward compatibility
 */
function parseLegacyNKSF(buffer: ArrayBuffer): NKSPreset {
  const view = new DataView(buffer);
  let offset = 0;

  // Skip NKSF magic + version
  offset += 8;

  const metadata: Partial<NKSPresetMetadata> = {
    vendor: NKS_CONSTANTS.VENDOR_ID,
    uuid: NKS_CONSTANTS.PLUGIN_UUID,
    version: '1.0',
  };
  const parameters: Record<string, number> = {};
  let pluginBlob: ArrayBuffer | undefined;

  while (offset < buffer.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    offset += 8;
    const chunkStart = offset;

    switch (chunkId) {
      case NKS_CONSTANTS.MAGIC_NISI: {
        const metaStr = readNullTermString(new Uint8Array(buffer, chunkStart, chunkSize));
        try {
          Object.assign(metadata, JSON.parse(metaStr));
        } catch (e) {
          console.warn('[NKS] Failed to parse legacy NISI:', e);
        }
        break;
      }

      case NKS_CONSTANTS.MAGIC_NIKA: {
        const paramView = new DataView(buffer, chunkStart, chunkSize);
        let po = 0;
        const paramCount = paramView.getUint32(po, true);
        po += 4;

        const firstByte = paramCount > 0 && po < chunkSize ? paramView.getUint8(po) : 0;
        const isStringFormat = firstByte > 0 && firstByte < 128 && (po + 1 + firstByte + 4) <= chunkSize;

        if (isStringFormat) {
          for (let i = 0; i < paramCount && po < chunkSize; i++) {
            const idLength = paramView.getUint8(po); po += 1;
            const idBytes = new Uint8Array(buffer, chunkStart + po, idLength);
            const paramId = new TextDecoder().decode(idBytes);
            po += idLength;
            parameters[paramId] = paramView.getFloat32(po, true);
            po += 4;
          }
        } else {
          for (let i = 0; i < paramCount && po + 8 <= chunkSize; i++) {
            const paramIndex = paramView.getUint32(po, true); po += 4;
            parameters[`param.${paramIndex}`] = paramView.getFloat32(po, true); po += 4;
          }
        }
        break;
      }

      case NKS_CONSTANTS.MAGIC_PLUG: {
        pluginBlob = buffer.slice(chunkStart, chunkStart + chunkSize);
        break;
      }
    }

    offset = chunkStart + chunkSize;
  }

  return { metadata: metadata as NKSPresetMetadata, parameters, blob: pluginBlob };
}

// ============================================================================
// Writer
// ============================================================================

/**
 * Write .nksf preset file in official RIFF/NIKS format
 */
export function writeNKSF(preset: NKSPreset): ArrayBuffer {
  const chunks: ArrayBuffer[] = [];

  // PLID chunk - Plugin Info
  const plidData = buildPLIDChunk(preset.metadata);
  chunks.push(plidData);

  // NISI chunk - Sound Info (msgpack)
  const nisiData = buildNISIChunk(preset.metadata);
  chunks.push(nisiData);

  // NICA chunk - Controller Assignments (msgpack)
  const nicaData = buildNICAChunk(preset);
  chunks.push(nicaData);

  // PCHK chunk - Plugin Data (raw bytes)
  if (preset.blob) {
    const pchkData = buildPCHKChunk(preset.blob);
    chunks.push(pchkData);
  }

  // Calculate total RIFF file size (excludes the 8 bytes for "RIFF" + size)
  const contentSize = 4 + chunks.reduce((sum, chunk) => {
    // Each chunk may have padding byte for 2-byte alignment
    const paddedSize = chunk.byteLength + (chunk.byteLength % 2);
    return sum + paddedSize;
  }, 0);

  // Build final RIFF file
  const totalSize = 8 + contentSize; // RIFF(4) + size(4) + content
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // RIFF header
  view.setUint32(offset, FOURCC_RIFF, false); offset += 4;
  view.setUint32(offset, contentSize, true);   offset += 4; // LE
  view.setUint32(offset, FOURCC_NIKS, false);  offset += 4;

  // Write chunks with padding
  for (const chunk of chunks) {
    new Uint8Array(buffer, offset, chunk.byteLength).set(new Uint8Array(chunk));
    offset += chunk.byteLength;
    // Pad to 2-byte boundary
    if (offset % 2 !== 0) {
      view.setUint8(offset, 0);
      offset++;
    }
  }

  return buffer;
}

/**
 * Build PLID chunk (Plugin Info)
 * Contains msgpack MAP with VST.magic or VST3.uid
 */
function buildPLIDChunk(metadata: NKSPresetMetadata): ArrayBuffer {
  const pluginInfo: Record<string, unknown> = {};

  // Use typed VST identifiers from metadata
  if (metadata.vstMagic !== undefined) {
    pluginInfo['VST.magic'] = metadata.vstMagic;
  }
  if (metadata.vst3Uid) {
    // VST3 UID is an array of exactly 4 integers per SDK Section 17.8
    pluginInfo['VST3.uid'] = [...metadata.vst3Uid];
  }

  // Default: use UUID hash as VST magic for DEViLBOX presets
  if (!pluginInfo['VST.magic'] && !pluginInfo['VST3.uid']) {
    pluginInfo['VST.magic'] = hashStringToInt32(metadata.uuid || NKS_CONSTANTS.PLUGIN_UUID);
  }

  const msgpackData = msgpackEncode(pluginInfo);
  return buildRIFFChunk(FOURCC_PLID, CHUNK_VERSION, msgpackData);
}

/**
 * Build NISI chunk (Sound Info)
 * Contains msgpack MAP per NKS SDK Section 17.9
 */
function buildNISIChunk(metadata: NKSPresetMetadata): ArrayBuffer {
  const nisi: Record<string, unknown> = {};

  // Required fields
  nisi.name = metadata.name || 'Untitled';
  nisi.vendor = metadata.vendor || NKS_CONSTANTS.VENDOR_ID;
  nisi.deviceType = metadata.deviceType || 'INST';
  nisi.bankchain = metadata.bankChain || ['DEViLBOX'];

  // Optional fields
  if (metadata.author) nisi.author = metadata.author;
  if (metadata.comment) nisi.comment = metadata.comment;
  if (metadata.uuid) nisi.UUID = metadata.uuid;

  // Types as [[type, subtype], ...] per SDK Section 17.9
  if (metadata.types && metadata.types.length > 0) {
    // types is already string[][] - each entry is [type, subType]
    nisi.types = metadata.types.map(pair =>
      pair.length >= 2 ? [pair[0], pair[1]] : [pair[0] || '', ''],
    );
  }

  // Character tags (stored in modes field internally)
  if (metadata.modes && metadata.modes.length > 0) {
    nisi.Character = metadata.modes;
  }

  const msgpackData = msgpackEncode(nisi);
  return buildRIFFChunk(FOURCC_NISI, CHUNK_VERSION, msgpackData);
}

/**
 * Build NICA chunk (Controller Assignments)
 * Contains msgpack MAP with "ni8" key -> pages of 8 assignments.
 *
 * If the preset has explicit NIC assignments (via nicaPages), use those directly.
 * Otherwise, auto-generate from parameter entries.
 *
 * Per SDK Section 17.10:
 * - Each page has exactly 8 encoder assignments
 * - Unassigned encoders have no "id" key (blank on display)
 * - "section" key starts a new visual section
 * - "autoname" uses plugin-reported parameter name
 * - "vflag" shows value instead of name
 */
function buildNICAChunk(preset: NKSPreset): ArrayBuffer {
  // Check for explicit NICA pages on the preset
  const explicitPages = (preset as NKSPresetWithNICA).nicaPages;
  if (explicitPages && explicitPages.length > 0) {
    return buildNICAFromExplicit(explicitPages);
  }

  // Auto-generate from parameter entries
  const paramEntries = Object.entries(preset.parameters);

  const pages: Record<string, unknown>[][] = [];
  let currentPage: Record<string, unknown>[] = [];

  for (let i = 0; i < paramEntries.length; i++) {
    const [id] = paramEntries[i];

    const assignment: Record<string, unknown> = {
      name: id,
    };

    // If it's a numeric param ID, set the id field
    if (id.startsWith('param.')) {
      assignment.id = parseInt(id.replace('param.', ''), 10);
    } else {
      // For string IDs (DEViLBOX format), use index as numeric ID
      assignment.id = i;
    }

    currentPage.push(assignment);

    if (currentPage.length === 8) {
      pages.push(currentPage);
      currentPage = [];
    }
  }

  // Pad last page to 8 entries
  if (currentPage.length > 0) {
    while (currentPage.length < 8) {
      currentPage.push({ name: '' }); // Unassigned encoder (no id key)
    }
    pages.push(currentPage);
  }

  // If no parameters, create one empty page
  if (pages.length === 0) {
    pages.push(Array.from({ length: 8 }, () => ({ name: '' })));
  }

  const nica = { ni8: pages };
  const msgpackData = msgpackEncode(nica);
  return buildRIFFChunk(FOURCC_NICA, CHUNK_VERSION, msgpackData);
}

/**
 * Build NICA chunk from explicit NICAssignment pages.
 * Properly serializes autoname, vflag, and section fields.
 */
function buildNICAFromExplicit(pages: NICAssignment[][]): ArrayBuffer {
  const serializedPages: Record<string, unknown>[][] = [];

  for (const page of pages) {
    const serializedPage: Record<string, unknown>[] = [];

    for (let i = 0; i < 8; i++) {
      const assignment = page[i];

      if (!assignment || (assignment.id === undefined && !assignment.name)) {
        // Unassigned encoder
        serializedPage.push({ name: '' });
        continue;
      }

      const entry: Record<string, unknown> = {
        name: assignment.name || '',
      };

      // Only include "id" if the encoder is assigned to a parameter
      // Omitting "id" means the encoder is unassigned (blank display)
      if (assignment.id !== undefined && assignment.id >= 0) {
        entry.id = assignment.id;
      }

      // Section label starts a new visual section on the display
      if (assignment.section) {
        entry.section = assignment.section;
      }

      // autoname: use plugin-reported name instead of static name
      if (assignment.autoname === true) {
        entry.autoname = true;
      }

      // vflag: show parameter value instead of name on display
      if (assignment.vflag === true) {
        entry.vflag = true;
      }

      serializedPage.push(entry);
    }

    serializedPages.push(serializedPage);
  }

  // Ensure at least one page
  if (serializedPages.length === 0) {
    serializedPages.push(Array.from({ length: 8 }, () => ({ name: '' })));
  }

  const nica = { ni8: serializedPages };
  const msgpackData = msgpackEncode(nica);
  return buildRIFFChunk(FOURCC_NICA, CHUNK_VERSION, msgpackData);
}

/**
 * Build PCHK chunk (Plugin Data)
 * Contains raw plugin state bytes (no msgpack)
 */
function buildPCHKChunk(blob: ArrayBuffer): ArrayBuffer {
  return buildRIFFChunk(FOURCC_PCHK, CHUNK_VERSION, new Uint8Array(blob));
}

/**
 * Build a RIFF chunk with FOURCC, size, version, and data
 */
function buildRIFFChunk(fourcc: number, version: number, data: Uint8Array): ArrayBuffer {
  // FOURCC(4) + size(4) + version(4) + data(n)
  const chunkSize = 4 + data.byteLength; // version(4) + data
  const buffer = new ArrayBuffer(8 + chunkSize);
  const view = new DataView(buffer);

  view.setUint32(0, fourcc, false);       // FOURCC (big-endian)
  view.setUint32(4, chunkSize, true);     // Chunk size (little-endian)
  view.setUint32(8, version, true);       // Version (little-endian)

  new Uint8Array(buffer, 12, data.byteLength).set(data);

  return buffer;
}

// ============================================================================
// Utilities
// ============================================================================

function fourccToString(fourcc: number): string {
  return String.fromCharCode(
    (fourcc >> 24) & 0xff,
    (fourcc >> 16) & 0xff,
    (fourcc >> 8) & 0xff,
    fourcc & 0xff,
  );
}

function readNullTermString(bytes: Uint8Array): string {
  let length = bytes.indexOf(0);
  if (length === -1) length = bytes.length;
  return new TextDecoder().decode(bytes.subarray(0, length));
}

function hashStringToInt32(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // Ensure positive
}

// ============================================================================
// Extended Preset Type with NICA
// ============================================================================

/**
 * Extended NKS preset that includes explicit NICA page assignments.
 * Use this when you want full control over the controller assignment layout
 * including section labels, autoname, and vflag flags.
 */
export interface NKSPresetWithNICA extends NKSPreset {
  nicaPages?: NICAssignment[][];
}

/**
 * Build NICA pages from NKS parameters with proper section grouping.
 * This creates well-structured pages with section labels and appropriate flags.
 *
 * Per SDK Section 9.2.4:
 * - Knob 1 must always be assigned
 * - Knob 5 must be assigned if any of Knobs 6-8 is used
 * - Don't span sections from Knob 3 to Knob 5 (display boundary)
 */
export function buildNICAPages(
  parameters: Array<{
    id: number;
    name: string;
    section?: string;
    autoname?: boolean;
    vflag?: boolean;
  }>,
): NICAssignment[][] {
  const pages: NICAssignment[][] = [];
  let currentPage: NICAssignment[] = [];
  let lastSection: string | undefined;

  for (const param of parameters) {
    const assignment: NICAssignment = {
      id: param.id,
      name: param.name,
    };

    // Add section label if it's a new section
    if (param.section && param.section !== lastSection) {
      assignment.section = param.section;
      lastSection = param.section;
    }

    // Preserve autoname and vflag
    if (param.autoname) assignment.autoname = true;
    if (param.vflag) assignment.vflag = true;

    currentPage.push(assignment);

    if (currentPage.length === 8) {
      pages.push(currentPage);
      currentPage = [];
      lastSection = undefined; // Reset section for new page
    }
  }

  // Pad last page to 8 entries
  if (currentPage.length > 0) {
    while (currentPage.length < 8) {
      currentPage.push({ name: '' }); // Unassigned encoder
    }
    pages.push(currentPage);
  }

  return pages;
}

/**
 * Build NICA pages following the first-page paradigm per SDK Section 9.2.1.
 * Orders parameters by importance: Spectrum, Oscillator, FX, Sound, Reverb, Delay, Attack, Decay.
 */
export function buildFirstPageNICA(
  parameters: Array<{
    id: number;
    name: string;
    section?: string;
    priority?: number;  // Higher = more important for first page
  }>,
): NICAssignment[][] {
  // Sort by priority (highest first) for the first page
  const sorted = [...parameters].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // First page gets top 8 priority parameters
  const firstPage = sorted.slice(0, 8);
  // Remaining pages get the rest
  const remaining = sorted.slice(8);

  return buildNICAPages([...firstPage, ...remaining]);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate plugin.json metadata file
 */
export function generatePluginJson(
  name: string,
  author: string,
  version: string,
  numPages: number,
  deviceType: 'INST' | 'FX' = 'INST'
): string {
  return JSON.stringify({
    author,
    name,
    vendor: NKS_CONSTANTS.VENDOR_ID,
    version,
    uuid: NKS_CONSTANTS.PLUGIN_UUID,
    short_name: name.substring(0, 16),
    description: `DEViLBOX ${name}`,
    ni_hw_integration: {
      device_type: deviceType,
      num_pages: numPages,
    },
  }, null, 2);
}

/**
 * Download .nksf file to user
 */
export function downloadNKSF(preset: NKSPreset, filename?: string): void {
  const buffer = writeNKSF(preset);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${preset.metadata.name || 'preset'}.nksf`;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Load .nksf file from user
 */
export async function loadNKSF(file: File): Promise<NKSPreset> {
  const buffer = await file.arrayBuffer();
  return parseNKSF(buffer);
}

/**
 * Verify NKSF file integrity by checking RIFF header
 */
export function verifyNKSF(buffer: ArrayBuffer): { valid: boolean; format: 'riff' | 'legacy' | 'invalid'; size: number } {
  if (buffer.byteLength < 12) return { valid: false, format: 'invalid', size: buffer.byteLength };

  const view = new DataView(buffer);
  const first = view.getUint32(0, false);

  if (first === FOURCC_RIFF) {
    const formType = view.getUint32(8, false);
    return {
      valid: formType === FOURCC_NIKS,
      format: 'riff',
      size: buffer.byteLength,
    };
  }

  if (first === NKS_CONSTANTS.MAGIC_NKSF) {
    return { valid: true, format: 'legacy', size: buffer.byteLength };
  }

  return { valid: false, format: 'invalid', size: buffer.byteLength };
}
