/**
 * openmpt_soundlib_bridge.cpp — WASM bridge wrapping OpenMPT's CSoundFile
 *
 * Provides full read/write access to tracker modules:
 * - Load 56+ formats (MOD, XM, IT, S3M, MPTM, and many more)
 * - Read/write pattern cells (note, instrument, volume, effects)
 * - Read/write sample PCM data
 * - Read/write instrument metadata
 * - Save to MOD, XM, IT, S3M formats
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

// Must define build mode before any openmpt includes
#ifndef LIBOPENMPT_BUILD
#define LIBOPENMPT_BUILD
#endif

// stdafx.h pulls in Types.hpp which defines uint32/int32 etc.
// Must come before any soundlib headers.
#include "common/stdafx.h"
#include "soundlib/Sndfile.h"
#include "common/FileReader.h"
#include "common/mptFileType.h"

#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

OPENMPT_NAMESPACE_BEGIN

// ============================================================================
// Global state — one module at a time
// ============================================================================

static CSoundFile *g_sf = nullptr;
static char g_json_buf[131072];  // 128KB JSON scratch buffer
static uint8_t *g_cell_buf = nullptr;
static int32_t g_cell_buf_size = 0;

// Save buffer for export
static std::vector<char> g_save_buf;

// ============================================================================
// Lifecycle
// ============================================================================

extern "C" {

EMSCRIPTEN_KEEPALIVE
int osl_load(const void *data, int size) {
    if (g_sf) {
        g_sf->Destroy();
        delete g_sf;
        g_sf = nullptr;
    }

    g_sf = new CSoundFile();
    FileReader file(mpt::as_span(static_cast<const std::byte*>(data),
                                  static_cast<size_t>(size)));

    if (!g_sf->Create(file, CSoundFile::loadCompleteModule)) {
        delete g_sf;
        g_sf = nullptr;
        return 0;
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int osl_create_new(int modtype, int numChannels, int numPatterns) {
    if (g_sf) {
        g_sf->Destroy();
        delete g_sf;
        g_sf = nullptr;
    }

    g_sf = new CSoundFile();
    MODTYPE mt = MOD_TYPE_IT;
    switch (modtype) {
        case 0: mt = MOD_TYPE_MOD; break;
        case 1: mt = MOD_TYPE_XM;  break;
        case 2: mt = MOD_TYPE_IT;  break;
        case 3: mt = MOD_TYPE_S3M; break;
    }
    g_sf->Create(mt, static_cast<CHANNELINDEX>(numChannels));

    // Create initial patterns and set up order list.
    // Both are required — without the order list, libopenmpt sees 0 orders
    // and read_float_stereo returns 0 frames immediately.
    for (int i = 0; i < numPatterns; i++) {
        g_sf->Patterns.Insert(i, 64);
        g_sf->Order().push_back(static_cast<PATTERNINDEX>(i));
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void osl_destroy(void) {
    if (g_sf) {
        g_sf->Destroy();
        delete g_sf;
        g_sf = nullptr;
    }
    if (g_cell_buf) {
        free(g_cell_buf);
        g_cell_buf = nullptr;
        g_cell_buf_size = 0;
    }
}

// ============================================================================
// Module metadata
// ============================================================================

static void json_escape(char *dst, int maxlen, const char *src) {
    int i = 0;
    if (!src) { dst[0] = '\0'; return; }
    while (*src && i < maxlen - 2) {
        unsigned char ch = static_cast<unsigned char>(*src);
        if (ch == '"' || ch == '\\') { dst[i++] = '\\'; dst[i++] = *src++; continue; }
        if (ch == '\n') { dst[i++] = '\\'; dst[i++] = 'n'; src++; continue; }
        if (ch == '\r') { src++; continue; }
        if (ch == '\t') { dst[i++] = '\\'; dst[i++] = 't'; src++; continue; }
        if (ch < 0x20) { src++; continue; }
        dst[i++] = *src++;
    }
    dst[i] = '\0';
}

static void json_escape_str(char *dst, int maxlen, const std::string &src) {
    json_escape(dst, maxlen, src.c_str());
}

EMSCRIPTEN_KEEPALIVE
const char *osl_get_info_json(void) {
    if (!g_sf) return "{}";

    std::string title = g_sf->GetTitle();
    const char *typeStr = "unknown";
    MODTYPE mt = g_sf->GetType();
    if (mt == MOD_TYPE_MOD)       typeStr = "MOD";
    else if (mt == MOD_TYPE_XM)   typeStr = "XM";
    else if (mt == MOD_TYPE_IT)   typeStr = "IT";
    else if (mt == MOD_TYPE_S3M)  typeStr = "S3M";
    else if (mt == MOD_TYPE_MPT)  typeStr = "MPTM";
    else if (mt == MOD_TYPE_MTM)  typeStr = "MTM";
    else if (mt == MOD_TYPE_669)  typeStr = "669";
    else if (mt == MOD_TYPE_ULT)  typeStr = "ULT";
    else if (mt == MOD_TYPE_STM)  typeStr = "STM";
    else if (mt == MOD_TYPE_FAR)  typeStr = "FAR";
    else if (mt == MOD_TYPE_DTM)  typeStr = "DTM";
    else if (mt == MOD_TYPE_AMF)  typeStr = "AMF";
    else if (mt == MOD_TYPE_AMS)  typeStr = "AMS";
    else if (mt == MOD_TYPE_DSM)  typeStr = "DSM";
    else if (mt == MOD_TYPE_MDL)  typeStr = "MDL";
    else if (mt == MOD_TYPE_OKT)  typeStr = "OKT";
    else if (mt == MOD_TYPE_MID)  typeStr = "MID";
    else if (mt == MOD_TYPE_DMF)  typeStr = "DMF";
    else if (mt == MOD_TYPE_PTM)  typeStr = "PTM";
    else if (mt == MOD_TYPE_DBM)  typeStr = "DBM";
    else if (mt == MOD_TYPE_MT2)  typeStr = "MT2";
    else if (mt == MOD_TYPE_AMF0) typeStr = "AMF0";
    else if (mt == MOD_TYPE_PSM)  typeStr = "PSM";
    else if (mt == MOD_TYPE_J2B)  typeStr = "J2B";
    else if (mt == MOD_TYPE_IMF)  typeStr = "IMF";
    else if (mt == MOD_TYPE_DIGI) typeStr = "DIGI";
    else if (mt == MOD_TYPE_STP)  typeStr = "STP";
    else if (mt == MOD_TYPE_PLM)  typeStr = "PLM";
    else if (mt == MOD_TYPE_SFX)  typeStr = "SFX";
    else if (mt == MOD_TYPE_MED)  typeStr = "MED";

    char esc_title[1024];
    json_escape_str(esc_title, sizeof(esc_title), title);

    int speed = g_sf->Order().GetDefaultSpeed();
    int tempo = g_sf->Order().GetDefaultTempo().GetInt();
    int channels = g_sf->GetNumChannels();
    int orders = g_sf->Order().GetLengthTailTrimmed();
    int patterns = g_sf->Patterns.GetNumPatterns();
    int instruments = g_sf->GetNumInstruments();
    int samples = g_sf->GetNumSamples();
    bool linearSlides = g_sf->m_SongFlags[SONG_LINEARSLIDES];

    snprintf(g_json_buf, sizeof(g_json_buf),
        "{"
        "\"title\":\"%s\","
        "\"type\":\"%s\","
        "\"numChannels\":%d,"
        "\"numOrders\":%d,"
        "\"numPatterns\":%d,"
        "\"numInstruments\":%d,"
        "\"numSamples\":%d,"
        "\"initialSpeed\":%d,"
        "\"initialBPM\":%d,"
        "\"linearSlides\":%s"
        "}",
        esc_title, typeStr,
        channels, orders, patterns, instruments, samples,
        speed, tempo,
        linearSlides ? "true" : "false"
    );
    return g_json_buf;
}

// ============================================================================
// Pattern read/write
// ============================================================================

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_num_channels(void) {
    return g_sf ? g_sf->GetNumChannels() : 0;
}

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_num_patterns(void) {
    return g_sf ? g_sf->Patterns.GetNumPatterns() : 0;
}

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_num_orders(void) {
    return g_sf ? g_sf->Order().GetLengthTailTrimmed() : 0;
}

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_order_pattern(int32_t order) {
    if (!g_sf || order < 0) return -1;
    return g_sf->Order()[static_cast<ORDERINDEX>(order)];
}

EMSCRIPTEN_KEEPALIVE
void osl_set_order(int32_t order, int32_t pattern) {
    if (!g_sf || order < 0) return;
    auto idx = static_cast<ORDERINDEX>(order);
    // Grow the order list if needed — operator[] on std::vector is UB past size()
    if (idx >= g_sf->Order().GetLength()) {
        g_sf->Order().resize(idx + 1);
    }
    g_sf->Order()[idx] = static_cast<PATTERNINDEX>(pattern);
}

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_pattern_num_rows(int32_t pattern) {
    if (!g_sf || !g_sf->Patterns.IsValidPat(static_cast<PATTERNINDEX>(pattern))) return 0;
    return g_sf->Patterns[static_cast<PATTERNINDEX>(pattern)].GetNumRows();
}

/**
 * Bulk-read an entire pattern into a flat buffer.
 * Layout: rows × channels × 6 bytes [note, instr, volcmd, vol, command, param]
 * Returns pointer to buffer in WASM heap.
 */
