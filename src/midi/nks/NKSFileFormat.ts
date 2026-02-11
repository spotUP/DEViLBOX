/**
 * NKS File Format Parser/Writer
 * 
 * Handles .nksf preset file format:
 * - Binary chunk-based format (similar to RIFF/IFF)
 * - Contains metadata, parameter values, and plugin state
 * - Compatible with NI Komplete Kontrol and Maschine
 */

import type { NKSPreset, NKSPresetMetadata } from './types';
import { NKS_CONSTANTS } from './types';

/**
 * Parse .nksf preset file
 */
export async function parseNKSF(buffer: ArrayBuffer): Promise<NKSPreset> {
  const view = new DataView(buffer);
  let offset = 0;

  // Verify NKSF magic header
  const magic = view.getUint32(offset, false);
  if (magic !== NKS_CONSTANTS.MAGIC_NKSF) {
    throw new Error('Invalid NKSF file: missing magic header');
  }
  offset += 4;

  // Read version
  const versionMajor = view.getUint16(offset, false);
  const versionMinor = view.getUint16(offset + 2, false);
  offset += 4;
  
  console.log(`[NKS] Parsing NKSF v${versionMajor}.${versionMinor}`);

  const metadata: Partial<NKSPresetMetadata> = {
    vendor: NKS_CONSTANTS.VENDOR_ID,
    uuid: NKS_CONSTANTS.PLUGIN_UUID,
    version: `${versionMajor}.${versionMinor}`,
  };
  
  const parameters: Record<string, number> = {};
  let pluginBlob: ArrayBuffer | undefined;

  // Read chunks until end of file
  while (offset < buffer.byteLength) {
    // Read chunk header
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);  // Little-endian
    offset += 8;

    const chunkStart = offset;
    const chunkEnd = offset + chunkSize;

    console.log(`[NKS] Chunk: 0x${chunkId.toString(16)}, size: ${chunkSize}`);

    switch (chunkId) {
      case NKS_CONSTANTS.MAGIC_NISI: {
        // NI Sound Info chunk - metadata
        const metaStr = readString(new Uint8Array(buffer, chunkStart, chunkSize));
        try {
          const metaJson = JSON.parse(metaStr);
          Object.assign(metadata, metaJson);
        } catch (e) {
          console.warn('[NKS] Failed to parse NISI metadata:', e);
        }
        break;
      }

      case NKS_CONSTANTS.MAGIC_NIKA: {
        // NI Kontrol Automation chunk - parameter values
        // Supports two formats:
        // 1. DEViLBOX format: count(u32le) + [idLen(u8) + idStr + value(f32le)] x N
        // 2. NI native format: count(u32le) + [paramIndex(u32le) + value(f32le)] x N
        const paramView = new DataView(buffer, chunkStart, chunkSize);
        let paramOffset = 0;

        // Read parameter count
        const paramCount = paramView.getUint32(paramOffset, true);
        paramOffset += 4;

        // Detect format: if first byte after count looks like a small string length (<128)
        // it's probably our string-ID format. If it's a larger value, it's NI numeric format.
        const firstByte = paramCount > 0 && paramOffset < chunkSize
          ? paramView.getUint8(paramOffset) : 0;
        const isStringFormat = firstByte > 0 && firstByte < 128 && (paramOffset + 1 + firstByte + 4) <= chunkSize;

        if (isStringFormat) {
          // DEViLBOX string-ID format
          for (let i = 0; i < paramCount && paramOffset < chunkSize; i++) {
            const idLength = paramView.getUint8(paramOffset);
            paramOffset += 1;

            const idBytes = new Uint8Array(buffer, chunkStart + paramOffset, idLength);
            const paramId = new TextDecoder().decode(idBytes);
            paramOffset += idLength;

            const paramValue = paramView.getFloat32(paramOffset, true);
            paramOffset += 4;

            parameters[paramId] = paramValue;
          }
        } else {
          // NI native numeric-index format
          for (let i = 0; i < paramCount && paramOffset + 8 <= chunkSize; i++) {
            const paramIndex = paramView.getUint32(paramOffset, true);
            paramOffset += 4;

            const paramValue = paramView.getFloat32(paramOffset, true);
            paramOffset += 4;

            // Store with numeric index as string key
            parameters[`param.${paramIndex}`] = paramValue;
          }
        }
        break;
      }

      case NKS_CONSTANTS.MAGIC_PLUG: {
        // Plugin state blob - raw plugin data
        pluginBlob = buffer.slice(chunkStart, chunkEnd);
        break;
      }

      default:
        console.warn(`[NKS] Unknown chunk: 0x${chunkId.toString(16)}`);
    }

    offset = chunkEnd;
  }

  return {
    metadata: metadata as NKSPresetMetadata,
    parameters,
    blob: pluginBlob,
  };
}

