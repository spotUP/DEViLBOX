#pragma once

#ifdef __APPLE__
#include <AudioToolbox/AudioToolbox.h>

bool showAUPluginGUI(AudioUnit unit, const char* pluginName, int slot);
void closeAUPluginGUI(int slot);
void pollGUI();
#endif
