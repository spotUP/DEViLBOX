/*
 * Minimal SDL2 stub for Emscripten WASM compilation of FT2 sample editor.
 * Provides just enough types/constants to compile without SDL2 installed.
 * All display/audio functions are no-ops — the WASM bridge handles I/O directly.
 */
#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

/* ── Basic types ─────────────────────────────────────────────────────── */
typedef enum { SDL_FALSE = 0, SDL_TRUE = 1 } SDL_bool;
typedef void* SDL_Window;
typedef void* SDL_Renderer;
typedef void* SDL_Texture;
typedef struct SDL_PixelFormat {
    uint32_t format;
    uint8_t  BitsPerPixel, BytesPerPixel;
    uint32_t Rmask, Gmask, Bmask, Amask;
} SDL_PixelFormat;

typedef struct SDL_Surface {
    uint32_t flags;
    SDL_PixelFormat *format;
    int w, h, pitch;
    void *pixels;
} SDL_Surface;

typedef void* SDL_Cursor;
typedef void* SDL_RWops;
typedef void* SDL_Thread;
typedef void* SDL_cond;
typedef void* SDL_mutex;
typedef void* SDL_sem;

typedef uint32_t SDL_AudioDeviceID;
typedef uint16_t SDL_AudioFormat;
typedef uint32_t SDL_Keycode;
typedef uint32_t SDL_JoystickID;

/* SDL_Scancode — only the values actually used */
typedef enum {
    SDL_SCANCODE_UNKNOWN = 0,
    SDL_SCANCODE_A = 4,
    SDL_SCANCODE_B = 5,
    SDL_SCANCODE_Z = 29,
    SDL_SCANCODE_LSHIFT = 225,
    SDL_SCANCODE_RSHIFT = 229,
    SDL_SCANCODE_LCTRL = 224,
    SDL_SCANCODE_RCTRL = 228,
    SDL_SCANCODE_LALT = 226,
    SDL_SCANCODE_RALT = 230,
    SDL_SCANCODE_LGUI = 227,
    SDL_SCANCODE_RGUI = 231,
    SDL_NUM_SCANCODES = 512,
} SDL_Scancode;

/* SDLK_ constants */
#define SDLK_BACKSPACE      8
#define SDLK_TAB            9
#define SDLK_RETURN         13
#define SDLK_ESCAPE         27
#define SDLK_SPACE          32
#define SDLK_DELETE         127
#define SDLK_UP             1073741906
#define SDLK_DOWN           1073741905
#define SDLK_RIGHT          1073741903
#define SDLK_LEFT           1073741904
#define SDLK_HOME           1073741898
#define SDLK_END            1073741901
#define SDLK_PAGEUP         1073741899
#define SDLK_PAGEDOWN       1073741902
#define SDLK_F1             1073741882
#define SDLK_F12            1073741893
#define SDLK_LSHIFT         1073742049
#define SDLK_RSHIFT         1073742053
#define SDLK_LCTRL          1073742048
#define SDLK_RCTRL          1073742052
#define SDLK_LALT           1073742050
#define SDLK_RALT           1073742054
#define SDLK_LGUI           1073742051
#define SDLK_RGUI           1073742055
#define SDLK_CAPSLOCK       1073741881
#define SDLK_NUMLOCKCLEAR   1073741907
#define SDLK_KP_ENTER       1073741912
#define SDLK_KP_PLUS        1073741911
#define SDLK_KP_MINUS       1073741910

/* Key modifier flags */
#define KMOD_NONE   0
#define KMOD_LSHIFT 0x0001
#define KMOD_RSHIFT 0x0002
#define KMOD_LCTRL  0x0040
#define KMOD_RCTRL  0x0080
#define KMOD_LALT   0x0100
#define KMOD_RALT   0x0200
#define KMOD_LGUI   0x0400
#define KMOD_RGUI   0x0800
#define KMOD_SHIFT  (KMOD_LSHIFT | KMOD_RSHIFT)
#define KMOD_CTRL   (KMOD_LCTRL | KMOD_RCTRL)
#define KMOD_ALT    (KMOD_LALT | KMOD_RALT)
#define KMOD_GUI    (KMOD_LGUI | KMOD_RGUI)
typedef uint16_t SDL_Keymod;

typedef struct SDL_Keysym {
    SDL_Scancode scancode;
    SDL_Keycode  sym;
    SDL_Keymod   mod;
    uint32_t     unused;
} SDL_Keysym;

