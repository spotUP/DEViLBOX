---
date: 2026-03-08
topic: tfmx-uade-ipc-deadlock
tags: [uade, wasm, tfmx, ipc, deadlock, companion-files]
status: implemented
---

# TFMX UADE Loading: IPC Deadlock Root Cause Analysis

## Summary

TFMX (and all multi-file UADE formats) failed to load in the WASM build due to a
**single-threaded IPC deadlock** in `uade_request_amiga_file()`. The fix bypasses
the IPC round-trip in the WASM build, resolving companion files directly from MEMFS.

## Root Cause

### Native UADE Architecture
In native UADE, the frontend (libuade) and core (uadecore/68k emulator) run in
**separate processes** connected by a Unix socketpair:

```
Frontend process                    Core process (fork'd)
─────────────────────               ───────────────────────
uade_play_internal()                uadecore main loop
  event loop:                         68k emulation
    read(pipe) → process              AMIGAMSG_LOADFILE:
                                        uade_request_amiga_file():
                                          write(pipe, REQUEST_AMIGA_FILE)
                                          read(pipe) → gets file back ✓
    handle_request_amiga_file():
      uade_find_amiga_file()
      send_file_back()
      write(pipe, file data)
```

The two processes run concurrently, so the core can block on `read(pipe)` while the
frontend handles the request asynchronously.

### WASM Architecture (the bug)
In the WASM build, both sides run in a **single thread** with ring buffers replacing
the socketpair. The "core processing" happens synchronously inside
`uadecore_handle_one_message()`, which is called from `uade_shim_read_rsp()`:

```
Frontend (same thread)                                Core (same call stack)
─────────────────────                                 ───────────────────────
uade_play_internal()
  uade_get_event()
    uade_receive_message()
      uade_atomic_read(RSP_FD)
        uade_shim_read_rsp()                   ←──── calls core processing
          uadecore_handle_one_message()        ────→ 68k emulation runs
                                                      AMIGAMSG_LOADFILE:
                                                        uade_request_amiga_file():
                                                          write(RSP) ← request goes here
                                                          read(CMD) ← EMPTY! DEADLOCK!
                                                                       Frontend can't run
                                                                       because we're inside it
```

The core writes `REQUEST_AMIGA_FILE` to the RSP buffer and then tries to read a
response from the CMD buffer. But the CMD buffer is empty — the frontend code that
would process the request and put a response in CMD is higher up in the call stack,
blocked waiting for the core processing to finish. **Classic single-threaded deadlock.**

### Error Manifestation

```
uade_receive_file(): Can not get meta     ← core tried to read file, CMD buffer empty
exit(1) intercepted via longjmp          ← uade.c AMIGAMSG_LOADFILE calls exit(1) on NULL
exit(1) during uade_play                 ← longjmp caught by setjmp guard
guarded_play returned: -1               ← play failed
protocol error: sending in R state is forbidden  ← IPC state machine corrupted by exit(1)
```

## Fix

### `uadeipc.c` — Bypass IPC for WASM (the core fix)

Added `#ifdef __EMSCRIPTEN__` override of `uade_request_amiga_file()` that resolves
files directly from MEMFS instead of doing the IPC round-trip:

```c
#ifdef __EMSCRIPTEN__
struct uade_file *uade_request_amiga_file(const char *name, struct uade_ipc *ipc)
{
    char realname[PATH_MAX];
    (void)ipc;
    if (uade_find_amiga_file(realname, sizeof realname, name, "/uade") == 0) {
        struct uade_file *f = uade_file_load(realname);
        if (f != NULL) return f;
    }
    // Return "file not found" struct (NULL data, size=-1)
    struct uade_file *f = calloc(1, sizeof(*f));
    if (f) { f->data = NULL; f->size = (size_t)-1; }
    return f;
}
#else
// ... original IPC-based implementation
#endif
```

### `entry.c` — Set CWD to /uade/

Added `chdir("/uade")` before `guarded_play()` so relative companion paths resolve
correctly. Some eagleplayers may request companions using relative paths.

## Affected Formats

This fix applies to ALL multi-file UADE formats where the 68k eagleplayer requests
companion files during playback. Known affected:

| Format | Companion Files | Notes |
|--------|----------------|-------|
| TFMX | mdat.* + smpl.* | R-Type, Turrican, many others |
| TFMX 1.5 | mdat.* + smpl.* | Older TFMX variant |
| Any format using AMIGAMSG_LOADFILE | Various | e.g., Crystal Palace uses AMIGAMSG_READ |

## Test Results

| Test | Result | Notes |
|------|--------|-------|
| David Whittaker (single file) | ✅ PASS | Baseline — never needed companion files |
| TFMX mdat.acieed1 + smpl.acieed1 | ✅ PASS | **Was failing before fix** |
| TFMX with old vpath "song" | ❌ FAIL | Expected — old vpath produces wrong companion name |

## Files Modified

| File | Change |
|------|--------|
| `third-party/uade-3.05/src/frontends/common/uadeipc.c` | Added `#ifdef __EMSCRIPTEN__` override of `uade_request_amiga_file()` |
| `uade-wasm/src/entry.c` | Added `chdir("/uade")` before playback |
| `public/uade/UADE.wasm` + `UADE.js` | Rebuilt |

## Key Insight

The `/uade/<filename>` vpath change (preserving original filenames instead of using
generic "song") is **required** for multi-file formats. The 68k eagleplayer derives
companion filenames from the module name. If the module is called "song", the TFMX
player requests "smpl.song" — which doesn't exist. With the original name
"mdat.acieed1", it correctly requests "smpl.acieed1".
