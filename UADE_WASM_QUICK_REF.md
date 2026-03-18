# UADE WASM Integration - Quick Reference Guide

## File Structure

```
uade-wasm/
├── build.sh                    # Build orchestration (3 steps)
├── generate_registry.py        # Embed players & config
├── generated/                  # CPU tables (generated)
│   ├── cpuemu.c               # 68k CPU (2.2 MB, generated)
│   ├── cpudefs.c, cpustbl.c, cputbl.h
│   └── cpuemu{1..8}.o         # Split compilation objects
│
└── src/                        # WASM-specific layer (14 files)
    ├── entry.c                # WASM API exports (34 functions)
    ├── uadecore_wasm.c        # 4-phase state machine
    ├── shim_ipc.c             # Ring buffer IPC (256 KB each)
    ├── paula_log.h            # Paula register logging
    ├── Stubs: uade_logging_stub.c, state_detection_stub.c, 
    │          rmc_stub.c, uade_exit_override.c, 
    │          unixatomic_wasm.c
    └── player_registry.c/basedir_data.c (auto-generated)
```

## Core Concepts

### 1. Single-Process Merge
**Native:** libuade ↔️ socketpair ↔️ uadecore (separate process)
**WASM:** libuade → ring buffer ← uadecore (same process, synchronous)

### 2. 4-Phase State Machine (uadecore_wasm.c)
```
Phase 1: CONFIG + HW init (once per module lifetime)
Phase 2: SCORE + module (once per song load)
Phase 3: Config messages (filter, frequency, etc)
Phase 4: m68k_run_1() emulation (continuous until audio produced)
```

### 3. Ring Buffer IPC (shim_ipc.c)
- 256 KiB command buffer (frontend → core)
- 256 KiB response buffer (core → frontend)
- Power-of-2 size for fast masking
- Circular with head/tail pointers
- Pull-triggered: frontend reads → triggers core processing

## API Groups (34 Exported Functions)

### Playback (5)
- `uade_wasm_init(sample_rate)` - One-time setup
- `uade_wasm_load(data, len, filename)` - Load & play
- `uade_wasm_render(out_l, out_r, frames)` - Audio output
- `uade_wasm_stop()` - Stop playback
- `uade_wasm_cleanup()` - Deallocate

### Song Info (6)
- `uade_wasm_get_subsong_count/min/max()` - Subsong info
- `uade_wasm_get_player_name(out, maxlen)` - Player type
- `uade_wasm_get_format_name(out, maxlen)` - Format type
- `uade_wasm_set_subsong(subsong)` - Switch subsong
- `uade_wasm_set_looping(loop)` - Loop on end
- `uade_wasm_set_one_subsong(on)` - Single subsong mode

### Live State (4)
- `uade_wasm_get_channel_snapshot(out[16])` - 4ch × 4 uint32
- `uade_wasm_get_channel_extended(out[32])` - 4ch × 8 uint32
- `uade_wasm_get_cia_state(out[5])` - CIA timers
- `uade_wasm_get_total_frames()` - Frames rendered

### Pattern Extraction (6)
- `uade_wasm_enable_paula_log(enable)` - Start/stop logging
- `uade_wasm_get_paula_log(out[], maxEntries)` - Drain log
- `uade_wasm_get_tick_count()` - Musical time
- `uade_wasm_enable_tick_snapshots(enable)` - Capture ticks
- `uade_wasm_reset_tick_snapshots()` - Clear buffer
- `uade_wasm_get_tick_snapshots(out[], maxSnaps)` - Drain snapshots

### Memory Access (4)
- `uade_wasm_read_memory(addr, out[], len)` - Read chip RAM
- `uade_wasm_write_memory(addr, data[], len)` - Write chip RAM
- `uade_wasm_read_string(addr, out[], maxlen)` - Read C string
- `uade_wasm_add_extra_file(filename, data, len)` - Write to MEMFS

### Debugging (4)
- `uade_wasm_set_watchpoint(slot, addr, size, mode)` - Set WP
- `uade_wasm_clear_watchpoint(slot)` - Clear WP
- `uade_wasm_clear_all_watchpoints()` - Clear all
- `uade_wasm_get_watchpoint_hits(out[], maxHits)` - Drain log

### Misc (2)
- `uade_wasm_mute_channels(mask)` - Mute individual channels
- `uade_wasm_reset_tick_count()` - Reset tick counter

## Data Formats

### Paula Log Entry
```c
struct {
    uint8_t  channel;       // 0-3
    uint8_t  reg;           // 0=LCH, 1=LCL, 2=LEN, 3=PER, 4=VOL, 5=DAT
    uint16_t value;         // Value written
    uint32_t source_addr;   // PC (chip RAM address)
    uint32_t tick;          // CIA-A tick count
} // 12 bytes
```

### Tick Snapshot
```c
struct {
    uint32_t tick;          // CIA-A tick count
    struct {                // Per channel (0-3)
        uint16_t period;    // Pitch (Amiga units)
        uint16_t volume;    // 0-64
        uint32_t lc;        // Sample start address
        uint16_t len;       // Sample length (words)
        uint8_t dma_en;     // DMA active (0/1)
        uint8_t triggered;  // Reserved
    } channels[4];
} // 52 bytes
```

