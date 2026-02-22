/* ft2_inst_ed.c — WASM stub: instrument editor handled by React wrapper */
#include <stdint.h>
#include <stdbool.h>
#include "ft2_header.h"
#include "ft2_audio.h"
#include "ft2_inst_ed.h"

void drawC4Rate(void)                               {}
void sanitizeInstrument(instr_t *ins)               { (void)ins; }
bool fileIsInstr(UNICHAR *f)                        { (void)f; return false; }
void saveInstr(UNICHAR *f, int16_t n)               { (void)f;(void)n; }
void loadInstr(UNICHAR *f)                          { (void)f; }
void copyInstr(void)                                {}
void xchgInstr(void)                                {}
void updateNewSample(void)                          {}
void updateNewInstrument(void)                      {}
void handleInstEditorRedrawing(void)                {}
void hideInstEditor(void)                           {}
void exitInstEditor(void)                           {}
void updateInstEditor(void)                         {}
void showInstEditor(void)                           {}
void toggleInstEditor(void)                         {}
void midiChDown(void)                               {}
void midiChUp(void)                                 {}
void midiPrgDown(void)                              {}
void midiPrgUp(void)                                {}
void midiBendDown(void)                             {}
void midiBendUp(void)                               {}
void sbMidiChPos(uint32_t pos)                      { (void)pos; }
void sbMidiPrgPos(uint32_t pos)                     { (void)pos; }
void sbMidiBendPos(uint32_t pos)                    { (void)pos; }
void volPreDef1(void)  {} void volPreDef2(void)  {} void volPreDef3(void)  {}
void volPreDef4(void)  {} void volPreDef5(void)  {} void volPreDef6(void)  {}
void panPreDef1(void)  {} void panPreDef2(void)  {} void panPreDef3(void)  {}
void panPreDef4(void)  {} void panPreDef5(void)  {} void panPreDef6(void)  {}
void relativeNoteOctUp(void)  {}
void relativeNoteOctDown(void){}
void relativeNoteUp(void)     {}
void relativeNoteDown(void)   {}
void volEnvAdd(void)   {} void volEnvDel(void)   {}
void volEnvSusUp(void) {} void volEnvSusDown(void) {}
void volEnvRepSUp(void)  {} void volEnvRepSDown(void)  {}
void volEnvRepEUp(void)  {} void volEnvRepEDown(void)  {}
void panEnvAdd(void)   {} void panEnvDel(void)   {}
void panEnvSusUp(void) {} void panEnvSusDown(void) {}
void panEnvRepSUp(void)  {} void panEnvRepSDown(void)  {}
void panEnvRepEUp(void)  {} void panEnvRepEDown(void)  {}
void volDown(void)     {} void volUp(void)       {}
void panDown(void)     {} void panUp(void)       {}
void ftuneDown(void)   {} void ftuneUp(void)     {}
void fadeoutDown(void) {} void fadeoutUp(void)   {}
void vibSpeedDown(void){} void vibSpeedUp(void)  {}
void vibDepthDown(void){} void vibDepthUp(void)  {}
void vibSweepDown(void){} void vibSweepUp(void)  {}
void setVolumeScroll(uint32_t pos)   { (void)pos; }
void setPanningScroll(uint32_t pos)  { (void)pos; }
void setFinetuneScroll(uint32_t pos) { (void)pos; }
void setFadeoutScroll(uint32_t pos)  { (void)pos; }
void setVibSpeedScroll(uint32_t pos) { (void)pos; }
void setVibDepthScroll(uint32_t pos) { (void)pos; }
void setVibSweepScroll(uint32_t pos) { (void)pos; }
void rbVibWaveSine(void)     {}
void rbVibWaveSquare(void)   {}
void rbVibWaveRampDown(void) {}
void rbVibWaveRampUp(void)   {}
void cbVEnv(void)    {} void cbVEnvSus(void)  {} void cbVEnvLoop(void) {}
void cbPEnv(void)    {} void cbPEnvSus(void)  {} void cbPEnvLoop(void) {}
void drawPiano(chSyncData_t *d)                           { (void)d; }
bool testInstrVolEnvMouseDown(bool mb)                    { (void)mb; return false; }
bool testInstrPanEnvMouseDown(bool mb)                    { (void)mb; return false; }
bool testPianoKeysMouseDown(bool mb)                      { (void)mb; return false; }
bool testInstrSwitcherMouseDown(void)                     { return false; }
void cbInstMidiEnable(void)                               {}
void cbInstMuteComputer(void)                             {}
void drawInstEditorExt(void)                              {}
void showInstEditorExt(void)                              {}
void hideInstEditorExt(void)                              {}
void toggleInstEditorExt(void)                            {}
