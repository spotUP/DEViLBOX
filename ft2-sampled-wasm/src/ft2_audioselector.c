/* ft2_audioselector.c — WASM stub */
#include <stdint.h>
#include <stdbool.h>
#include "ft2_audioselector.h"

void setToDefaultAudioOutputDevice(void) {}
void setToDefaultAudioInputDevice(void)  {}
char *getAudioOutputDeviceFromConfig(void) { return (char*)""; }
char *getAudioInputDeviceFromConfig(void)  { return (char*)""; }
bool saveAudioDevicesToConfig(const char *i, const char *o) { (void)i;(void)o; return true; }
bool testAudioDeviceListsMouseDown(void)   { return false; }
void rescanAudioDevices(void)              {}
void scrollAudInputDevListUp(void)         {}
void scrollAudInputDevListDown(void)       {}
void scrollAudOutputDevListUp(void)        {}
void scrollAudOutputDevListDown(void)      {}
void sbAudOutputSetPos(uint32_t p)         { (void)p; }
void sbAudInputSetPos(uint32_t p)          { (void)p; }
void freeAudioDeviceLists(void)            {}
void freeAudioDeviceSelectorBuffers(void)  {}
