/* ft2_scopes.c — WASM stub: scope display handled by framebuffer overlay */
#include <stdint.h>
#include <stdbool.h>
#include "../ft2_header.h"
#include "../ft2_replayer.h"
#include "ft2_scopes.h"

lastChInstr_t lastChInstr[MAX_CHANNELS];

int32_t getSamplePositionFromScopes(uint8_t ch) { (void)ch; return 0; }
void stopAllScopes(void)                        {}
void refreshScopes(void)                        {}
bool testScopesMouseDown(void)                  { return false; }
void drawScopes(void)                           {}
void drawScopeFramework(void)                   {}
bool initScopes(void)                           { return true; }