/* ── Struct types ────────────────────────────────────────────────────── */
typedef struct SDL_Rect {
    int x, y;
    int w, h;
} SDL_Rect;

typedef struct SDL_Color {
    uint8_t r, g, b, a;
} SDL_Color;

typedef struct SDL_version {
    uint8_t major, minor, patch;
} SDL_version;

typedef void (*SDL_AudioCallback)(void *userdata, uint8_t *stream, int len);

typedef struct SDL_AudioSpec {
    int               freq;
    SDL_AudioFormat   format;
    uint8_t           channels;
    uint8_t           silence;
    uint16_t          samples;
    uint16_t          padding;
    uint32_t          size;
    SDL_AudioCallback callback;
    void             *userdata;
} SDL_AudioSpec;

/* Audio status */
typedef enum {
    SDL_AUDIO_STOPPED = 0,
    SDL_AUDIO_PLAYING,
    SDL_AUDIO_PAUSED,
} SDL_AudioStatus;

/* Audio formats */
#define AUDIO_U8     0x0008
#define AUDIO_S8     0x8008
#define AUDIO_U16LSB 0x0010
#define AUDIO_S16LSB 0x8010
#define AUDIO_S16SYS 0x8010
#define AUDIO_S32SYS 0x8020
#define AUDIO_F32SYS 0x8120

/* ── Event types ─────────────────────────────────────────────────────── */
#define SDL_MOUSEBUTTONDOWN 0x401
#define SDL_MOUSEBUTTONUP   0x402
#define SDL_MOUSEMOTION     0x400
#define SDL_KEYDOWN         0x300
#define SDL_KEYUP           0x301
#define SDL_QUIT            0x100
#define SDL_DROPFILE        0x1000
#define SDL_DROPCOMPLETE    0x1003

/* Event state */
#define SDL_DISABLE 0
#define SDL_ENABLE  1
#define SDL_QUERY   -1
static inline uint8_t SDL_EventState(uint32_t type, int state) { (void)type; (void)state; return 0; }

typedef struct SDL_MouseButtonEvent {
    uint32_t type, timestamp;
    uint32_t windowID;
    uint32_t which;
    uint8_t  button, state, clicks;
    uint8_t  padding1;
    int32_t  x, y;
} SDL_MouseButtonEvent;

typedef struct SDL_KeyboardEvent {
    uint32_t    type, timestamp;
    uint32_t    windowID;
    uint8_t     state, repeat;
    uint8_t     padding2, padding3;
    SDL_Keysym  keysym;
} SDL_KeyboardEvent;

typedef union SDL_Event {
    uint32_t type;
    SDL_MouseButtonEvent button;
    SDL_KeyboardEvent    key;
    uint8_t              padding[56];
} SDL_Event;

/* ── Mouse buttons ───────────────────────────────────────────────────── */
#define SDL_BUTTON_LEFT   1
#define SDL_BUTTON_MIDDLE 2
#define SDL_BUTTON_RIGHT  3
#define SDL_BUTTON_LMASK  (1 << (SDL_BUTTON_LEFT   - 1))
#define SDL_BUTTON_RMASK  (1 << (SDL_BUTTON_RIGHT  - 1))
#define SDL_BUTTON_MMASK  (1 << (SDL_BUTTON_MIDDLE - 1))

/* ── Window/Renderer flags ───────────────────────────────────────────── */
#define SDL_WINDOW_FULLSCREEN     0x00000001
#define SDL_WINDOW_MINIMIZED      0x00000040
#define SDL_WINDOW_INPUT_FOCUS    0x00000200
#define SDL_WINDOW_MOUSE_FOCUS    0x00000400
#define SDL_WINDOW_RESIZABLE      0x00000020
#define SDL_RENDERER_PRESENTVSYNC 0x00000004

/* ── Surface flags / blend modes ─────────────────────────────────────── */
#define SDL_BLENDMODE_NONE  0
#define SDL_BLENDMODE_BLEND 1

/* ── Thread ──────────────────────────────────────────────────────────── */
#define SDLCALL /* empty — not __stdcall on non-Windows */
typedef int (SDLCALL *SDL_ThreadFunction)(void *data);

