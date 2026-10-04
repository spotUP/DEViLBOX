# Sources kept out of the public tree

These directories exist on the maintainer's machine and are listed in
`.gitignore`. They are not in the repository because we do not hold the
right to redistribute them, or because they are build output.

| Path | What it is | Why it is not published |
|------|------------|-------------------------|
| `third-party/sonix-music-driver/` | `SonixMusicDriver_v1.asm`, `SonixMusicDriver_AMP.asm` - disassemblies of the Sonix Music Driver (Aegis, 1988), marked All Rights Reserved | Original copyrighted code. Studying it to write our own Sonix engine (`src/engine/sonix/`, `sonix-wasm/`) is reverse engineering, which is legal where this project is developed; republishing the original is not covered by that. |
| `third-party/musicline_playback-main/musicline/asm-version/` | `Mline116.asm` - the original Musicline Editor 1.16 replayer source | Same: the original author's code. Our C++ port in `third-party/musicline_playback-main/musicline/*.cpp` is what the project builds. |
| `third-party/rtosc-build-wasm/` | 25 `.o` object files from an rtosc wasm build | Build artefacts. Rebuild from rtosc upstream (MIT). |

If you clone this repository you do not need any of them to build or run
DEViLBOX. If you need them for engine work, ask the maintainer.
