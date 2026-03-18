# UADE WASM Integration - Complete Documentation Index

## 📖 Documentation Files

This deep-dive is split across 3 comprehensive documents:

### 1. **UADE_WASM_ARCHITECTURE.md** (925 lines, 32 KB)
**Complete technical reference for the entire architecture**

Covers:
- Executive summary with key stats
- Full directory structure (files & directories)
- 3-step build process with detailed explanations
- Original vs WASM architecture comparison
- Synchronous IPC shim design & implementation
- 4-phase state machine (Phases 1-4 in detail)
- Virtual filesystem (MEMFS) setup & contents
- **Complete C API (all 34 functions)**
- Data flow examples (playback, pattern extraction, debugging)
- UADE core modifications (only 4 strategic hooks!)
- Data structure definitions
- Memory layout diagram
- Pattern/instrument extraction methods (4 approaches)
- Performance characteristics
- Limitations & design constraints

**Read this for:** Deep understanding of how everything fits together

---

### 2. **UADE_WASM_QUICK_REF.md** (370 lines, 14 KB)
**Quick lookup guide - organized by topic**

Contains:
- File structure overview
- 3 core concepts (1 sentence each)
- API groups (34 functions organized by purpose)
- Data format specifications (structs)
- 4 key modifications to UADE core
- Pattern extraction workflow (TypeScript example)
- Build process (condensed steps)
- Virtual filesystem layout
- Memory map
- Performance table
- Constraints & limitations
- Important files reference table

**Read this for:** Quick lookups, understanding API groups, data formats

---

### 3. **UADE_WASM_ENTRY_POINTS.md** (560 lines, 14 KB)
**Code flow diagrams - JavaScript to WASM boundary**