EMSCRIPTEN_KEEPALIVE
uint8_t *osl_get_pattern_data(int32_t pattern) {
    if (!g_sf) return nullptr;
    PATTERNINDEX pat = static_cast<PATTERNINDEX>(pattern);
    if (!g_sf->Patterns.IsValidPat(pat)) return nullptr;

    const CPattern &p = g_sf->Patterns[pat];
    int32_t rows = p.GetNumRows();
    int32_t channels = g_sf->GetNumChannels();
    int32_t needed = rows * channels * 6;

    if (needed > g_cell_buf_size) {
        g_cell_buf = static_cast<uint8_t*>(realloc(g_cell_buf, needed));
        g_cell_buf_size = needed;
    }

    uint8_t *ptr = g_cell_buf;
    for (int32_t r = 0; r < rows; r++) {
        auto row = p.GetRow(static_cast<ROWINDEX>(r));
        for (int32_t c = 0; c < channels; c++) {
            const ModCommand &m = row[c];
            *ptr++ = m.note;
            *ptr++ = m.instr;
            *ptr++ = static_cast<uint8_t>(m.volcmd);
            *ptr++ = m.vol;
            *ptr++ = static_cast<uint8_t>(m.command);
            *ptr++ = m.param;
        }
    }
    return g_cell_buf;
}

