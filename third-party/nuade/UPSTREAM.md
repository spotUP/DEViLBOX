# nuade - vendored upstream

- Repository: https://github.com/emoon/nuade (Daniel Collin / emoon, MIT)
- Pinned commit: 4900e597e6718d523e50bbaf6e1fc6ca41ebe683
- Pin date: 2026-10-13 (upstream HEAD at vendoring time, 5 commits)
- Tarball sha256 (`gh api repos/emoon/nuade/tarball/<sha>`): 6b5a85645f66a2813c1d3a7681ebc1276bd8c23acad038413cfb826193d0008a
- DEViLBOX changes: none. Everything of ours lives in `nuade-wasm/` (shim, CMake, build script). A fix this tree needs goes
  upstream as a PR and, until merged, as `nuade-wasm/patches/NNNN-*.patch` applied by `nuade-wasm/build.sh`.
- Bump: `third-party/nuade/update.sh <sha>` re-fetches, rewrites this file and lists the `players/<id>` directories that
  changed, so only those formats' comparisons re-run.
