// DexedJuceCompat.h — JUCE 6/7 → 8 compatibility shims for Dexed
// Dexed was written for JUCE 6; our lib is JUCE 8. This header
// provides inline replacements for removed/deprecated APIs.
#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace DexedCompat
{
    // PopupMenu::show() was removed in JUCE 7+
    // Returns 0 (no selection) — popup menus are non-essential in WASM UI
    inline int showPopupMenu(juce::PopupMenu& menu) {
        (void)menu;
        return 0;
    }

    // AlertWindow::showMessageBox() was removed in JUCE 8
    inline void showMessageBox(const juce::String& title, const juce::String& message) {
        // Log to console instead of showing a dialog
        EM_ASM({
            console.log("[DexedUI] Alert: " + UTF8ToString($0) + " - " + UTF8ToString($1));
        }, title.toRawUTF8(), message.toRawUTF8());
    }
}
