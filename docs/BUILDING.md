# Building DEViLBOX

Prerequisites, setup, and build commands. For app development you do **not** need the WASM
toolchain — the compiled `.wasm` artifacts under `public/` are committed. You only need
Emscripten / Rust when you change a native module's source and want to rebuild it.

## Prerequisites

| Tool | Version | Needed for |
|------|---------|-----------|
| Node.js | 20.x (matches CI) | everything |
| npm | bundled with Node 20 | everything |
| Emscripten (emsdk) | 3.1.x or newer | rebuilding C/C++ WASM modules only |
| CMake | ≥ 3.16 | rebuilding C/C++ WASM modules only |
| Rust + wasm-pack | stable | rebuilding the Rust WASM modules only |

## First-time setup

```bash
git clone <repo-url> DEViLBOX
cd DEViLBOX
scripts/setup.sh          # or: npm install
```

`scripts/setup.sh` checks your Node version, runs `npm install`, and reports whether the
optional WASM toolchain (Emscripten, CMake, wasm-pack) is available.

### A note on `third-party/`

The `third-party/*` entries are git **gitlinks** (pinned commits of upstream synth/replayer
sources) but the repo intentionally ships **no `.gitmodules`**, so `git submodule update --init`
does nothing. These trees are only required to rebuild the corresponding WASM modules from
source; normal app development uses the committed `public/**/*.wasm` binaries and does not need
them. Reference copies of upstream sources live outside the repo at
`/Users/spot/Code/Reference Code/` (see `CLAUDE.md`).

## Common commands

| Action | Command |
|--------|---------|
| Start dev (Express :3011 + Vite :5174 + WS relay :4003) | `npm run dev` |
| Build production | `npm run build` |
| Type-check (strict) | `npm run type-check` (`tsc -b --force`) |
| Lint | `npm run lint` |
| Test (watch) | `npm run test` |
| Test (CI) | `npm run test:ci` |
| Deploy | `git push origin main` (CI builds + Hetzner pulls automatically) |

`npm run dev` and `npm run build` first run `asbuild` (the AssemblyScript modules) — no extra
toolchain required, it's an npm dependency.

## Rebuilding WASM modules

Only needed when you edit a native module's source (e.g. `cinter4-wasm/src`, `furnace-wasm/src`).

```bash
source /path/to/emsdk/emsdk_env.sh     # put emcc/emcmake on PATH
scripts/build-all-wasm.sh --list       # list every module
scripts/build-all-wasm.sh cinter4      # rebuild one module
scripts/build-all-wasm.sh              # rebuild all
scripts/build-all-wasm.sh -j8 --clean  # parallel, clean first
```

Emscripten modules build via `emcmake cmake` + `emmake make` and write their `.js`/`.wasm`
into `public/<module>/`. Rust modules build via `wasm-pack` (skipped automatically if
`wasm-pack` is not installed). Commit the regenerated `public/**/*.wasm` — CI does not rebuild
them, it bundles the committed binaries.
