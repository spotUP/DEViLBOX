// build_juce_gui_extra.cpp — WASM build for juce_gui_extra
#include "JuceWasmConfig.h"
#include <juce_gui_extra/juce_gui_extra.h>

// Portable source files
#include <juce_gui_extra/code_editor/juce_CodeDocument.cpp>
#include <juce_gui_extra/code_editor/juce_CodeEditorComponent.cpp>
#include <juce_gui_extra/code_editor/juce_CPlusPlusCodeTokeniser.cpp>
#include <juce_gui_extra/code_editor/juce_LuaCodeTokeniser.cpp>
#include <juce_gui_extra/code_editor/juce_XMLCodeTokeniser.cpp>

#include <juce_gui_extra/documents/juce_FileBasedDocument.cpp>

#include <juce_gui_extra/misc/juce_AnimatedAppComponent.cpp>
#include <juce_gui_extra/misc/juce_BubbleMessageComponent.cpp>
#include <juce_gui_extra/misc/juce_ColourSelector.cpp>
#include <juce_gui_extra/misc/juce_KeyMappingEditorComponent.cpp>
#include <juce_gui_extra/misc/juce_LiveConstantEditor.cpp>
#include <juce_gui_extra/misc/juce_PreferencesPanel.cpp>
#include <juce_gui_extra/misc/juce_RecentlyOpenedFilesList.cpp>
#include <juce_gui_extra/misc/juce_SplashScreen.cpp>

// Disabled for WASM: SystemTrayIconComponent, WebBrowser, PushNotifications