/**
 * Write a single cell in a pattern.
 */
EMSCRIPTEN_KEEPALIVE
void osl_set_pattern_cell(int32_t pattern, int32_t row, int32_t channel,
                           uint8_t note, uint8_t instr,
                           uint8_t volcmd, uint8_t vol,
                           uint8_t command, uint8_t param) {
    if (!g_sf) return;
    PATTERNINDEX pat = static_cast<PATTERNINDEX>(pattern);
    if (!g_sf->Patterns.IsValidPat(pat)) return;

    ModCommand *m = g_sf->Patterns[pat].GetpModCommand(
        static_cast<ROWINDEX>(row),
        static_cast<CHANNELINDEX>(channel)
    );
    if (!m) return;

    m->note = note;
    m->instr = instr;
    m->volcmd = static_cast<VolumeCommand>(volcmd);
    m->vol = vol;
    m->command = static_cast<EffectCommand>(command);
    m->param = param;
}

EMSCRIPTEN_KEEPALIVE
int osl_resize_pattern(int32_t pattern, int32_t newRows) {
    if (!g_sf || newRows < 1 || newRows > 1024) return 0;
    PATTERNINDEX pat = static_cast<PATTERNINDEX>(pattern);
    if (!g_sf->Patterns.IsValidPat(pat)) return 0;
    return g_sf->Patterns[pat].Resize(static_cast<ROWINDEX>(newRows)) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int osl_add_pattern(int32_t numRows) {
    if (!g_sf || numRows < 1) return -1;
    PATTERNINDEX pat = g_sf->Patterns.InsertAny(static_cast<ROWINDEX>(numRows));
    return (pat == PATTERNINDEX_INVALID) ? -1 : static_cast<int>(pat);
}

// ============================================================================
// Instrument / Sample metadata
// ============================================================================

// Forward declarations
const char *osl_get_sample_names_json(void);

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_num_instruments(void) {
    return g_sf ? g_sf->GetNumInstruments() : 0;
}

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_num_samples(void) {
    return g_sf ? g_sf->GetNumSamples() : 0;
}

EMSCRIPTEN_KEEPALIVE
const char *osl_get_instrument_names_json(void) {
    if (!g_sf) return "[]";

    int num = g_sf->GetNumInstruments();
    // If no instruments (MOD/S3M), use sample names instead
    if (num == 0) return osl_get_sample_names_json();

    char *p = g_json_buf;
    int remaining = sizeof(g_json_buf);
    int n = snprintf(p, remaining, "[");
    p += n; remaining -= n;

    for (int i = 1; i <= num && remaining > 256; i++) {
        const ModInstrument *ins = g_sf->Instruments[i];
        char esc[200] = {0};
        if (ins) {
            std::string name = ins->GetName();
            json_escape_str(esc, sizeof(esc), name);
        }
        n = snprintf(p, remaining, "%s\"%s\"", i > 1 ? "," : "", esc);
        p += n; remaining -= n;
    }
    snprintf(p, remaining, "]");
    return g_json_buf;
}

EMSCRIPTEN_KEEPALIVE
const char *osl_get_sample_names_json(void) {
    if (!g_sf) return "[]";

    int num = g_sf->GetNumSamples();
    char *p = g_json_buf;
    int remaining = sizeof(g_json_buf);
    int n = snprintf(p, remaining, "[");
    p += n; remaining -= n;

    for (int i = 1; i <= num && remaining > 256; i++) {
        std::string name(g_sf->m_szNames[i].buf, strnlen(g_sf->m_szNames[i].buf, sizeof(g_sf->m_szNames[i].buf)));
        char esc[200];
        json_escape_str(esc, sizeof(esc), name);
        n = snprintf(p, remaining, "%s\"%s\"", i > 1 ? "," : "", esc);
        p += n; remaining -= n;
    }
    snprintf(p, remaining, "]");
    return g_json_buf;
}

// ============================================================================
// Sample PCM data — read/write
// ============================================================================

EMSCRIPTEN_KEEPALIVE
const char *osl_get_sample_info_json(int32_t sampleIdx) {
    if (!g_sf || sampleIdx < 1 || sampleIdx > static_cast<int32_t>(g_sf->GetNumSamples()))
        return "{}";

    const ModSample &smp = g_sf->GetSample(static_cast<SAMPLEINDEX>(sampleIdx));
    std::string name(g_sf->m_szNames[sampleIdx].buf, strnlen(g_sf->m_szNames[sampleIdx].buf, sizeof(g_sf->m_szNames[sampleIdx].buf)));
    char esc_name[200];
    json_escape_str(esc_name, sizeof(esc_name), name);

    snprintf(g_json_buf, sizeof(g_json_buf),
        "{"
        "\"name\":\"%s\","
        "\"length\":%u,"
        "\"loopStart\":%u,"
        "\"loopEnd\":%u,"
        "\"sustainStart\":%u,"
        "\"sustainEnd\":%u,"
        "\"c5Speed\":%u,"
        "\"globalVol\":%u,"
        "\"defaultVol\":%u,"
        "\"pan\":%u,"
        "\"relativeTone\":%d,"
        "\"fineTune\":%d,"
        "\"is16Bit\":%s,"
        "\"isStereo\":%s,"
        "\"hasLoop\":%s,"
        "\"hasSustainLoop\":%s,"
        "\"pingPongLoop\":%s"
        "}",
        esc_name,
        static_cast<unsigned>(smp.nLength),
        static_cast<unsigned>(smp.nLoopStart),
        static_cast<unsigned>(smp.nLoopEnd),
        static_cast<unsigned>(smp.nSustainStart),
        static_cast<unsigned>(smp.nSustainEnd),
        smp.nC5Speed,
        static_cast<unsigned>(smp.nGlobalVol),
        static_cast<unsigned>(smp.nVolume),
        static_cast<unsigned>(smp.nPan),
        static_cast<int>(smp.RelativeTone),
        static_cast<int>(smp.nFineTune),
        (smp.uFlags[CHN_16BIT]) ? "true" : "false",
        (smp.uFlags[CHN_STEREO]) ? "true" : "false",
        (smp.uFlags[CHN_LOOP]) ? "true" : "false",
        (smp.uFlags[CHN_SUSTAINLOOP]) ? "true" : "false",
        (smp.uFlags[CHN_PINGPONGLOOP]) ? "true" : "false"
    );
    return g_json_buf;
}

/**
 * Get sample PCM data size in bytes.
 */
EMSCRIPTEN_KEEPALIVE
int32_t osl_get_sample_data_size(int32_t sampleIdx) {
    if (!g_sf || sampleIdx < 1 || sampleIdx > static_cast<int32_t>(g_sf->GetNumSamples()))
        return 0;
    const ModSample &smp = g_sf->GetSample(static_cast<SAMPLEINDEX>(sampleIdx));
    return static_cast<int32_t>(smp.GetSampleSizeInBytes());
}

/**
 * Get pointer to raw sample PCM data in WASM heap.
 * 8-bit samples: signed int8. 16-bit samples: signed int16.
 * Stereo samples are interleaved L/R.
 */
EMSCRIPTEN_KEEPALIVE
const void *osl_get_sample_data(int32_t sampleIdx) {
    if (!g_sf || sampleIdx < 1 || sampleIdx > static_cast<int32_t>(g_sf->GetNumSamples()))
        return nullptr;
    const ModSample &smp = g_sf->GetSample(static_cast<SAMPLEINDEX>(sampleIdx));
    return smp.samplev();
}

/**
 * Replace sample PCM data. The data pointer must be in WASM heap (_malloc'd).
 * bitsPerSample: 8 or 16. channels: 1 or 2.
 */
EMSCRIPTEN_KEEPALIVE
int osl_set_sample_data(int32_t sampleIdx, const void *data, int32_t numFrames,
                         int bitsPerSample, int channels, uint32_t c5Speed) {
    if (!g_sf || sampleIdx < 1) return 0;

    // Ensure sample slot exists
    if (sampleIdx > static_cast<int32_t>(g_sf->GetNumSamples())) {
        // Can't add beyond limit
        return 0;
    }

    ModSample &smp = g_sf->GetSample(static_cast<SAMPLEINDEX>(sampleIdx));

    // Free old data
    smp.FreeSample();

    // Allocate and copy new data
    smp.nLength = static_cast<SmpLength>(numFrames);
    smp.nC5Speed = c5Speed;

    if (bitsPerSample == 16) smp.uFlags.set(CHN_16BIT);
    else smp.uFlags.reset(CHN_16BIT);

    if (channels == 2) smp.uFlags.set(CHN_STEREO);
    else smp.uFlags.reset(CHN_STEREO);

    size_t dataSize = static_cast<size_t>(numFrames) * (bitsPerSample / 8) * channels;
    if (smp.AllocateSample()) {
        memcpy(smp.sampleb(), data, dataSize);
        return 1;
    }
    return 0;
}

// ============================================================================
// MIDI macro config (Zxx / Symphonie DSP)
// ============================================================================

/**
 * Get MIDI macro string (Zxx) at index 0-127.
 * Returns pointer to a static buffer — copy before the next call.
 */
EMSCRIPTEN_KEEPALIVE
const char *osl_get_midi_macro_string(int idx) {
    static char buf[64];
    buf[0] = '\0';
    if (!g_sf || idx < 0 || idx >= 128) return buf;
    const std::string macroStr = static_cast<std::string>(g_sf->m_MidiCfg.Zxx[static_cast<size_t>(idx)]);
    snprintf(buf, sizeof(buf), "%s", macroStr.c_str());
    return buf;
}

/**
 * Set MIDI macro string (Zxx) at index 0-127.
 */
EMSCRIPTEN_KEEPALIVE
void osl_set_midi_macro_string(int idx, const char *str) {
    if (!g_sf || idx < 0 || idx >= 128 || !str) return;
    g_sf->m_MidiCfg.Zxx[static_cast<size_t>(idx)] = std::string_view(str);
}

// ============================================================================
// Speed/tempo
// ============================================================================

EMSCRIPTEN_KEEPALIVE
void osl_set_initial_speed(int32_t speed) {
    if (g_sf) g_sf->Order().SetDefaultSpeed(static_cast<uint32_t>(speed));
}

EMSCRIPTEN_KEEPALIVE
void osl_set_initial_tempo(int32_t tempo) {
    if (g_sf) g_sf->Order().SetDefaultTempoInt(static_cast<uint32_t>(tempo));
}

// ============================================================================
// Save / Export
// ============================================================================

#ifndef MODPLUG_NO_FILESAVE

static int do_save(int format) {
    if (!g_sf) return 0;
    g_save_buf.clear();

    std::ostringstream oss(std::ios::binary);
    bool ok = false;
    switch (format) {
        case 0: ok = g_sf->SaveMod(oss); break;
        case 1: ok = g_sf->SaveXM(oss, false); break;
        case 2: ok = g_sf->SaveIT(oss, mpt::PathString(), false); break;
        case 3: ok = g_sf->SaveS3M(oss); break;
        default: return 0;
    }

    if (ok) {
        std::string data = oss.str();
        g_save_buf.assign(data.begin(), data.end());
        return 1;
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE int osl_save_mod(void) { return do_save(0); }
EMSCRIPTEN_KEEPALIVE int osl_save_xm(void)  { return do_save(1); }
EMSCRIPTEN_KEEPALIVE int osl_save_it(void)  { return do_save(2); }
EMSCRIPTEN_KEEPALIVE int osl_save_s3m(void) { return do_save(3); }

EMSCRIPTEN_KEEPALIVE
const void *osl_get_save_buffer(void) {
    return g_save_buf.empty() ? nullptr : g_save_buf.data();
}

EMSCRIPTEN_KEEPALIVE
int32_t osl_get_save_buffer_size(void) {
    return static_cast<int32_t>(g_save_buf.size());
}

EMSCRIPTEN_KEEPALIVE
void osl_free_save_buffer(void) {
    g_save_buf.clear();
    g_save_buf.shrink_to_fit();
}

#endif // MODPLUG_NO_FILESAVE

} // extern "C"

OPENMPT_NAMESPACE_END
