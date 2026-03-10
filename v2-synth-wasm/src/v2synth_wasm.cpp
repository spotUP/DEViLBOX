/**
 * V2 Synth WASM Bridge
 * 
 * Emscripten bindings for the V2 synthesizer for real-time playback in DEViLBOX.
 * This exposes note-on/off, CC, and patch control - NOT just V2M playback.
 */

#include <emscripten.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>

// V2 synth core
extern "C" {
  extern unsigned int synthGetSize();
  extern void synthInit(void *pthis, const void *patchmap, int samplerate);
  extern void synthRender(void *pthis, void *buf, int smp, void *buf2, int add);
  extern void synthProcessMIDI(void *pthis, const void *ptr);
  extern void synthSetGlobals(void *pthis, const void *ptr);
  extern void synthGetChannelVU(void *pthis, int ch, float *l, float *r);
  extern void synthGetMainVU(void *pthis, float *l, float *r);
  extern void synthSetVUMode(void *pthis, int mode);
}

// Include sdInit from sounddef
extern void sdInit();

// Global synth state
static void* g_synth = nullptr;
static uint8_t* g_patchmap = nullptr;
static uint32_t g_sampleRate = 44100;
static bool g_initialized = false;

// MIDI buffer for commands
static uint8_t g_midiBuffer[256];

