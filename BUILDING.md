# Building DEViLBOX

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 20+ | Runtime + dev server |
| **Emscripten** | 4.0.16+ | WASM compilation (`emcc`, `emcmake`, `emmake`) |
| **CMake** | 3.13+ | Build system for most WASM modules |
| **wasm-pack** | 0.13+ | Only needed for Rust modules (oidos-wasm) |
| **Git** | 2.x | Submodule support required |

### Installing Emscripten

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source emsdk_env.sh  # add to your shell profile
```

Verify: `emcc --version` should print `4.0.16` or newer.

## Quick Start

```bash
# 1. Clone with submodules
git clone --recursive https://github.com/user/DEViLBOX.git
cd DEViLBOX

# 2. Install Node dependencies
npm install

# 3. (Optional) Build all WASM modules from source
scripts/build-all-wasm.sh

# 4. Start dev server
npm run dev
```

Pre-built WASM binaries are committed in `public/`, so step 3 is only needed if you want to modify C/C++/Rust sources.

## WASM Module Build System

87 WASM modules live in `*-wasm/` directories. The master build script handles all of them:

```bash
# Build everything
scripts/build-all-wasm.sh

# Build a specific module (substring match)
scripts/build-all-wasm.sh furnace
scripts/build-all-wasm.sh hively

# Parallel make jobs
scripts/build-all-wasm.sh -j8

# Clean build (remove build dirs first)
scripts/build-all-wasm.sh --clean

# See what would be built
scripts/build-all-wasm.sh --dry-run

# List all buildable modules
scripts/build-all-wasm.sh --list
```

### Module Categories

| Category | Count | Build Method |
|----------|-------|-------------|
| Standard CMake | ~65 | `emcmake cmake .. && emmake make` |
| Nested CMake (transpiled 68k) | ~8 | Same, but CMakeLists in `src/<Name>/` |
| JUCE plugins | 1 (multi-target) | `scripts/build-juce-wasm.sh` |
| Shell script | 2 (uade, blep) | Custom `build.sh` |
| Rust/wasm-pack | 1 (oidos) | `wasm-pack build` |

### Individual Build Scripts

Some modules have dedicated build scripts in `scripts/` for more control:

- `scripts/build-juce-wasm.sh` — All JUCE-based synths (Dexed, Helm, Surge, etc.)
- `scripts/build-furnace-wasm.sh` — Furnace tracker engine
- `scripts/build-furnace-chips.sh` — Furnace chip emulation modules
- `scripts/build-mame-wasm.sh` — MAME chip emulators
- `scripts/build-ami-sampler-wasm.sh` — Amiga sampler

### Output

Built `.js` and `.wasm` files are placed in `public/<module-name>/` by each module's CMakeLists.txt. For example, `furnace-wasm/` outputs to `public/furnace/`.

## Git Submodules

Third-party sources live in `third-party/` as git submodules. Initialize them if you need to build WASM modules that reference third-party code:

```bash
git submodule update --init --recursive
```

Not all submodules are needed for all modules. If a build fails with missing includes, check that the relevant submodule is initialized.

## TypeScript / Frontend

```bash
# Dev server (Vite + Express + WS relay)
npm run dev

# Type check
npm run type-check

# Production build
npm run build
```

## Troubleshooting

**`emcc: command not found`** — Run `source /path/to/emsdk/emsdk_env.sh` or add it to your shell profile.

**Missing third-party headers** — Run `git submodule update --init --recursive` to initialize submodules.

**WASM module fails to build** — Try building just that module: `scripts/build-all-wasm.sh <module-name>`. Check the CMakeLists.txt for specific third-party dependencies.

**Pre-built binaries work but source build differs** — The committed binaries in `public/` are the canonical versions. Source builds should produce functionally identical output but may differ in optimization level.
