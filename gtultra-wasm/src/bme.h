/* bme.h — Stub for WASM build (replaces BME/SDL types) */
#ifndef BME_H
#define BME_H

#include <stdint.h>
#include <stdbool.h>

/* SDL-compatible typedefs */
typedef uint8_t  Uint8;
typedef uint16_t Uint16;
typedef uint32_t Uint32;
typedef int8_t   Sint8;
typedef int16_t  Sint16;
typedef int32_t  Sint32;

/* BME audio constants */
#define SIXTEENBIT 1
#define STEREO 2

/* BME audio system stubs */
static int snd_bpmtempo = 125;
static int snd_mixrate = 44100;
static int snd_bpmcount = 0;
static int snd_buffersize = 2048;
typedef void (*snd_player_t)(void);
static snd_player_t snd_player = NULL;

static inline int snd_init(unsigned mixrate, unsigned mode, unsigned bufferlength,
                            unsigned channels, unsigned usedirectsound) {
    (void)mode; (void)bufferlength; (void)channels; (void)usedirectsound;
    snd_mixrate = mixrate;
    return 1;
}
static inline void snd_uninit(void) {}

/* SDL stubs */
typedef int SDL_TimerID;
typedef void* SDL_mutex;
typedef void* SDL_Thread;
typedef int SDL_LogPriority;

#define SDL_NUM_SCANCODES 512
#define SDL_INIT_AUDIO 0x10
#define SDL_INIT_TIMER 0x20

