# amiga-adf

Bootable Amiga ADF export: a bootblock trackloader that loads the UADE glue,
one eagleplayer and a module slot, then plays the module on an A500 (68000,
512K chip + 512K slow RAM, Kickstart 1.3 or later).

Build (always through the build queue):

    ~/.claude/bin/buildq --purpose "<who>: <task>" -- \
      python3 third-party/amiga-adf/build_adf.py --module <dir-with-only-the-mod>/x.mod --out <outdir>

Stage the module from a directory holding only that file: PTK-Prowiz declares
DTP_ExtLoad, so `uade_stage.py` picks up any sibling file that matches a
companion name.

Output: `devilbox.adf` and `layout.json` (module slot disk offset and maximum
size, disk offset of the 32-bit big-endian module length word, memory map).

## Origin and licence of each file

Copied from the Up Rough Demo System (`~/Code/UpRough/Up_Rough_Demo_System`,
same owner as DEViLBOX, no separate licence file there). That repository is
read-only from here: fixes go into these copies, never back into it.

| File here | Source in the demo system | Licence | Local change |
|-----------|---------------------------|---------|--------------|
| `amiga/uade_glue.s` | `amiga/uade_glue.s` | Up Rough (owner's code); includes UADE score, GPL v2 | module length read from the patchable `_uade_module_len` word instead of the `UADE_MODULE_BYTES` immediate (2 sites); score include path |
| `amiga/uade_probe.s` | `amiga/uade_probe.s` | Up Rough | none; used as the host (`_start`) |
| `amiga/input_sdk.s` | `amiga/input_sdk.s` | Up Rough | none; score.s calls `_input_key_event` under UADE_NATIVE |
| `amiga/uade_layout.i`, `paula_silence.i`, `cache_flush.i`, `cia_giveback.i` | `amiga/` | Up Rough | none |
| `amiga/uade.mk` | `amiga/uade.mk` | Up Rough | none; reference only, `build_adf.py` replaces it |
| `amiga/uade_arena_sizes.tsv`, `uade_player_min_cpu.tsv`, `uade_formats.txt` | `amiga/` | Up Rough | none |
| `score/score.s`, `score/config.i`, `score/relocator.s` | `amiga/vendor/uade-3.05/amigasrc/score/` | UADE, GPL v2 (`third-party/uade-3.05/COPYING.GPL`) | none here; these are the demo system's bare-metal patches of UADE 3.05 score |
| `amiga/uade_ahx_waves.bin` | `amiga/uade_ahx_waves.bin` (sha256 `bb414901...8be10`) | Up Rough (captured off a device run of the AHX player) | none; AHX v2 waveform/filter table the stager feeds through ENV:EaglePlayer/ahx |
| `tools/uade_stage.py`, `uade_lookup.py`, `hunkdump.py`, `uade_arena_table.py` | `tools/` | Up Rough | none |
| `players/SIDMon1.0.PATCHED`, `players/custom` | `amiga/vendor/uade-3.05/players/` | UADE player distribution (GPL v2 package; individual player authors) | none |

All other players and the score include files (`custom.i`, `exec_lib.i`, ...)
come from the vendored `third-party/uade-3.05/`.

PTK-Prowiz check: sha256 `cea8f553a382654d56d8d7e27ec26cf9374db54e3e9dcab5be9b4f092e57e9ca`
in both the demo system and `third-party/uade-3.05/players/` -- identical, so
the vendored copy is used.

New here (DEViLBOX): `adf/adf_boot.s` (bootblock trackloader), `build_adf.py`.
