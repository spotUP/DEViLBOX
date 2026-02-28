// src/engine/sc/oscEncoder.ts
// OSC 1.0 message encoder for SuperCollider scsynth communication.
// All multi-byte values are big-endian per the OSC spec.
// Strings and type tags are null-terminated and zero-padded to 4-byte boundaries.

const _encoder = new TextEncoder();

function pad4(n: number): number {
  return Math.ceil(n / 4) * 4;
}

function encodeString(str: string): Uint8Array {
  const bytes = _encoder.encode(str);
  const size = pad4(bytes.length + 1); // +1 for null terminator
  const buf = new Uint8Array(size);
  buf.set(bytes);
  return buf;
}

function encodeInt32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setInt32(0, value, false); // false = big-endian
  return buf;
}

function encodeFloat32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setFloat32(0, value, false);
  return buf;
}

function encodeBlob(data: Uint8Array): Uint8Array {
  const paddedLen = pad4(data.length);
  const buf = new Uint8Array(4 + paddedLen);
  const view = new DataView(buf.buffer);
  view.setInt32(0, data.length, false);
  buf.set(data, 4);
  return buf;
}

export type OSCArg =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'b'; value: Uint8Array };

export function encodeOSCMessage(address: string, args: OSCArg[]): Uint8Array {
  const addrBytes = encodeString(address);
  const typeTags = ',' + args.map(a => a.type).join('');
  const typeBytes = encodeString(typeTags);

  const argParts: Uint8Array[] = args.map(arg => {
    switch (arg.type) {
      case 'i': return encodeInt32BE(arg.value);
      case 'f': return encodeFloat32BE(arg.value);
      case 's': return encodeString(arg.value);
      case 'b': return encodeBlob(arg.value);
      default: {
        const _exhaustiveCheck: never = arg;
        throw new Error(`Unhandled OSC arg type: ${(_exhaustiveCheck as { type: string }).type}`);
      }
    }
  });

  const totalSize = addrBytes.length + typeBytes.length +
    argParts.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  result.set(addrBytes, offset); offset += addrBytes.length;
  result.set(typeBytes, offset); offset += typeBytes.length;
  for (const part of argParts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** /d_recv <blob> — load a compiled SynthDef binary */
export function oscLoadSynthDef(binary: Uint8Array): Uint8Array {
  return encodeOSCMessage('/d_recv', [{ type: 'b', value: binary }]);
}

/** /s_new — create a new synth node */
export function oscNewSynth(
  defName: string,
  nodeId: number,
  params: Record<string, number>,
): Uint8Array {
  const args: OSCArg[] = [
    { type: 's', value: defName },
    { type: 'i', value: nodeId },
    { type: 'i', value: 0 }, // addAction: addToHead
    { type: 'i', value: 0 }, // targetGroup: root group
  ];
  for (const [key, val] of Object.entries(params)) {
    args.push({ type: 's', value: key });
    args.push({ type: 'f', value: val });
  }
  return encodeOSCMessage('/s_new', args);
}

/** /n_set — update named parameters on a running node */
export function oscSetParams(nodeId: number, params: Record<string, number>): Uint8Array {
  const args: OSCArg[] = [{ type: 'i', value: nodeId }];
  for (const [key, val] of Object.entries(params)) {
    args.push({ type: 's', value: key });
    args.push({ type: 'f', value: val });
  }
  return encodeOSCMessage('/n_set', args);
}

/** /n_free — release a node */
export function oscFreeNode(nodeId: number): Uint8Array {
  return encodeOSCMessage('/n_free', [{ type: 'i', value: nodeId }]);
}
