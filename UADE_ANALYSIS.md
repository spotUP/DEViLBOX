# UADE C Source Code Analysis: Amiga Music Emulation & Data Extraction

## Overview
UADE (Unix Amiga Delitracker Emulation) is a full Amiga emulator core for music playback. Located at:
- **Main:** `/Users/spot/Code/DEViLBOX/third-party/uade-3.05`
- **Version:** 3.05

---

## 1. UADE THIRD-PARTY SOURCE TREE

### Directory Structure
```
uade-3.05/
├── src/                          # Emulation core C code
│   ├── newcpu.c                 # 68000 CPU emulator (Motorola 68000)
│   ├── custom.c                 # Custom chip emulation (Paula, DMA, etc.)
│   ├── audio.c                  # Paula audio chip emulation
│   ├── cia.c                    # CIA timer/interrupt chip
│   ├── memory.c                 # Memory management & access
│   ├── debug.c                  # Debug interface (can read/write Amiga memory)
│   ├── uade.c                   # Main emulation driver
│   ├── include/                 # Core headers (newcpu.h, custom.h, memory.h, etc.)
│   └── frontends/
│       ├── libuade/             # Library interface
│       ├── common/              # Shared frontend code (uadestate.c, uadecontrol.c)
│       └── uade123/             # CLI player reference implementation
├── amigasrc/                    # Amiga-side code (68000 assembly)
│   └── score/
│       ├── score.s              # Main UADE runtime (Amiga 68000 code)
│       └── delisymbols.s        # Delitracker API symbols
├── players/                     # Eagleplayer plugins (~100+ formats)
├── doc/                         # Documentation
└── configure, Makefile, etc.
```

---

## 2. UADE EMULATION CORE FILES

### A. 68000 CPU Emulator
**Files:** `newcpu.c`, `newcpu.h`, `readcpu.c`, `gencpu.c`

Key features:
- Full 68000 CPU emulation (instruction set, registers, flags)
- Generated instruction handlers from `table68k` file
- Used to execute eagleplayer code and modules

### B. Paula Audio Chip Emulation
**Files:** `audio.c`, `audio.h`

Key features:
- Emulates 4 separate Paula audio channels
- Implements 8-bit PCM sample playback via DMA
- Handles audio registers (AUDxPTR, AUDxLEN, AUDxPER, AUDxVOL)
- RC filter emulation (A500 vs A1200)
- Sample rate conversion
- Structure: `struct audio_channel_data audio_channel[4]`

### C. Custom Chip (DMA Controller, Interrupt Handler)
**Files:** `custom.c`, `custom.h`

Key features:
- **DMA masks:** DMA_AUD0-3 for audio channels (bits 0x0001-0x0008)
- **Interrupt control:** INTREQ, INTENA registers
- Sprites, bitplanes, disk DMA (for completeness)
- Copper (display list processor)
- Main register interface for 68000 access

### D. CIA Chip (Timers & Interrupts)
**Files:** `cia.c`, `cia.h`

Key features:
- **CIA-A & CIA-B:** Two 6526 CIA chips
- **Timer registers:** ciaata, ciaatb (main used for sound timing)
- **Interrupt control:** ciaaicr, ciaaimask (IRQ/NMI generation)
- Vertical sync handlers

---

## 3. EAGLEPLAYER PLUGIN SYSTEM

**Files:** `frontends/include/uade/eagleplayer.h`, `frontends/common/eagleplayer.c`

### Plugin Interface Structure
```c
struct eagleplayer {
    char *playername;           // Player name (e.g., "ProTracker v2.3d")
    size_t nextensions;         // Number of file extensions
    char **extensions;          // Array of extensions (e.g., ["mod", "MOD"])
    int flags;                  // ES_* flags (see below)
    struct uade_attribute *attributelist;  // Player attributes
};
```

### Configuration Flags (ES_* constants)
```c
ES_PLAYER              // Player type marker
ES_SUBSONGS            // Supports multiple subsongs
ES_SUBSONG_TIMEOUT     // Has subsong timeout value
ES_TIMEOUT             // Has song timeout value
ES_SILENCE_TIMEOUT     // Has silence detection
ES_ONE_SUBSONG         // Only one subsong
ES_NEVER_ENDS          // Player never reports end
ES_ALWAYS_ENDS         // Player always reports end
ES_BROKEN_SONG_END     // Broken song end detection
ES_CONTENT_DETECTION   // File content detection support
ES_SPEED_HACK          // Requires speed hack
ES_NTSC / ES_PAL       // System mode (NTSC 60Hz / PAL 50Hz)
ES_NO_FILTER           // Disable audio filter
ES_LED_ON / ES_LED_OFF // LED filter control
// ... plus 20+ more flags
```

