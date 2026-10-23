// emscripten 4.0.16 exports EXPORTED_RUNTIME_METHODS at top level, before the
// wasm instance exists, so `Module["wasmTable"] = wasmTable` copies undefined
// and nothing updates it after assignWasmExports() sets the real table.
// Expose the table through an accessor instead; the setter swallows that early
// top-level copy. The worklet reads Module.wasmTable for the mute/volume
// function pointers (chiptune3.worklet.js).
Object.defineProperty(Module, 'wasmTable', {
  get: () => wasmTable,
  set: () => {},
  configurable: true,
  enumerable: true,
});
