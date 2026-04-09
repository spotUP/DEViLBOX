/**
 * AdPlug WASM Bridge
 *
 * Emscripten wrapper for the AdPlug C++ library.
 * Provides a C API for loading and rendering 50+ OPL/AdLib music formats.
 * Embeds standard.bnk for ROL/SCI instrument bank support.
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

extern "C" {

EMSCRIPTEN_KEEPALIVE
int adplug_init(uint32_t sampleRate) {
    if (g_initialized) return 1;

    g_sampleRate = sampleRate;
    // 16-bit stereo OPL emulator
    g_opl = new CEmuopl(static_cast<int>(sampleRate), true, true);
    g_initialized = true;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void adplug_shutdown() {
    if (g_player) { delete g_player; g_player = nullptr; }
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
    if (!g_initialized || !g_opl) return -1;

    // Clean up previous
    if (g_player) { delete g_player; g_player = nullptr; }
    if (g_fileData) { free(g_fileData); g_fileData = nullptr; }

    // Copy file data (AdPlug may re-read during playback)
    g_fileData = (uint8_t*)malloc(length);
    if (!g_fileData) return -1;
    memcpy(g_fileData, data, length);
    g_fileSize = length;

    // Reset OPL emulator
    g_opl->init();

    // Use AdPlug factory to auto-detect format and create player
    CProvider_Memory provider(g_fileData, g_fileSize, std::string(filename));
    g_player = CAdPlug::factory(std::string(filename), g_opl, CAdPlug::players, provider);

    // Clear companions after load attempt
    for (auto& c : g_companions) { free(c.data); }
    g_companions.clear();

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

    // Calculate samples per tick
    float refresh = g_player->getrefresh();
    if (refresh <= 0.0f) refresh = 70.0f;
    g_samplesPerTick = (double)g_sampleRate / (double)refresh;
    g_sampleAccum = 0.0;

    return 0;
}

EMSCRIPTEN_KEEPALIVE
void adplug_rewind(uint32_t subsong) {
    if (g_player) {
        g_player->rewind(static_cast<int>(subsong));
        g_opl->init();
        g_sampleAccum = 0.0;
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
            g_sampleAccum -= g_samplesPerTick;

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
uint32_t adplug_get_num_instruments() {
    return g_player ? (uint32_t)g_player->getinstruments() : 0;
}

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

} // extern "C"

// ── Pattern/Instrument Extraction ──────────────────────────────────────────
// CmodPlayer-based formats (A2M, CFF, D00, DTM, etc.) all inherit from
// CmodPlayer which has uniform `tracks[][]` and `inst[]` arrays.
// We expose these via a struct-offset hack since they're protected.

#include "protrack.h"

// Expose CmodPlayer's protected members for extraction.
// This works because CmodPlayer's layout is known at compile time.
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
};

static CmodPlayerAccessor* asModPlayer() {
    if (!g_player) return nullptr;
    // Dynamic cast is not available (no RTTI in WASM build).
    // Check if the player type string matches known CmodPlayer subclasses.
    std::string type = g_player->gettype();
    // All protrack-based formats identify with specific type strings.
    // We check if getpatterns() returns >0 as a heuristic — CPlayer base returns 0,
    // CmodPlayer overrides it to return nop.
    if (g_player->getpatterns() > 0 && g_player->getorders() > 0) {
        return reinterpret_cast<CmodPlayerAccessor*>(g_player);
    }
    return nullptr;
}

extern "C" {

// ── Structural Queries ─────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_patterns() {
    return g_player ? g_player->getpatterns() : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_orders() {
    return g_player ? g_player->getorders() : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_rows() {
    auto* mp = asModPlayer();
    if (!mp) return 64;
    return (uint32_t)mp->getNrows();
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_channels() {
    auto* mp = asModPlayer();
    if (!mp) return 9;
    return (uint32_t)mp->getNchans();
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_speed() {
    return g_player ? g_player->getspeed() : 6;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_bpm_value() {
    auto* mp = asModPlayer();
    return mp ? mp->bpm : 125;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_restart_pos() {
    auto* mp = asModPlayer();
    return mp ? (uint32_t)mp->restartpos : 0;
}

// ── Order List ─────────────────────────────────────────────────────────────

/** Get order at position idx. Returns pattern index. */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_order_entry(uint32_t idx) {
    auto* mp = asModPlayer();
    if (!mp || !mp->order || idx >= mp->length) return 0;
    return mp->order[idx];
}

// ── Pattern Data ───────────────────────────────────────────────────────────

/**
 * Get a single note from a pattern.
 * Returns packed: note(8) | inst(8) | command(8) | param1(4)<<4|param2(4) (32 bits)
 */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_note(uint32_t pattern, uint32_t row, uint32_t channel) {
    auto* mp = asModPlayer();
    if (!mp || !mp->tracks || !mp->trackord) return 0;
    if (pattern >= mp->nop) return 0;
    if (channel >= mp->getNchans()) return 0;
    if (row >= mp->getNrows()) return 0;

    unsigned short trackIdx = mp->trackord[pattern][channel];
    if (!mp->tracks[trackIdx]) return 0;

    auto& t = mp->tracks[trackIdx][row];
    return ((uint32_t)t.note) |
           ((uint32_t)t.inst << 8) |
           ((uint32_t)t.command << 16) |
           ((uint32_t)((t.param1 << 4) | t.param2) << 24);
}

// ── Instrument Data ────────────────────────────────────────────────────────

/**
 * Get instrument OPL register data (11 bytes).
 * Writes into caller-provided buffer. Returns 1 on success, 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int adplug_get_instrument_regs(uint32_t index, uint8_t* outRegs) {
    auto* mp = asModPlayer();
    if (!mp || !mp->inst) return 0;
    if (index >= (uint32_t)g_player->getinstruments()) return 0;

    memcpy(outRegs, mp->inst[index].data, 11);
    return 1;
}

} // extern "C"