### File: eagleplayer.conf
Maps file extensions to eagleplayers (plugins):
```
ProTracker 2.3d mod MOD
Soundtracker st
FutureComposer sc68
...
```

---

## 4. MEMORY READ/WRITE HOOKS & DEBUG INTERFACES

### A. Direct Memory Access Functions
**File:** `memory.c`, `memory.h`

```c
// Direct access macros (from memory.h):
#define longget(addr)   (call_mem_get_func(get_mem_bank(addr).lget, addr))
#define wordget(addr)   (call_mem_get_func(get_mem_bank(addr).wget, addr))
#define byteget(addr)   (call_mem_get_func(get_mem_bank(addr).bget, addr))
#define longput(addr,l) (call_mem_get_func(get_mem_bank(addr).lput, addr, l))
#define wordput(addr,w) (call_mem_put_func(get_mem_bank(addr).wput, addr, w))
#define byteput(addr,b) (call_mem_put_func(get_mem_bank(addr).bput, addr, b))

// Higher-level wrappers:
static inline uae_u32 get_long(uaecptr addr) { return longget_1(addr); }
static inline uae_u32 get_word(uaecptr addr) { return wordget_1(addr); }
static inline uae_u32 get_byte(uaecptr addr) { return byteget_1(addr); }
static inline void put_long(uaecptr addr, uae_u32 l) { longput_1(addr, l); }
static inline void put_word(uaecptr addr, uae_u32 w) { wordput_1(addr, w); }
static inline void put_byte(uaecptr addr, uae_u32 b) { byteput_1(addr, b); }

// Direct pointer access (FASTEST):
static inline uae_u8 *get_real_address(uaecptr addr) {
    return get_mem_bank(addr).xlateaddr(addr);
}
```

**Key exported variable:**
```c
extern uae_u8 *chipmemory;  // Direct pointer to emulated Amiga chip RAM (0-512KB)
extern uae_u32 allocated_chipmem;  // Size (typically 512KB = 0x80000)
```

### B. UADE Debug Interface
**File:** `debug.c`

Comprehensive debugger with memory inspection commands:
- `m <addr> <lines>`: Memory dump
- `S <file> <addr> <n>`: Save memory block to file
- `R <file> <addr> <n>`: Load file into memory
- `d <addr>`: Disassembly
- `l [name]`: List/trace to debug points

**UADE Debug Info Marker in Memory:**
```c
// Search for "uade debug info" string in chipmemory
// This marks the start of a debug info structure
if (!strcmp((char *) chipmemory + ptr, "uade debug info")) {
    baseptr = ptr;  // Found!
}
```

### C. State Detection Module
**File:** `state_detection.c`, `state_detection.h`

Detects music state changes via memory scanning:
```c
void uade_state_detection_init(const uae_u32 addr, const uae_u32 size);
int uade_state_detection_step(void);
```

Mechanism:
1. Tracks memory modification counters for specified memory range
2. Computes MD5 digest of modified bytes
3. Detects when digest repeats (indicates pattern loop)
4. Useful for detecting pattern changes during playback

---

## 5. AMIGA CHIP RAM & PAULA REGISTER EXPOSURE

### ✅ YES - Emulated Memory IS Readable from Host!

**Direct access:**
```c
// In your host code, you can read Amiga memory directly:
extern uae_u8 *chipmemory;  // Declare this in your code
extern uae_u32 allocated_chipmem;

// Read a byte at Amiga address 0x12345678
uint8_t val = chipmemory[0x12345678];

// Read full 68000 CPU register state
extern struct regstruct regs;  // m68k registers: d0-d7, a0-a7, pc, sr
```

### Paula Register Access
Paula registers are memory-mapped at addresses 0xDFF000-0xDFF1FF:

**Key registers:**
```c
// AUDxPTR: Audio channel x pointer (DMA source address)
// 0xDFF0A0, 0xDFF0B0, 0xDFF0C0, 0xDFF0D0 (channels 0-3)

// AUDxLEN: Audio channel x length (number of samples)
// 0xDFF0A4, 0xDFF0B4, 0xDFF0C4, 0xDFF0D4

// AUDxPER: Audio channel x period (1/samplerate, 68000 cycles)
// 0xDFF0A6, 0xDFF0B6, 0xDFF0C6, 0xDFF0D6

// AUDxVOL: Audio channel x volume (0-64)
// 0xDFF0A8, 0xDFF0B8, 0xDFF0C8, 0xDFF0D8

// ADKCON: Audio DMA control (enable, bit 15 = set, bits 0-3 = enable mask)
// 0xDFF09E (written) / 0xDFF09E (read)

// DMACON: DMA control (bit 0-3 = AUD DMA enable if bit 9 = 1)
// 0xDFF096 (written) / 0xDFF002 (read)
```

