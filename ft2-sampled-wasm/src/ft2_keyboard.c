/* ft2_keyboard.c — WASM stub: keyboard handled by JS bridge */
#include <stdint.h>
#include <stdbool.h>
#include "ft2_keyboard.h"

keyb_t keyb;

int8_t  scancodeKeyToNote(SDL_Scancode s)                           { (void)s; return -1; }
void    keyUpHandler(SDL_Scancode s, SDL_Keycode k)                 { (void)s;(void)k; }
void    keyDownHandler(SDL_Scancode s, SDL_Keycode k, bool rep)     { (void)s;(void)k;(void)rep; }
void    readKeyModifiers(void)                                      {}
