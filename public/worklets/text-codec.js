/**
 * text-codec.js - TextEncoder / TextDecoder for the AudioWorkletGlobalScope.
 *
 * The worklet scope has neither. Engine worklets call them (file names into
 * WASM memory, Emscripten's UTF8ToString). Only UADE's worklet installed a
 * substitute, on the scope every worklet of the context shares, so an engine
 * worked only when UADE had loaded first in that tab: ASAP and the
 * eagleplayer runner played silence with "TextEncoder is not defined"
 * (2026-10-05/06). WASMSingletonBase loads this before any engine worklet.
 * Registers no processor.
 */
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = class {
    get encoding() { return 'utf-8'; }
    encode(str = '') {
      const buf = new Uint8Array(str.length * 3);
      let pos = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
          const lo = str.charCodeAt(i + 1);
          if (lo >= 0xdc00 && lo < 0xe000) {
            const cp = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
            i++;
            buf[pos++] = 0xf0 | (cp >> 18);
            buf[pos++] = 0x80 | ((cp >> 12) & 0x3f);
            buf[pos++] = 0x80 | ((cp >> 6) & 0x3f);
            buf[pos++] = 0x80 | (cp & 0x3f);
            continue;
          }
        }
        if (c < 0x80) buf[pos++] = c;
        else if (c < 0x800) { buf[pos++] = 0xc0 | (c >> 6); buf[pos++] = 0x80 | (c & 0x3f); }
        else { buf[pos++] = 0xe0 | (c >> 12); buf[pos++] = 0x80 | ((c >> 6) & 0x3f); buf[pos++] = 0x80 | (c & 0x3f); }
      }
      return buf.slice(0, pos);
    }
  };
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class {
    constructor(label = 'utf-8') { this.encoding = label; }
    decode(input) {
      if (!input) return '';
      const bytes = input instanceof Uint8Array
        ? input
        : new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength ?? input.length);
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) str += String.fromCharCode(b);
        else if (b < 0xe0) str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
        else if (b < 0xf0) str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
        else str += String.fromCodePoint(((b & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
      }
      return str;
    }
  };
}
