# nuade - vendored upstream

- Repository: https://github.com/emoon/nuade (Daniel Collin / emoon, MIT)
- Pinned commit: 111c9657965f00e9a94fec3545ce238d43af57f4
- Pin date: 2026-10-14
- Tarball sha256 (`gh api repos/emoon/nuade/tarball/<sha>`): ed5fd35867fdc4e35cdd1cf0420d4f46adfebbb00aa3f5a96c194e3bbac5f2fd
- DEViLBOX changes: none. Everything of ours lives in `nuade-wasm/` (shim, CMake, build script). A fix this tree needs goes
  upstream as a PR and, until merged, as `nuade-wasm/patches/NNNN-*.patch` applied by `nuade-wasm/build.sh`.
- Bump: `third-party/nuade/update.sh <sha>` re-fetches, rewrites this file and lists the `players/<id>` directories that
  changed, so only those formats' comparisons re-run.
- 2026-10-14 bump 4900e597e671 -> 111c9657965f (12 commits, 88 files, 37 players). Measured: 77 formats of unchanged players render
  bit-identical (10 s, first corpus song each, old vs new Nuade.wasm); the 38 table rows of changed players + the seven EaglePlayer
  rows re-measured: no correlation or pass flag moved, no default moved. One shim change: SoundMon numbers its voices by Paula
  channel (3 - n), so nuade-wasm/src/nuade_wasm.c maps them back to the tracker column (column_of).

