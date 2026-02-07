# VMPC2000XL WebAssembly Port Analysis

**Date:** 2026-02-07
**Analyzed by:** Claude Code

## Project Overview

VMPC2000XL is a comprehensive Akai MPC2000XL emulator built with JUCE, wrapping the standalone `mpc` library. This analysis evaluates the feasibility of porting it to WebAssembly for DEViLBOX.

---

## 📊 Code Complexity Analysis

### MPC Core Library
- **Repository:** https://github.com/izzyreal/mpc.git
- **Total Source Files:** 1,073 C++/HPP files
- **Primary Components:**
  - `engine/` - 62 CPP files (audio engine, voice management, mixer)
  - `sampler/` - 7 CPP files (sample playback, programs, pads)
  - `sequencer/` - 95 files (MIDI sequencer, transport, tracks)
  - `lcdgui/` - 75 files (screen management, UI state)
  - `disk/` - 31 files (file I/O, APS format)
  - `audiomidi/` - 24 files (MIDI I/O, audio routing)
  - `command/` - 69 files (state management commands)
  - `file/` - 16 files (WAV/SND parsing)
  - Supporting: controller, hardware, input, nvram, utils, etc.

### Key Dependencies (from CMakeLists.txt)
1. **akaifat** - FAT16 filesystem emulation for MPC disk images
2. **Catch2** - Testing framework
3. **gulrak/filesystem** - C++17 filesystem library
4. **tl-expected** - Error handling (monadic operations)
5. **rtmidi** - MIDI I/O (not needed for WASM)
6. **lodepng** - PNG loading for GUI resources

### VMPC-JUCE Wrapper
- **VmpcProcessor.cpp:** 1,262 lines
- **Key Integration Points:**
  - `mpc.init()` - Initialize entire MPC system
  - `mpc.getEngineHost()` - Get audio engine
  - `server->work()` - Process audio block
  - MIDI routing, transport sync, multi-output routing

---

## 🚨 Complexity Assessment

### Critical Challenges

