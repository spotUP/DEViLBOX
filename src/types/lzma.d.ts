/**
 * `lzma` ships no type declarations and no ESM entry point.
 *
 * `src/lzma_worker.js` is the self-contained implementation: it defines the
 * codec and assigns it to top-level `this`, which under CommonJS semantics is
 * `module.exports`. It is the only file in the package that works without a
 * Worker or a script tag, so it is the one imported directly.
 *
 * `compress` returns signed bytes; `decompress` returns a byte array, or a
 * string when the payload decodes as text, so callers must handle both.
 */
declare module 'lzma/src/lzma_worker.js' {
  interface LZMACodec {
    compress(data: Uint8Array | number[] | string, mode?: number): number[];
    decompress(data: Uint8Array | number[]): number[] | string;
  }
  const lzmaWorker: { LZMA: LZMACodec; LZMA_WORKER: LZMACodec };
  export default lzmaWorker;
}
