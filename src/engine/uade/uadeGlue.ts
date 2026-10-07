/** UADE only strips ESM markers — no HEAP rewrites (the worklet handles memory views itself). */
export function uadeTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];');
}
