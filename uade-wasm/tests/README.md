# uade-wasm/tests — native harnesses for the UADE core

These run the C sources directly, outside Emscripten, so bugs that only show up as
memory corruption inside a 128 MB wasm heap become hard failures.

## audio.device memory safety

`third-party/uade-3.05/src/audiodevice.c` is a trust boundary. The fake audio.device
receives `struct IOAudio` requests built by 68k code that a module controls, and turns
their fields into host pointers (`ioa_Data`), array indices (`io_Unit` -> channel), loop
bounds (`ioa_Length`) and linked-list walks (the reply chain). Nothing upstream sanitises
them.

```
./run_audiodevice_tests.sh                       # current source
./run_audiodevice_tests.sh /path/to/audiodevice.c  # any other revision
```

The script compiles `test_audiodevice.c` plus the target source under
AddressSanitizer + UBSan with `-fno-sanitize-recover=all`, and runs each case in its own
process with a timeout, so a sanitizer finding aborts and an unbounded loop shows up as a
timeout instead of hanging the suite.

`adshim/` replaces the UADE headers the file includes (`memory.h`, `audio.h`, `custom.h`,
`sysdeps.h`, `sysconfig.h`) with minimal test versions, and is placed first on the include
path — the same shadowing trick `build.sh` uses for `sd-sound.h`. Two properties matter:

- `get_real_address()` translates an address **without checking it**, exactly like the real
  one, so any address the code fails to validate resolves outside the backing buffer.
- the buffer is `calloc`'d rather than a global: a 32 KB global lands in `__common` on
  macOS, where the linker de-aligns it and ASan cannot fence it with redzones.

The fake memory map puts `ioa_Data` **last**. `alloc_channels()` scans forward from it, so
any structure placed after it would be read as a channel mask and end the scan early —
which silently hid the `ioa_Length` overrun while this harness was being written.

### Cases

| case | drives |
|------|--------|
| `write_no_channel` | `CMD_WRITE` with `io_Unit` = 0 -> channel -1 indexing `_write_msg_list[]` |
| `pervol_no_channel` | `ADCMD_PERVOL` with `io_Unit` = 0 -> channel -1 reaching `audio_channel[]` |
| `abortio_bad_cmd` | `AbortIO` with `io_Command` = 9999 -> `cmd_labels[]` (33 entries) |
| `open_huge_length` | `OpenDevice` with `ioa_Length` = 0x0fffffff -> unbounded prefs scan |
| `bad_request_addr` | request pointer outside mapped memory -> unvalidated dereference |
| `cyclic_reply_list` | reply chain that loops back on itself -> unbounded walk |

All six fail against the pre-fix `audiodevice.c` (five sanitizer aborts, one timeout) and
pass against the current one. `src/engine/uade/__tests__/audiodeviceSafety.test.ts` runs
the script as part of `npm run test:ci`, and `.github/workflows/uade-core.yml` runs it in CI.

## Message-id lockstep

`../verify_amigamsg.py` checks that `score.s`'s `AMIGAMSG_* equ` constants and the
`enum amigamsg` in `amigamsg.h` agree. They are a wire protocol between the 68k score and
the host with nothing linking them, so an enumerator inserted in the middle of the enum
silently re-numbers every message after it.
