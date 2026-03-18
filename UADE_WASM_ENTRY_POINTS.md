# UADE WASM - Key Entry Points & Code Flow

## JavaScript → WASM Boundary

### 1. Init Flow
```
JavaScript:
    uade = await createUADE()
    uade.init(44100)
                ↓
entry.c:uade_wasm_init(44100):
    ├─ populate_virtual_fs()
    │  ├─ FS.mkdir('/uade', '/uade/players', etc)
    │  ├─ Write 175 eagleplayers from player_registry.c
    │  └─ Write config files from basedir_data.c
    ├─ uade_new_state()
    │  └─ uade_arch_spawn() → shim_ipc.c
    │     └─ uadecore_wasm_init() [uadecore_wasm.c Phase 1 prep]
    ├─ uade_config_set_option() [frequency, panning]
    └─ return 0 (success)
```

**Files involved:**
- `entry.c` (1000+ lines) - Main API
- `player_registry.c` (auto-generated) - All 175 players
- `basedir_data.c` (auto-generated) - Config files
- `shim_ipc.c` - IPC initialization

---

### 2. Load & Play Flow
```
JavaScript:
    uade.load(moduleData, "myfile.mod")
                ↓
entry.c:uade_wasm_load(data, len, filename):
    ├─ Write file to MEMFS (/uade/myfile.mod)
    ├─ uade_shim_reset_for_load() [shim_ipc.c]
    │  └─ Clear ring buffers, reset core phase
    ├─ guarded_play(vpath, -1) [with exit() catching]
    │  └─ uade_play() [libuade frontend, uadestate.c]
    │     ├─ Detect format (eagleplayer matching)
    │     ├─ Load SCORE (68k replay binary)
    │     ├─ Send IPC: SCORE + PLAYER + MODULE + TOKEN
    │     │  └─ These go to s_cmd_buf [shim_ipc.c]
    │     ├─ Read IPC: CAN_PLAY + TOKEN
    │     │  └─ shim_ipc.c:uade_shim_read_rsp()
    │     │     └─ While response empty:
    │     │        └─ uadecore_handle_one_message() [Phase 2]
    │     │           ├─ uadecore_reset() [receive SCORE+player+module]
    │     │           ├─ m68k_reset()
    │     │           └─ customreset()
    │     ├─ Send IPC: CONFIG messages + TOKEN
    │     └─ Return 1 (success)
    └─ return 0
```

**Files involved:**
- `entry.c` - Load orchestration
- `shim_ipc.c` - Ring buffer IPC (read_rsp triggers core)
- `uadecore_wasm.c` - Phase 2: SCORE+module handling

---

### 3. Render (Audio) Flow
```
JavaScript:
    const left = new Float32Array(4096);
    const right = new Float32Array(4096);
    uade.render(left, right, 4096)
                ↓
entry.c:uade_wasm_render(out_l, out_r, frames):
    ├─ Loop: while (frames_done < frames_needed)
    │  ├─ guarded_read(tmp, chunk*4) [chunk=4096 max]
    │  │  └─ uade_read() [libuade]
    │  │     └─ shim_ipc.c:uade_shim_read_rsp()
    │  │        └─ While response empty:
    │  │           └─ uadecore_handle_one_message()
    │  │              ├─ Phase 3 [if first read]: handle_r_state()
    │  │              │  [process config messages]
    │  │              └─ Phase 4: m68k_run_1()
    │  │                 ├─ Execute 68k instructions
    │  │                 ├─ Paula chip writes samples
    │  │                 ├─ CIA-A Timer A fires
    │  │                 │  └─ uade_wasm_on_cia_a_tick() [entry.c]
    │  │                 │     ├─ g_uade_tick_count++
    │  │                 │     └─ Capture tick snapshot (if enabled)
    │  │                 │        [populate g_tick_snaps ring buf]
    │  │                 ├─ Paula writes → uade_wasm_log_paula_write()
    │  │                 │  [populate g_paula_log ring buf]
    │  │                 └─ When audio ready: uadecore_wasm_yield = 1
    │  │                    [break out of m68k_run_1()]
    │  ├─ Read PCM int16 samples from tmp[]
    │  ├─ Convert int16 → float32: out_l[i] = tmp[i*2]/32768.0f
    │  └─ Convert int16 → float32: out_r[i] = tmp[i*2+1]/32768.0f
    │
    ├─ s_total_frames += frames_done
    └─ return 1 (success) or 0 (song ended)
```

**Key functions:**
- `entry.c:uade_wasm_render()` - Main render entry
- `shim_ipc.c:uade_shim_read_rsp()` - Pulls responses, triggers core
- `uadecore_wasm.c:uadecore_handle_one_message()` - 4-phase state machine
- `newcpu.c:m68k_run_1()` - CPU emulation (from UADE core)

---