**Reading Paula registers:**
```c
// Get DMA status for all channels:
uint16_t dmacon = get_word(0xDFF002);  // Read DMACON
if (dmacon & 0x200) {  // Master DMA enable
    if (dmacon & 0x0001) { /* AUD0 enabled */ }
    if (dmacon & 0x0002) { /* AUD1 enabled */ }
    if (dmacon & 0x0004) { /* AUD2 enabled */ }
    if (dmacon & 0x0008) { /* AUD3 enabled */ }
}

// Get sample pointer and length for channel 0:
uint32_t ptr = get_long(0xDFF0A0);
uint16_t len = get_word(0xDFF0A4);
uint16_t per = get_word(0xDFF0A6);
```

---

## 6. SONG POSITION & PATTERN CHANGE DETECTION

### A. Subsong Detection (Built-in)
**File:** `frontends/include/uade/uade.h`

```c
struct uade_subsong_info {
    int cur;   // current subsong number
    int min;   // minimum subsong
    int def;   // default subsong to start
    int max;   // maximum subsong
};

// Access during playback:
const struct uade_song_info *si = uade_get_song_info(state);
printf("Subsong: %d/%d\n", si->subsongs.cur, si->subsongs.max);
int ret = uade_next_subsong(state);  // Go to next subsong
```

### B. Song Position Information
**Available metadata:**
```c
struct uade_song_info {
    int64_t subsongbytes;  // Bytes synthesized in current subsong
    int64_t songbytes;     // Total bytes synthesized in all subsongs
    double duration;       // Duration in seconds (if known)
    // ... plus player name, format, etc.
};
```

### C. Pattern Position Detection (Via Score)
**File:** `amigasrc/score/score.s`

The UADE Amiga-side runtime (score.s) stores state at fixed memory addresses:

```c
// Defined in uade.c (Score memory layout)
static const int SCORE_SUBSONG       = 0x120;  // Current subsong number
static const int SCORE_MIN_SUBSONG   = 0x204;  // Min subsong
static const int SCORE_MAX_SUBSONG   = 0x208;  // Max subsong
static const int SCORE_CUR_SUBSONG   = 0x20C;  // Current subsong (read)
static const int SCORE_MODULE_NAME_ADDR = 0x128;  // Module name pointer
static const int SCORE_HAVE_SONGEND  = 0x12C;  // Song end flag

// Access from host code:
uint32_t cur_subsong = get_long(chipmemory + 0x20C);
uint32_t min_subsong = get_long(chipmemory + 0x204);
uint32_t max_subsong = get_long(chipmemory + 0x208);
```

### D. Debug Points (Score Debug Info)
The Score establishes a debug info structure at a fixed location:

```c
// From debug.c: uade_debug_search()
// Each debug point has:
// - Name string (null-terminated, word-aligned)
// - Offset from "uade debug info" marker (long)

// Example debug points include:
// - "sample_ptr" → current sample playback position
// - "pattern_pos" → current pattern position
// - "pattern_idx" → current pattern index
// - (specific to each eagleplayer)
```

---

## 7. EAGLEPLAYER PLUGIN INTERFACE DEEP DIVE

### Eagleplayer Entry Points
**File:** `amigasrc/score/delisymbols.s` (Delitracker API)

Players must export symbols:
```asm
Player_Init:      ; Initialize player (called once)
    ; Input: D0 = module address, A0 = memory for data
    ; Can set up patterns, instruments, etc.

Player_CheckModule:  ; Verify this is correct module format
    ; Input: D0 = module address
    ; Output: D0 = success (0) or failure (-1)

Player_ConfigModule:  ; Configure player options
    ; Input: D0-D3 = configuration parameters

Player_PlayModule:    ; Start playing
    ; Should enable audio DMA, set up interrupt handlers
    
Player_StopModule:    ; Stop playing

Player_SongEnd:       ; Check if song ended
    ; Output: D0 = 0 if not ended, non-zero if ended

Player_Interrupt:     ; Called regularly from timer interrupt
    ; Updates pattern position, samples, etc.
```

### How to Hook Eagleplayers
**Eagleplayer options via uade.conf:**
```
ProTracker 2.3d mod MOD
    option1 value1
    option2 value2
```

Can set:
- Sample offset adjustments
- Pattern timing hacks
- Subsong count overrides

---

## 8. SCORE.S - AMIGA RUNTIME

**File:** `amigasrc/score/score.s` (~3900 lines)

This is the Amiga-side driver that:
1. **Initializes 68000 environment:** Exec, AmigaDOS, system resources
2. **Loads eagleplayer:** Relocates and calls Player_Init
3. **Loads module:** Places module in chip RAM
4. **Sets up interrupts:** CIA timers, vertical blank handlers
5. **Manages playback:** Calls Player_Interrupt, tracks subsongs
6. **Exposes debug info:** Creates "uade debug info" structure with named offsets

