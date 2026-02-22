/* ft2_module_loader.c — WASM stub: module loading not used in sample editor */
#include <stdint.h>
#include <stdbool.h>
#include "ft2_header.h"
#include "ft2_unicode.h"
#include "ft2_module_loader.h"

bool tmpPatternEmpty(uint16_t n)                                     { (void)n; return true; }
void clearUnusedChannels(note_t *p, int16_t nr, int32_t nc)          { (void)p;(void)nr;(void)nc; }
bool allocateTmpInstr(int16_t n)                                     { (void)n; return false; }
bool allocateTmpPatt(int32_t n, uint16_t nr)                         { (void)n;(void)nr; return false; }
void loadMusic(UNICHAR *f)                                           { (void)f; }
bool loadMusicUnthreaded(UNICHAR *f, bool autoPlay)                  { (void)f;(void)autoPlay; return false; }
bool handleModuleLoadFromArg(int argc, char **argv)                  { (void)argc;(void)argv; return false; }
void loadDroppedFile(char *p, bool check)                            { (void)p;(void)check; }
void handleLoadMusicEvents(void)                                     {}
