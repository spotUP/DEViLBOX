/**
 * Prepares the Emscripten glue (public/cz101/CZ101.js) to run inside the
 * AudioWorklet via the Function constructor (same pattern as klysTransform):
 * strips the module-system epilogue's reliance on import.meta and exposes the
 * heap view the worklet reads rendered samples from.
 */
export function cz101Transform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/HEAPF32=new Float32Array\(b\);/, 'HEAPF32=new Float32Array(b);Module["HEAPF32"]=HEAPF32;');
}