/* SDL scancodes (subset needed by KEY_* defines) */
#define SDL_SCANCODE_BACKSPACE 42
#define SDL_SCANCODE_CAPSLOCK  57
#define SDL_SCANCODE_RETURN    40
#define SDL_SCANCODE_ESCAPE    41
#define SDL_SCANCODE_LALT      226
#define SDL_SCANCODE_LCTRL     224
#define SDL_SCANCODE_RALT      230
#define SDL_SCANCODE_RCTRL     228
#define SDL_SCANCODE_LSHIFT    225
#define SDL_SCANCODE_RSHIFT    229
#define SDL_SCANCODE_NUMLOCKCLEAR 83
#define SDL_SCANCODE_SCROLLLOCK 71
#define SDL_SCANCODE_SPACE     44
#define SDL_SCANCODE_TAB       43
#define SDL_SCANCODE_F1  58
#define SDL_SCANCODE_F2  59
#define SDL_SCANCODE_F3  60
#define SDL_SCANCODE_F4  61
#define SDL_SCANCODE_F5  62
#define SDL_SCANCODE_F6  63
#define SDL_SCANCODE_F7  64
#define SDL_SCANCODE_F8  65
#define SDL_SCANCODE_F9  66
#define SDL_SCANCODE_F10 67
#define SDL_SCANCODE_F11 68
#define SDL_SCANCODE_F12 69
#define SDL_SCANCODE_A 4
#define SDL_SCANCODE_B 5
#define SDL_SCANCODE_C 6
#define SDL_SCANCODE_D 7
#define SDL_SCANCODE_E 8
#define SDL_SCANCODE_F 9
#define SDL_SCANCODE_G 10
#define SDL_SCANCODE_H 11
#define SDL_SCANCODE_I 12
#define SDL_SCANCODE_J 13
#define SDL_SCANCODE_K 14
#define SDL_SCANCODE_L 15
#define SDL_SCANCODE_M 16
#define SDL_SCANCODE_N 17
#define SDL_SCANCODE_O 18
#define SDL_SCANCODE_P 19
#define SDL_SCANCODE_Q 20
#define SDL_SCANCODE_R 21
#define SDL_SCANCODE_S 22
#define SDL_SCANCODE_T 23
#define SDL_SCANCODE_U 24
#define SDL_SCANCODE_V 25
#define SDL_SCANCODE_W 26
#define SDL_SCANCODE_X 27
#define SDL_SCANCODE_Y 28
#define SDL_SCANCODE_Z 29
#define SDL_SCANCODE_1 30
#define SDL_SCANCODE_2 31
#define SDL_SCANCODE_3 32
#define SDL_SCANCODE_4 33
#define SDL_SCANCODE_5 34
#define SDL_SCANCODE_6 35
#define SDL_SCANCODE_7 36
#define SDL_SCANCODE_8 37
#define SDL_SCANCODE_9 38
#define SDL_SCANCODE_0 39
#define SDL_SCANCODE_MINUS 45
#define SDL_SCANCODE_EQUALS 46
#define SDL_SCANCODE_LEFTBRACKET 47
#define SDL_SCANCODE_RIGHTBRACKET 48
#define SDL_SCANCODE_SEMICOLON 51
#define SDL_SCANCODE_APOSTROPHE 52
#define SDL_SCANCODE_GRAVE 53
#define SDL_SCANCODE_COMMA 54
#define SDL_SCANCODE_PERIOD 55
#define SDL_SCANCODE_SLASH 56
#define SDL_SCANCODE_BACKSLASH 49
#define SDL_SCANCODE_DELETE 76
#define SDL_SCANCODE_DOWN  81
#define SDL_SCANCODE_END   77
#define SDL_SCANCODE_HOME  74
#define SDL_SCANCODE_INSERT 73
#define SDL_SCANCODE_LEFT  80
#define SDL_SCANCODE_PAGEDOWN 78
#define SDL_SCANCODE_PAGEUP 75
#define SDL_SCANCODE_RIGHT 79
#define SDL_SCANCODE_UP    82
#define SDL_SCANCODE_LGUI  227
#define SDL_SCANCODE_RGUI  231
#define SDL_SCANCODE_MENU  118
#define SDL_SCANCODE_PAUSE 72
#define SDL_SCANCODE_KP_DIVIDE   84
#define SDL_SCANCODE_KP_MULTIPLY 85
#define SDL_SCANCODE_KP_PLUS     87
#define SDL_SCANCODE_KP_MINUS    86
#define SDL_SCANCODE_KP0  98
#define SDL_SCANCODE_KP1  89
#define SDL_SCANCODE_KP2  90
#define SDL_SCANCODE_KP3  91
#define SDL_SCANCODE_KP4  92
#define SDL_SCANCODE_KP5  93
#define SDL_SCANCODE_KP6  94
#define SDL_SCANCODE_KP7  95
#define SDL_SCANCODE_KP8  96
#define SDL_SCANCODE_KP9  97
#define SDL_SCANCODE_KP_ENTER   88
#define SDL_SCANCODE_KP_EQUALS  103
#define SDL_SCANCODE_KP_PERIOD  99