/* SDL_CreateThread: run synchronously in WASM (no real threading needed) */
static inline SDL_Thread *SDL_CreateThread(SDL_ThreadFunction fn, const char *name, void *data)
{
    (void)name;
    if (fn) fn(data);
    return (SDL_Thread *)1; /* non-NULL sentinel */
}
static inline void SDL_WaitThread(SDL_Thread *thread, int *status)
{
    (void)thread;
    if (status) *status = 0;
}
static inline void SDL_DetachThread(SDL_Thread *thread)
{
    (void)thread; /* already ran synchronously */
}
static inline SDL_Thread *SDL_CreateThreadWithStackSize(SDL_ThreadFunction fn, const char *name, size_t stackSize, void *data)
{
    (void)name; (void)stackSize;
    if (fn) fn(data);
    return (SDL_Thread *)1;
}

/* ── Timing ──────────────────────────────────────────────────────────── */
static inline uint64_t SDL_GetPerformanceCounter(void)    { return 0; }
static inline uint64_t SDL_GetPerformanceFrequency(void)  { return 1000000ULL; }
static inline uint32_t SDL_GetTicks(void)                 { return 0; }
static inline void     SDL_Delay(uint32_t ms)             { (void)ms; }

/* ── Window / Renderer no-ops ────────────────────────────────────────── */
static inline int SDL_Init(uint32_t flags)                        { (void)flags; return 0; }
static inline void SDL_Quit(void)                                 {}
static inline void SDL_GetVersion(SDL_version *v)                 { if(v){v->major=2;v->minor=0;v->patch=20;} }
static inline const char *SDL_GetError(void)                      { return ""; }
static inline void SDL_ClearError(void)                           {}

static inline SDL_Window *SDL_CreateWindow(const char *t, int x, int y, int w, int h, uint32_t f) { (void)t;(void)x;(void)y;(void)w;(void)h;(void)f; return (SDL_Window*)1; }
static inline void SDL_DestroyWindow(SDL_Window *w)               { (void)w; }
static inline uint32_t SDL_GetWindowFlags(SDL_Window *w)          { (void)w; return SDL_WINDOW_INPUT_FOCUS; }
static inline void SDL_GetWindowPosition(SDL_Window *w, int *x, int *y) { (void)w; if(x)*x=0; if(y)*y=0; }
static inline void SDL_SetWindowTitle(SDL_Window *w, const char *t) { (void)w;(void)t; }
static inline void SDL_SetWindowSize(SDL_Window *w, int x, int y) { (void)w;(void)x;(void)y; }
static inline void SDL_GetWindowSize(SDL_Window *w, int *x, int *y) { (void)w; if(x)*x=632; if(y)*y=400; }
static inline void SDL_SetWindowMinimumSize(SDL_Window *w, int x, int y) { (void)w;(void)x;(void)y; }
static inline void SDL_ShowWindow(SDL_Window *w)                  { (void)w; }
static inline void SDL_HideWindow(SDL_Window *w)                  { (void)w; }
static inline void SDL_RaiseWindow(SDL_Window *w)                 { (void)w; }
static inline bool SDL_IsTextInputActive(void)                    { return false; }
static inline void SDL_StartTextInput(void)                       {}
static inline void SDL_StopTextInput(void)                        {}
static inline int  SDL_GetDisplayDPI(int i, float *d, float *h, float *v) { (void)i;if(d)*d=96;if(h)*h=96;if(v)*v=96; return 0; }
static inline int  SDL_GetDisplayBounds(int i, SDL_Rect *r)       { (void)i; if(r){r->x=0;r->y=0;r->w=1920;r->h=1080;} return 0; }
static inline int  SDL_GetNumVideoDisplays(void)                  { return 1; }

static inline SDL_Renderer *SDL_CreateRenderer(SDL_Window *w, int i, uint32_t f) { (void)w;(void)i;(void)f; return (SDL_Renderer*)1; }
static inline void SDL_DestroyRenderer(SDL_Renderer *r)           { (void)r; }
static inline int  SDL_RenderClear(SDL_Renderer *r)               { (void)r; return 0; }
static inline int  SDL_RenderCopy(SDL_Renderer *r, SDL_Texture *t, const SDL_Rect *s, const SDL_Rect *d) { (void)r;(void)t;(void)s;(void)d; return 0; }
static inline void SDL_RenderPresent(SDL_Renderer *r)             { (void)r; }
static inline int  SDL_SetRenderDrawColor(SDL_Renderer *r, uint8_t re, uint8_t g, uint8_t b, uint8_t a) { (void)r;(void)re;(void)g;(void)b;(void)a; return 0; }
static inline int  SDL_GetRendererInfo(SDL_Renderer *r, void *i)  { (void)r;(void)i; return -1; }
static inline int  SDL_GetRendererOutputSize(SDL_Renderer *r, int *w, int *h) { (void)r;if(w)*w=632;if(h)*h=400; return 0; }
static inline int  SDL_SetHint(const char *n, const char *v)      { (void)n;(void)v; return 0; }
static inline int  SDL_SetHintWithPriority(const char *n, const char *v, int p) { (void)n;(void)v;(void)p; return 0; }

