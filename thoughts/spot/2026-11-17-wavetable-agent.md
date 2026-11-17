# Song wavetable list (Furnace)
Done: fur_set_wave / fur_truncate_waves / fur_remap_waves in fileops WASM (sets song.waveLen, which the saver reads); setFurWaveListWasm; FurnaceDispatchEngine.replaceModuleWavetables; src/stores/furnaceWaveList.ts (add, duplicate, remove, move); FurnaceWaveList.tsx mounted in FurnaceEditor; waveListOps.ts remap.
Tests: stores/__tests__/furnaceWaveList.test.ts (mocks), lib/import/__tests__/furnaceWaveListExport.test.ts (real WASM save/reload).
Unverified: UI in browser; chip-side effect of remapped instrument/sequencer waves while playing; fileops remap of macros/10xx not asserted after .fur reload.