/* BME KEY_* macros (map to SDL scancodes) */
#define KEY_BACKSPACE    SDL_SCANCODE_BACKSPACE
#define KEY_CAPSLOCK     SDL_SCANCODE_CAPSLOCK
#define KEY_ENTER        SDL_SCANCODE_RETURN
#define KEY_ESC          SDL_SCANCODE_ESCAPE
#define KEY_ALT          SDL_SCANCODE_LALT
#define KEY_CTRL         SDL_SCANCODE_LCTRL
#define KEY_LEFTCTRL     SDL_SCANCODE_LCTRL
#define KEY_RIGHTALT     SDL_SCANCODE_RALT
#define KEY_RIGHTCTRL    SDL_SCANCODE_RCTRL
#define KEY_LEFTSHIFT    SDL_SCANCODE_LSHIFT
#define KEY_RIGHTSHIFT   SDL_SCANCODE_RSHIFT
#define KEY_NUMLOCK      SDL_SCANCODE_NUMLOCKCLEAR
#define KEY_SCROLLLOCK   SDL_SCANCODE_SCROLLLOCK
#define KEY_SPACE        SDL_SCANCODE_SPACE
#define KEY_TAB          SDL_SCANCODE_TAB
#define KEY_F1  SDL_SCANCODE_F1
#define KEY_F2  SDL_SCANCODE_F2
#define KEY_F3  SDL_SCANCODE_F3
#define KEY_F4  SDL_SCANCODE_F4
#define KEY_F5  SDL_SCANCODE_F5
#define KEY_F6  SDL_SCANCODE_F6
#define KEY_F7  SDL_SCANCODE_F7
#define KEY_F8  SDL_SCANCODE_F8
#define KEY_F9  SDL_SCANCODE_F9
#define KEY_F10 SDL_SCANCODE_F10
#define KEY_F11 SDL_SCANCODE_F11
#define KEY_F12 SDL_SCANCODE_F12
#define KEY_A SDL_SCANCODE_A
#define KEY_B SDL_SCANCODE_B
#define KEY_C SDL_SCANCODE_C
#define KEY_D SDL_SCANCODE_D
#define KEY_E SDL_SCANCODE_E
#define KEY_F SDL_SCANCODE_F
#define KEY_G SDL_SCANCODE_G
#define KEY_H SDL_SCANCODE_H
#define KEY_I SDL_SCANCODE_I
#define KEY_J SDL_SCANCODE_J
#define KEY_K SDL_SCANCODE_K
#define KEY_L SDL_SCANCODE_L
#define KEY_M SDL_SCANCODE_M
#define KEY_N SDL_SCANCODE_N
#define KEY_O SDL_SCANCODE_O
#define KEY_P SDL_SCANCODE_P
#define KEY_Q SDL_SCANCODE_Q
#define KEY_R SDL_SCANCODE_R
#define KEY_S SDL_SCANCODE_S
#define KEY_T SDL_SCANCODE_T
#define KEY_U SDL_SCANCODE_U
#define KEY_V SDL_SCANCODE_V
#define KEY_W SDL_SCANCODE_W
#define KEY_X SDL_SCANCODE_X
#define KEY_Y SDL_SCANCODE_Y
#define KEY_Z SDL_SCANCODE_Z
#define KEY_1 SDL_SCANCODE_1
#define KEY_2 SDL_SCANCODE_2
#define KEY_3 SDL_SCANCODE_3
#define KEY_4 SDL_SCANCODE_4
#define KEY_5 SDL_SCANCODE_5
#define KEY_6 SDL_SCANCODE_6
#define KEY_7 SDL_SCANCODE_7
#define KEY_8 SDL_SCANCODE_8
#define KEY_9 SDL_SCANCODE_9
#define KEY_0 SDL_SCANCODE_0
#define KEY_MINUS    SDL_SCANCODE_MINUS
#define KEY_EQUAL    SDL_SCANCODE_EQUALS
#define KEY_BRACKETL SDL_SCANCODE_LEFTBRACKET
#define KEY_BRACKETR SDL_SCANCODE_RIGHTBRACKET
#define KEY_SEMICOLON SDL_SCANCODE_SEMICOLON
#define KEY_APOST1   SDL_SCANCODE_APOSTROPHE
#define KEY_APOST2   SDL_SCANCODE_GRAVE
#define KEY_COMMA    SDL_SCANCODE_COMMA
#define KEY_COLON    SDL_SCANCODE_PERIOD
#define KEY_PERIOD   SDL_SCANCODE_PERIOD
#define KEY_SLASH    SDL_SCANCODE_SLASH
#define KEY_BACKSLASH SDL_SCANCODE_BACKSLASH
#define KEY_DEL      SDL_SCANCODE_DELETE
#define KEY_DOWN     SDL_SCANCODE_DOWN
#define KEY_END      SDL_SCANCODE_END
#define KEY_HOME     SDL_SCANCODE_HOME
#define KEY_INS      SDL_SCANCODE_INSERT
#define KEY_LEFT     SDL_SCANCODE_LEFT
#define KEY_PGDN     SDL_SCANCODE_PAGEDOWN
#define KEY_PGUP     SDL_SCANCODE_PAGEUP
#define KEY_RIGHT    SDL_SCANCODE_RIGHT
#define KEY_UP       SDL_SCANCODE_UP
#define KEY_WINDOWSL SDL_SCANCODE_LGUI
#define KEY_WINDOWSR SDL_SCANCODE_RGUI
#define KEY_MENU     SDL_SCANCODE_MENU
#define KEY_PAUSE    SDL_SCANCODE_PAUSE
#define KEY_KPDIVIDE   SDL_SCANCODE_KP_DIVIDE
#define KEY_KPMULTIPLY SDL_SCANCODE_KP_MULTIPLY
#define KEY_KPPLUS     SDL_SCANCODE_KP_PLUS
#define KEY_KPMINUS    SDL_SCANCODE_KP_MINUS
#define KEY_KP0 SDL_SCANCODE_KP0
#define KEY_KP1 SDL_SCANCODE_KP1
#define KEY_KP2 SDL_SCANCODE_KP2
#define KEY_KP3 SDL_SCANCODE_KP3
#define KEY_KP4 SDL_SCANCODE_KP4
#define KEY_KP5 SDL_SCANCODE_KP5
#define KEY_KP6 SDL_SCANCODE_KP6
#define KEY_KP7 SDL_SCANCODE_KP7
#define KEY_KP8 SDL_SCANCODE_KP8
#define KEY_KP9 SDL_SCANCODE_KP9
#define KEY_KPUP    SDL_SCANCODE_KP8
#define KEY_KPDOWN  SDL_SCANCODE_KP2
#define KEY_KPLEFT  SDL_SCANCODE_KP4
#define KEY_KPRIGHT SDL_SCANCODE_KP6
#define KEY_KPENTER  SDL_SCANCODE_KP_ENTER
#define KEY_KPEQUALS SDL_SCANCODE_KP_EQUALS
#define KEY_KPPERIOD SDL_SCANCODE_KP_PERIOD