static inline SDL_Texture *SDL_CreateTexture(SDL_Renderer *r, uint32_t f, int a, int w, int h) { (void)r;(void)f;(void)a;(void)w;(void)h; return (SDL_Texture*)1; }
static inline void SDL_DestroyTexture(SDL_Texture *t)             { (void)t; }
static inline int  SDL_UpdateTexture(SDL_Texture *t, const SDL_Rect *r, const void *p, int s) { (void)t;(void)r;(void)p;(void)s; return 0; }
static inline int  SDL_LockTexture(SDL_Texture *t, const SDL_Rect *r, void **p, int *s) { (void)t;(void)r;if(p)*p=NULL;if(s)*s=0; return -1; }
static inline void SDL_UnlockTexture(SDL_Texture *t)              { (void)t; }

/* ── Surface no-ops ──────────────────────────────────────────────────── */
static inline SDL_Surface *SDL_CreateRGBSurface(uint32_t f, int w, int h, int d, uint32_t rm, uint32_t gm, uint32_t bm, uint32_t am) { (void)f;(void)w;(void)h;(void)d;(void)rm;(void)gm;(void)bm;(void)am; return NULL; }
static inline void SDL_FreeSurface(SDL_Surface *s)                { (void)s; }
static inline int  SDL_SetSurfaceBlendMode(SDL_Surface *s, int m) { (void)s;(void)m; return 0; }
static inline int  SDL_SetColorKey(SDL_Surface *s, int f, uint32_t k) { (void)s;(void)f;(void)k; return 0; }
static inline int  SDL_SetSurfaceRLE(SDL_Surface *s, int f)       { (void)s;(void)f; return 0; }
static inline int  SDL_LockSurface(SDL_Surface *s)                { (void)s; return 0; }
static inline void SDL_UnlockSurface(SDL_Surface *s)              { (void)s; }
static inline int  SDL_BlitSurface(SDL_Surface *s, const SDL_Rect *sr, SDL_Surface *d, SDL_Rect *dr) { (void)s;(void)sr;(void)d;(void)dr; return 0; }
static inline SDL_Surface *SDL_GetWindowSurface(SDL_Window *w)    { (void)w; return NULL; }
static inline int  SDL_UpdateWindowSurface(SDL_Window *w)         { (void)w; return 0; }

/* ── Cursor no-ops ───────────────────────────────────────────────────── */
static inline SDL_Cursor *SDL_CreateColorCursor(SDL_Surface *s, int h, int v) { (void)s;(void)h;(void)v; return (SDL_Cursor*)1; }
static inline SDL_Cursor *SDL_CreateCursor(const uint8_t *d, const uint8_t *m, int w, int h, int hx, int hy) { (void)d;(void)m;(void)w;(void)h;(void)hx;(void)hy; return (SDL_Cursor*)1; }
static inline SDL_Cursor *SDL_GetDefaultCursor(void)              { return (SDL_Cursor*)1; }
static inline void SDL_SetCursor(SDL_Cursor *c)                   { (void)c; }
static inline void SDL_FreeCursor(SDL_Cursor *c)                  { (void)c; }
static inline void SDL_ShowCursor(int toggle)                     { (void)toggle; }

/* ── Mouse no-ops ────────────────────────────────────────────────────── */
static inline uint32_t SDL_GetMouseState(int *x, int *y)          { if(x)*x=0; if(y)*y=0; return 0; }
static inline uint32_t SDL_GetGlobalMouseState(int *x, int *y)    { if(x)*x=0; if(y)*y=0; return 0; }
static inline void SDL_WarpMouseInWindow(SDL_Window *w, int x, int y) { (void)w;(void)x;(void)y; }
static inline void SDL_WarpMouseGlobal(int x, int y)              { (void)x;(void)y; }

/* ── Events no-ops ───────────────────────────────────────────────────── */
static inline int SDL_PollEvent(SDL_Event *e)                     { (void)e; return 0; }
static inline int SDL_WaitEvent(SDL_Event *e)                     { (void)e; return 0; }
static inline int SDL_PushEvent(SDL_Event *e)                     { (void)e; return 0; }
static inline void SDL_FlushEvents(uint32_t min, uint32_t max)    { (void)min;(void)max; }

