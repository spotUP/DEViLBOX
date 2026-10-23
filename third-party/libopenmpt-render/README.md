# libopenmpt for the DJ render worker

`build.sh` builds `public/chiptune3/libopenmpt.render.js`, the libopenmpt the DJ
render worker (`src/workers/dj-render.worker.ts`, `renderWithLibopenmpt`) renders
every libopenmpt format with (XM, S3M, IT, MPTM, ...; MOD goes to UADE).

- Source: libopenmpt 0.8.4 (`libopenmpt-0.8.4+release.makefile.tar.gz` from
  lib.openmpt.org, SHA-256 pinned in `build.sh`), BSD licence (`LICENSE` in the tarball).
  0.8.4 is the version the tracker's live playback ships prebuilt
  (`public/chiptune3/libopenmpt.worklet.js`, chiptune3). Built unpatched with
  this script, it renders MOD (Amiga resampler), S3M, IT and XM sample-exact to
  that binary, so a deck render sounds as the tracker does.
- `devilbox-taps.patch` (changes marked `DEViLBOX:`):
  - per-channel taps in the mixer (`soundlib/Fastmix.cpp`, `Sndmix.cpp`,
    `Sndfile.h`): with taps on, each pattern channel (its NNA voices folded in)
    mixes into its own buffer, summed into the mix after all voices, global
    volume applied to each tap as to the mix;
  - C API `openmpt_module_enable_channel_taps(mod, count)` and
    `openmpt_module_read_channel_tap(mod, channel, count, left, right)`: each
    read call's tapped channels, converted like the mix (fixed point to float,
    master gain);
  - `build/make/config-emscripten.mk`: the runtime methods the worker uses
    (`stackSave`, `stackAlloc`, `wasmTable`, `HEAP*`, `UTF8ToString`).
- `devilbox-edit.patch` (applied after the taps patch): in-place edit C API on
  `openmpt_module*` so the tracker worklet edits a playing module without rebuilding it:
  `openmpt_module_set_pattern_cell`, `_set_order_pattern`, `_set_num_orders`,
  `_resize_pattern`, `_add_pattern`, `_set_initial_speed`, `_set_initial_tempo`,
  `_set_midi_macro` (same semantics as `openmpt_soundlib_bridge.cpp`), plus the
  `HEAPU16`/`HEAP64`/`HEAPU64` runtime methods. `build.sh` also writes the result to
  `public/chiptune3/libopenmpt.worklet.js`. Measured 2026-10-23: 30 s renders of a MOD
  and an XM are byte-identical to the previous shipped worklet binary.
- Measured 2026-10-13 (30 s renders, Node): taps on, the mix stays within
  5e-6 (-106 dBFS) of the shipped binary (each tapped channel keeps its own
  end-of-sample click-removal tail, which decays in integer steps), and the taps
  sum to the mix within -146 dB (MOD -157, S3M -146, XM -148).
- Not tapped (they reach the mix, no stem): OPL (S3M AdLib) voices, reverb sends,
  plugins, surround channels. The taps are taken before stereo separation and DSP,
  which the renderer leaves at 100 % / off.

Usage: `emcc` on PATH (tested with emcc 4.0.16), then `third-party/libopenmpt-render/build.sh`.