### 4. Pattern Extraction Flow
```
JavaScript:
    uade.enablePaulaLog(true)
    uade.enableTickSnapshots(true)
    // Play song...
    const paulaBuf = new Uint32Array(maxEntries * 3);
    const count = uade.getPaulaLog(paulaBuf, maxEntries);
                ↓
entry.c:uade_wasm_enable_paula_log(enable):
    └─ g_paula_log_enabled = enable
       g_paula_log_read = g_paula_log_write = 0
                ↓
[During render, each Paula write triggers:]
entry.c:uade_wasm_log_paula_write(channel, reg, value):
    ├─ idx = g_paula_log_write & PAULA_LOG_MASK
    ├─ g_paula_log[idx] = {
    │    channel, reg, value,
    │    source_addr: g_uade_last_chip_read_addr,
    │    tick: g_uade_tick_count
    │ }
    └─ g_paula_log_write++
                ↓
entry.c:uade_wasm_get_paula_log(out, maxEntries):
    ├─ Loop: while (count < maxEntries && read != write)
    │  ├─ idx = g_paula_log_read & PAULA_LOG_MASK
    │  ├─ e = &g_paula_log[idx]
    │  ├─ out[count*3+0] = (channel<<24)|(reg<<16)|value
    │  ├─ out[count*3+1] = source_addr
    │  ├─ out[count*3+2] = tick
    │  ├─ g_paula_log_read++
    │  └─ count++
    └─ return count

[Tick snapshots similar, but triggered by uade_wasm_on_cia_a_tick()]
```

**Buffers:**
- `g_paula_log[512]` - Ring buffer (circular)
- `g_tick_snaps[4096]` - Ring buffer (circular)
- Both captured during m68k emulation, drained by JavaScript

---

## Core State Machine Flow (uadecore_wasm.c)

```
Initial State: s_core_phase = 0 (uninit)

uadecore_wasm_init():
    → s_core_phase = 1 (waiting for CONFIG)

uade_play() sends CONFIG:
    → shim_ipc.c:uade_shim_read_rsp() triggers...

uadecore_handle_one_message():

┌─────────────────────────────────────────────────────────┐
│ Phase 1: CONFIG + HW Init                               │
│ - Receive CONFIG (path to uaerc)                        │
│ - Load config file                                      │
│ - machdep_init(), setup_sound(), memory_init(), etc.   │
│ - s_hw_initialized = 1                                  │
│ - s_core_phase = 2                                      │
│                                                          │
│ Phase 2: SCORE + Module Load                            │
│ - uadecore_reset() [reads SCORE, player, module]        │
│ - m68k_reset(), customreset()                           │
│ - Send CAN_PLAY + TOKEN response                        │
│ - s_core_phase = 3                                      │
│                                                          │
│ Phase 3: Config Messages                                │
│ - uadecore_handle_r_state() [receives filter, freq...]  │
│ - If no reboot: s_core_phase = 4                        │
│ - Else: s_core_phase = 2                                │
│                                                          │
│ Phase 4: 68k Emulation                                  │
│ - Check uadecore_wasm_yield (audio ready?)              │
│   If yes: reset yield, call uadecore_handle_r_state()   │
│ - Check uadecore_reboot (module finished?)              │
│   If yes: send TOKEN, s_core_phase = 2                  │
│ - m68k_run_1() [execute instructions until audio ready] │
│   ├─ Paula writes → uade_wasm_log_paula_write()         │
│   ├─ CIA-A tick → uade_wasm_on_cia_a_tick()             │
│   ├─ Paula readies samples → uadecore_wasm_yield = 1    │
│   └─ Continue                                            │
│                                                          │
│ [Loop back to Phase 4 or restart at Phase 2]            │
└─────────────────────────────────────────────────────────┘
```

**Synchronization:**
- Frontend reads response → `uade_shim_read_rsp()` triggers core processing
- Core runs until response ready (audio data or status message)
- Frontend receives response, processes it
- Repeat

---

## Memory Access Flow (Debugging/Sample Extraction)

```
JavaScript:
    const sampleAddr = 0x010234;  // from channel snapshot
    const sampleData = new Uint8Array(256);
    uade.readMemory(sampleAddr, sampleData, 256);
                ↓
entry.c:uade_wasm_read_memory(addr, out, len):
    ├─ Loop: for (i = 0; i < len; i++)
    │  ├─ out[i] = byteget(addr + i) [memory.c: chip RAM access]
    │  └─ [triggers uade_wasm_check_wp_read() if watchpoint active]
    └─ return 0
                ↓
memory.c:chipmem_bget(addr):
    ├─ #ifdef UADE_WASM
    │  └─ uade_wasm_check_wp_read(addr, value)
    │     [populate watchpoint log if in active range]
    └─ return byte

[Similarly for write_memory() → chipmem_bput() → uade_wasm_check_wp_write()]
```

**Access path:**
- JavaScript → `uade_wasm_read_memory()` 
- → `byteget()` (memory.c, goes through UAE banking)
- → actual chip RAM (WASM linear memory)
- ← with optional watchpoint check

---

## Ring Buffer IPC Mechanics (shim_ipc.c)

### Writing (Frontend → Core)

