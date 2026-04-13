/**
 * AdPlug WASM Bridge
 *
 * Emscripten wrapper for the AdPlug C++ library.
 * Provides a C API for loading and rendering 50+ OPL/AdLib music formats.
 * Embeds standard.bnk for ROL/SCI instrument bank support.
 *
 * Pattern/instrument extraction supports multiple player backends:
 *   CmodPlayer (A2M, AMD, CFF, DFM, DTM, MAD, MTR, SA2, SAT, XMS)
 *   ChscPlayer (HSC, HSP, MTK)
 *   Cs3mPlayer (DMO, S3M)
 *   CpisPlayer (PIS)
 *   Cd00Player (D00)
 *   CldsPlayer (LDS)
 */

#include <emscripten.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>

#include "adplug.h"
#include "emuopl.h"
extern "C" {
#include "nukedopl.h"
}
#include "fprovide.h"
#include "player.h"
#include "players.h"
#include "binstr.h"

// Embedded standard.bnk for ROL/SCI support (generated from AdPlug test data)
#include "standard_bnk.h"

// Embedded insts.dat for KSM (Ken Silverman Music) support
#include "insts_dat.h"

// Helper: case-insensitive ends-with check
static bool iends_with(const std::string& str, const std::string& suffix) {
    if (suffix.size() > str.size()) return false;
    return std::equal(suffix.rbegin(), suffix.rend(), str.rbegin(),
        [](char a, char b) { return tolower(a) == tolower(b); });
}

// Companion files (e.g. patch.003 for SCI, .bnk for ROL)
struct CompanionFile {
    uint8_t* data;
    uint64_t size;
    std::string name;
};
static std::vector<CompanionFile> g_companions;

// In-memory file provider for AdPlug
// Serves the loaded music file, companion files, AND standard.bnk for ROL.
class CProvider_Memory : public CFileProvider {
public:
    CProvider_Memory(const uint8_t* data, uint64_t size, const std::string& filename)
        : m_data(data), m_size(size), m_filename(filename) {}

    binistream* open(std::string filename) const override {
        // Serve the main music file
        if (filename == m_filename) {
            return makeStream(m_data, m_size);
        }

        // Check companion files (e.g. patch.003 for SCI)
        for (const auto& c : g_companions) {
            if (iends_with(filename, c.name)) {
                return makeStream(c.data, c.size);
            }
        }

        // Serve standard.bnk for ROL files
        if (iends_with(filename, "standard.bnk") || iends_with(filename, ".bnk")) {
            return makeStream(standard_bnk_data, standard_bnk_size);
        }

        // Serve insts.dat for KSM (Ken Silverman Music) files
        if (iends_with(filename, "insts.dat")) {
            return makeStream(insts_dat, insts_dat_len);
        }

        return nullptr;
    }

    void close(binistream* f) const override {
        delete f;
    }

private:
    static binisstream* makeStream(const uint8_t* data, uint64_t size) {
        binisstream* stream = new binisstream(
            const_cast<uint8_t*>(data), static_cast<unsigned long>(size));
        stream->setFlag(binio::BigEndian, false);
        stream->setFlag(binio::FloatIEEE);
        return stream;
    }

    const uint8_t* m_data;
    uint64_t m_size;
    std::string m_filename;
};

// Global state
static CEmuopl* g_opl = nullptr;
class CMutingOpl;
static CMutingOpl* g_mutingOpl = nullptr;  // wraps g_opl for mute/level support
static CPlayer* g_player = nullptr;
static uint32_t g_sampleRate = 48000;
static bool g_initialized = false;

static uint8_t* g_fileData = nullptr;
static uint64_t g_fileSize = 0;

static double g_samplesPerTick = 0.0;
static double g_sampleAccum = 0.0;

// Title/type string buffers for JS access
static char g_title[256] = {};
static char g_type[128] = {};
static char g_filename[512] = {};  // original filename for OPL capture re-load

// Forward declarations for extraction support
enum PlayerType {
    PT_UNKNOWN = 0, PT_CMOD, PT_HSC, PT_S3M, PT_PIS, PT_D00, PT_LDS,
    PT_BMF, PT_HERAD, PT_SOP, PT_JBM, PT_ROL,
    PT_OPL_CAPTURE  // fallback: OPL register capture for any format
};
static PlayerType g_playerType = PT_UNKNOWN;
static void detectPlayerType();
class Cd00PlayerAccessor;
static Cd00PlayerAccessor* asD00Player();

// Include player headers early for use in both extern "C" blocks
#include "protrack.h"
#include "hsc.h"
#include "s3m.h"
#include "pis.h"
#include "d00.h"
#include "lds.h"
#include "bmf.h"
#include "xad.h"
#include "herad.h"
#include "sop.h"
#include "jbm.h"
#include "rol.h"

// Accessor class for PIS (needed in both extern "C" blocks)
class CpisPlayerAccessor : public CpisPlayer {
public:
    using CpisPlayer::module;
};

static CpisPlayerAccessor* asPisPlayer() {
    if (!g_player) return nullptr;
    if (g_playerType != PT_PIS) return nullptr;
    return reinterpret_cast<CpisPlayerAccessor*>(g_player);
}

// ════════════════════════════════════════════════════════════════════════════
// D00 Native Pattern Extraction
// ════════════════════════════════════════════════════════════════════════════
//
// Walks D00 order lists and sequence data to build a time-aligned pattern grid
// with full effect information preserved. Unlike OPL capture, this reads the
// actual D00 format data structures so effects like vibrato, slide, SpFX,
// LevelPuls, set-instrument, set-volume are all captured.

// D00 note table (same as in d00.cpp)
static const uint16_t d00_notetable[12] = {340,363,385,408,432,458,485,514,544,577,611,647};

// Local LE16 reader for D00 extraction (defined before accessor classes)
static inline uint16_t d00ReadLE16(const uint16_t* val) {
    const uint8_t* b = (const uint8_t*)val;
    return (uint16_t)((b[1] << 8) + b[0]);
}

struct D00Cell {
    uint8_t note;       // 0=empty, 1-96=note, 127=note-off
    uint8_t inst;       // 0=none, 1-based instrument
    uint8_t effTyp;     // XM-compatible effect type
    uint8_t eff;        // XM-compatible effect parameter
};

// Max grid size for D00 extraction
#define D00_MAX_ROWS    16384
#define D00_MAX_CHANNELS 9

// Storage for pre-extracted D00 pattern grid
static std::vector<D00Cell> g_d00Grid;   // [row * 9 + channel]
static uint32_t g_d00GridRows = 0;
static uint32_t g_d00GridChannels = 9;
static bool g_d00NativeExtracted = false;

// Pre-extract D00 patterns by simulating the sequencer (no OPL, just data walking)
static void d00NativeExtract(Cd00PlayerAccessor* dp);


// ════════════════════════════════════════════════════════════════════════════
// OPL Register Capture — generic extraction for ALL formats
// ════════════════════════════════════════════════════════════════════════════
//
// Plays the song tick-by-tick, intercepts OPL register writes to detect
// note-on/note-off events, and reconstructs tracker patterns from the
// captured data. Works for any format, including MIDI, raw, and event-based.

// OPL frequency number table (one octave, matching OPL chip standard)
static const uint16_t OPL_FNUM_TABLE[12] = {
    343, 363, 385, 408, 432, 458, 485, 514, 544, 577, 611, 647
};

// Convert OPL fnum+block to MIDI-like note number (C-0 = 0, C-1 = 12, etc.)
static uint8_t fnum_to_note(uint16_t fnum, uint8_t block) {
    if (fnum == 0) return 0;
    // Find closest note in the fnum table
    int bestNote = 0;
    int bestDist = 9999;
    for (int n = 0; n < 12; n++) {
        int dist = abs((int)fnum - (int)OPL_FNUM_TABLE[n]);
        if (dist < bestDist) {
            bestDist = dist;
            bestNote = n;
        }
    }
    return (uint8_t)(block * 12 + bestNote + 1); // +1 so 0 = empty
}

// Captured note event
struct CapturedNote {
    uint32_t tick;
    uint8_t  channel;    // 0-8 (OPL2) or 0-17 (OPL3)
    uint8_t  note;       // MIDI-like note (1-based, 0=empty)
    uint8_t  instrument; // instrument fingerprint index
    uint8_t  volume;     // 0-63 (from carrier TL)
    bool     isNoteOn;   // true=on, false=off
};

// Instrument fingerprint (11 OPL register bytes)
struct InstrumentFingerprint {
    uint8_t regs[11];
    bool operator==(const InstrumentFingerprint& o) const {
        return memcmp(regs, o.regs, 11) == 0;
    }
};

// OPL operator register offset table (channel 0-8 → operator offset)
static const uint8_t OPL_OP_OFFSETS[9][2] = {
    {0x00, 0x03}, {0x01, 0x04}, {0x02, 0x05},
    {0x08, 0x0B}, {0x09, 0x0C}, {0x0A, 0x0D},
    {0x10, 0x13}, {0x11, 0x14}, {0x12, 0x15}
};

// Capture state
static std::vector<CapturedNote> g_capturedNotes;
static std::vector<InstrumentFingerprint> g_capturedInstruments;
static uint32_t g_captureTotalTicks = 0;
static float g_captureRefreshRate = 0.0f;
static uint32_t g_captureTicksPerRow = 0; // computed from actual note spacing
static uint32_t g_renderTickCount = 0;   // ticks rendered since last rewind (for position tracking)

// D00 captured→native instrument mapping.
// g_d00InstMap[capturedIdx] = native 1-based instrument index (0 = no match).
// Built after capture by comparing captured fingerprints to native D00 instruments.
static std::vector<uint8_t> g_d00InstMap;

// Compute the actual ticks-per-row from captured note timestamps.
// Measures tick deltas between consecutive note-ons per channel, finds the GCD.
static uint32_t computeCaptureTicksPerRow() {
    if (g_capturedNotes.size() < 2) return 6; // fallback

    // Track last note-on tick per channel (up to 18 OPL channels)
    uint32_t lastTick[18];
    bool hasTick[18];
    memset(hasTick, 0, sizeof(hasTick));

    // Collect tick deltas in a histogram (buckets for deltas 1-499)
    uint32_t deltaCount[500];
    memset(deltaCount, 0, sizeof(deltaCount));
    uint32_t totalDeltas = 0;

    for (auto& cn : g_capturedNotes) {
        if (!cn.isNoteOn || cn.channel >= 18) continue;
        if (hasTick[cn.channel]) {
            uint32_t delta = cn.tick - lastTick[cn.channel];
            if (delta > 0 && delta < 500) {
                deltaCount[delta]++;
                totalDeltas++;
            }
        }
        lastTick[cn.channel] = cn.tick;
        hasTick[cn.channel] = true;
    }

    if (totalDeltas == 0) return 6; // fallback

    // Find the GCD of all deltas that appear at least twice
    uint32_t gcd = 0;
    for (uint32_t d = 1; d < 500; d++) {
        if (deltaCount[d] < 2) continue;
        if (gcd == 0) {
            gcd = d;
        } else {
            uint32_t a = gcd, b = d;
            while (b) { uint32_t t = b; b = a % b; a = t; }
            gcd = a;
        }
    }

    // If no deltas appeared twice, use the most common delta
    if (gcd == 0) {
        uint32_t bestCount = 0;
        for (uint32_t d = 1; d < 500; d++) {
            if (deltaCount[d] > bestCount) {
                bestCount = deltaCount[d];
                gcd = d;
            }
        }
    }

    return gcd > 0 ? gcd : 6;
}

