#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include "asap.h"

static ASAP *asap = NULL;
static int sample_rate = 48000;

/* Persistent filename buffer for ASAP_Load (needs null-terminated C string) */
static char filename_buf[256];

EMSCRIPTEN_KEEPALIVE int asap_wasm_init(int sr) {
    sample_rate = sr;
    if (asap) ASAP_Delete(asap);
    asap = ASAP_New();
    if (!asap) return 0;
    return 1;
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_load(const uint8_t *data, int len, const char *filename) {
    if (!asap) return 0;
    ASAP_SetSampleRate(asap, sample_rate);
    /* Copy filename to persistent buffer */
    strncpy(filename_buf, filename, sizeof(filename_buf) - 1);
    filename_buf[sizeof(filename_buf) - 1] = '\0';
    if (!ASAP_Load(asap, filename_buf, data, len)) return 0;
    const ASAPInfo *info = ASAP_GetInfo(asap);
    int song = ASAPInfo_GetDefaultSong(info);
    int duration = ASAPInfo_GetDuration(info, song);
    if (duration < 0) duration = 180000; /* 3 min default */
    if (!ASAP_PlaySong(asap, song, duration)) return 0;
    ASAP_DetectSilence(asap, 5);
    return 1;
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_render(int16_t *buf, int frames) {
    if (!asap) return 0;
    int bytes = frames * 2 * (int)sizeof(int16_t); /* stereo S16 */
    int generated = ASAP_Generate(asap, (uint8_t*)buf, bytes, ASAPSampleFormat_S16_L_E);
    return generated / (2 * (int)sizeof(int16_t));
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_get_channels(void) {
    if (!asap) return 0;
    return ASAPInfo_GetChannels(ASAP_GetInfo(asap));
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_get_songs(void) {
    if (!asap) return 0;
    return ASAPInfo_GetSongs(ASAP_GetInfo(asap));
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_get_duration(int song) {
    if (!asap) return -1;
    return ASAPInfo_GetDuration(ASAP_GetInfo(asap), song);
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_get_position(void) {
    if (!asap) return 0;
    return ASAP_GetPosition(asap);
}

EMSCRIPTEN_KEEPALIVE void asap_wasm_seek(int position) {
    if (asap) ASAP_Seek(asap, position);
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_play_song(int song) {
    if (!asap) return 0;
    const ASAPInfo *info = ASAP_GetInfo(asap);
    int duration = ASAPInfo_GetDuration(info, song);
    if (duration < 0) duration = 180000;
    return ASAP_PlaySong(asap, song, duration);
}

EMSCRIPTEN_KEEPALIVE void asap_wasm_stop(void) {
    if (asap) { ASAP_Delete(asap); asap = NULL; }
}

EMSCRIPTEN_KEEPALIVE int asap_wasm_get_pokey_volume(int channel) {
    if (!asap) return 0;
    return ASAP_GetPokeyChannelVolume(asap, channel);
}

EMSCRIPTEN_KEEPALIVE void asap_wasm_mute_channels(int mask) {
    if (asap) ASAP_MutePokeyChannels(asap, mask);
}