Key variables exposed to host at fixed addresses:
```asm
$0100: MODULE_ADDR          ; Module start address
$0104: MODULE_LEN           ; Module length
$0108: PLAYER_ADDR          ; Player code address
$010C: RELOC_ADDR           ; Relocation base
$0120: SUBSONG              ; Current subsong (write to set)
$0204: MIN_SUBSONG          ; Min subsong
$0208: MAX_SUBSONG          ; Max subsong
$020C: CUR_SUBSONG          ; Current subsong (read-only)
$0300: INPUT_MSG            ; Control message input
```

---

## ANSWERS TO YOUR KEY QUESTIONS

### Q1: Does UADE expose the emulated Amiga memory space?
**✅ YES - Fully exposed!**
- Direct pointer: `extern uae_u8 *chipmemory;`
- Direct read functions: `get_byte()`, `get_word()`, `get_long()`
- No need to go through IPC or messages for memory reads

### Q2: Can we read CIA timer registers or Paula registers during playback?
**✅ YES - Absolutely!**
- Read Paula DMA registers: `get_long(0xDFF0A0 + channel*16)` for ptr
- Read CIA timers: `get_word(0xBFE401 + offset)` for CIA-A, `0xBFED01` for CIA-B
- Read DMACON: `get_word(0xDFF002)` for current DMA status
- All are standard Amiga memory addresses in the chip register space

### Q3: Is there a mechanism to detect pattern/position changes during playback?
**✅ YES - Multiple options:**
1. **State Detection Module:** MD5-based memory change detection
2. **Score Debug Points:** Named offsets in "uade debug info" structure
3. **Manual scanning:** Read subsong info via `uade_get_song_info()`
4. **Direct register reads:** Monitor Paula register changes

### Q4: What's the eagleplayer plugin interface - can we add hooks?
**✅ YES - Pluggable architecture!**
- Defined in `delisymbols.s` (Delitracker standard)
- Add custom eagleplayers in `players/` directory
- Configure via `eagleplayer.conf`
- Can wrap existing players with custom hooks/callbacks

### Q5: Are there any existing "score dump" or "pattern extraction" features?
**✅ Partial - Debug interface exists**
- Debug mode in `debug.c` can dump memory (`S` command)
- Score provides named debug points (eagleplayer-specific)
- State detection tracks memory modifications
- **NOT automated pattern extraction** - that's eagleplayer-specific

**NOTE:** Pattern extraction would require:
1. Understanding each eagleplayer's memory layout (per-format)
2. Reading instrument samples from chipmemory at runtime
3. Reading pattern data from module (also in chipmemory)
4. Parsing format-specific structures (highly format-dependent)

---

## PRACTICAL IMPLEMENTATION PATHS

### Path 1: Direct Memory Reading (Simplest)
```c
#include <uade/uade.h>

// After uade_play():
extern uae_u8 *chipmemory;
extern uae_u32 allocated_chipmem;

// Read Amiga memory directly:
uint8_t val = chipmemory[0x12345];
uint16_t sample = (chipmemory[addr] << 8) | chipmemory[addr+1];

// Read Paula registers:
uint32_t ptr = (chipmemory[0xDFF0A0] << 24) | 
               (chipmemory[0xDFF0A1] << 16) |
               (chipmemory[0xDFF0A2] << 8) |
               (chipmemory[0xDFF0A3]);
```

### Path 2: State Detection Hooks
```c
uade_state_detection_init(0x20000, 0x10000);  // Track range

while (playing) {
    uade_read(buffer, size, state);
    if (uade_state_detection_step()) {
        printf("State changed (pattern boundary?)\n");
    }
}
```

### Path 3: Debug Info Navigation
```c
// After uade_play(), find eagleplayer's debug points:
uint32_t pattern_pos = uade_debug_search("pattern_pos");
uint32_t sample_ptr = uade_debug_search("sample_ptr");

// Poll during playback:
uint32_t pos = get_long(chipmemory + pattern_pos);
```

---

## KEY FILE LOCATIONS SUMMARY

| Purpose | File |
|---------|------|
| Memory access | `src/memory.c/.h` |
| CPU emulator | `src/newcpu.c/.h` |
| Paula audio | `src/audio.c/.h` |
| Custom chip | `src/custom.c/.h` |
| CIA timers | `src/cia.c/.h` |
| Debug interface | `src/debug.c` |
| State detection | `src/state_detection.c` |
| Eagleplayer system | `src/frontends/common/eagleplayer.c/.h` |
| Score (Amiga runtime) | `amigasrc/score/score.s` |
| Main API | `src/frontends/include/uade/uade.h` |
| IPC control | `src/frontends/common/uadecontrol.c` |