// OPL shadow registers for capture
static uint8_t g_oplRegs[2][256];  // [chip][register]
static bool g_oplKeyOn[2][9];      // per-chip per-channel key-on state

// Per-channel mute mask: bit N = 1 means channel N is ACTIVE, 0 = muted.
// Supports up to 18 channels (2 OPL chips × 9 channels).
static uint32_t g_channelMuteMask = 0x3FFFF;  // all 18 active by default

// Per-channel level output buffer (filled during render from shadow regs)
static float g_channelLevels[18];

// ── Real-time channel state (updated every tick during streaming render) ──
// This gives the worklet accurate per-channel note/instrument/volume/effect
// data that matches the actual OPL output, avoiding all extraction bugs.
struct ChannelState {
    uint8_t note;       // 0=off, 1-96=note (1-based like tracker)
    uint8_t inst;       // 1-based instrument index, 0=none
    uint8_t vol;        // 0-63 (from carrier TL, 0=silent 63=loud)
    uint8_t effTyp;     // effect command type
    uint8_t eff;        // effect parameter
    uint8_t trigger;    // 1 if note just triggered this tick, 0 if sustained
};
static ChannelState g_channelState[18];
static uint8_t g_prevKeyOn[2][9];  // previous tick's key-on state for edge detection

// Reconstruct instrument from shadow registers for a given channel.
// Returns FULL register data (including TL volume bits) for playback.
static InstrumentFingerprint getChannelInstrument(int chip, int ch) {
    InstrumentFingerprint fp = {};
    if (ch < 0 || ch >= 9) return fp;
    uint8_t modOff = OPL_OP_OFFSETS[ch][0];
    uint8_t carOff = OPL_OP_OFFSETS[ch][1];
    fp.regs[0]  = g_oplRegs[chip][0x20 + modOff]; // mod AM/VIB/EG/KSR/MULT
    fp.regs[1]  = g_oplRegs[chip][0x20 + carOff]; // car AM/VIB/EG/KSR/MULT
    fp.regs[2]  = g_oplRegs[chip][0x40 + modOff]; // mod KSL/TL
    fp.regs[3]  = g_oplRegs[chip][0x40 + carOff]; // car KSL/TL
    fp.regs[4]  = g_oplRegs[chip][0x60 + modOff]; // mod AR/DR
    fp.regs[5]  = g_oplRegs[chip][0x60 + carOff]; // car AR/DR
    fp.regs[6]  = g_oplRegs[chip][0x80 + modOff]; // mod SL/RR
    fp.regs[7]  = g_oplRegs[chip][0x80 + carOff]; // car SL/RR
    fp.regs[8]  = g_oplRegs[chip][0xE0 + modOff]; // mod waveform
    fp.regs[9]  = g_oplRegs[chip][0xE0 + carOff]; // car waveform
    fp.regs[10] = g_oplRegs[chip][0xC0 + ch];     // feedback/connection
    return fp;
}

// Compare two instrument fingerprints ignoring volume-sensitive TL bits.
// This prevents volume changes from creating duplicate instruments.
static bool instrumentsMatch(const InstrumentFingerprint& a, const InstrumentFingerprint& b) {
    for (int i = 0; i < 11; i++) {
        if (i == 2 || i == 3) {
            // KSL/TL register — compare only KSL (bits 6-7), ignore TL (bits 0-5)
            if ((a.regs[i] & 0xC0) != (b.regs[i] & 0xC0)) return false;
        } else {
            if (a.regs[i] != b.regs[i]) return false;
        }
    }
    return true;
}

// Find or add instrument fingerprint, return 1-based index (0 = no instrument)
static uint8_t findOrAddInstrument(const InstrumentFingerprint& fp) {
    // Check if all regs are zero → skip
    bool allZero = true;
    for (int i = 0; i < 11; i++) if (fp.regs[i]) { allZero = false; break; }
    if (allZero) return 0;

    for (size_t i = 0; i < g_capturedInstruments.size(); i++) {
        if (instrumentsMatch(g_capturedInstruments[i], fp)) return (uint8_t)(i + 1);
    }
    if (g_capturedInstruments.size() < 255) {
        g_capturedInstruments.push_back(fp);
        return (uint8_t)g_capturedInstruments.size(); // 1-based
    }
    return 0;
}

// Process an OPL register write during capture
static void captureOplWrite(int chip, int reg, int val, uint32_t tick) {
    if (chip < 0 || chip > 1) return;
    g_oplRegs[chip][reg & 0xFF] = (uint8_t)val;

    // Detect key-on/key-off on registers 0xB0-0xB8
    if (reg >= 0xB0 && reg <= 0xB8) {
        int ch = reg - 0xB0;
        bool keyOn = (val & 0x20) != 0;
        bool wasOn = g_oplKeyOn[chip][ch];

        if (keyOn && !wasOn) {
            // Note ON
            uint16_t fnum = g_oplRegs[chip][0xA0 + ch] |
                           ((g_oplRegs[chip][0xB0 + ch] & 0x03) << 8);
            uint8_t block = (g_oplRegs[chip][0xB0 + ch] >> 2) & 0x07;
            uint8_t note = fnum_to_note(fnum, block);

            InstrumentFingerprint fp = getChannelInstrument(chip, ch);
            uint8_t instIdx = findOrAddInstrument(fp);

            // Volume from carrier TL (0x40 + carrier offset), inverted: 0=loud, 63=silent
            uint8_t carrierTL = g_oplRegs[chip][0x40 + OPL_OP_OFFSETS[ch][1]];
            uint8_t vol = 63 - (carrierTL & 0x3F);

            CapturedNote cn;
            cn.tick = tick;
            cn.channel = (uint8_t)(chip * 9 + ch);
            cn.note = note;
            cn.instrument = instIdx;
            cn.volume = vol;
            cn.isNoteOn = true;
            g_capturedNotes.push_back(cn);
        }
        else if (!keyOn && wasOn) {
            // Note OFF
            CapturedNote cn;
            cn.tick = tick;
            cn.channel = (uint8_t)(chip * 9 + ch);
            cn.note = 0;
            cn.instrument = 0;
            cn.volume = 0;
            cn.isNoteOn = false;
            g_capturedNotes.push_back(cn);
        }

        g_oplKeyOn[chip][ch] = keyOn;
    }
}

// Capturing OPL wrapper — intercepts writes and forwards to real OPL
class CCapturingOpl : public Copl {
public:
    CEmuopl* realOpl;
    uint32_t currentTick;

    CCapturingOpl(CEmuopl* real) : realOpl(real), currentTick(0) {
        currType = real->gettype();
    }

    void write(int reg, int val) override {
        captureOplWrite(currChip, reg, val, currentTick);
        realOpl->setchip(currChip);
        realOpl->write(reg, val);
    }

    void setchip(int n) override {
        Copl::setchip(n);
        realOpl->setchip(n);
    }

    void init() override {
        realOpl->init();
        memset(g_oplRegs, 0, sizeof(g_oplRegs));
        memset(g_oplKeyOn, 0, sizeof(g_oplKeyOn));
    }

    void update(short* buf, int samples) override {
        realOpl->update(buf, samples);
    }
};

// Muting OPL wrapper — used during streaming playback.
// Intercepts register writes to:
//   1. Track shadow registers for per-channel level metering
//   2. Suppress key-on + force max attenuation for muted channels
class CMutingOpl : public Copl {
public:
    CEmuopl* realOpl;

    CMutingOpl(CEmuopl* real) : realOpl(real) {
        currType = real->gettype();
    }

    void write(int reg, int val) override {
        int chip = currChip;

        // Track shadow registers for level metering
        if (chip >= 0 && chip <= 1) {
            g_oplRegs[chip][reg & 0xFF] = (uint8_t)val;
            // Track key-on state
            if (reg >= 0xB0 && reg <= 0xB8) {
                g_oplKeyOn[chip][reg - 0xB0] = (val & 0x20) != 0;
            }
        }

        // Only do muting work if any channel is actually muted
        if (g_channelMuteMask != 0x3FFFF) {
            int ch = regToChannel(reg);
            if (ch >= 0) {
                int globalCh = chip * 9 + ch;
                if (!(g_channelMuteMask & (1u << globalCh))) {
                    // Channel is muted — strip key-on, force max attenuation
                    if (reg >= 0xB0 && reg <= 0xB8) {
                        val &= ~0x20;
                    }
                    if ((reg & 0xE0) == 0x40) {
                        val = (val & 0xC0) | 0x3F;
                    }
                }
            }
        }

        realOpl->setchip(chip);
        realOpl->write(reg, val);
    }

    void setchip(int n) override {
        Copl::setchip(n);
        realOpl->setchip(n);
    }

    void init() override {
        realOpl->init();
        memset(g_oplRegs, 0, sizeof(g_oplRegs));
        memset(g_oplKeyOn, 0, sizeof(g_oplKeyOn));
        memset(g_channelLevels, 0, sizeof(g_channelLevels));
    }

    void update(short* buf, int samples) override {
        realOpl->update(buf, samples);
    }

    // Compute per-channel levels from shadow registers
    void updateChannelLevels() {
        for (int chip = 0; chip < 2; chip++) {
            for (int ch = 0; ch < 9; ch++) {
                int globalCh = chip * 9 + ch;
                if (!g_oplKeyOn[chip][ch]) {
                    g_channelLevels[globalCh] *= 0.85f;
                    continue;
                }
                uint8_t carOff = OPL_OP_OFFSETS[ch][1];
                uint8_t tl = g_oplRegs[chip][0x40 + carOff] & 0x3F;
                float level = 1.0f - (tl / 63.0f);
                float prev = g_channelLevels[globalCh] * 0.85f;
                g_channelLevels[globalCh] = level > prev ? level : prev;
            }
        }
    }

private:
    // Map an OPL register to its channel (0-8), or -1 if not channel-specific
    static int regToChannel(int reg) {
        if (reg >= 0xA0 && reg <= 0xA8) return reg - 0xA0;
        if (reg >= 0xB0 && reg <= 0xB8) return reg - 0xB0;
        if (reg >= 0xC0 && reg <= 0xC8) return reg - 0xC0;
        int off = reg & 0x1F;
        int base = reg & 0xE0;
        if (base == 0x20 || base == 0x40 || base == 0x60 || base == 0x80 || base == 0xE0) {
            for (int c = 0; c < 9; c++) {
                if (OPL_OP_OFFSETS[c][0] == off || OPL_OP_OFFSETS[c][1] == off)
                    return c;
            }
        }
        return -1;
    }
};

// Forward declare — defined after accessor classes
static void updateChannelState();

