---
date: 2026-04-04
topic: make-devilbox-fully-buildable
tags: [infrastructure, build, wasm, ci]
status: draft
---

# Make DEViLBOX Fully Buildable

## Current State
- 85+ WASM modules with source in `*-wasm/` directories (all tracked in git)
- Only ~9 have individual build scripts in `scripts/`
- No master build-all script
- `third-party/` has submodules that need initialization
- No documented build prerequisites
- Pre-built WASM binaries committed in `public/` (works for app users but not contributors)

## What's Needed

### 1. Master Build Script (`scripts/build-all-wasm.sh`)
- Iterate all `*-wasm/` directories
- Each with a `CMakeLists.txt`: `mkdir -p build && cd build && emcmake cmake .. && emmake make`
- Skip modules without CMakeLists (they use custom build scripts)
- Parallel build support (`-j` flag)
- Individual module rebuild: `scripts/build-wasm.sh <module-name>`

### 2. Prerequisites Documentation
- Emscripten version (currently 4.0.16)
- CMake minimum version
- Node.js version
- Git submodule initialization: `git submodule update --init --recursive`

### 3. Submodule Setup Script
- `scripts/setup.sh` that:
  - Initializes git submodules
  - Verifies Emscripten is installed
  - Optionally builds all WASM modules

### 4. CI/CD Integration
- GitHub Actions workflow to build all WASM modules
- Verify committed binaries match rebuilt ones
- Catch broken builds early

## Module Categories

### Standard CMake (majority — ~70 modules)
Pattern: `mkdir build && cd build && emcmake cmake .. && emmake make`

### JUCE-based (juce-wasm/)
Multiple JUCE plugins: DB303, DX7, Helm, Monique, OBXf, Odin2, Surge, Vital, etc.
Each has its own CMakeLists inside juce-wasm/

### MAME chips (mame-wasm/)
Single CMakeLists builds multiple chip targets

### Custom scripts
A few modules have bespoke build scripts in scripts/

## Priority
High — blocks external contributors from building the project.
