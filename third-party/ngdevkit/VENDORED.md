# ngdevkit (vendored subset)

- Upstream: https://github.com/dciabrin/ngdevkit
- Pinned commit: 8756cbd188bf10f54d75fb3d62463d0213115f6b (2026-11-06, "nullsound" era of Homebrew
  ngdevkit 0.5+202611061802-1).
- Why this commit and not master: the Neo Geo ROM build (ArcadeGame Makefile, tools/neogeo-rom-check.ts)
  links the patched nullsound modules against the installed Homebrew `nullsound.lib`, which is built from
  8756cbd. Upstream master (6962480, 2026-11-25) reorganised nullsound memory layout; mixing those sources
  with the 8756cbd lib breaks the FM state alignment. Bump this pin only together with the Homebrew lib.
- License: GPL-3.0-or-later for the tools (COPYING), LGPL-3.0-or-later for nullsound (COPYING.LESSER);
  both files are kept verbatim here.
- Taken: `tools/`, `nullsound/`, `COPYING`, `COPYING.LESSER`, `README.md` (via `git archive 8756cbd`).
  Not taken: toolchain build files, runtime, nullbios, include, CI, the .git directory. No build outputs.

## Local changes (grep `DEViLBOX patch`)

- `tools/furtool.py`: reads the Furnace virtual tempo N/D; SSG `noiseFreq` macro -> props byte 6 ->
  YM2610 reg 0x06; the "macro element not supported" warning prints the key, not a stale loop variable.
- `tools/nsstool.py`: timer B follows the virtual tempo (hz * N / D, out-of-range = error); FDxx emits a
  tempo opcode; F8xx / F9xx emit `vol_step_u` / `vol_step_d`.
- `nullsound/nss-ssg.s`: `state_ssg_noise_period` props byte (+6) so the noise macro does not clobber
  `state_ssg_macro_data`.
- `nullsound/stream.s`: opcode slots 0x32 / 0x4d = `vol_step_u` / `vol_step_d`.
- `nullsound/nss-vol-step.s` (new): the two volume-step opcodes.

The patched furtool.py and the patched nss-ssg.s must ship together: patched furtool against a stock
driver writes key 6 over the SSG macro pointer.

## Running

Only the Python standard library is needed: `python3 third-party/ngdevkit/tools/furtool.py ...`
(nsstool.py imports furtool from its own directory).
