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

// Forward declarations for extraction support
enum PlayerType { PT_UNKNOWN = 0, PT_CMOD, PT_HSC, PT_S3M, PT_PIS, PT_D00, PT_LDS };
static PlayerType g_playerType = PT_UNKNOWN;
static void detectPlayerType();

// Include player headers early for use in both extern "C" blocks
#include "protrack.h"
#include "hsc.h"
#include "s3m.h"
#include "pis.h"
#include "d00.h"
#include "lds.h"

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

    // Detect player type for pattern extraction
    detectPlayerType();

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
    // PIS has instruments in its module struct
    if (g_playerType == PT_PIS) {
        auto* pp = asPisPlayer();
        return pp ? (uint32_t)pp->module.number_of_instruments : 0;
    }
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
// Multiple player backends supported:
//   CmodPlayer — A2M, AMD, CFF, DFM, DTM, MAD, MTR, SA2, SAT, XMS
//   ChscPlayer — HSC, HSP, MTK
//   Cs3mPlayer — DMO (TwinTeam packed S3M)
//   CpisPlayer — PIS (Beni Tracker)
//   Cd00Player — D00 (EdLib)
//   CldsPlayer — LDS (Loudness Sound System)

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

// ── Player type detection ──────────────────────────────────────────────────
// We identify the player type by checking virtual method overrides and
// returned type strings, since RTTI is not available in Emscripten builds.

static CmodPlayerAccessor* asModPlayer() {
    if (!g_player) return nullptr;
    if (g_playerType != PT_CMOD) return nullptr;
    auto* mp = reinterpret_cast<CmodPlayerAccessor*>(g_player);
    auto ch = mp->getNchans();
    auto rows = mp->getNrows();
    if (ch == 0 || ch > 18 || rows == 0 || rows > 256) return nullptr;
    return mp;
}

static ChscPlayerAccessor* asHscPlayer() {
    if (!g_player) return nullptr;
    if (g_playerType != PT_HSC) return nullptr;
    return reinterpret_cast<ChscPlayerAccessor*>(g_player);
}

static Cs3mPlayerAccessor* asS3mPlayer() {
    if (!g_player) return nullptr;
    if (g_playerType != PT_S3M) return nullptr;
    return reinterpret_cast<Cs3mPlayerAccessor*>(g_player);
}

static CldsPlayerAccessor* asLdsPlayer() {
    if (!g_player) return nullptr;
    if (g_playerType != PT_LDS) return nullptr;
    return reinterpret_cast<CldsPlayerAccessor*>(g_player);
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
        // Validate it's actually CmodPlayer by checking patterns > 0
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

    // Cs3mPlayer (DMO = packed S3M, also native S3M)
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
    return g_player ? g_player->getpatterns() : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_orders() {
    // PIS: song positions act as both patterns and orders
    if (auto* pp = asPisPlayer()) {
        uint32_t len = pp->module.length;
        return len > 0 ? len : 0;
    }
    return g_player ? g_player->getorders() : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_rows() {
    if (auto* mp = asModPlayer()) return (uint32_t)mp->getNrows();
    // HSC/S3M/PIS/LDS all use 64 rows per pattern
    return 64;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_channels() {
    if (auto* mp = asModPlayer()) return (uint32_t)mp->getNchans();
    if (g_playerType == PT_HSC) return 9;
    if (auto* sp = asS3mPlayer()) return 9;  // S3M OPL uses 9 channels
    if (g_playerType == PT_PIS) return 9;
    if (g_playerType == PT_D00) return 9;
    if (g_playerType == PT_LDS) return 9;
    return 9;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_speed() {
    return g_player ? g_player->getspeed() : 6;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_bpm_value() {
    if (auto* mp = asModPlayer()) return mp->bpm;
    if (auto* sp = asS3mPlayer()) return sp->tempo;
    return 125;
}

EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_restart_pos() {
    auto* mp = asModPlayer();
    return mp ? (uint32_t)mp->restartpos : 0;
}

// ── Order List ─────────────────────────────────────────────────────────────

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
    if (auto* hp = asHscPlayer()) {
        if (pattern >= 50 || row >= 64 || channel >= 9) return 0;
        auto& n = hp->patterns[pattern][row * 9 + channel];
        if (n.note == 0 && n.effect == 0) return 0;

        // HSC note format: 0=empty, 1-12*8=notes (octave*12+note), 127=rest/off
        uint8_t note = n.note;
        uint8_t effect = n.effect;
        uint8_t cmd = 0, param = 0;

        // Effects: 1=slide up, 2=slide down, 3=tone porta, 4=no effect (set instrument)
        // High nibble of effect byte = instrument number (if bit 7 is 0)
        uint8_t instNum = 0;
        if (note != 0 && note != 127) {
            // Instrument is embedded in the channel state, not per-note in HSC
            // The effect byte encodes: high nibble = instrument change or effect param
            if (effect & 0x80) {
                // Effect mode
                cmd = (effect >> 4) & 0x07;
                param = effect & 0x0F;
            } else {
                instNum = (effect >> 4) & 0x0F;
                cmd = 0;
                param = effect & 0x0F;
            }
        }

        return ((uint32_t)note) |
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
        // S3M OPL instrument: type must be 0 (OPL melody)
        if (sp->inst[index].type != 0) return 0;
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

    return 0;
}

// ── Player Type Query ──────────────────────────────────────────────────────

/** Returns the detected player type enum value. 0=unknown. */
EMSCRIPTEN_KEEPALIVE
uint32_t adplug_get_player_type() {
    return (uint32_t)g_playerType;
}

} // extern "C"