#### 1. **Massive Dependency Chain**
- The MPC library is not modular - it's designed as a complete emulator
- Engine depends on Sampler → Sampler depends on Disk → Disk depends on akaifat
- Sequencer tightly integrated with audio engine
- GUI state affects audio processing (can't cleanly separate)

#### 2. **JUCE-Specific Code**
- Heavy use of JUCE data structures throughout:
  - `juce::AudioBuffer`
  - `juce::MidiBuffer`
  - `juce::File` (file I/O)
  - `juce::MemoryBlock` (state save/load)
- Would need extensive refactoring or JUCE stub implementations

#### 3. **State Management Complexity**
- 69 command files for state management
- Observable pattern throughout (UI observers)
- AutoSave system for persistence
- NVRAM emulation for MPC settings

#### 4. **Audio Engine Architecture**
```
processBlock()
  → engineHost->prepareProcessBlock()
  → processMidiIn() (convert JUCE MIDI)
  → server->work() (multi-channel processing)
     → SequencerPlaybackEngine::process()
        → DrumNoteEventHandler (voice triggering)
           → Voice::render() (sample playback)
              → EnvelopeGenerator (ADSR)
              → Filter processing
              → IndivFxMixer (stereo mixing)
                 → StereoMixer (master output)
```

This is deeply nested with many interconnected systems.

---

## ⚖️ Comparison with Other JUCE Ports

### RdPiano (Simple - Successfully Ported)
- **Files:** ~10 C++ files
- **Complexity:** Single-chip MCU emulation
- **Dependencies:** None (self-contained)
- **Audio Chain:** MCU → SpaceD → Phaser → Resample → EQ
- **Port Effort:** ~4 hours

### Dexed/OB-Xd (Moderate - Successfully Ported)
- **Files:** ~20-30 C++ files
- **Complexity:** Synth engine with presets
- **Dependencies:** Minimal (math libraries)
- **Audio Chain:** Oscillators → Filters → Envelopes → Output
- **Port Effort:** ~8-12 hours each

### VMPC2000XL (Extreme)
- **Files:** 1,073+ C++ files
- **Complexity:** Full hardware emulator
- **Dependencies:** 6 external libraries + JUCE
- **Audio Chain:** See 6-level nesting above
- **Estimated Port Effort:** **6-12 weeks** (240-480 hours)

---

## 💡 Recommendations

### Option 1: **Don't Port VMPC (Recommended)**
**Reasoning:**
- 100x more complex than other ports
- Requires extensive refactoring of tightly coupled code
- DEViLBOX already has:
  - ES5503 DOC sampler (Ensoniq Mirage/IIgs)
  - C352 Namco sampler
  - K054539 Konami sampler
  - ICS2115 wavetable
  - RF5C400 PCM
  - TR-707 drum machine
- Focus efforts on completing other priorities

### Option 2: **Build MPC-Inspired Sampler**
Instead of porting VMPC, create a new sampler inspired by MPC workflow:
- Use DEViLBOX's existing sample playback engine
- Implement MPC-style:
  - 16 pads with velocity sensitivity
  - Program/sound architecture
  - Simple ADSR + filter per pad
  - Stereo + 4 assignable outputs
  - MIDI learn for hardware integration
- **Estimated Effort:** 1-2 weeks
- **Benefits:** Native to DEViLBOX, easier to maintain

### Option 3: **Minimal VMPC Core**
Extract only the absolute minimum for basic sampler:
- `Voice.cpp` + `EnvelopeGenerator.cpp` (playback)
- `Sound.cpp` + `Program.cpp` (sample management)
- `Pad.cpp` (trigger interface)
- Stub out all sequencer/disk/GUI code
- **Estimated Effort:** 3-4 weeks
- **Limitations:** Won't be authentic MPC, missing many features

### Option 4: **Full VMPC Port (Not Recommended)**
- Clone entire mpc library
- Port 1,073 files to WASM-compatible code
- Create stub implementations for:
  - JUCE classes
  - File I/O (use Emscripten FS or virtual disk)
  - MIDI I/O (route through AudioWorklet messages)
- Extensive testing and debugging
- **Estimated Effort:** 6-12 weeks (full-time)
- **Risk:** High chance of subtle bugs in such complex port

---

## 🎯 Priority Suggestions

Based on DEViLBOX's current status:

### High Priority (Complete These First)
1. **MAME Chip Debugging**
   - Fix remaining silent chips (SN76477, TR707 ROM loading)
   - Test all 23/24 chips thoroughly
   - Document per-chip quirks

2. **Hardware Synth ROMs**
   - Acquire RolandSA, D50, VFX, RdPiano ROM dumps
   - Document ROM requirements
   - Create ROM loading UI

3. **Furnace Macro System Polish**
   - Test all 8 export formats
   - Refine macro playback timing
   - Add loop point support

### Medium Priority
4. **Sampler System Enhancement**
   - Improve existing sample engine
   - Add MPC-inspired features to current architecture
   - Create drum machine UI based on TR-808 style

### Low Priority
5. **VMPC Port**
   - Only consider if all above are complete
   - Start with minimal core, not full emulator

---

## 📈 Effort vs. Value Matrix

| Task | Effort | Value | Priority |
|------|--------|-------|----------|
| MAME chip fixes | Low (1-2 days) | High (23 chips) | ⭐⭐⭐⭐⭐ |
| ROM acquisition | Variable | High (authentic) | ⭐⭐⭐⭐ |
| Furnace polish | Medium (1 week) | High (8 formats) | ⭐⭐⭐⭐ |
| MPC-inspired sampler | Medium (2 weeks) | Medium | ⭐⭐⭐ |
| Minimal VMPC | High (3-4 weeks) | Low (limited) | ⭐⭐ |
| Full VMPC port | Extreme (12 weeks) | Medium (one emulator) | ⭐ |

---

## 🔚 Conclusion

**The VMPC2000XL port is not recommended** due to:
1. Massive complexity (1,073 files vs. 10 for other ports)
2. Tight JUCE coupling requiring extensive refactoring
3. DEViLBOX already has multiple sampler chips
4. Better ROI focusing on completing other features

**Alternative recommendation:**
Build a new MPC-inspired sampler using DEViLBOX's existing architecture, taking 1-2 weeks instead of 3 months, with better integration and maintainability.

---

**Final Decision:** If you still want MPC-style workflow, let's discuss building a custom MPC-inspired sampler that fits DEViLBOX's architecture better. If you want the exact VMPC emulation, be prepared for a 3-month port project with significant complexity.
