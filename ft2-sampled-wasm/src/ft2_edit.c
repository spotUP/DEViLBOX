/* ft2_edit.c — WASM stub: pattern editing not used in sample editor */
#include <stdint.h>
#include <stdbool.h>
#include "ft2_edit.h"

bool handleEditKeys(SDL_Keycode kc, SDL_Scancode sc) { (void)kc;(void)sc; return false; }
void recordNote(uint8_t n, int8_t v)       { (void)n;(void)v; }
void testNoteKeysRelease(SDL_Scancode sc)   { (void)sc; }
void writeToMacroSlot(uint8_t s)            { (void)s; }
void writeFromMacroSlot(uint8_t s)          { (void)s; }
void insertPatternNote(void)                {}
void insertPatternLine(void)                {}
void deletePatternNote(void)                {}
void deletePatternLine(void)                {}
void scaleFadeVolumeTrack(void)             {}
void scaleFadeVolumePattern(void)           {}
void scaleFadeVolumeBlock(void)             {}
void toggleCopyMaskEnable(void)             {}
void toggleCopyMask0(void)  {} void toggleCopyMask1(void)  {} void toggleCopyMask2(void)  {}
void toggleCopyMask3(void)  {} void toggleCopyMask4(void)  {}
void togglePasteMask0(void) {} void togglePasteMask1(void) {} void togglePasteMask2(void) {}
void togglePasteMask3(void) {} void togglePasteMask4(void) {}
void toggleTranspMask0(void){} void toggleTranspMask1(void){} void toggleTranspMask2(void){}
void toggleTranspMask3(void){} void toggleTranspMask4(void){}
void trackTranspCurInsUp(void)    {} void trackTranspCurInsDn(void)    {}
void trackTranspCurIns12Up(void)  {} void trackTranspCurIns12Dn(void)  {}
void trackTranspAllInsUp(void)    {} void trackTranspAllInsDn(void)    {}
void trackTranspAllIns12Up(void)  {} void trackTranspAllIns12Dn(void)  {}
void pattTranspCurInsUp(void)     {} void pattTranspCurInsDn(void)     {}
void pattTranspCurIns12Up(void)   {} void pattTranspCurIns12Dn(void)   {}
void pattTranspAllInsUp(void)     {} void pattTranspAllInsDn(void)     {}
void pattTranspAllIns12Up(void)   {} void pattTranspAllIns12Dn(void)   {}
void songTranspCurInsUp(void)     {} void songTranspCurInsDn(void)     {}
void songTranspCurIns12Up(void)   {} void songTranspCurIns12Dn(void)   {}
void songTranspAllInsUp(void)     {} void songTranspAllInsDn(void)     {}
void songTranspAllIns12Up(void)   {} void songTranspAllIns12Dn(void)   {}
void blockTranspCurInsUp(void)    {} void blockTranspCurInsDn(void)    {}
void blockTranspCurIns12Up(void)  {} void blockTranspCurIns12Dn(void)  {}
void blockTranspAllInsUp(void)    {} void blockTranspAllInsDn(void)    {}
void blockTranspAllIns12Up(void)  {} void blockTranspAllIns12Dn(void)  {}
void cutTrack(void)     {} void copyTrack(void)    {} void pasteTrack(void)   {}
void cutPattern(void)   {} void copyPattern(void)  {} void pastePattern(void) {}
void cutBlock(void)     {} void copyBlock(void)    {} void pasteBlock(void)   {}
void remapBlock(void)   {} void remapTrack(void)   {}
void remapPattern(void) {} void remapSong(void)    {}
