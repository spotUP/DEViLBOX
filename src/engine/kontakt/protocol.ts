export const KONTAKT_BRIDGE_MAGIC = 0x4b425247;

export interface KontaktAudioFrame {
  sampleCount: number;
  left: Float32Array;
  right: Float32Array;
}

export interface KontaktStatusMessage {
  type: 'status';
  connected: boolean;
  presetName: string | null;
  sampleRate: number;
  blockSize?: number;
  backend?: string;
  platform?: string;
}

export interface KontaktErrorMessage {
  type: 'error';
  message: string;
}

export type KontaktBridgeMessage = KontaktStatusMessage | KontaktErrorMessage | Record<string, unknown>;

export function parseKontaktAudioFrame(buffer: ArrayBuffer): KontaktAudioFrame | null {
  if (buffer.byteLength < 8) {
    return null;
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== KONTAKT_BRIDGE_MAGIC) {
    return null;
  }

  const sampleCount = view.getUint32(4, true);
  const expectedBytes = 8 + sampleCount * 4 * 2;
  if (buffer.byteLength < expectedBytes) {
    return null;
  }

  const floats = new Float32Array(buffer, 8, sampleCount * 2);
  const left = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    left[i] = floats[i];
    right[i] = floats[sampleCount + i];
  }

  return { sampleCount, left, right };
}
