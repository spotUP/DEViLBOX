/* pretracker_wrapper.c — WASM harness for transpiled PreTracker replayer */

#include "paula_soft.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

/* The replayer is one big function with a command dispatch at entry */
extern void prt_replayer_entry(void);
extern int prt_cmd;
extern uint32_t d0, d1, a0, a1, a2, sp;

#define PRT_CMD_SONG_INIT   1
#define PRT_CMD_PLAYER_INIT 2
#define PRT_CMD_PLAYER_TICK 3
#define PRT_CMD_START_SONG  4
#define PRT_CMD_STOP        5

static int       g_initialized = 0;
static double    g_frames_per_tick = 0.0;
static double    g_accum = 0.0;
static double    g_output_rate = (double)PAULA_RATE_PAL;

static uint8_t  *g_module_buf = NULL;
static uint32_t  g_module_size = 0;
static uint8_t  *g_song_data = NULL;
static uint8_t  *g_player_state = NULL;
static uint8_t  *g_chipmem = NULL;
static uint8_t   g_stack[65536] __attribute__((aligned(16)));

#define VBLANK_HZ           50.0
#define SONG_DATA_SIZE      0x600
#define PLAYER_STATE_SIZE   0x2000
#define DEFAULT_CHIPMEM     (256*1024)

static inline void push32_be(uint32_t val) {
    sp -= 4;
    uint8_t *p = (uint8_t *)(uintptr_t)sp;
    p[0] = (uint8_t)(val >> 24); p[1] = (uint8_t)(val >> 16);
    p[2] = (uint8_t)(val >> 8);  p[3] = (uint8_t)(val);
}

static void reset_stack(void) {
    sp = (uint32_t)(uintptr_t)(g_stack + sizeof(g_stack));
}

extern void paula_dump_state(void);

EXPORT int player_init(const uint8_t *module_data, uint32_t module_size) {
    paula_reset();
    g_accum = 0.0;
    g_frames_per_tick = g_output_rate / VBLANK_HZ;

    if (g_module_buf) { free(g_module_buf); g_module_buf = NULL; }
    if (g_song_data) { free(g_song_data); g_song_data = NULL; }
    if (g_player_state) { free(g_player_state); g_player_state = NULL; }
    if (g_chipmem) { free(g_chipmem); g_chipmem = NULL; }

    g_module_buf = (uint8_t *)malloc(module_size);
    if (!g_module_buf) return -1;
    memcpy(g_module_buf, module_data, module_size);
    g_module_size = module_size;

    g_song_data = (uint8_t *)calloc(1, SONG_DATA_SIZE);
    g_player_state = (uint8_t *)calloc(1, PLAYER_STATE_SIZE);
    g_chipmem = (uint8_t *)calloc(1, DEFAULT_CHIPMEM);
    if (!g_song_data || !g_player_state || !g_chipmem) return -2;

    printf("[PRT] module: %c%c%c ver=0x%02x size=%u\n",
        g_module_buf[0], g_module_buf[1], g_module_buf[2], g_module_buf[3], module_size);

    /* songInit: dispatch pushes module, song, state + return addr */
    reset_stack();
    push32_be((uint32_t)(uintptr_t)g_module_buf);
    push32_be((uint32_t)(uintptr_t)g_song_data);
    push32_be((uint32_t)(uintptr_t)g_player_state);
    push32_be(0xDEADBEEF);
    a0 = (uint32_t)(uintptr_t)g_player_state;
    a1 = (uint32_t)(uintptr_t)g_song_data;
    a2 = (uint32_t)(uintptr_t)g_module_buf;
    prt_cmd = PRT_CMD_SONG_INIT;
    prt_replayer_entry();
    printf("[PRT] songInit d0=%u\n", d0);

    uint32_t chipmem_needed = d0;
    if (chipmem_needed > DEFAULT_CHIPMEM && chipmem_needed < 4*1024*1024) {
        free(g_chipmem);
        g_chipmem = (uint8_t *)calloc(1, chipmem_needed);
        if (!g_chipmem) return -3;
    }

    /* playerInit */
    reset_stack();
    push32_be((uint32_t)(uintptr_t)g_song_data);
    push32_be((uint32_t)(uintptr_t)g_chipmem);
    push32_be((uint32_t)(uintptr_t)g_player_state);
    push32_be(0xDEADBEEF);
    a0 = (uint32_t)(uintptr_t)g_player_state;
    a1 = (uint32_t)(uintptr_t)g_chipmem;
    a2 = (uint32_t)(uintptr_t)g_song_data;
    prt_cmd = PRT_CMD_PLAYER_INIT;
    prt_replayer_entry();
    printf("[PRT] playerInit done\n");
    paula_dump_state();

    /* startSong 0 */
    reset_stack();
    push32_be((uint32_t)(uintptr_t)g_player_state);
    push32_be(0xDEADBEEF);
    a0 = (uint32_t)(uintptr_t)g_player_state;
    d0 = 0;
    prt_cmd = PRT_CMD_START_SONG;
    prt_replayer_entry();
    printf("[PRT] startSong done\n");
    paula_dump_state();

    g_initialized = 1;
    return 0;
}

EXPORT int player_render(float *buf, int frames) {
    static int rc = 0; if (++rc <= 3) printf("[PRT] render call %d frames=%d fpt=%.1f accum=%.1f\n", rc, frames, g_frames_per_tick, g_accum);
    if (!g_initialized) { memset(buf, 0, frames * 2 * sizeof(float)); return 0; }
    float *out = buf;
    int remaining = frames;
    while (remaining > 0) {
        int n = (int)(g_frames_per_tick - g_accum);
        if (n < 1) n = 1;
        if (n > remaining) n = remaining;
        int got = paula_render(out, n);
        out += got * 2;
        remaining -= got;
        g_accum += (double)got;
        if (g_accum >= g_frames_per_tick) {
            g_accum -= g_frames_per_tick;
            reset_stack();
            push32_be((uint32_t)(uintptr_t)g_player_state);
            push32_be(0xDEADBEEF);
            a0 = (uint32_t)(uintptr_t)g_player_state;
            prt_cmd = PRT_CMD_PLAYER_TICK;
            printf("[PRT] tick pre\n");
            prt_replayer_entry();
            printf("[PRT] tick post\n");
            static int tc = 0;
            tc++;
            if (tc <= 5) { printf("[PRT] tick %d\n", tc); paula_dump_state(); }
            if (tc == 1000) { printf("[PRT] 1000 ticks, stopping\n"); return frames - remaining; }
        }
    }
    return frames;
}

EXPORT void player_stop(void) { if (g_initialized) { paula_reset(); g_initialized = 0; } }
EXPORT void player_set_sample_rate(int rate) {
    g_output_rate = (double)rate;
    paula_set_output_rate((float)rate);
    g_frames_per_tick = g_output_rate / VBLANK_HZ;
}
EXPORT int player_is_finished(void) { return 0; }
EXPORT int player_get_subsong_count(void) { return 1; }
EXPORT void player_set_subsong(int n) { (void)n; }
EXPORT const char* player_get_title(void) { return "PreTracker"; }
EXPORT double player_detect_duration(void) { return 0.0; }
EXPORT void player_set_channel_gain(int ch, float gain) { paula_set_channel_gain(ch, gain); }
EXPORT void player_get_channel_levels(float *out) { paula_get_channel_levels(out); }
