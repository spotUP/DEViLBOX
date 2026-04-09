/**
 * AdPlug WASM Bridge
 *
 * Emscripten wrapper for the AdPlug C++ library.
 * Provides a C API for loading and rendering 50+ OPL/AdLib music formats.
 */

#include <emscripten.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>

#include "adplug.h"
#include "emuopl.h"
#include "fprovide.h"
#include "player.h"
#include "players.h"
#include "binstr.h"

// In-memory file provider for AdPlug
class CProvider_Memory : public CFileProvider {
public:
    CProvider_Memory(const uint8_t* data, uint64_t size, const std::string& filename)
        : m_data(data), m_size(size), m_filename(filename) {}

    binistream* open(std::string filename) const override {
        if (filename == m_filename) {
            binisstream* stream = new binisstream(const_cast<uint8_t*>(m_data), static_cast<unsigned long>(m_size));
            stream->setFlag(binio::BigEndian, false);
            stream->setFlag(binio::FloatIEEE);
            return stream;
        }
        return nullptr;
    }

    void close(binistream* f) const override {
        delete f;
    }

private:
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
    g_initialized = false;
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