extern "C" {

/**
 * Get required synth memory size
 */
EMSCRIPTEN_KEEPALIVE
uint32_t v2synth_get_size() {
    return synthGetSize();
}

/**
 * Initialize the V2 synthesizer
 * 
 * @param sampleRate Output sample rate (44100-192000)
 * @return 0 on success, -1 on error
 */
EMSCRIPTEN_KEEPALIVE
int v2synth_init(uint32_t sampleRate) {
    if (g_initialized) {
        return 1; // Already initialized
    }
    
    // Initialize sounddef tables
    sdInit();
    
    g_sampleRate = sampleRate;
    
    // Allocate synth work memory
    uint32_t size = synthGetSize();
    g_synth = malloc(size);
    if (!g_synth) {
        return -1;
    }
    memset(g_synth, 0, size);
    
    // Allocate default patchmap (128 patches × patch size)
    // For now, allocate empty - will be filled by v2synth_load_patch
    g_patchmap = (uint8_t*)malloc(128 * 256); // Conservative estimate
    if (!g_patchmap) {
        free(g_synth);
        g_synth = nullptr;
        return -1;
    }
    memset(g_patchmap, 0, 128 * 256);
    
    // Initialize synth with patchmap
    synthInit(g_synth, g_patchmap, sampleRate);
    
    g_initialized = true;
    return 0;
}

/**
 * Shutdown the V2 synthesizer
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_shutdown() {
    if (g_synth) {
        free(g_synth);
        g_synth = nullptr;
    }
    if (g_patchmap) {
        free(g_patchmap);
        g_patchmap = nullptr;
    }
    g_initialized = false;
}

/**
 * Load a patch into a channel
 * 
 * @param channel MIDI channel (0-15)
 * @param patchData Pointer to patch data
 * @param size Size of patch data
 * @return 0 on success
 */
EMSCRIPTEN_KEEPALIVE
int v2synth_load_patch(int channel, const uint8_t* patchData, int size) {
    if (!g_initialized || !g_patchmap || channel < 0 || channel > 15) {
        return -1;
    }
    
    // Copy patch to patchmap at channel offset
    // V2 patch size is ~256 bytes (v2soundsize from sounddef.h)
    memcpy(g_patchmap + channel * 256, patchData, size < 256 ? size : 256);
    
    // Re-init synth with updated patchmap
    synthInit(g_synth, g_patchmap, g_sampleRate);
    
    return 0;
}

/**
 * Set global parameters (reverb, delay, etc.)
 * 
 * @param globalsData Pointer to globals data
 * @param size Size of globals data
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_set_globals(const uint8_t* globalsData, int size) {
    if (!g_initialized) return;
    synthSetGlobals(g_synth, globalsData);
}

/**
 * Send note-on event
 * 
 * @param channel MIDI channel (0-15)
 * @param note MIDI note (0-127)
 * @param velocity Velocity (0-127, 0 = note off)
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_note_on(int channel, int note, int velocity) {
    if (!g_initialized) return;
    
    // Build MIDI message: 0x9n nn vv 0xfd
    g_midiBuffer[0] = 0x90 | (channel & 0x0F);
    g_midiBuffer[1] = note & 0x7F;
    g_midiBuffer[2] = velocity & 0x7F;
    g_midiBuffer[3] = 0xFD; // End marker
    
    synthProcessMIDI(g_synth, g_midiBuffer);
}

/**
 * Send note-off event
 * 
 * @param channel MIDI channel (0-15)
 * @param note MIDI note (0-127)
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_note_off(int channel, int note) {
    if (!g_initialized) return;
    
    // Build MIDI message: 0x8n nn 00 0xfd
    g_midiBuffer[0] = 0x80 | (channel & 0x0F);
    g_midiBuffer[1] = note & 0x7F;
    g_midiBuffer[2] = 0;
    g_midiBuffer[3] = 0xFD; // End marker
    
    synthProcessMIDI(g_synth, g_midiBuffer);
}

/**
 * Send control change (CC) event
 * 
 * @param channel MIDI channel (0-15)
 * @param cc CC number (0-127)
 * @param value Value (0-127)
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_control_change(int channel, int cc, int value) {
    if (!g_initialized) return;
    
    // Build MIDI message: 0xBn cc vv 0xfd
    g_midiBuffer[0] = 0xB0 | (channel & 0x0F);
    g_midiBuffer[1] = cc & 0x7F;
    g_midiBuffer[2] = value & 0x7F;
    g_midiBuffer[3] = 0xFD; // End marker
    
    synthProcessMIDI(g_synth, g_midiBuffer);
}

/**
 * Send pitch bend event
 * 
 * @param channel MIDI channel (0-15)
 * @param value Pitch bend value (0-16383, 8192 = center)
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_pitch_bend(int channel, int value) {
    if (!g_initialized) return;
    
    // Build MIDI message: 0xEn ll hh 0xfd (LSB, MSB)
    g_midiBuffer[0] = 0xE0 | (channel & 0x0F);
    g_midiBuffer[1] = value & 0x7F;         // LSB
    g_midiBuffer[2] = (value >> 7) & 0x7F;  // MSB
    g_midiBuffer[3] = 0xFD; // End marker
    
    synthProcessMIDI(g_synth, g_midiBuffer);
}

/**
 * Send program change event
 * 
 * @param channel MIDI channel (0-15)
 * @param program Program number (0-127)
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_program_change(int channel, int program) {
    if (!g_initialized) return;
    
    // Build MIDI message: 0xCn pp 0xfd
    g_midiBuffer[0] = 0xC0 | (channel & 0x0F);
    g_midiBuffer[1] = program & 0x7F;
    g_midiBuffer[2] = 0xFD; // End marker
    
    synthProcessMIDI(g_synth, g_midiBuffer);
}

/**
 * Render audio samples
 * 
 * @param buffer Pointer to interleaved stereo float buffer
 * @param numSamples Number of samples to render
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_render(float* buffer, uint32_t numSamples) {
    if (!g_initialized || !g_synth) {
        memset(buffer, 0, numSamples * 2 * sizeof(float));
        return;
    }
    
    synthRender(g_synth, buffer, numSamples, nullptr, 0);
}

/**
 * Get VU meter values for a channel
 * 
 * @param channel MIDI channel (0-15)
 * @param left Pointer to left VU value
 * @param right Pointer to right VU value
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_get_channel_vu(int channel, float* left, float* right) {
    if (!g_initialized) {
        *left = *right = 0;
        return;
    }
    synthGetChannelVU(g_synth, channel, left, right);
}

/**
 * Get master VU meter values
 * 
 * @param left Pointer to left VU value
 * @param right Pointer to right VU value
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_get_master_vu(float* left, float* right) {
    if (!g_initialized) {
        *left = *right = 0;
        return;
    }
    synthGetMainVU(g_synth, left, right);
}

/**
 * Set VU meter mode
 * 
 * @param mode 0 = peak, 1 = RMS
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_set_vu_mode(int mode) {
    if (!g_initialized) return;
    synthSetVUMode(g_synth, mode);
}

/**
 * Memory allocation helper for JavaScript
 */
EMSCRIPTEN_KEEPALIVE
uint8_t* v2synth_alloc(uint32_t size) {
    return (uint8_t*)malloc(size);
}

/**
 * Memory free helper for JavaScript
 */
EMSCRIPTEN_KEEPALIVE
void v2synth_free(uint8_t* ptr) {
    free(ptr);
}

} // extern "C"