/* BME window system stubs */
extern int win_quitted;
extern unsigned char win_keystate[512];

static inline int SDL_Init(int flags) { (void)flags; return 0; }
static inline Uint32 SDL_GetTicks(void) { return 0; }
static inline void SDL_Delay(Uint32 ms) { (void)ms; }
static inline SDL_mutex* SDL_CreateMutex(void) { return (SDL_mutex*)1; }
static inline int SDL_LockMutex(SDL_mutex* m) { (void)m; return 0; }
static inline int SDL_UnlockMutex(SDL_mutex* m) { (void)m; return 0; }
static inline void SDL_DestroyMutex(SDL_mutex* m) { (void)m; }
static inline SDL_TimerID SDL_AddTimer(Uint32 interval, void* callback, void* param) {
    (void)interval; (void)callback; (void)param; return 1;
}
static inline int SDL_RemoveTimer(SDL_TimerID id) { (void)id; return 1; }
static inline SDL_Thread* SDL_CreateThread(void* fn, const char* name, void* data) {
    (void)fn; (void)name; (void)data; return (SDL_Thread*)1;
}
static inline void SDL_WaitThread(SDL_Thread* t, int* status) { (void)t; (void)status; }
static inline void SDL_Log(const char* fmt, ...) { (void)fmt; }
static inline void SDL_LogSetOutputFunction(void* callback, void* userdata) {
    (void)callback; (void)userdata;
}

/* Audio callback types */
typedef struct {
    int freq;
    Uint16 format;
    Uint8 channels;
    Uint16 samples;
    Uint32 size;
    void (*callback)(void *userdata, Uint8 *stream, int len);
    void *userdata;
} SDL_AudioSpec;

#define AUDIO_S16SYS 0x8010

static inline int SDL_OpenAudio(SDL_AudioSpec* desired, SDL_AudioSpec* obtained) {
    (void)desired; (void)obtained; return 0;
}
static inline void SDL_PauseAudio(int pause_on) { (void)pause_on; }
static inline void SDL_CloseAudio(void) {}
static inline void SDL_LockAudio(void) {}
static inline void SDL_UnlockAudio(void) {}

#endif /* BME_H */