Shows:
- Init flow (one-time setup)
- Load & play flow (format detection → playback)
- Render flow (audio generation with CPU emulation)
- Pattern extraction flow (Paula logging + snapshots)
- **4-phase state machine diagram** (visual representation)
- Memory access flow (debugging/samples)
- Ring buffer IPC mechanics (read/write cycle)
- File layout summary (shim layer organization)
- Hook points in UADE core (where #ifdef UADE_WASM code goes)

**Read this for:** Understanding code flow, following execution paths

---

## 🎯 How to Use This Documentation

### I want to understand the architecture
→ Start with **ARCHITECTURE.md** Sections: Executive Summary + Architecture Diagrams

### I need to know the C API
→ Use **QUICK_REF.md** Section: API Groups + Data Formats

### I'm implementing something new
→ Check **ENTRY_POINTS.md** for similar code paths + relevant files

### I need to debug something
→ **ENTRY_POINTS.md** → 4-Phase State Machine + Hook Points sections

### I want to add pattern extraction
→ **ARCHITECTURE.md** → Pattern Extraction section + **ENTRY_POINTS.md** → Pattern Extraction Flow

### I'm building or modifying
→ **QUICK_REF.md** → Build Process + **ARCHITECTURE.md** → Build Process

---

## 📋 Quick Facts

| Aspect | Detail |
|--------|--------|
| **WASM Layer** | 14 custom C files + auto-generated registry |
| **Core Changes** | 4 strategic hooks (#ifdef UADE_WASM) |
| **API Functions** | 34 exported (EMSCRIPTEN_KEEPALIVE) |
| **IPC Method** | 256 KiB ring buffers (cmd + response) |
| **Players Embedded** | 175 (all UADE 3.05 formats) |
| **Build Output** | 2.4 MB (97 KB JS + 2.3 MB WASM) |
| **Memory** | 32 MB initial, 128 MB max |
| **Pattern Logging** | 4 methods (Paula log, tick snapshots, watchpoints, direct memory) |

---

## 🏗️ Architecture Layers

```
┌─────────────────────────────────┐
│   JavaScript (AudioWorklet)     │
│   ├─ Load .mod/.xm/.it files   │
│   ├─ Call uade_wasm_*()        │
│   └─ Poll debug logs           │
└─────────────┬───────────────────┘
              │
        Emscripten
              │
┌─────────────▼───────────────────┐
│   entry.c (WASM API Layer)      │
│   ├─ 34 exported functions     │
│   ├─ Log buffers               │
│   └─ Frontend orchestration    │
└─────────────┬───────────────────┘
              │
┌─────────────▼───────────────────┐
│   libuade (unmodified)          │
│   ├─ Format detection          │
│   ├─ File loading              │
│   └─ IPC state machine         │
└─────────────┬───────────────────┘
              │
┌─────────────▼───────────────────┐
│   shim_ipc.c (Ring Buffers)     │
│   ├─ 256 KiB cmd buffer        │
│   ├─ 256 KiB response buffer   │
│   └─ Synchronous core trigger  │
└─────────────┬───────────────────┘
              │
┌─────────────▼───────────────────┐
│   uadecore_wasm.c (State Machine)
│   ├─ Phase 1: CONFIG + HW init │
│   ├─ Phase 2: SCORE + module   │
│   ├─ Phase 3: Config messages  │
│   └─ Phase 4: m68k_run_1()    │
└─────────────┬───────────────────┘
              │
┌─────────────▼───────────────────┐
│   UADE Core (65k C source)      │
│   ├─ memory.c (Amiga RAM)      │
│   ├─ audio.c (Paula PCM)       │
│   ├─ cia.c (Timers)            │
│   ├─ custom.c (Chip)           │
│   ├─ newcpu.c (68k CPU)        │
│   ├─ cpuemu.c (2.2 MB)         │
│   └─ +175 eagleplayers         │
└─────────────────────────────────┘
```

---

## 🔍 Key Concepts

### 1. Single-Process Merge
**Native UADE:** libuade ↔️ socketpair ↔️ uadecore (separate process)
**WASM UADE:** libuade → ring buffer ← uadecore (same process, synchronous)

### 2. Pull-Triggered Synchronous IPC
- Frontend reads response (expects data)
- Ring buffer empty → call core synchronously
- Core runs until audio ready
- Response written to ring buffer
- Frontend continues

### 3. 4-Phase Core State Machine
```
Phase 1: CONFIG + Hardware init (once per module)
    ↓
Phase 2: SCORE + Module load (per song)
    ↓
Phase 3: Config messages (filter, frequency, etc)
    ↓
Phase 4: m68k_run_1() (continuous until audio ready)
    → Loop back to Phase 3 (process more config) or Phase 4
```

### 4. Pattern/Instrument Extraction
- **Paula Log:** Every register write logged
- **Tick Snapshots:** Full state every CIA-A tick
- **Watchpoints:** Track memory access
- **Direct Read:** Extract samples from chip RAM

---

## 🗂️ File Organization

### WASM Shim Layer (uade-wasm/src/)
- `entry.c` — Main API + logging (1000+ lines)
- `uadecore_wasm.c` — 4-phase state machine (299 lines)
- `shim_ipc.c` — Ring buffer IPC (300+ lines)
- `paula_log.h` — Data structures (54 lines)
- Stubs: `uade_logging_stub.c`, `state_detection_stub.c`, `rmc_stub.c`, etc.

### Generated Files (uade-wasm/generated/)
- `cpuemu.c` — 68k CPU emulator (2.2 MB, generated)
- `cpudefs.c`, `cpustbl.c`, `cputbl.h` — CPU tables
- `cpuemu{1..8}.o` — Split compilation objects

### Auto-Generated Registry (uade-wasm/src/)
- `player_registry.c` — 175 eagleplayer binaries
- `basedir_data.c` — Config files (uaerc, eagleplayer.conf, score binary)

### Build System
- `build.sh` — 3-step build orchestration (223 lines)
- `generate_registry.py` — Embed players & config (159 lines)

---

## 🎓 Learning Path

**Beginner:** Want to use the API?
1. Read: QUICK_REF.md → API Groups
2. Find: Relevant function in ARCHITECTURE.md → C API section
3. Lookup: Data format in QUICK_REF.md → Data Formats

**Intermediate:** Understand the IPC?
1. Read: ENTRY_POINTS.md → Ring Buffer IPC Mechanics
2. Study: shim_ipc.c (300 lines)
3. Reference: ENTRY_POINTS.md → Init Flow, Load & Play Flow

**Advanced:** Implement new feature?
1. Read: ARCHITECTURE.md → Modifications to UADE Core
2. Study: Entry point in ENTRY_POINTS.md
3. Find: Similar hook in uadecore_wasm.c or entry.c
4. Implement: New #ifdef UADE_WASM section

**Expert:** Debug pattern extraction?
1. Read: ARCHITECTURE.md → Pattern/Instrument Extraction
2. Study: ENTRY_POINTS.md → Pattern Extraction Flow
3. Reference: paula_log.h → Data structures
4. Code: entry.c → Paula logging functions

---

## 🔍 Cross-References

| Want to find... | Go to... |
|-----------------|----------|
| API list | QUICK_REF.md (API Groups) or ARCHITECTURE.md (C API) |
| Build process | QUICK_REF.md (Build Process) or ARCHITECTURE.md (Section 3) |
| File layout | QUICK_REF.md (File Structure) or ARCHITECTURE.md (Directory Structure) |
| 4-phase machine | ENTRY_POINTS.md (4-Phase State Machine Diagram) or ARCHITECTURE.md (uadecore_wasm.c) |
| Data formats | QUICK_REF.md (Data Formats) or ARCHITECTURE.md (Data Structures section) |
| Code flows | ENTRY_POINTS.md (all flows) or ARCHITECTURE.md (Data Flow section) |
| Memory layout | QUICK_REF.md (Memory Layout) or ARCHITECTURE.md (Memory Layout section) |
| Pattern extraction | ARCHITECTURE.md (Pattern/Instrument Extraction) or ENTRY_POINTS.md (Pattern Extraction Flow) |
| Watchpoints | ARCHITECTURE.md (Watchpoint API) or QUICK_REF.md (Debugging group) |
| Ring buffers | ENTRY_POINTS.md (Ring Buffer IPC Mechanics) or ARCHITECTURE.md (Synchronous IPC Shim) |

---

## 📝 Notes

### About the Documentation
- **Total:** 1,587 lines across 3 files
- **Written:** March 2025
- **Scope:** Complete UADE WASM integration architecture
- **Level:** Technical deep-dive for developers

### Key Insights
1. WASM layer is elegantly minimal (14 files)
2. UADE core virtually untouched (only 4 hooks)
3. Ring buffer IPC is clever (pull-triggered sync)
4. Pattern extraction is powerful (4 methods available)
5. Architecture is well-designed for the constraints

### Potential Enhancements
- Time-travel debugging (snapshot at CPU PC points)
- Enhanced memory inspection (any Amiga address space)
- Better sample extraction (detect formats, loop points)
- Custom logging hooks (application-specific)

---

## 📞 Quick Navigation

**From JavaScript, I want to:**
- Load and play a file → uade_wasm_load()
- Get audio output → uade_wasm_render()
- See what's playing → uade_wasm_get_channel_snapshot()
- Extract pattern data → uade_wasm_enable_paula_log() + uade_wasm_get_paula_log()
- Debug a format → uade_wasm_set_watchpoint() + uade_wasm_get_watchpoint_hits()

**I'm coding in C, I need to:**
- Add logging → Insert #ifdef UADE_WASM hook in core, call entry.c function
- Add export → Add EMSCRIPTEN_KEEPALIVE function in entry.c
- Modify IPC → Edit shim_ipc.c ring buffer functions
- Debug core → Add watchpoint calls to memory.c, enable via JavaScript API

**The build is:**
1. Python: Generate player registry
2. Native: Build 68k CPU tools
3. Emscripten: Compile WASM with ring buffer IPC

---

**For questions or clarifications, refer to the specific documentation file listed above.**
