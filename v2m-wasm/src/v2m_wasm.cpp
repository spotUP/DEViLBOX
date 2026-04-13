/**
 * V2M WASM Bridge
 * 
 * Emscripten bindings for V2MPlayer to enable .v2m playback in DEViLBOX.
 * Uses jgilje's portable v2m-player fork.
 */

#include <emscripten.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>

#include "v2mplayer.h"
#include "v2mconv.h"
#include "sounddef.h"
#include "synth.h"

// Global state
static V2MPlayer* g_player = nullptr;
static uint8_t* g_convertedData = nullptr;
static int g_convertedLen = 0;
static uint32_t g_sampleRate = 44100;
static bool g_initialized = false;

extern "C" {

/**
 * Initialize the V2M player subsystem.
 * Must be called before any other functions.
 */
EMSCRIPTEN_KEEPALIVE
int v2m_init(uint32_t sampleRate) {
    if (g_initialized) {
        return 1; // Already initialized
    }
    
    // Initialize sounddef tables
    sdInit();
    
    g_sampleRate = sampleRate;
    g_player = new V2MPlayer();
    g_player->Init();
    g_initialized = true;
    
    return 0;
}

/**
 * Shutdown the V2M player and free all resources.
 */
EMSCRIPTEN_KEEPALIVE
void v2m_shutdown() {
    if (g_player) {
        g_player->Close();
        delete g_player;
        g_player = nullptr;
    }
    
    if (g_convertedData) {
        delete[] g_convertedData;
        g_convertedData = nullptr;
        g_convertedLen = 0;
    }
    
    g_initialized = false;
}

/**
 * Load a V2M file from memory.
 * 
 * @param data Pointer to V2M file data
 * @param length Length of the data in bytes
 * @return 0 on success, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int v2m_load(const uint8_t* data, int length) {
    if (!g_initialized || !g_player) {
        return -1;
    }
    
    // Close any previously loaded song
    g_player->Close();
    
    // Free previous converted data
    if (g_convertedData) {
        delete[] g_convertedData;
        g_convertedData = nullptr;
        g_convertedLen = 0;
    }
    
    // Convert to newest V2M format
    uint8_t* convPtr = nullptr;
    int convLen = 0;
    ConvertV2M(data, length, &convPtr, &convLen);
    
    if (!convPtr || convLen <= 0) {
        return -1;
    }
    
    g_convertedData = convPtr;
    g_convertedLen = convLen;
    
    // Open with the converted data
    if (!g_player->Open(g_convertedData, g_sampleRate)) {
        delete[] g_convertedData;
        g_convertedData = nullptr;
        g_convertedLen = 0;
        return -1;
    }
    
    return 0;
}

/**
 * Start playback from a given time offset.
 * 
 * @param timeMs Time offset from song start in milliseconds
 */
EMSCRIPTEN_KEEPALIVE
void v2m_play(uint32_t timeMs) {
    if (g_player) {
        g_player->Play(timeMs);
    }
}

/**
 * Stop playback.
 * 
 * @param fadeMs Optional fade out time in milliseconds (0 = immediate stop)
 */
EMSCRIPTEN_KEEPALIVE
void v2m_stop(uint32_t fadeMs) {
    if (g_player) {
        g_player->Stop(fadeMs);
    }
}

/**
 * Render audio samples.
 * 
 * @param buffer Pointer to stereo float buffer (interleaved L/R)
 * @param numSamples Number of stereo samples to render
 * @return 1 if still playing, 0 if finished
 */
EMSCRIPTEN_KEEPALIVE
int v2m_render(float* buffer, uint32_t numSamples) {
    if (!g_player) {
        // Fill with silence
        memset(buffer, 0, numSamples * 2 * sizeof(float));
        return 0;
    }
    
    // Zero buffer first (Render doesn't clear by default)
    memset(buffer, 0, numSamples * 2 * sizeof(float));
    
    g_player->Render(buffer, numSamples);
    
    return g_player->IsPlaying() ? 1 : 0;
}

/**
 * Check if the player is currently playing.
 * 
 * @return 1 if playing, 0 if not
 */
EMSCRIPTEN_KEEPALIVE
int v2m_is_playing() {
    return (g_player && g_player->IsPlaying()) ? 1 : 0;
}

/**
 * Get the song length in seconds.
 * 
 * @return Song length in seconds, or 0 if no song loaded
 */
EMSCRIPTEN_KEEPALIVE
uint32_t v2m_get_length() {
    if (g_player) {
        return g_player->Length();
    }
    return 0;
}

/**
 * Allocate memory for loading V2M data.
 * Call this from JS, then write the file data, then call v2m_load.
 * 
 * @param size Number of bytes to allocate
 * @return Pointer to allocated memory
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* v2m_alloc(uint32_t size) {
    return (uint8_t*)malloc(size);
}

/**
 * Free memory allocated with v2m_alloc.
 *
 * @param ptr Pointer to free
 */
EMSCRIPTEN_KEEPALIVE
void v2m_free(uint8_t* ptr) {
    free(ptr);
}

/**
 * Set the gain override for a single V2 synth channel (0-15).
 * 1.0 = passthrough, 0.0 = mute.
 *
 * @param channel Channel index (0..15)
 * @param gain    Linear gain multiplier
 */
EMSCRIPTEN_KEEPALIVE
void v2m_set_channel_gain(int channel, float gain) {
    if (g_player) {
        synthSetChannelGain(g_player->GetSynth(), channel, gain);
    }
}

} // extern "C"