/* ── Audio no-ops ────────────────────────────────────────────────────── */
static inline int SDL_GetNumAudioDevices(int iscapture)           { (void)iscapture; return 0; }
static inline const char *SDL_GetAudioDeviceName(int i, int c)    { (void)i;(void)c; return ""; }
static inline SDL_AudioDeviceID SDL_OpenAudioDevice(const char *d, int c, const SDL_AudioSpec *w, SDL_AudioSpec *o, int a) { (void)d;(void)c;(void)w;(void)o;(void)a; return 0; }
static inline void SDL_CloseAudioDevice(SDL_AudioDeviceID dev)    { (void)dev; }
static inline void SDL_PauseAudioDevice(SDL_AudioDeviceID dev, int p) { (void)dev;(void)p; }
static inline SDL_AudioStatus SDL_GetAudioDeviceStatus(SDL_AudioDeviceID d) { (void)d; return SDL_AUDIO_STOPPED; }
static inline void SDL_LockAudioDevice(SDL_AudioDeviceID dev)     { (void)dev; }
static inline void SDL_UnlockAudioDevice(SDL_AudioDeviceID dev)   { (void)dev; }

/* ── Sync primitives no-ops ──────────────────────────────────────────── */
static inline SDL_mutex *SDL_CreateMutex(void)                    { return (SDL_mutex*)malloc(1); }
static inline void SDL_DestroyMutex(SDL_mutex *m)                 { free(m); }
static inline int  SDL_LockMutex(SDL_mutex *m)                    { (void)m; return 0; }
static inline int  SDL_UnlockMutex(SDL_mutex *m)                  { (void)m; return 0; }
static inline SDL_sem *SDL_CreateSemaphore(uint32_t val)          { (void)val; return (SDL_sem*)malloc(4); }
static inline void SDL_DestroySemaphore(SDL_sem *s)               { free(s); }
static inline int  SDL_SemWait(SDL_sem *s)                        { (void)s; return 0; }
static inline int  SDL_SemPost(SDL_sem *s)                        { (void)s; return 0; }

/* ── Misc ────────────────────────────────────────────────────────────── */
static inline void SDL_SetMainReady(void)                         {}
static inline char *SDL_GetBasePath(void)                         { return NULL; }
static inline char *SDL_GetPrefPath(const char *o, const char *a) { (void)o;(void)a; return NULL; }
static inline void SDL_free(void *p)                              { free(p); }
static inline void *SDL_malloc(size_t s)                          { return malloc(s); }
static inline void *SDL_calloc(size_t n, size_t s)                { return calloc(n, s); }
static inline void *SDL_realloc(void *p, size_t s)                { return realloc(p, s); }
static inline char *SDL_strdup(const char *s)                     { return s ? strdup(s) : NULL; }
static inline int  SDL_snprintf(char *t, size_t mx, const char *fmt, ...) { (void)t;(void)mx;(void)fmt; return 0; }
static inline uint32_t SDL_SwapLE32(uint32_t x)                  { return x; }
static inline uint16_t SDL_SwapLE16(uint16_t x)                  { return x; }

/* Atomic operations — simplified stubs */
typedef struct { int value; } SDL_atomic_t;
static inline int  SDL_AtomicGet(SDL_atomic_t *a)                 { return a->value; }
static inline int  SDL_AtomicSet(SDL_atomic_t *a, int v)          { int old=a->value; a->value=v; return old; }
static inline int  SDL_AtomicAdd(SDL_atomic_t *a, int v)          { int old=a->value; a->value+=v; return old; }

/* SDL_RWops minimal stubs */
static inline SDL_RWops *SDL_RWFromFile(const char *f, const char *m) { (void)f;(void)m; return NULL; }
static inline void SDL_RWclose(SDL_RWops *rw)                     { (void)rw; }

/* ── SDL2 sub-headers (often included separately) ────────────────────── */
/* These are sometimes included as SDL2/SDL_syswm.h etc. — provide empty stubs */
#define SDL_SYSWM_UNKNOWN 0
typedef struct SDL_SysWMinfo { int version; } SDL_SysWMinfo;
static inline bool SDL_GetWindowWMInfo(SDL_Window *w, SDL_SysWMinfo *i) { (void)w;(void)i; return false; }
