/*
 * Minimal SDL stub for klystron WASM build.
 * Provides only the type definitions and no-op functions that klystron needs.
 */
#ifndef SDL_STUB_H
#define SDL_STUB_H

#include <stdint.h>
#include <stdlib.h>

typedef uint8_t  Uint8;
typedef uint16_t Uint16;
typedef uint32_t Uint32;
typedef uint64_t Uint64;
typedef int8_t   Sint8;
typedef int16_t  Sint16;
typedef int32_t  Sint32;
typedef int64_t  Sint64;

/* SDL_mutex stubs (never used — CYD_SINGLE_THREAD flag) */
typedef void *SDL_mutex;
static inline SDL_mutex *SDL_CreateMutex(void) { return NULL; }
static inline void SDL_DestroyMutex(SDL_mutex *m) { (void)m; }
static inline int SDL_LockMutex(SDL_mutex *m) { (void)m; return 0; }
static inline int SDL_UnlockMutex(SDL_mutex *m) { (void)m; return 0; }

/* SDL_Delay / SDL_GetTicks stubs (only in debug spinloop paths) */
static inline void SDL_Delay(Uint32 ms) { (void)ms; }
static inline Uint32 SDL_GetTicks(void) { return 0; }
static inline const char *SDL_GetError(void) { return ""; }

/* Surface stubs (used in my_lock/my_unlock macros) */
#define SDL_MUSTLOCK(s) 0
static inline int SDL_LockSurface(void *s) { (void)s; return 0; }
static inline void SDL_UnlockSurface(void *s) { (void)s; }

/* Audio format constants */
#define AUDIO_S16SYS 0x8010

/* Audio stubs (never called — we use NOSDL_MIXER and call cyd_output_buffer_stereo directly) */
typedef struct {
    int freq;
    Uint16 format;
    Uint8 channels;
    Uint16 samples;
    Uint32 size;
    void (*callback)(void *userdata, Uint8 *stream, int len);
    void *userdata;
} SDL_AudioSpec;

static inline int SDL_OpenAudio(SDL_AudioSpec *desired, SDL_AudioSpec *obtained) { (void)desired; (void)obtained; return -1; }
static inline void SDL_CloseAudio(void) {}
static inline void SDL_PauseAudio(int pause_on) { (void)pause_on; }

#endif /* SDL_STUB_H */
