# BLEP WASM Module

Band-Limited Step (BLEP) synthesis for reducing aliasing in digital audio.

## Source

Based on PT2-clone's BLEP implementation by aciddose.

## Building

Requires Emscripten SDK:

```bash
# Install emsdk if needed
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# Build BLEP module
cd blep-wasm
./build.sh
```

## Output

- `blep.wasm` - WebAssembly binary
- `blep.js` - JavaScript loader

## Integration

Copy compiled files to `public/blep/`:

```bash
mkdir -p ../public/blep
cp blep.wasm blep.js ../public/blep/
```

## Usage

See `../src/engine/blep/BlepProcessor.ts` for TypeScript wrapper.
