/* ft2_pattern_ed.c — WASM stub: pattern editor not shown in sample editor view */
#include <stdint.h>
#include <stdbool.h>
#include "ft2_header.h"
#include "ft2_unicode.h"
#include "ft2_pattern_ed.h"

volatile pattMark_t pattMark;

void resetPlaybackTime(void)             {}
bool allocatePattern(uint16_t n)         { (void)n; return true; }
void killPatternIfUnused(uint16_t n)     { (void)n; }
uint8_t getMaxVisibleChannels(void)      { return 4; }
void updatePatternWidth(void)            {}
void updateAdvEdit(void)                 {}
void drawAdvEdit(void)                   {}
void hideAdvEdit(void)                   {}
void showAdvEdit(void)                   {}
void toggleAdvEdit(void)                 {}
void cursorTabLeft(void)                 {}
void cursorTabRight(void)                {}
void cursorChannelLeft(void)             {}
void cursorChannelRight(void)            {}
void cursorLeft(void)                    {}
void cursorRight(void)                   {}
void chanLeft(void)                      {}
void chanRight(void)                     {}
void showPatternEditor(void)             {}
void updateInstrumentSwitcher(void)      {}
void hidePatternEditor(void)             {}
void patternEditorExtended(void)         {}
void exitPatternEditorExtended(void)     {}
void clearPattMark(void)                 {}
void checkMarkLimits(void)               {}
void handlePatternDataMouseDown(bool b)  { (void)b; }
void togglePatternEditorExtended(void)   {}
void rowOneUpWrap(void)                  {}
void rowOneDownWrap(void)                {}
void rowUp(uint16_t n)                   { (void)n; }
void rowDown(uint16_t n)                 { (void)n; }
void keybPattMarkUp(void)                {}
void keybPattMarkDown(void)              {}
void keybPattMarkLeft(void)              {}
void keybPattMarkRight(void)             {}
void drawTranspose(void)                 {}
void showTranspose(void)                 {}
void hideTranspose(void)                 {}
void toggleTranspose(void)               {}
bool loadTrack(UNICHAR *f)               { (void)f; return false; }
bool saveTrack(UNICHAR *f)               { (void)f; return false; }
bool loadPattern(UNICHAR *f)             { (void)f; return false; }
bool savePattern(UNICHAR *f)             { (void)f; return false; }
void scrollChannelLeft(void)             {}
void scrollChannelRight(void)            {}
void setChannelScrollPos(uint32_t p)     { (void)p; }
void jumpToChannel(uint8_t n)            { (void)n; }
void sbPosEdPos(uint32_t p)              { (void)p; }
void pbPosEdPosUp(void)   {} void pbPosEdPosDown(void)  {}
void pbPosEdIns(void)     {} void pbPosEdDel(void)      {}
void pbPosEdPattUp(void)  {} void pbPosEdPattDown(void) {}
void pbPosEdLenUp(void)   {} void pbPosEdLenDown(void)  {}
void pbPosEdRepSUp(void)  {} void pbPosEdRepSDown(void) {}
void pbBPMUp(void)        {} void pbBPMDown(void)       {}
void pbSpeedUp(void)      {} void pbSpeedDown(void)     {}
void pbIncAdd(void)       {} void pbDecAdd(void)        {}
void pbAddChan(void)      {} void pbSubChan(void)       {}
void pbEditPattUp(void)   {} void pbEditPattDown(void)  {}
void pbPattLenUp(void)    {} void pbPattLenDown(void)   {}
void drawPosEdNums(int16_t n)            { (void)n; }
void drawSongLength(void)                {}
void drawSongLoopStart(void)             {}
void drawSongBPM(uint16_t v)             { (void)v; }
void drawSongSpeed(uint16_t v)           { (void)v; }
void drawEditPattern(uint16_t v)         { (void)v; }
void drawPatternLength(uint16_t v)       { (void)v; }
void drawGlobalVol(uint16_t v)           { (void)v; }
void drawIDAdd(void)                     {}
void drawPlaybackTime(void)              {}
void drawSongName(void)                  {}
void showInstrumentSwitcher(void)        {}
void hideInstrumentSwitcher(void)        {}
void changeLogoType(uint8_t t)           { (void)t; }
void changeBadgeType(uint8_t t)          { (void)t; }
void resetChannelOffset(void)            {}
void shrinkPattern(void)                 {}
void expandPattern(void)                 {}
void pbSwapInstrBank(void)               {}
void pbSetInstrBank1(void)  {} void pbSetInstrBank2(void)  {}
void pbSetInstrBank3(void)  {} void pbSetInstrBank4(void)  {}
void pbSetInstrBank5(void)  {} void pbSetInstrBank6(void)  {}
void pbSetInstrBank7(void)  {} void pbSetInstrBank8(void)  {}
void pbSetInstrBank9(void)  {} void pbSetInstrBank10(void) {}
void pbSetInstrBank11(void) {} void pbSetInstrBank12(void) {}
void pbSetInstrBank13(void) {} void pbSetInstrBank14(void) {}
void pbSetInstrBank15(void) {} void pbSetInstrBank16(void) {}
void setNewInstr(int16_t n)              { (void)n; }
void sampleListScrollUp(void)            {}
void sampleListScrollDown(void)          {}
void pbZap(void)                         {}
void sbSmpBankPos(uint32_t p)            { (void)p; }
void pbToggleLogo(void)                  {}
void pbToggleBadge(void)                 {}