### Watchpoint Hit
```c
struct {
    uint32_t addr;          // Address accessed
    uint32_t value;         // Value read/written
    uint32_t tick;          // CIA-A tick
    uint8_t is_write;       // 1=write, 0=read
    uint8_t wp_slot;        // Watchpoint slot (0-7)
} // 14 bytes
```

## Key Modifications to UADE Core

Only 4 strategic insertion points (all `#ifdef UADE_WASM`):

1. **cia.c** CIA_update() → calls `uade_wasm_on_cia_a_tick()`
   - Increments tick counter
   - Captures 4-channel snapshots

2. **audio.c** Paula register handlers → call `uade_wasm_log_paula_write()`
   - Logs every Paula write with source address

3. **memory.c** chipmem_bget/bput → call `uade_wasm_check_wp_read/write()`
   - Memory watchpoint detection

4. **uade.c** uadecore_check_sound_buffers() → sets `uadecore_wasm_yield`
   - Signals to break out of m68k_run_1()

## Pattern Extraction Workflow

```typescript
// 1. Enable logging
uade.enablePaulaLog(true);
uade.enableTickSnapshots(true);

// 2. Play part of song
for (let i = 0; i < 50000; i++) {
    uade.render(out, out, 4096);  // Dummy output
}

// 3. Drain Paula log
const paula = new Uint32Array(maxEntries * 3);
const paulaCount = uade.getPaulaLog(paula, maxEntries);
// paula[i*3] = (channel<<24)|(reg<<16)|value
// paula[i*3+1] = source_addr
// paula[i*3+2] = tick

// 4. Drain tick snapshots
const snaps = new Uint32Array(maxSnaps * 13);
const snapCount = uade.getTickSnapshots(snaps, maxSnaps);
// snaps[i*13] = tick
// snaps[i*13+1+ch*3] = (period<<16)|volume
// snaps[i*13+1+ch*3+1] = lc
// snaps[i*13+1+ch*3+2] = (len<<8)|(dma_en<<1)|triggered

// 5. Analyze patterns from logs
```

## Build Process

```bash
cd uade-wasm

# Step 1: Generate player registry
python3 generate_registry.py
# → src/player_registry.c (175 players)
# → src/basedir_data.c (config files)

# Step 2: Generate CPU opcode tables (NATIVE)
cc -o generated/build68k uade-3.05/src/build68k.c
./generated/build68k < uade-3.05/src/table68k > generated/cpudefs.c
cc -o generated/gencpu gencpu.c readcpu.c cpudefs.c missing.c
./generated/gencpu
# → generated/cpuemu.c (2.2 MB)
# → generated/cpustbl.c, cputbl.h

# Step 3: Compile with Emscripten
emcc -O2 -DUADE_WASM=1 \
  -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=134217728 \
  -sMODULARIZE=1 -sEXPORT_NAME=createUADE \
  uade_core.c uade_frontend.c \
  shim_ipc.c entry.c \
  cpuemu{1..8}.o \
  -o ../public/uade/UADE.js
```

## Virtual Filesystem (MEMFS)

Mounted at startup:
```
/uade/
├── players/                 # 175 eagleplayer binaries
├── ENV/EaglePlayer/         # Player config files
├── uade.conf                # UADE configuration
├── eagleplayer.conf         # Format detection rules
├── uaerc                     # UAE emulator config
├── score                     # 68k replay binary
├── uadecore                  # Dummy file
└── [song].mod               # Loaded at runtime per uade_wasm_load()
```

All files embedded in WASM binary, no runtime filesystem access.

## Memory Layout

```
0x00000000  Stack (grows down)
            ├─ Heap (malloc/free)
            │  ├─ libuade state
            │  ├─ UADE player state
            │  ├─ Ring buffers (512 KB total)
            │  └─ Log buffers (220 KB)
            │
0x00400000  Amiga Chip RAM (2-8 MB)
            ├─ Paula samples
            ├─ Replayer code
            └─ Module data
            │
0x02000000  Available
            │
0x08000000  (33 MB initial, grows to 128 MB)
```

## Performance

| Operation | Time |
|-----------|------|
| Init | 5-10ms |
| Load | 5-20ms |
| Render (4096 frames) | 0.5-2ms |
| Pattern scan | 10-50ms |

## Key Constraints

1. **Single-process:** libuade & uadecore share memory (no isolation)
2. **Synchronous IPC:** Ring buffers, pull-triggered processing
3. **Max 10k core cycles:** Per response read (limits scan speed)
4. **Static filesystem:** Players baked into binary
5. **Exit interception:** setjmp/longjmp catches crashes
6. **No companion files:** At runtime (can be added via `add_extra_file()`)

## Important Files to Understand

| File | Purpose | Lines |
|------|---------|-------|
| `uadecore_wasm.c` | 4-phase state machine | 299 |
| `entry.c` | WASM API + ring buffer management | 1000+ |
| `shim_ipc.c` | In-memory IPC ring buffers | 300+ |
| `paula_log.h` | Data structure definitions | 54 |
| `build.sh` | Build process (3 steps) | 223 |
| `generate_registry.py` | Player/config embedding | 159 |

## References

- **Complete architecture doc:** `UADE_WASM_ARCHITECTURE.md` (925 lines)
- **UADE source:** `third-party/uade-3.05/`
- **Build output:** `public/uade/UADE.{js,wasm}` (2.4 MB total)
- **Companion audio:** `UADE.worklet.js` (AudioWorklet wrapper)

