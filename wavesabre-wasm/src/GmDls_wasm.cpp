// GmDls WASM stub — replaces Windows GmDls::Load() with a version
// that returns a copy of data previously set from JavaScript.
// Also dynamically finds the wave pool offset for non-Windows DLS files.

#include <WaveSabreCore/GmDls.h>
#include <cstring>

// Global pointer to the GM DLS data, set from JavaScript
static unsigned char* g_gmDlsData = nullptr;
static unsigned int g_gmDlsSize = 0;
static int g_wavePoolOffset = -1;  // Dynamically detected

#ifdef WASM_BUILD
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

// Find the wave pool (wvpl LIST chunk) offset in a DLS file
static int findWavePoolOffset(const unsigned char* data, unsigned int size) {
    unsigned int i = 0;
    while (i + 12 < size) {
        if (data[i] == 'L' && data[i+1] == 'I' && data[i+2] == 'S' && data[i+3] == 'T') {
            // Check if this LIST has type 'wvpl'
            if (data[i+8] == 'w' && data[i+9] == 'v' && data[i+10] == 'p' && data[i+11] == 'l') {
                return (int)(i + 12); // Return offset to the wave entries (after LIST/size/type)
            }
            // Skip past this LIST chunk
            unsigned int listSize = *(const unsigned int*)(data + i + 4);
            i += 8 + listSize;
            if (listSize & 1) i++; // RIFF padding
        } else {
            i++;
        }
    }
    return -1;
}

// Called from JS to provide the GM DLS file data
EXPORT void wavesabre_set_gmdls_data(unsigned char* data, unsigned int size) {
    if (g_gmDlsData) {
        delete[] g_gmDlsData;
    }

    // Find wave pool offset in the provided data
    g_wavePoolOffset = findWavePoolOffset(data, size);

    if (g_wavePoolOffset < 0) {
        // Not a valid DLS file
        g_gmDlsData = nullptr;
        g_gmDlsSize = 0;
        return;
    }

    // If offset matches the hardcoded Windows value, store as-is
    // Otherwise, remap data so WaveListOffset points to the actual wave pool
    int hardcodedOffset = 0x00044602;
    if (g_wavePoolOffset == hardcodedOffset) {
        g_gmDlsData = new unsigned char[size];
        memcpy(g_gmDlsData, data, size);
        g_gmDlsSize = size;
    } else {
        // Create a remapped buffer: the wave pool data starts at hardcoded offset
        // so Adultery's code using GmDls::WaveListOffset works unmodified
        unsigned int wavePoolDataSize = size - g_wavePoolOffset;
        unsigned int remappedSize = hardcodedOffset + wavePoolDataSize;
        g_gmDlsData = new unsigned char[remappedSize];
        memset(g_gmDlsData, 0, hardcodedOffset);
        memcpy(g_gmDlsData + hardcodedOffset, data + g_wavePoolOffset, wavePoolDataSize);
        g_gmDlsSize = remappedSize;
    }
}

EXPORT int wavesabre_has_gmdls() {
    return g_gmDlsData != nullptr ? 1 : 0;
}

namespace WaveSabreCore
{
    unsigned char* GmDls::Load()
    {
        if (!g_gmDlsData || g_gmDlsSize == 0) {
            return nullptr;
        }
        // Return a copy — caller will delete[] it
        auto copy = new unsigned char[g_gmDlsSize];
        memcpy(copy, g_gmDlsData, g_gmDlsSize);
        return copy;
    }
}