```
JavaScript calls uade_play():
    libuade:uade_send_string(UADE_COMMAND_SCORE, ...):
        uade_atomic_write(FD_9001, data):
            unixatomic_wasm.c: stub (just calls write)
                shim_ipc.c:read() intercepts FD 9001:
                    uade_shim_write_cmd(data):
                        ring_write(&s_cmd_buf, data, count)
                        return count
```

### Reading (Core → Frontend)

```
JavaScript calls uade_wasm_render():
    libuade:uade_read(...):
        uade_receive_message(...):
            unixatomic_wasm.c: stub
                shim_ipc.c:write() intercepts FD 9002 (response):
                    uade_shim_read_rsp(buf, count):
                        while (s_rsp_buf empty && iters--):
                            uadecore_handle_one_message()  ← SYNC CALL
                        return data from s_rsp_buf
```

**Key insight:** Response reads **pull** core processing, which runs synchronously.

---

## File Layout Summary

### WASM Shim Layer (uade-wasm/src/)
```
entry.c              ← Main API + ring buffer lifecycle
├─ uade_wasm_init()
├─ uade_wasm_load()
├─ uade_wasm_render()
├─ uade_wasm_get_paula_log()
├─ uade_wasm_on_cia_a_tick() [called by cia.c]
├─ uade_wasm_log_paula_write() [called by audio.c]
├─ uade_wasm_check_wp_read/write() [called by memory.c]
└─ g_paula_log[512], g_tick_snaps[4096], etc.

uadecore_wasm.c      ← 4-phase state machine
├─ uadecore_wasm_init()
├─ uadecore_handle_one_message()
│  ├─ Phase 1: CONFIG + HW init
│  ├─ Phase 2: SCORE + module
│  ├─ Phase 3: config messages
│  └─ Phase 4: m68k_run_1()
└─ uadecore_wasm_reset_for_load()

shim_ipc.c           ← Ring buffer IPC
├─ uade_shim_write_cmd()   [frontend writes command]
├─ uade_shim_read_rsp()    [frontend reads response, triggers core]
├─ uade_shim_write_rsp()   [core writes response]
├─ uade_shim_read_cmd()    [core reads command]
├─ uade_arch_spawn()       [replace fork(), init core]
└─ RingBuf s_cmd_buf, s_rsp_buf (256 KiB each)

paula_log.h          ← Data structure definitions
├─ UadePaulaLogEntry (12 bytes)
├─ UadeChannelTick (12 bytes)
├─ UadeTickSnapshot (52 bytes)
└─ UadeWpHit (14 bytes)
```

### Generated Files (uade-wasm/generated/)
```
cpuemu.c             ← 68k CPU emulator (2.2 MB, generated from table68k)
cpudefs.c            ← 68k instruction metadata
cpustbl.c, cputbl.h  ← CPU state tables
cpuemu{1..8}.o       ← Split compilation objects
```

### Auto-Generated Registry (uade-wasm/src/)
```
player_registry.c    ← 175 eagleplayer binaries (from generate_registry.py)
basedir_data.c       ← Config files (uaerc, eagleplayer.conf, score binary)
```

---

## Hook Points in UADE Core

### cia.c: CIA-A Tick Counting
```c
// In CIA_update(), when CIA-A Timer A overflows:
#ifdef UADE_WASM
    extern void uade_wasm_on_cia_a_tick(void);
    uade_wasm_on_cia_a_tick();  // Increments g_uade_tick_count
#endif
```

### audio.c: Paula Register Logging
```c
// In all AUDx register write handlers:
#ifdef UADE_WASM
    extern void uade_wasm_log_paula_write(uint8_t ch, uint8_t reg, uint16_t val);
    uade_wasm_log_paula_write(ch, reg, val);  // Populates g_paula_log
#endif
```

### memory.c: Memory Watchpoints
```c
// In chipmem_bget() (read):
#ifdef UADE_WASM
    extern void uade_wasm_check_wp_read(uint32_t addr, uint32_t value);
    uade_wasm_check_wp_read(addr, value);
#endif

// In chipmem_bput() (write):
#ifdef UADE_WASM
    extern void uade_wasm_check_wp_write(uint32_t addr, uint32_t value);
    uade_wasm_check_wp_write(addr, value);
#endif
```

### uade.c: Yield Signal
```c
// In uadecore_check_sound_buffers():
#ifdef UADE_WASM
    extern volatile int uadecore_wasm_yield;
    uadecore_wasm_yield = 1;  // Signal audio ready
#endif
```

---

## Summary

**The architecture is elegantly minimal:**

1. **Init:** Mount MEMFS, create UADE state, init core (Phase 1)
2. **Load:** Write file, send SCORE+player+module, receive CAN_PLAY (Phase 2)
3. **Render:** Pull audio from core, which runs m68k emulation until audio ready (Phase 4)
4. **Logging:** Capture Paula writes + CIA ticks into ring buffers
5. **Debugging:** Memory access + watchpoints for reverse engineering

All coordinated through a simple **pull-triggered synchronous IPC shim** using ring buffers.