extern "C" {

EMSCRIPTEN_KEEPALIVE
int adplug_init(uint32_t sampleRate) {
    if (g_initialized) return 1;

    g_sampleRate = sampleRate;
    // 16-bit stereo OPL emulator
    g_opl = new CEmuopl(static_cast<int>(sampleRate), true, true);
    g_mutingOpl = new CMutingOpl(g_opl);
    g_channelMuteMask = 0x3FFFF; // all active
    g_initialized = true;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void adplug_shutdown() {
    if (g_player) { delete g_player; g_player = nullptr; }
    if (g_mutingOpl) { delete g_mutingOpl; g_mutingOpl = nullptr; }
    if (g_opl)    { delete g_opl;    g_opl = nullptr; }
    if (g_fileData) { free(g_fileData); g_fileData = nullptr; }
    for (auto& c : g_companions) { free(c.data); }
    g_companions.clear();
    g_initialized = false;
}

/**
 * Add a companion file (e.g. patch.003 for SCI, custom .bnk for ROL).
 * Call before adplug_load(). Companions are cleared on next adplug_load().
 */
EMSCRIPTEN_KEEPALIVE
void adplug_add_companion(const uint8_t* data, uint32_t length, const char* name) {
    CompanionFile c;
    c.data = (uint8_t*)malloc(length);
    memcpy(c.data, data, length);
    c.size = length;
    c.name = std::string(name);
    g_companions.push_back(c);
}

EMSCRIPTEN_KEEPALIVE
int adplug_load(const uint8_t* data, uint32_t length, const char* filename) {
    if (!g_initialized || !g_opl || !g_mutingOpl) return -1;

    // Clean up previous
    if (g_player) { delete g_player; g_player = nullptr; }
    if (g_fileData) { free(g_fileData); g_fileData = nullptr; }

    // Copy file data (AdPlug may re-read during playback)
    g_fileData = (uint8_t*)malloc(length);
    if (!g_fileData) return -1;
    memcpy(g_fileData, data, length);
    g_fileSize = length;

    // Reset OPL emulator
    g_mutingOpl->init();
    memset(g_channelState, 0, sizeof(g_channelState));
    memset(g_prevKeyOn, 0, sizeof(g_prevKeyOn));
    g_capturedInstruments.clear();

    // Use AdPlug factory to auto-detect format and create player
    // Pass the muting OPL wrapper so we can mute channels during streaming.
    CProvider_Memory provider(g_fileData, g_fileSize, std::string(filename));
    g_player = CAdPlug::factory(std::string(filename), g_mutingOpl, CAdPlug::players, provider);

    if (!g_player) {
        free(g_fileData);
        g_fileData = nullptr;
        return -1;
    }

    // Store metadata
    std::string title = g_player->gettitle();
    strncpy(g_title, title.c_str(), sizeof(g_title) - 1);
    g_title[sizeof(g_title) - 1] = '\0';

    std::string type = g_player->gettype();
    strncpy(g_type, type.c_str(), sizeof(g_type) - 1);
    g_type[sizeof(g_type) - 1] = '\0';

    strncpy(g_filename, filename, sizeof(g_filename) - 1);
    g_filename[sizeof(g_filename) - 1] = '\0';

    // Calculate samples per tick
    float refresh = g_player->getrefresh();
    if (refresh <= 0.0f) refresh = 70.0f;
    g_samplesPerTick = (double)g_sampleRate / (double)refresh;
    g_sampleAccum = 0.0;

    // Detect player type for pattern extraction
    detectPlayerType();

    // D00 native extraction — walk order lists + sequences to build pattern grid.
    // Falls back to OPL capture (triggered by TypeScript) if extraction produces
    // too few rows (e.g., some packed v4 files with unusual sequence layouts).
    if (g_playerType == PT_D00) {
        auto* dp = asD00Player();
        if (dp) {
            d00NativeExtract(dp);
            if (g_d00NativeExtracted && g_d00GridRows < 4) {
                // Suspiciously few rows — disable native and let OPL capture handle it
                g_d00NativeExtracted = false;
                g_d00GridRows = 0;
                g_d00Grid.clear();
            }
        }
    }

    return 0;
}

EMSCRIPTEN_KEEPALIVE
void adplug_rewind(uint32_t subsong) {
    if (g_player) {
        g_player->rewind(static_cast<int>(subsong));
        g_mutingOpl->init();
        g_sampleAccum = 0.0;
        g_renderTickCount = 0;
        memset(g_channelState, 0, sizeof(g_channelState));
        memset(g_prevKeyOn, 0, sizeof(g_prevKeyOn));
        float refresh = g_player->getrefresh();
        if (refresh <= 0.0f) refresh = 70.0f;
        g_samplesPerTick = (double)g_sampleRate / (double)refresh;
    }
}

/**
 * Render interleaved stereo S16 samples.
 * Returns number of frames rendered, or 0 if song finished.
 */
EMSCRIPTEN_KEEPALIVE
int adplug_render(int16_t* buffer, uint32_t maxFrames) {
    if (!g_player || !g_opl) {
        memset(buffer, 0, maxFrames * 2 * sizeof(int16_t));
        return 0;
    }

    uint32_t framesGen = 0;
    bool finished = false;

    while (framesGen < maxFrames && !finished) {
        uint32_t untilTick = (uint32_t)(g_samplesPerTick - g_sampleAccum);
        if (untilTick == 0) untilTick = 1;
        if (framesGen + untilTick > maxFrames)
            untilTick = maxFrames - framesGen;

        g_opl->update(buffer + framesGen * 2, static_cast<int>(untilTick));
        framesGen += untilTick;
        g_sampleAccum += untilTick;

        if (g_sampleAccum >= g_samplesPerTick) {
            finished = !g_player->update();
            g_renderTickCount++;
            g_sampleAccum -= g_samplesPerTick;

            // Update per-channel levels from shadow registers
            if (g_mutingOpl) g_mutingOpl->updateChannelLevels();

            // Update per-channel note/inst/vol/effect state
            updateChannelState();

            float refresh = g_player->getrefresh();
            if (refresh > 0.0f)
                g_samplesPerTick = (double)g_sampleRate / (double)refresh;
        }
    }

    return finished ? 0 : (int)framesGen;
}

EMSCRIPTEN_KEEPALIVE
const char* adplug_get_title() { return g_title; }

EMSCRIPTEN_KEEPALIVE
const char* adplug_get_type() { return g_type; }

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_subsongs() {
    return g_player ? (uint32_t)g_player->getsubsongs() : 0;
}

EMSCRIPTEN_KEEPALIVE
float adplug_get_refresh() {
    return g_player ? g_player->getrefresh() : 0.0f;
}

EMSCRIPTEN_KEEPALIVE
void adplug_set_ticks_per_row(uint32_t tpr) {
    g_captureTicksPerRow = tpr;
}

/**
 * Set per-channel mute mask for live streaming playback.
 * Bit N = 1 means channel N is ACTIVE (playing); bit N = 0 = muted.
 * Channels 0-8 = OPL chip 0, channels 9-17 = OPL chip 1.
 * Default: 0x3FFFF (all 18 active).
 */
EMSCRIPTEN_KEEPALIVE
void adplug_set_mute_mask(uint32_t mask) {
    g_channelMuteMask = mask;
    // When a channel is newly muted, immediately silence it in the OPL
    if (g_opl) {
        for (int chip = 0; chip < 2; chip++) {
            for (int ch = 0; ch < 9; ch++) {
                int globalCh = chip * 9 + ch;
                if (!(mask & (1u << globalCh)) && g_oplKeyOn[chip][ch]) {
                    // Force key-off + max attenuation
                    g_opl->setchip(chip);
                    uint8_t bval = g_oplRegs[chip][0xB0 + ch] & ~0x20;
                    g_opl->write(0xB0 + ch, bval);
                    // Max attenuation on carrier
                    uint8_t carOff = OPL_OP_OFFSETS[ch][1];
                    g_opl->write(0x40 + carOff, (g_oplRegs[chip][0x40 + carOff] & 0xC0) | 0x3F);
                }
            }
        }
    }
}

/**
 * Get pointer to per-channel level array (18 floats, 0.0-1.0).
 * Updated every tick during adplug_render().
 */
EMSCRIPTEN_KEEPALIVE
float* adplug_get_channel_levels() {
    return g_channelLevels;
}

/**
 * Get the number of active audio channels for the current format.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_num_audio_channels() {
    if (!g_player) return 0;
    // Most OPL2 formats use 9 channels
    return 9;
}

// adplug_get_num_instruments is defined in the second extern "C" block
// where accessor functions are available

EMSCRIPTEN_KEEPALIVE
const char* adplug_get_instrument_name(uint32_t index) {
    static char instName[256];
    if (g_player && index < (uint32_t)g_player->getinstruments()) {
        std::string name = g_player->getinstrument(index);
        strncpy(instName, name.c_str(), sizeof(instName) - 1);
        instName[sizeof(instName) - 1] = '\0';
    } else {
        instName[0] = '\0';
    }
    return instName;
}

EMSCRIPTEN_KEEPALIVE
uint8_t* adplug_alloc(uint32_t size) {
    return (uint8_t*)malloc(size);
}

EMSCRIPTEN_KEEPALIVE
void adplug_free(uint8_t* ptr) {
    free(ptr);
}

/**
 * Get real-time channel state for a specific channel.
 * Returns packed: note(8) | inst(8) | vol(8) | trigger(1)+effTyp(7) | eff(8)
 * Called from worklet after each render to build live pattern grid.
 * 40 bits packed into a uint64 returned as two uint32s via pointer.
 * Simpler: return pointer to ChannelState array (6 bytes per channel).
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* adplug_get_channel_state_ptr() {
    return (uint8_t*)g_channelState;
}

/**
 * Get size of a single ChannelState struct (for JS offset calculation).
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_channel_state_stride() {
    return sizeof(ChannelState);
}

} // extern "C"

// ── Pattern/Instrument Extraction ──────────────────────────────────────────
// Multiple player backends supported:
//   CmodPlayer — A2M, AMD, CFF, DFM, DTM, MAD, MTR, SA2, SAT, XMS
//   ChscPlayer — HSC, HSP, MTK
//   Cs3mPlayer — DMO (TwinTeam packed S3M)
//   CpisPlayer — PIS (Beni Tracker)
//   Cd00Player — D00 (EdLib)
//   CldsPlayer — LDS (Loudness Sound System)
//   CxadbmfPlayer — BMF (Bob's Music Format via XAD shell)
//   CheradPlayer — AGD/HERAD (Herbulot AdLib)
//   CsopPlayer — SOP (Note Sequencer)
//   CjbmPlayer — JBM (Johannes Bjerregaard Music)
//   CrolPlayer — ROL (AdLib Visual Composer)
//   OPL Capture — generic fallback for all other formats

// (Headers already included above via forward declarations)

// ── Accessor classes to expose protected members ───────────────────────────

class CmodPlayerAccessor : public CmodPlayer {
public:
    using CmodPlayer::inst;
    using CmodPlayer::tracks;
    using CmodPlayer::order;
    using CmodPlayer::trackord;
    using CmodPlayer::nop;
    using CmodPlayer::length;
    using CmodPlayer::restartpos;
    using CmodPlayer::tempo;
    using CmodPlayer::bpm;
    using CmodPlayer::channel;
};

class ChscPlayerAccessor : public ChscPlayer {
public:
    using ChscPlayer::patterns;
    using ChscPlayer::song;
    using ChscPlayer::instr;
    using ChscPlayer::speed;
    using ChscPlayer::channel;
};

class Cs3mPlayerAccessor : public Cs3mPlayer {
public:
    using Cs3mPlayer::pattern;
    using Cs3mPlayer::orders;
    using Cs3mPlayer::inst;
    using Cs3mPlayer::header;
    using Cs3mPlayer::speed;
    using Cs3mPlayer::tempo;
};

class Cd00PlayerAccessor : public Cd00Player {
public:
    using Cd00Player::inst;
    using Cd00Player::channel;
    using Cd00Player::seqptr;
    using Cd00Player::version;
    using Cd00Player::header;
    using Cd00Player::header1;
    using Cd00Player::filedata;
    using Cd00Player::filesize;
};

class CldsPlayerAccessor : public CldsPlayer {
public:
    using CldsPlayer::soundbank;
    using CldsPlayer::positions;
    using CldsPlayer::patterns;
    using CldsPlayer::patterns_size;
    using CldsPlayer::channel;
    using CldsPlayer::numpatch;
    using CldsPlayer::numposi;
    using CldsPlayer::pattlen;
    using CldsPlayer::speed;
    using CldsPlayer::tempo;
};

class CxadbmfPlayerAccessor : public CxadbmfPlayer {
public:
    using CxadbmfPlayer::bmf;
};

class CheradPlayerAccessor : public CheradPlayer {
public:
    using CheradPlayer::track;
    using CheradPlayer::chn;
    using CheradPlayer::inst;
    using CheradPlayer::nTracks;
    using CheradPlayer::nInsts;
    using CheradPlayer::wSpeed;
    using CheradPlayer::AGD;
    using CheradPlayer::v2;
};

class CsopPlayerAccessor : public CsopPlayer {
public:
    using CsopPlayer::track;
    using CsopPlayer::inst;
    using CsopPlayer::nTracks;
    using CsopPlayer::nInsts;
    using CsopPlayer::basicTempo;
    using CsopPlayer::tickBeat;
    using CsopPlayer::percussive;
};

class CjbmPlayerAccessor : public CjbmPlayer {
public:
    using CjbmPlayer::voice;
    using CjbmPlayer::m;
    using CjbmPlayer::sequences;
    using CjbmPlayer::seqtable;
    using CjbmPlayer::seqcount;
    using CjbmPlayer::instable;
    using CjbmPlayer::inscount;
    using CjbmPlayer::voicemask;
};

// ── Player type detection ──────────────────────────────────────────────────

static CmodPlayerAccessor* asModPlayer() {
    if (!g_player || g_playerType != PT_CMOD) return nullptr;
    auto* mp = reinterpret_cast<CmodPlayerAccessor*>(g_player);
    auto ch = mp->getNchans();
    auto rows = mp->getNrows();
    if (ch == 0 || ch > 18 || rows == 0 || rows > 256) return nullptr;
    return mp;
}

static ChscPlayerAccessor* asHscPlayer() {
    if (!g_player || g_playerType != PT_HSC) return nullptr;
    return reinterpret_cast<ChscPlayerAccessor*>(g_player);
}

static Cs3mPlayerAccessor* asS3mPlayer() {
    if (!g_player || g_playerType != PT_S3M) return nullptr;
    return reinterpret_cast<Cs3mPlayerAccessor*>(g_player);
}

static CldsPlayerAccessor* asLdsPlayer() {
    if (!g_player || g_playerType != PT_LDS) return nullptr;
    return reinterpret_cast<CldsPlayerAccessor*>(g_player);
}

static CxadbmfPlayerAccessor* asBmfPlayer() {
    if (!g_player || g_playerType != PT_BMF) return nullptr;
    return reinterpret_cast<CxadbmfPlayerAccessor*>(g_player);
}

static CheradPlayerAccessor* asHeradPlayer() {
    if (!g_player || g_playerType != PT_HERAD) return nullptr;
    return reinterpret_cast<CheradPlayerAccessor*>(g_player);
}

static CsopPlayerAccessor* asSopPlayer() {
    if (!g_player || g_playerType != PT_SOP) return nullptr;
    return reinterpret_cast<CsopPlayerAccessor*>(g_player);
}

static CjbmPlayerAccessor* asJbmPlayer() {
    if (!g_player || g_playerType != PT_JBM) return nullptr;
    return reinterpret_cast<CjbmPlayerAccessor*>(g_player);
}

static Cd00PlayerAccessor* asD00Player() {
    if (!g_player || g_playerType != PT_D00) return nullptr;
    return reinterpret_cast<Cd00PlayerAccessor*>(g_player);
}

// ── D00 Native Pattern Extraction Implementation ──────────────────────────
static void d00NativeExtract(Cd00PlayerAccessor* dp) {
    g_d00NativeExtracted = false;
    g_d00GridRows = 0;
    g_d00Grid.clear();

    if (!dp || !dp->filedata) return;

    uint16_t tpoinOff;
    uint8_t globalSpeed;
    if (dp->version > 1) {
        tpoinOff = d00ReadLE16(&dp->header->tpoin);
        globalSpeed = dp->header->speed;
    } else {
        tpoinOff = d00ReadLE16(&dp->header1->tpoin);
        globalSpeed = dp->header1->speed;
    }
    if (globalSpeed == 0) globalSpeed = 6;

    struct Stpoin {
        uint16_t ptr[9];
        uint8_t volume[9];
        uint8_t dummy[5];
    };

    if (tpoinOff + sizeof(Stpoin) > dp->filesize) return;
    Stpoin tpoin;
    memcpy(&tpoin, dp->filedata + tpoinOff, sizeof(Stpoin));

    struct ChanSim {
        const uint16_t* order;
        uint32_t ordpos;
        uint16_t speed;
        int16_t transpose;
        uint16_t inst;
        uint8_t vol;
        bool ended;
        uint16_t rhcnt;
        uint16_t del;
        uint32_t pattpos;
        const uint16_t* patt;
        bool pattValid;
    };
    ChanSim ch[9];
    memset(ch, 0, sizeof(ch));

    for (int c = 0; c < 9; c++) {
        uint16_t ptr = d00ReadLE16(&tpoin.ptr[c]);
        if (ptr && ptr + 4 <= dp->filesize) {
            ch[c].speed = d00ReadLE16((const uint16_t*)(dp->filedata + ptr));
            ch[c].order = (const uint16_t*)(dp->filedata + ptr + 2);
            ch[c].vol = tpoin.volume[c];
            ch[c].inst = c;
        } else {
            ch[c].ended = true;
        }
        ch[c].pattValid = false;
    }

    g_d00Grid.resize(D00_MAX_ROWS * D00_MAX_CHANNELS);
    memset(g_d00Grid.data(), 0, g_d00Grid.size() * sizeof(D00Cell));

    auto safeRead16 = [&](const uint16_t* ptr) -> uint16_t {
        const char* p = (const char*)ptr;
        if (p < dp->filedata || p + 2 > dp->filedata + dp->filesize) return 0xFFFF;
        return d00ReadLE16(ptr);
    };

    uint32_t totalRows = 0;

    for (uint32_t row = 0; row < D00_MAX_ROWS; row++) {
        bool allEnded = true;

        for (int c = 0; c < 9; c++) {
            if (ch[c].ended) continue;
            allEnded = false;

            if (ch[c].del > 0) {
                ch[c].del--;
                continue;
            }

            if (ch[c].rhcnt > 0) {
                ch[c].rhcnt--;
                ch[c].del = ch[c].speed > 0 ? ch[c].speed - 1 : 0;
                continue;
            }

            bool needOrder = !ch[c].pattValid;

            if (needOrder) {
d00_readorder:
                uint16_t ord = safeRead16(&ch[c].order[ch[c].ordpos]);
                if (ord == 0xFFFE) {
                    ch[c].ended = true;
                    continue;
                }
                if (ord == 0xFFFF) {
                    uint16_t target = safeRead16(&ch[c].order[ch[c].ordpos + 1]);
                    if (target == ch[c].ordpos || target > 4096) {
                        ch[c].ended = true;
                        continue;
                    }
                    ch[c].ordpos = target;
                    goto d00_readorder;
                }
                if (ord >= 0x9000) {
                    ch[c].speed = ord & 0xFF;
                    ch[c].ordpos++;
                    goto d00_readorder;
                }
                if (ord >= 0x8000) {
                    int16_t trans = ord & 0xFF;
                    if (ord & 0x100) trans = -trans;
                    ch[c].transpose = trans;
                    ch[c].ordpos++;
                    ord = safeRead16(&ch[c].order[ch[c].ordpos]);
                }

                if (!dp->seqptr) { ch[c].ended = true; continue; }
                uint16_t seqOff = safeRead16(&dp->seqptr[ord]);
                if (seqOff == 0xFFFF || seqOff + 2 > dp->filesize) {
                    ch[c].ended = true;
                    continue;
                }
                ch[c].patt = (const uint16_t*)(dp->filedata + seqOff);
                ch[c].pattpos = 0;
                ch[c].pattValid = true;
            }

d00_readseq:
            {
                uint16_t pattword = safeRead16(&ch[c].patt[ch[c].pattpos]);
                if (pattword == 0xFFFF) {
                    ch[c].pattpos = 0;
                    ch[c].ordpos++;
                    ch[c].pattValid = false;
                    goto d00_readorder;
                }

                uint8_t cnt = (pattword >> 8) & 0xFF;
                uint8_t note = pattword & 0xFF;
                uint8_t fx = (pattword >> 12) & 0x0F;
                uint16_t fxop = pattword & 0x0FFF;
                ch[c].pattpos++;

                D00Cell& cell = g_d00Grid[row * D00_MAX_CHANNELS + c];

                bool isNoteEvent = (dp->version > 0) ? (cnt < 0x40) : (!fx);

                if (isNoteEvent) {
                    if (note == 0 || note == 0x80) {
                        cell.note = 97; // XM note-off
                        if (dp->version > 0) ch[c].rhcnt = cnt;
                    } else if (note == 0x7E) {
                        if (dp->version > 0) ch[c].rhcnt = cnt;
                    } else {
                        uint8_t playNote = note;
                        if (dp->version > 0) {
                            if (note > 0x80) playNote = note - 0x80;
                            else playNote = note + ch[c].transpose;
                        } else {
                            if (cnt < 2) playNote = note + ch[c].transpose;
                        }
                        if (playNote > 0 && playNote < 127) {
                            cell.note = playNote;
                            cell.inst = (ch[c].inst & 0xFF) + 1;
                        }
                        if (dp->version > 0) {
                            uint8_t dur = cnt;
                            if (cnt >= 0x20) dur = cnt - 0x20;
                            ch[c].rhcnt = dur;
                        }
                    }
                } else {
                    uint8_t effType = 0, effParam = 0;
                    switch (fx) {
                        case 6:
                            cell.note = 97;
                            ch[c].rhcnt = fxop & 0xFF;
                            ch[c].del = ch[c].speed > 0 ? ch[c].speed - 1 : 0;
                            continue;
                        case 7:
                            effType = 0x04;
                            effParam = ((fxop >> 8) & 0x0F) << 4 | (fxop & 0x0F);
                            break;
                        case 8:
                            break;
                        case 9:
                            effType = 0x0C;
                            effParam = 63 - (fxop & 63);
                            break;
                        case 0xB:
                            break;
                        case 0xC:
                            ch[c].inst = fxop & 0xFF;
                            break;
                        case 0xD:
                            effType = 0x01;
                            effParam = fxop & 0xFF;
                            break;
                        case 0xE:
                            effType = 0x02;
                            effParam = fxop & 0xFF;
                            break;
                    }
                    cell.effTyp = effType;
                    cell.eff = effParam;
                    goto d00_readseq;
                }

                ch[c].del = ch[c].speed > 0 ? ch[c].speed - 1 : 0;
            }
        }

        if (allEnded) break;
        totalRows = row + 1;
    }

    g_d00GridRows = totalRows;
    g_d00Grid.resize(totalRows * D00_MAX_CHANNELS);
    g_d00NativeExtracted = true;
}

// Read little-endian uint16_t (matches d00.cpp's LE_WORD)
static inline uint16_t readLE16(const uint16_t* val) {
    const uint8_t* b = (const uint8_t*)val;
    return (uint16_t)((b[1] << 8) + b[0]);
}

// Compute number of instruments in a D00 file.
// The instrument table starts at instptr and ends at the next section boundary.
static uint32_t d00InstrumentCount() {
    auto* dp = asD00Player();
    if (!dp || !dp->inst) return 0;

    uint16_t instOff;
    if (dp->version > 1) {
        instOff = readLE16(&dp->header->instptr);
    } else {
        instOff = readLE16(&dp->header1->instptr);
    }

    // Collect all section offsets that come AFTER the instrument table
    // to find the nearest boundary
    uint32_t boundary = (uint32_t)dp->filesize;  // worst case: end of file
    uint16_t offsets[8];
    int nOffsets = 0;

    if (dp->version > 1) {
        offsets[nOffsets++] = readLE16(&dp->header->seqptr);
        offsets[nOffsets++] = readLE16(&dp->header->tpoin);
        offsets[nOffsets++] = readLE16(&dp->header->infoptr);
        if (dp->version == 2 || dp->version == 4)
            offsets[nOffsets++] = readLE16(&dp->header->spfxptr);
    } else {
        offsets[nOffsets++] = readLE16(&dp->header1->seqptr);
        offsets[nOffsets++] = readLE16(&dp->header1->tpoin);
        offsets[nOffsets++] = readLE16(&dp->header1->infoptr);
        if (dp->version == 1)
            offsets[nOffsets++] = readLE16(&dp->header1->lpulptr);
    }

    for (int i = 0; i < nOffsets; i++) {
        uint32_t off = (uint32_t)offsets[i];
        if (off > instOff && off < boundary)
            boundary = off;
    }

    uint32_t instRegionSize = boundary - instOff;
    uint32_t count = instRegionSize / 16;  // sizeof(Sinsts) = 16 with packing
    if (count > 4096) count = 4096;  // sanity cap
    return count;
}

// Detect player type after loading by checking the type string
static void detectPlayerType() {
    g_playerType = PT_UNKNOWN;
    if (!g_player) return;

    std::string type = g_player->gettype();

    // CmodPlayer-derived formats
    if (type.find("AdLib Tracker 2") != std::string::npos ||
        type.find("AMUSIC") != std::string::npos ||
        type.find("BoomTracker") != std::string::npos ||
        type.find("Digital-FM") != std::string::npos ||
        type.find("DeFy") != std::string::npos ||
        type.find("Mlat") != std::string::npos ||
        type.find("Master Tracker") != std::string::npos ||
        type.find("Surprise!") != std::string::npos) {
        if (g_player->getpatterns() > 0 && g_player->getorders() > 0) {
            auto* mp = reinterpret_cast<CmodPlayerAccessor*>(g_player);
            auto ch = mp->getNchans();
            auto rows = mp->getNrows();
            if (ch >= 1 && ch <= 18 && rows >= 1 && rows <= 256) {
                g_playerType = PT_CMOD;
                return;
            }
        }
    }

    // ChscPlayer-derived formats
    if (type.find("HSC") != std::string::npos ||
        type.find("HSC-Tracker") != std::string::npos ||
        type.find("MPU-401 Trakker") != std::string::npos) {
        g_playerType = PT_HSC;
        return;
    }

    // Cs3mPlayer (DMO = packed S3M)
    if (type.find("TwinTeam") != std::string::npos ||
        type.find("Scream Tracker 3") != std::string::npos) {
        g_playerType = PT_S3M;
        return;
    }

    // CpisPlayer
    if (type.find("Beni Tracker") != std::string::npos) {
        g_playerType = PT_PIS;
        return;
    }

    // Cd00Player
    if (type.find("EdLib") != std::string::npos ||
        type.find("Packed EdLib") != std::string::npos) {
        g_playerType = PT_D00;
        return;
    }

    // CldsPlayer
    if (type.find("LOUDNESS") != std::string::npos) {
        g_playerType = PT_LDS;
        return;
    }

    // CxadbmfPlayer (BMF via XAD shell) — NOT the same as BAM (Bob's Adlib Music)
    if (type.find("BMF Adlib Tracker") != std::string::npos) {
        g_playerType = PT_BMF;
        return;
    }

    // CheradPlayer (AGD/HERAD)
    if (type.find("HERAD") != std::string::npos ||
        type.find("Herbulot") != std::string::npos) {
        g_playerType = PT_HERAD;
        return;
    }

    // CsopPlayer (SOP)
    if (type.find("Note Sequencer") != std::string::npos ||
        type.find("sopepos") != std::string::npos) {
        g_playerType = PT_SOP;
        return;
    }

    // CjbmPlayer (JBM)
    if (type.find("Johannes Bjerregaard") != std::string::npos) {
        g_playerType = PT_JBM;
        return;
    }

    // CrolPlayer (ROL)
    if (type.find("AdLib Visual Composer") != std::string::npos ||
        type.find("ROL") != std::string::npos) {
        g_playerType = PT_ROL;
        return;
    }

    // Fallback: if none of the above matched, use OPL capture
    // (covers ADL, BAM, GOT, KSM, LAA, MDI, MKJ, MSC, PLX, RAW, RIX, XAD, XSM)
    g_playerType = PT_OPL_CAPTURE;
}

// ── Real-time channel state (called every tick during streaming render) ──
// Reads OPL shadow registers for note/volume, enriches from player internals.
static void updateChannelState() {
    for (int chip = 0; chip < 2; chip++) {
        for (int ch = 0; ch < 9; ch++) {
            int globalCh = chip * 9 + ch;
            ChannelState& cs = g_channelState[globalCh];
            bool keyOn = g_oplKeyOn[chip][ch];
            bool wasOn = g_prevKeyOn[chip][ch] != 0;

            if (keyOn) {
                uint16_t fnum = g_oplRegs[chip][0xA0 + ch] |
                               ((g_oplRegs[chip][0xB0 + ch] & 0x03) << 8);
                uint8_t block = (g_oplRegs[chip][0xB0 + ch] >> 2) & 0x07;
                cs.note = fnum_to_note(fnum, block);

                uint8_t carrierTL = g_oplRegs[chip][0x40 + OPL_OP_OFFSETS[ch][1]] & 0x3F;
                cs.vol = 63 - carrierTL;

                // Trigger on key-on edge (was off, now on)
                cs.trigger = (!wasOn) ? 1 : 0;

                // Default instrument from OPL fingerprint (if no format-specific enrichment)
                if (!wasOn) {
                    InstrumentFingerprint fp = getChannelInstrument(chip, ch);
                    cs.inst = findOrAddInstrument(fp);
                }
            } else {
                if (wasOn) {
                    cs.note = 0;
                    cs.vol = 0;
                    cs.trigger = 0;
                    cs.effTyp = 0;
                    cs.eff = 0;
                }
            }

            g_prevKeyOn[chip][ch] = keyOn ? 1 : 0;
        }
    }

    // Enrich D00 channels with player-internal state
    if (g_playerType == PT_D00) {
        auto* dp = asD00Player();
        if (dp) {
            for (int c = 0; c < 9; c++) {
                ChannelState& cs = g_channelState[c];
                if (cs.note > 0) {
                    cs.inst = (uint8_t)(dp->channel[c].inst + 1);
                    if (dp->channel[c].slideval != 0) {
                        cs.effTyp = dp->channel[c].slideval > 0 ? 0x01 : 0x02;
                        cs.eff = (uint8_t)abs(dp->channel[c].slideval);
                    } else if (dp->channel[c].vibspeed != 0) {
                        cs.effTyp = 0x04;
                        cs.eff = (uint8_t)((dp->channel[c].vibspeed << 4) | dp->channel[c].vibdepth);
                    } else {
                        cs.effTyp = 0;
                        cs.eff = 0;
                    }
                }
            }
        }
    }

    // Enrich CmodPlayer channels with native note/inst/fx
    if (g_playerType == PT_CMOD) {
        auto* mp = asModPlayer();
        if (mp && mp->channel) {
            uint32_t nch = mp->getNchans();
            for (uint32_t c = 0; c < nch && c < 18; c++) {
                ChannelState& cs = g_channelState[c];
                if (cs.note > 0 && cs.trigger) {
                    cs.inst = mp->channel[c].inst + 1;
                    cs.effTyp = mp->channel[c].fx;
                    cs.eff = (mp->channel[c].info1 << 4) | mp->channel[c].info2;
                }
            }
        }
    }
}

extern "C" {

// ── Structural Queries ─────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_patterns() {
    // PIS: treat each song position as a virtual pattern
    if (auto* pp = asPisPlayer()) return pp->module.length;
    // LDS: compute from patterns_size and pattlen
    if (auto* lp = asLdsPlayer()) {
        if (!lp->patterns || lp->pattlen == 0) return 0;
        return lp->patterns_size / (lp->pattlen * 9 * sizeof(uint16_t));
    }
    // BMF: count sequential non-empty events as a single virtual pattern per stream position
    if (auto* bp = asBmfPlayer()) {
        // BMF has streams[9][1024] — treat as one big pattern per song
        // Determine length from active_streams and longest event sequence
        uint32_t maxLen = 0;
        for (int ch = 0; ch < bp->bmf.active_streams; ch++) {
            for (uint32_t i = 0; i < 1024; i++) {
                if (bp->bmf.streams[ch][i].note || bp->bmf.streams[ch][i].delay)
                    maxLen = std::max(maxLen, i + 1);
            }
        }
        // Split into 64-row patterns
        return maxLen > 0 ? (maxLen + 63) / 64 : 0;
    }
    // SOP/HERAD/JBM/ROL: OPL capture provides pattern count
    if (g_playerType == PT_OPL_CAPTURE || g_playerType == PT_SOP ||
        g_playerType == PT_HERAD || g_playerType == PT_JBM || g_playerType == PT_ROL) {
        if (g_captureTotalTicks == 0) return 0;
        uint32_t ticksPerRow = g_captureTicksPerRow > 0 ? g_captureTicksPerRow : 6;
        uint32_t totalRows = g_captureTotalTicks / ticksPerRow;
        return totalRows > 0 ? (totalRows + 63) / 64 : 0;
    }
    // D00: use native extraction grid if available, else fall back to OPL capture
    if (g_playerType == PT_D00) {
        if (g_d00NativeExtracted && g_d00GridRows > 0) {
            return (g_d00GridRows + 63) / 64;
        }
        if (g_captureTotalTicks == 0) return 0;
        uint32_t ticksPerRow = g_captureTicksPerRow > 0 ? g_captureTicksPerRow : 6;
        uint32_t totalRows = g_captureTotalTicks / ticksPerRow;
        return totalRows > 0 ? (totalRows + 63) / 64 : 0;
    }
    return g_player ? g_player->getpatterns() : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_orders() {
    // PIS: song positions act as both patterns and orders
    if (auto* pp = asPisPlayer()) {
        uint32_t len = pp->module.length;
        return len > 0 ? len : 0;
    }
    // For OPL capture and BMF, orders = identity (pattern 0, 1, 2, ...)
    if (g_playerType == PT_BMF || g_playerType == PT_OPL_CAPTURE || g_playerType == PT_D00 ||
        g_playerType == PT_SOP || g_playerType == PT_HERAD ||
        g_playerType == PT_JBM || g_playerType == PT_ROL) {
        return adplug_get_patterns();
    }
    return g_player ? g_player->getorders() : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_rows() {
    if (auto* mp = asModPlayer()) return (uint32_t)mp->getNrows();
    // All other formats use 64 rows per pattern
    return 64;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_channels() {
    if (auto* mp = asModPlayer()) return (uint32_t)mp->getNchans();
    if (auto* bp = asBmfPlayer()) return (uint32_t)bp->bmf.active_streams;
    if (auto* hp = asHeradPlayer()) return (uint32_t)hp->nTracks;
    if (auto* sp = asSopPlayer()) return (uint32_t)sp->nTracks;
    if (g_playerType == PT_JBM) return 9;  // JBM uses up to 11 but OPL2 has 9 melody
    // D00 native extraction: always 9 channels
    if (g_playerType == PT_D00 && g_d00NativeExtracted) return 9;
    // OPL capture: count channels that have notes
    if (g_playerType == PT_OPL_CAPTURE || g_playerType == PT_D00 || g_playerType == PT_ROL) {
        uint8_t maxCh = 0;
        for (const auto& n : g_capturedNotes) {
            if (n.isNoteOn && n.channel + 1 > maxCh) maxCh = n.channel + 1;
        }
        return maxCh > 0 ? maxCh : 9;
    }
    return 9;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_speed() {
    return g_player ? g_player->getspeed() : 6;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_is_cmod_player() {
    return g_playerType == PT_CMOD ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_bpm_value() {
    if (auto* mp = asModPlayer()) return mp->bpm;
    if (auto* sp = asS3mPlayer()) return sp->tempo;
    // HSC, D00, LDS etc. don't have a BPM concept — return 0 to signal
    // the TS extractor to derive BPM from the refresh rate instead
    return 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_restart_pos() {
    auto* mp = asModPlayer();
    return mp ? (uint32_t)mp->restartpos : 0;
}

// ── Order List ─────────────────────────────────────────────────────────────

// ── Playback Position (for live position reporting) ───────────────────────

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_position() {
    // For capture-based formats (D00, SOP, HERAD, etc.), the player's getorder()
    // returns 0 because these formats don't track position internally.
    // Use tick-based computation from the render tick counter instead.
    if (g_captureTicksPerRow > 0 && g_renderTickCount > 0) {
        uint32_t globalRow = g_renderTickCount / g_captureTicksPerRow;
        return globalRow / 64; // 64 rows per pattern
    }
    return g_player ? g_player->getorder() : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_row() {
    if (g_captureTicksPerRow > 0 && g_renderTickCount > 0) {
        uint32_t globalRow = g_renderTickCount / g_captureTicksPerRow;
        return globalRow % 64;
    }
    return g_player ? g_player->getrow() : 0;
}

// ── Order List (continued) ────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_order_entry(uint32_t idx) {
    // CmodPlayer
    if (auto* mp = asModPlayer()) {
        if (!mp->order || idx >= mp->length) return 0xFFFF;
        return mp->order[idx];
    }
    // ChscPlayer — song[0..127], 0xFF = end
    if (auto* hp = asHscPlayer()) {
        if (idx >= 0x80) return 0xFFFF;
        uint8_t val = hp->song[idx];
        return (val == 0xFF) ? 0xFFFF : val;
    }
    // Cs3mPlayer
    if (auto* sp = asS3mPlayer()) {
        if (idx >= sp->header.ordnum) return 0xFFFF;
        return sp->orders[idx];
    }
    // LDS
    if (auto* lp = asLdsPlayer()) {
        if (!lp->positions || idx >= lp->numposi) return 0xFFFF;
        return lp->positions[idx].patnum;
    }
    // PIS — identity mapping (position N = pattern N)
    if (auto* pp = asPisPlayer()) {
        if (idx >= (uint32_t)pp->module.length) return 0xFFFF;
        return idx;
    }
    // BMF, SOP, HERAD, JBM, ROL, OPL capture — identity mapping
    if (g_playerType == PT_BMF || g_playerType == PT_OPL_CAPTURE || g_playerType == PT_D00 ||
        g_playerType == PT_SOP || g_playerType == PT_HERAD ||
        g_playerType == PT_JBM || g_playerType == PT_ROL) {
        uint32_t numPats = adplug_get_patterns();
        return (idx < numPats) ? idx : 0xFFFF;
    }
    return 0xFFFF;
}

// ── Pattern Data ───────────────────────────────────────────────────────────

/**
 * Get a single note from a pattern.
 * Returns packed: note(8) | inst(8) | command(8) | param(8) (32 bits)
 * Works for all supported player types.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_note(uint32_t pattern, uint32_t row, uint32_t channel) {
    // ── CmodPlayer ──
    if (auto* mp = asModPlayer()) {
        if (!mp->tracks || !mp->trackord) return 0;
        if (pattern >= mp->nop) return 0;
        if (channel >= mp->getNchans()) return 0;
        if (row >= mp->getNrows()) return 0;

        unsigned short trackIdx = mp->trackord[pattern][channel];
        unsigned long maxTracks = mp->getNpats() * mp->getNchans() + 1;
        if (trackIdx >= maxTracks) return 0;
        if (!mp->tracks[trackIdx]) return 0;

        auto& t = mp->tracks[trackIdx][row];
        return ((uint32_t)t.note) |
               ((uint32_t)t.inst << 8) |
               ((uint32_t)t.command << 16) |
               ((uint32_t)((t.param1 << 4) | t.param2) << 24);
    }

    // ── ChscPlayer ── patterns[pat][row*9+ch] has {note, effect}
    // HSC format (from hsc.cpp):
    //   note byte: bit 7 = "set instrument" flag, bits 0-6 = note (0=empty, 127=off)
    //   If bit 7 set: effect byte = instrument number (0-127)
    //   If bit 7 clear: effect byte high nibble = effect type, low nibble = param
    //     Effects: 0x00=set panning, 0x10=global volume?, 0x50=set perc inst,
    //              0x60=set volume, 0xA0=porta up, 0xB0=porta down, 0xC0=set inst vol
    // At init, each channel i starts with instrument i.
    if (auto* hp = asHscPlayer()) {
        if (pattern >= 50 || row >= 64 || channel >= 9) return 0;
        auto& n = hp->patterns[pattern][row * 9 + channel];
        if (n.note == 0 && n.effect == 0) return 0;

        uint8_t rawNote = n.note;
        uint8_t effect = n.effect;
        uint8_t cmd = 0, param = 0;
        uint8_t instNum = 0;

        // Bit 7 of note = "set instrument" flag (hsc.cpp line 117)
        // When set, the effect byte is the instrument number and no note is played.
        bool setInst = (rawNote & 0x80) != 0;
        uint8_t noteVal = rawNote & 0x7F; // 0=empty, 1-96=note, 127=off/pause

        if (setInst) {
            // Instrument change command: effect byte = instrument index (0-127)
            // In HSC the player does `setinstr(chan, effect); continue;` — no note.
            // We emit instrument number only (note stays 0).
            instNum = effect + 1; // 1-based for XM
            noteVal = 0; // no note plays on instrument-change rows
        } else {
            // HSC effects (hsc.cpp lines 126-168):
            //   0x10/0x20=manual slide up/down, 0x50=perc inst,
            //   0x60=set feedback, 0xA0=carrier vol, 0xB0=mod vol,
            //   0xC0=inst vol, 0xD0=position jump, 0xF0=set speed
            //
            // OPL-specific effects use range 0x30-0x3F so the TS replayer
            // can forward them to the OPL3 synth (same pattern as Furnace chip effects).
            //   0x30 = OPL set feedback       (param = feedback 0-7)
            //   0x31 = OPL carrier volume     (param = volume 0-15, <<2 to get 0-63)
            //   0x32 = OPL modulator volume   (param = volume 0-15, <<2 to get 0-63)
            //   0x33 = OPL instrument volume  (param = volume 0-15, sets both ops)
            if (effect != 0) {
                uint8_t effType = (effect >> 4) & 0x0F;
                uint8_t effParam = effect & 0x0F;
                switch (effType) {
                    case 0x1: // slide up (manual) → XM porta up
                        cmd = 1; param = effParam; break;
                    case 0x2: // slide down (manual) → XM porta down
                        cmd = 2; param = effParam; break;
                    case 0x6: // set feedback → OPL effect 0x30
                        cmd = 0x30; param = effParam; break;
                    case 0xA: // carrier volume → OPL effect 0x31
                        cmd = 0x31; param = effParam; break;
                    case 0xB: // modulator volume → OPL effect 0x32
                        cmd = 0x32; param = effParam; break;
                    case 0xC: // instrument volume (both ops) → OPL effect 0x33
                        cmd = 0x33; param = effParam; break;
                    case 0xD: // position jump → XM Bxx
                        cmd = 0x0B; param = effParam; break;
                    case 0xF: // set speed → XM Fxx
                        cmd = 0x0F; param = effParam; break;
                    default:
                        cmd = 0; param = 0; break;
                }
            }
        }

        return ((uint32_t)noteVal) |
               ((uint32_t)instNum << 8) |
               ((uint32_t)cmd << 16) |
               ((uint32_t)param << 24);
    }

    // ── Cs3mPlayer ── pattern[pat][row][ch] has {note, oct, instrument, volume, command, info}
    if (auto* sp = asS3mPlayer()) {
        if (pattern >= sp->header.patnum || row >= 64 || channel >= 9) return 0;
        auto& e = sp->pattern[pattern][row][channel];

        // S3M note: note + oct*12 gives semitone
        uint8_t note = 0;
        if (e.note < 14 && e.oct < 8) {
            note = e.oct * 12 + e.note + 1;
        } else if (e.note == 14) {
            note = 127; // note off/cut
        }

        return ((uint32_t)note) |
               ((uint32_t)e.instrument << 8) |
               ((uint32_t)e.command << 16) |
               ((uint32_t)e.info << 24);
    }

    // ── CldsPlayer ── patterns is a flat uint16_t array, 9 channels per row
    if (auto* lp = asLdsPlayer()) {
        if (!lp->patterns || channel >= 9) return 0;
        // Pattern data offset: pattern * pattlen * 9 + row * 9 + channel
        // Each entry is a uint16_t encoding note + instrument/effect
        uint32_t pattlen = lp->pattlen ? lp->pattlen : 64;
        if (row >= pattlen) return 0;
        uint32_t maxPats = lp->patterns_size / (pattlen * 9 * sizeof(uint16_t));
        if (pattern >= maxPats) return 0;

        uint32_t idx = pattern * pattlen * 9 + row * 9 + channel;
        if (idx * 2 >= lp->patterns_size) return 0;
        uint16_t val = lp->patterns[idx];

        // LDS pattern format: HHLL where HH=high byte, LL=low byte
        // High byte: command/instrument, Low byte: note
        uint8_t note = val & 0xFF;
        uint8_t hi = (val >> 8) & 0xFF;
        uint8_t inst = (hi >> 4) & 0x0F;
        uint8_t cmd = hi & 0x0F;

        return ((uint32_t)note) |
               ((uint32_t)inst << 8) |
               ((uint32_t)cmd << 16) |
               ((uint32_t)0 << 24);
    }

    // ── CpisPlayer ── pattern[128][64] packed uint32_t, order[256][9] per-channel
    // For PIS, 'pattern' parameter = song position (since order is per-channel)
    if (auto* pp = asPisPlayer()) {
        if (row >= 64 || channel >= 9) return 0;
        if (pattern >= (uint32_t)pp->module.length) return 0;

        uint8_t patIdx = pp->module.order[pattern][channel];
        if (patIdx >= pp->module.number_of_patterns) return 0;

        uint32_t packed = pp->module.pattern[patIdx][row];
        uint8_t el = packed & 0xFF;
        uint8_t b2 = (packed >> 8) & 0xFF;
        uint8_t b1 = (packed >> 16) & 0xFF;

        uint8_t noteVal = b1 >> 4;       // 0-11 = note, 12+ = no note
        uint8_t octave = (b1 >> 1) & 7;
        uint8_t instNum = ((b1 & 1) << 4) | (b2 >> 4);
        uint16_t effect = ((b2 & 0x0F) << 8) | el;

        uint8_t note = 0;
        if (noteVal < 12) {
            note = octave * 12 + noteVal + 1;
        }

        uint8_t cmd = (effect >> 8) & 0x0F;
        uint8_t param = effect & 0xFF;

        return ((uint32_t)note) |
               ((uint32_t)instNum << 8) |
               ((uint32_t)cmd << 16) |
               ((uint32_t)param << 24);
    }

    // ── BMF ── streams[9][1024] with {note, delay, volume, instrument, cmd, cmd_data}
    if (auto* bp = asBmfPlayer()) {
        if (channel >= (uint32_t)bp->bmf.active_streams) return 0;
        // Linear event index = pattern * 64 + row
        uint32_t eventIdx = pattern * 64 + row;
        if (eventIdx >= 1024) return 0;
        auto& ev = bp->bmf.streams[channel][eventIdx];
        if (!ev.note && !ev.instrument && !ev.cmd) return 0;

        uint8_t note = ev.note;
        uint8_t inst = ev.instrument + 1; // 1-based
        uint8_t cmd = ev.cmd;
        uint8_t param = ev.cmd_data;

        return ((uint32_t)note) |
               ((uint32_t)inst << 8) |
               ((uint32_t)cmd << 16) |
               ((uint32_t)param << 24);
    }

    // ── D00 Native Extraction (preserves all effects) ──
    if (g_playerType == PT_D00 && g_d00NativeExtracted) {
        uint32_t absRow = pattern * 64 + row;
        if (absRow >= g_d00GridRows || channel >= D00_MAX_CHANNELS) return 0;
        const D00Cell& cell = g_d00Grid[absRow * D00_MAX_CHANNELS + channel];
        if (cell.note == 0 && cell.inst == 0 && cell.effTyp == 0 && cell.eff == 0) return 0;
        return ((uint32_t)cell.note) |
               ((uint32_t)cell.inst << 8) |
               ((uint32_t)cell.effTyp << 16) |
               ((uint32_t)cell.eff << 24);
    }

    // ── OPL Capture (SOP, HERAD, JBM, ROL, D00, and all stream formats) ──
    if (g_playerType == PT_OPL_CAPTURE || g_playerType == PT_D00 || g_playerType == PT_SOP ||
        g_playerType == PT_HERAD || g_playerType == PT_JBM || g_playerType == PT_ROL) {
        if (g_capturedNotes.empty() || g_captureTotalTicks == 0) return 0;

        uint32_t ticksPerRow = g_captureTicksPerRow > 0 ? g_captureTicksPerRow : 6;
        uint32_t targetRow = pattern * 64 + row;
        uint32_t tickStart = targetRow * ticksPerRow;
        uint32_t tickEnd = tickStart + ticksPerRow;

        // Binary search for approximate start position
        size_t lo = 0, hi = g_capturedNotes.size();
        while (lo < hi) {
            size_t mid = (lo + hi) / 2;
            if (g_capturedNotes[mid].tick < tickStart) lo = mid + 1;
            else hi = mid;
        }

        // First pass: look for note-on events
        for (size_t i = lo; i < g_capturedNotes.size(); i++) {
            auto& cn = g_capturedNotes[i];
            if (cn.tick >= tickEnd) break;
            if (cn.channel == channel && cn.isNoteOn) {
                // Pack: note | instrument | Cxx volume command
                // XM effect 0x0C (12) = Set Volume (Cxx)
                uint8_t volCmd = 12; // XM Cxx = set volume (NOT 15 which is Fxx=speed!)
                uint8_t volParam = (uint8_t)std::min(63u, (uint32_t)cn.volume);

                // For D00: remap captured instrument index to native instrument index
                uint8_t instIdx = cn.instrument;
                if (g_playerType == PT_D00 && instIdx > 0 &&
                    (instIdx - 1) < g_d00InstMap.size() && g_d00InstMap[instIdx - 1] > 0) {
                    instIdx = g_d00InstMap[instIdx - 1];
                }

                return ((uint32_t)cn.note) |
                       ((uint32_t)instIdx << 8) |
                       ((uint32_t)volCmd << 16) |
                       ((uint32_t)volParam << 24);
            }
        }

        // Second pass: look for note-off events (no note-on found in this row)
        for (size_t i = lo; i < g_capturedNotes.size(); i++) {
            auto& cn = g_capturedNotes[i];
            if (cn.tick >= tickEnd) break;
            if (cn.channel == channel && !cn.isNoteOn) {
                // Note off: note=127 in CmodPlayer convention (maps to XM 97)
                return ((uint32_t)127) |
                       ((uint32_t)0 << 8) |
                       ((uint32_t)0 << 16) |
                       ((uint32_t)0 << 24);
            }
        }
        return 0;
    }

    return 0;
}

// ── Instrument Data ────────────────────────────────────────────────────────

/**
 * Get instrument OPL register data (11 bytes).
 * Writes into caller-provided buffer. Returns 1 on success, 0 on failure.
 * Works for all supported player types.
 */
EMSCRIPTEN_KEEPALIVE
int adplug_get_instrument_regs(uint32_t index, uint8_t* outRegs) {
    // ── CmodPlayer ──
    if (auto* mp = asModPlayer()) {
        if (!mp->inst) return 0;
        if (index >= (uint32_t)g_player->getinstruments()) return 0;
        memcpy(outRegs, mp->inst[index].data, 11);
        return 1;
    }

    // ── ChscPlayer ── instr[128][12]: 12 bytes per instrument
    // Bytes 0-10 = standard OPL registers, byte 11 = param
    if (auto* hp = asHscPlayer()) {
        if (index >= 128) return 0;
        memcpy(outRegs, hp->instr[index], 11);
        return 1;
    }

    // ── Cs3mPlayer ── inst[99] has d00-d0b = 12 OPL register bytes
    if (auto* sp = asS3mPlayer()) {
        if (index >= sp->header.insnum || index >= 99) return 0;
        // S3M OPL instrument types: 2=OPL2 melody, 3=OPL2 drum, 0=unused
        // DMO (packed S3M) may also store as type 2 or 3
        if (sp->inst[index].type != 2 && sp->inst[index].type != 3) {
            // Still try reading if type=0 — some formats don't set type correctly
            bool anyData = sp->inst[index].d00 || sp->inst[index].d01 ||
                           sp->inst[index].d02 || sp->inst[index].d03 ||
                           sp->inst[index].d04 || sp->inst[index].d05;
            if (!anyData) return 0;
        }
        // d00-d0a map to standard OPL register layout
        outRegs[0] = sp->inst[index].d00;  // mod char
        outRegs[1] = sp->inst[index].d01;  // car char
        outRegs[2] = sp->inst[index].d02;  // mod KSL/TL
        outRegs[3] = sp->inst[index].d03;  // car KSL/TL
        outRegs[4] = sp->inst[index].d04;  // mod AR/DR
        outRegs[5] = sp->inst[index].d05;  // car AR/DR
        outRegs[6] = sp->inst[index].d06;  // mod SL/RR
        outRegs[7] = sp->inst[index].d07;  // car SL/RR
        outRegs[8] = sp->inst[index].d08;  // mod wave
        outRegs[9] = sp->inst[index].d09;  // car wave
        outRegs[10] = sp->inst[index].d0a; // feedback/connection
        return 1;
    }

    // ── CldsPlayer ── soundbank has OPL register fields
    if (auto* lp = asLdsPlayer()) {
        if (!lp->soundbank || index >= lp->numpatch) return 0;
        auto& sb = lp->soundbank[index];
        outRegs[0] = sb.mod_misc;   // mod AM/VIB/EGT/KSR/MULT
        outRegs[1] = sb.car_misc;   // car AM/VIB/EGT/KSR/MULT
        outRegs[2] = sb.mod_vol;    // mod KSL/TL
        outRegs[3] = sb.car_vol;    // car KSL/TL
        outRegs[4] = sb.mod_ad;     // mod AR/DR
        outRegs[5] = sb.car_ad;     // car AR/DR
        outRegs[6] = sb.mod_sr;     // mod SL/RR
        outRegs[7] = sb.car_sr;     // car SL/RR
        outRegs[8] = sb.mod_wave;   // mod waveform
        outRegs[9] = sb.car_wave;   // car waveform
        outRegs[10] = sb.feedback;  // feedback/connection
        return 1;
    }

    // ── CpisPlayer ── PisInstrument has 11 OPL register bytes
    if (auto* pp = asPisPlayer()) {
        if (index >= (uint32_t)pp->module.number_of_instruments) return 0;
        uint8_t realIdx = pp->module.instrument_map[index];
        if (realIdx >= 64) return 0;
        auto& pi = pp->module.instrument[realIdx];
        outRegs[0] = pi.mul1;   // mod MULT
        outRegs[1] = pi.mul2;   // car MULT
        outRegs[2] = pi.lev1;   // mod KSL/TL
        outRegs[3] = pi.lev2;   // car KSL/TL
        outRegs[4] = pi.atd1;   // mod AR/DR
        outRegs[5] = pi.atd2;   // car AR/DR
        outRegs[6] = pi.sur1;   // mod SL/RR
        outRegs[7] = pi.sur2;   // car SL/RR
        outRegs[8] = pi.wav1;   // mod wave
        outRegs[9] = pi.wav2;   // car wave
        outRegs[10] = pi.fbcon; // feedback/connection
        return 1;
    }

    // ── Cd00Player ── D00/EdLib instruments: data[11] in D00-specific byte order
    // D00 data[] layout differs from standard OPL register order — remap here.
    // Mapping derived from Cd00Player::setinst() in d00.cpp:
    //   data[0]  → reg 0x60+carOff  (car AR/DR)
    //   data[1]  → reg 0x80+carOff  (car SL/RR)
    //   data[2]  → reg 0x40+carOff  (car KSL/TL, used in setvolume)
    //   data[3]  → reg 0x20+carOff  (car AM/VIB/EG/KSR/MULT)
    //   data[4]  → reg 0xE0+carOff  (car waveform)
    //   data[5]  → reg 0x60+modOff  (mod AR/DR)
    //   data[6]  → reg 0x80+modOff  (mod SL/RR)
    //   data[7]  → reg 0x40+modOff  (mod KSL/TL, used in setvolume)
    //   data[8]  → reg 0x20+modOff  (mod AM/VIB/EG/KSR/MULT)
    //   data[9]  → reg 0xE0+modOff  (mod waveform)
    //   data[10] → reg 0xC0+ch      (feedback/connection)
    if (auto* dp = asD00Player()) {
        uint32_t numInst = d00InstrumentCount();
        if (!dp->inst || index >= numInst) return 0;
        auto& d = dp->inst[index].data;
        outRegs[0]  = d[8];   // mod AM/VIB/EG/KSR/MULT
        outRegs[1]  = d[3];   // car AM/VIB/EG/KSR/MULT
        outRegs[2]  = d[7];   // mod KSL/TL
        outRegs[3]  = d[2];   // car KSL/TL
        outRegs[4]  = d[5];   // mod AR/DR
        outRegs[5]  = d[0];   // car AR/DR
        outRegs[6]  = d[6];   // mod SL/RR
        outRegs[7]  = d[1];   // car SL/RR
        outRegs[8]  = d[9];   // mod waveform
        outRegs[9]  = d[4];   // car waveform
        outRegs[10] = d[10];  // feedback/connection
        return 1;
    }

    // ── BMF ── instruments[32] with 13 bytes of OPL data
    if (auto* bp = asBmfPlayer()) {
        if (index >= 32) return 0;
        // BMF instrument data[13]: OPL register layout
        memcpy(outRegs, bp->bmf.instruments[index].data, 11);
        return 1;
    }

    // ── HERAD ── herad_inst with detailed OPL params
    if (auto* hp = asHeradPlayer()) {
        if (index >= hp->nInsts) return 0;
        auto& p = hp->inst[index].param;
        if (p.mode < 0) return 0; // keymap, not a normal instrument
        // Build standard 11-byte OPL register layout
        outRegs[0] = (p.mod_am << 7) | (p.mod_vib << 6) | (p.mod_eg << 5) |
                     (p.mod_ksr << 4) | (p.mod_mul & 0x0F);
        outRegs[1] = (p.car_am << 7) | (p.car_vib << 6) | (p.car_eg << 5) |
                     (p.car_ksr << 4) | (p.car_mul & 0x0F);
        outRegs[2] = (p.mod_ksl << 6) | (p.mod_out & 0x3F);
        outRegs[3] = (p.car_ksl << 6) | (p.car_out & 0x3F);
        outRegs[4] = (p.mod_A << 4) | (p.mod_D & 0x0F);
        outRegs[5] = (p.car_A << 4) | (p.car_D & 0x0F);
        outRegs[6] = (p.mod_S << 4) | (p.mod_R & 0x0F);
        outRegs[7] = (p.car_S << 4) | (p.car_R & 0x0F);
        outRegs[8] = p.mod_wave;
        outRegs[9] = p.car_wave;
        outRegs[10] = (p.feedback << 1) | (p.con & 0x01);
        return 1;
    }

    // ── SOP ── sop_inst with 11 or 22 bytes of OPL data
    if (auto* sp = asSopPlayer()) {
        if (index >= sp->nInsts) return 0;
        // SOP instrument data is stored in inst[n].data (11 bytes for 2OP)
        memcpy(outRegs, sp->inst[index].data, 11);
        return 1;
    }

    // ── OPL Capture ── instruments from captured fingerprints
    if (g_playerType == PT_OPL_CAPTURE || g_playerType == PT_SOP ||
        g_playerType == PT_HERAD || g_playerType == PT_JBM || g_playerType == PT_ROL) {
        // index is 0-based, but captured instruments use 1-based indexing
        if (index >= g_capturedInstruments.size()) return 0;
        memcpy(outRegs, g_capturedInstruments[index].regs, 11);
        return 1;
    }

    return 0;
}

// ── Number of instruments ──────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_num_instruments() {
    // PIS has instruments in its module struct
    if (g_playerType == PT_PIS) {
        auto* pp = asPisPlayer();
        return pp ? (uint32_t)pp->module.number_of_instruments : 0;
    }
    if (g_playerType == PT_BMF) return 32;
    if (g_playerType == PT_D00) return d00InstrumentCount();
    if (auto* hp = asHeradPlayer()) return hp->nInsts;
    if (auto* sp = asSopPlayer()) return sp->nInsts;
    if (g_playerType == PT_OPL_CAPTURE || g_playerType == PT_JBM || g_playerType == PT_ROL)
        return (uint32_t)g_capturedInstruments.size();
    return g_player ? (uint32_t)g_player->getinstruments() : 0;
}

// ── OPL Capture API ────────────────────────────────────────────────────────

/**
 * Run OPL capture: plays through the entire song tick-by-tick,
 * intercepting OPL register writes to detect note-on/note-off events.
 * Call after adplug_load(). Returns number of note events captured.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_capture_song() {
    if (!g_player || !g_opl) return 0;

    // Clear previous capture
    g_capturedNotes.clear();
    g_capturedInstruments.clear();
    g_d00InstMap.clear();
    g_captureTotalTicks = 0;
    g_captureTicksPerRow = 0;
    memset(g_oplRegs, 0, sizeof(g_oplRegs));
    memset(g_oplKeyOn, 0, sizeof(g_oplKeyOn));

    // Create a SEPARATE OPL emulator for capture — don't touch g_opl
    CEmuopl* captureRealOpl = new CEmuopl(static_cast<int>(g_sampleRate), true, true);
    CCapturingOpl captureOpl(captureRealOpl);

    // Re-create player with the capturing OPL using the stored filename
    CProvider_Memory provider(g_fileData, g_fileSize, std::string(g_filename));
    CPlayer* capturePlayer = CAdPlug::factory(
        std::string(g_filename),
        &captureOpl,
        CAdPlug::players,
        provider
    );

    if (!capturePlayer) { delete captureRealOpl; return 0; }

    g_captureRefreshRate = capturePlayer->getrefresh();

    // Try all subsongs — some formats (ADL/Sierra) default to an empty subsong
    int numSubsongs = capturePlayer->getsubsongs();
    const uint32_t MAX_TICKS = 50000;

    for (int sub = 0; sub < std::max(1, numSubsongs); sub++) {
        captureOpl.init();
        capturePlayer->rewind(sub);

        uint32_t tick = 0;
        bool playing = true;
        while (playing && tick < MAX_TICKS) {
            captureOpl.currentTick = g_captureTotalTicks + tick;
            playing = capturePlayer->update();
            tick++;
        }
        g_captureTotalTicks += tick;

        // If we got events from this subsong, stop (use the first productive one)
        if (!g_capturedNotes.empty()) break;
    }

    delete capturePlayer;
    delete captureRealOpl;

    // Sort captured notes by tick for correct binary search in adplug_get_note()
    std::sort(g_capturedNotes.begin(), g_capturedNotes.end(),
        [](const CapturedNote& a, const CapturedNote& b) {
            return a.tick < b.tick;
        });

    // Compute actual ticks-per-row from note spacing
    g_captureTicksPerRow = computeCaptureTicksPerRow();

    // ── Build D00 captured→native instrument mapping ──
    // For D00, map each captured instrument fingerprint to the closest
    // native D00 instrument by comparing registers (ignoring TL volume bits).
    g_d00InstMap.clear();
    if (g_playerType == PT_D00) {
        auto* dp = asD00Player();
        uint32_t numNative = d00InstrumentCount();
        if (dp && dp->inst && numNative > 0) {
            for (size_t ci = 0; ci < g_capturedInstruments.size(); ci++) {
                // Convert each native D00 instrument to standard format and compare
                uint8_t bestMatch = 0; // 0 = no match
                for (uint32_t ni = 0; ni < numNative; ni++) {
                    auto& d = dp->inst[ni].data;
                    InstrumentFingerprint nativeFp = {};
                    nativeFp.regs[0]  = d[8];   // mod AM/VIB/EG/KSR/MULT
                    nativeFp.regs[1]  = d[3];   // car AM/VIB/EG/KSR/MULT
                    nativeFp.regs[2]  = d[7];   // mod KSL/TL
                    nativeFp.regs[3]  = d[2];   // car KSL/TL
                    nativeFp.regs[4]  = d[5];   // mod AR/DR
                    nativeFp.regs[5]  = d[0];   // car AR/DR
                    nativeFp.regs[6]  = d[6];   // mod SL/RR
                    nativeFp.regs[7]  = d[1];   // car SL/RR
                    nativeFp.regs[8]  = d[9];   // mod waveform
                    nativeFp.regs[9]  = d[4];   // car waveform
                    nativeFp.regs[10] = d[10];  // feedback/connection
                    if (instrumentsMatch(g_capturedInstruments[ci], nativeFp)) {
                        bestMatch = (uint8_t)(ni + 1); // 1-based
                        break;
                    }
                }
                g_d00InstMap.push_back(bestMatch);
            }
        }
    }

    return (uint32_t)g_capturedNotes.size();
}

/** Get number of captured note events */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_capture_get_num_events() {
    return (uint32_t)g_capturedNotes.size();
}

/** Get number of unique captured instruments */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_capture_get_num_instruments() {
    return (uint32_t)g_capturedInstruments.size();
}

/** Get total ticks captured */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_capture_get_total_ticks() {
    return g_captureTotalTicks;
}

/** Get capture refresh rate (ticks per second) */
EMSCRIPTEN_KEEPALIVE
float adplug_capture_get_refresh_rate() {
    return g_captureRefreshRate;
}

/** Get computed ticks-per-row from captured note spacing */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_capture_get_ticks_per_row() {
    return g_captureTicksPerRow;
}

/** Get player refresh rate (ticks per second) for any loaded format */
EMSCRIPTEN_KEEPALIVE
float adplug_get_refresh_rate() {
    if (!g_player) return 0.0f;
    float r = g_player->getrefresh();
    return r > 0.0f ? r : 70.0f;
}

// ── Player Type Query ──────────────────────────────────────────────────────

/** Returns the detected player type enum value. 0=unknown. */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_player_type() {
    return (uint32_t)g_playerType;
}

// ── Per-Channel Scope Capture ─────────────────────────────────────────────

/**
 * Enable or disable per-channel oscilloscope capture for both OPL backends.
 * Call with enable=1 before playback to start capturing.
 */
EMSCRIPTEN_KEEPALIVE
void adplug_enable_scope(int enable) {
    FMOPL_EnableScopeCapture(enable);
    // Note: Nuked OPL3 scope would need the opl3_chip* pointer.
    // FMOPL is the primary backend used by CEmuopl/AdPlug.
}

/**
 * Retrieve per-channel scope data (float samples from ring buffer).
 *
 * @param chip_index  OPL chip index (0 or 1 for dual OPL2)
 * @param channel     Channel index (0-8 for OPL2, 0-17 for OPL3)
 * @param buffer      WASM heap pointer for output float samples
 * @param num_samples Maximum number of samples to retrieve
 * @return Number of samples written to buffer
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_scope_data(int chip_index, int channel,
                                float* buffer, uint32_t num_samples) {
    return FMOPL_GetScopeData(chip_index, channel, buffer, num_samples);
}

/**
 * Get the scope buffer size (number of samples in ring buffer).
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_scope_buffer_size() {
    return FMOPL_SCOPE_BUFFER_SIZE;
}

/**
 * Get the number of scope channels per chip.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_scope_num_channels() {
    return FMOPL_SCOPE_NUM_CHANNELS;
}

} // extern "C"