/**
 * Write .nksf preset file
 */
export function writeNKSF(preset: NKSPreset): ArrayBuffer {
  const chunks: ArrayBuffer[] = [];

  // NISI chunk - metadata (ensure NKS2 required fields are present)
  const nisiData = {
    ...preset.metadata,
    // NKS2 requires types array
    types: preset.metadata.types || [],
    // NKS2 character tags stored in modes
    modes: preset.metadata.modes || [],
  };
  const metaJson = JSON.stringify(nisiData);
  const metaBytes = new TextEncoder().encode(metaJson);
  chunks.push(createChunk(NKS_CONSTANTS.MAGIC_NISI, metaBytes.buffer));

  // NIKA chunk - parameter values
  const paramEntries = Object.entries(preset.parameters);
  const paramBufferSize = 4 + paramEntries.reduce((sum, [id]) => sum + 1 + id.length + 4, 0);
  const paramBuffer = new ArrayBuffer(paramBufferSize);
  const paramView = new DataView(paramBuffer);
  let paramOffset = 0;

  // Write parameter count
  paramView.setUint32(paramOffset, paramEntries.length, true);
  paramOffset += 4;

  // Write each parameter
  for (const [id, value] of paramEntries) {
    const idBytes = new TextEncoder().encode(id);
    paramView.setUint8(paramOffset, idBytes.length);
    paramOffset += 1;
    
    new Uint8Array(paramBuffer, paramOffset, idBytes.length).set(idBytes);
    paramOffset += idBytes.length;
    
    paramView.setFloat32(paramOffset, value, true);
    paramOffset += 4;
  }

  chunks.push(createChunk(NKS_CONSTANTS.MAGIC_NIKA, paramBuffer));

  // PLUG chunk - plugin state blob (optional)
  if (preset.blob) {
    chunks.push(createChunk(NKS_CONSTANTS.MAGIC_PLUG, preset.blob));
  }

  // Calculate total size
  const totalSize = 8 + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // Write NKSF header
  view.setUint32(offset, NKS_CONSTANTS.MAGIC_NKSF, false);
  offset += 4;
  
  view.setUint16(offset, NKS_CONSTANTS.VERSION_MAJOR, false);
  view.setUint16(offset + 2, NKS_CONSTANTS.VERSION_MINOR, false);
  offset += 4;

  // Write chunks
  for (const chunk of chunks) {
    new Uint8Array(buffer, offset, chunk.byteLength).set(new Uint8Array(chunk));
    offset += chunk.byteLength;
  }

  return buffer;
}

/**
 * Create a chunk with header
 */
function createChunk(id: number, data: ArrayBuffer): ArrayBuffer {
  const buffer = new ArrayBuffer(8 + data.byteLength);
  const view = new DataView(buffer);
  
  view.setUint32(0, id, false);
  view.setUint32(4, data.byteLength, true);
  
  new Uint8Array(buffer, 8, data.byteLength).set(new Uint8Array(data));
  
  return buffer;
}

/**
 * Read null-terminated or length-prefixed string
 */
function readString(bytes: Uint8Array): string {
  // Find null terminator
  let length = bytes.indexOf(0);
  if (length === -1) length = bytes.length;
  
  return new TextDecoder().decode(bytes.subarray(0, length));
}

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
  const pluginJson = {
    author,
    name,
    vendor: NKS_CONSTANTS.VENDOR_ID,
    version,
    uuid: NKS_CONSTANTS.PLUGIN_UUID,
    url: 'https://github.com/yourusername/devilbox',
    short_name: name.substring(0, 16),
    description: `DEViLBOX ${name}`,
    ni_hw_integration: {
      device_type: deviceType,
      num_pages: numPages,
    },
  };

  return JSON.stringify(pluginJson, null, 2);
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
