/* ft2_config.c — WASM stub: provides config_t with FT2 dark mode defaults */
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "ft2_config.h"

config_t config;

void resetConfig(void)
{
    memset(&config, 0, sizeof(config_t));
    config.cfg_StdPalNum  = PAL_DARK_MODE; /* dark palette */
    config.audioFreq      = DEFAULT_AUDIO_FREQ;
    config.masterVol      = 256;
    config.ptnFont        = PATT_FONT_CAPITALS;
    config.smpEd_SampleNote = 48; /* middle C for sample playback preview */
}

bool loadConfig(bool showErrorFlag)          { (void)showErrorFlag; resetConfig(); return true; }
void loadConfig2(void)                       { resetConfig(); }
bool saveConfig(bool showErrorFlag)          { (void)showErrorFlag; return true; }
void saveConfig2(void)                       {}
void loadConfigOrSetDefaults(void)           { resetConfig(); }
void showConfigScreen(void)                  {}
void hideConfigScreen(void)                  {}
void exitConfigScreen(void)                  {}
void setConfigAudioRadioButtonStates(void)   {}
void configToggleImportWarning(void)         {}
void configToggleNotYetAppliedWarning(void)  {}
void drawAudioOutputList(void)               {}
void drawAudioInputList(void)                {}
void configAmpDown(void)                     {}
void configAmpUp(void)                       {}
void rbConfigMouseNice(void)                 {}
void rbConfigMouseUgly(void)                 {}
void rbConfigMouseAwful(void)                {}
void rbConfigMouseUsable(void)               {}
void rbConfigScopeStandard(void)             {}
void rbConfigMouseBusyVogue(void)            {}
void rbConfigMouseBusyMrH(void)              {}
void rbConfigScopeLined(void)                {}
void rbConfigPatt4Chans(void)                {}
void rbConfigPatt6Chans(void)                {}
void rbConfigPatt8Chans(void)                {}
void rbConfigPatt12Chans(void)               {}
void rbConfigFontCapitals(void)              {}
void rbConfigFontLowerCase(void)             {}
void rbConfigFontFuture(void)                {}
void rbConfigFontBold(void)                  {}
void rbFileSortExt(void)                     {}
void rbFileSortName(void)                    {}
void rbWinSizeAuto(void)                     {}
void rbWinSize1x(void)                       {}
void rbWinSize2x(void)                       {}
void rbWinSize3x(void)                       {}
void rbWinSize4x(void)                       {}
void cbToggleAutoSaveConfig(void)            {}
void cbConfigVolRamp(void)                   {}
void cbConfigPattStretch(void)               {}
void cbConfigHexCount(void)                  {}
void cbConfigAccidential(void)               {}
void cbConfigShowZeroes(void)                {}
void cbConfigFramework(void)                 {}
void cbConfigLineColors(void)                {}
void cbConfigChanNums(void)                  {}
void cbConfigShowVolCol(void)                {}
void cbEnableCustomPointer(void)             {}
void cbSoftwareMouse(void)                   {}
void cbSampCutToBuff(void)                   {}
void cbPattCutToBuff(void)                   {}
void cbKillNotesAtStop(void)                 {}
void cbFileOverwriteWarn(void)               {}
void cbMultiChanRec(void)                    {}
void cbMultiChanKeyJazz(void)                {}
void cbMultiChanEdit(void)                   {}
void cbRecKeyOff(void)                       {}
void cbQuantization(void)                    {}
void cbChangePattLenInsDel(void)             {}
void cbUseOldAboutScreen(void)               {}
void cbMIDIEnable(void)                      {}
void cbMIDIRecTransp(void)                   {}
void cbMIDIRecAllChn(void)                   {}
void cbMIDIRecVelocity(void)                 {}
void cbMIDIRecAftert(void)                   {}
void cbVsyncOff(void)                        {}
void cbFullScreen(void)                      {}
void cbPixelFilter(void)                     {}
void cbStretchImage(void)                    {}
void sbAmp(uint32_t pos)                     { (void)pos; }
void sbMasterVol(uint32_t pos)               { (void)pos; }
void sbMIDISens(uint32_t pos)                { (void)pos; }
