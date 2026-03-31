// build_juce_gui_basics.cpp — WASM build for juce_gui_basics
// Manual include of all portable .cpp files + WASM stubs for windowing.
// We CANNOT use JUCE_LINUX trick because Linux native code needs X11.
#include "JuceWasmConfig.h"

#define JUCE_CORE_INCLUDE_NATIVE_HEADERS 1

#include <juce_gui_basics/juce_gui_basics.h>

// Include detail headers (same order as real unity build)
#include <juce_graphics/native/juce_EventTracing.h>
#include <juce_gui_basics/detail/juce_AccessibilityHelpers.h>
#include <juce_gui_basics/detail/juce_ButtonAccessibilityHandler.h>
#include <juce_gui_basics/detail/juce_ScalingHelpers.h>
#include <juce_gui_basics/detail/juce_ComponentHelpers.h>
#include <juce_gui_basics/detail/juce_FocusHelpers.h>
#include <juce_gui_basics/detail/juce_FocusRestorer.h>
#include <juce_gui_basics/detail/juce_ViewportHelpers.h>
#include <juce_gui_basics/detail/juce_LookAndFeelHelpers.h>
#include <juce_gui_basics/detail/juce_PointerState.h>
#include <juce_gui_basics/detail/juce_CustomMouseCursorInfo.h>
#include <juce_gui_basics/detail/juce_MouseInputSourceImpl.h>
#include <juce_gui_basics/detail/juce_MouseInputSourceList.h>
#include <juce_gui_basics/detail/juce_ToolbarItemDragAndDropOverlayComponent.h>
#include <juce_gui_basics/detail/juce_ScopedMessageBoxInterface.h>
#include <juce_gui_basics/detail/juce_ScopedMessageBoxImpl.h>
#include <juce_gui_basics/detail/juce_ScopedContentSharerInterface.h>
#include <juce_gui_basics/detail/juce_ScopedContentSharerImpl.h>
#include <juce_gui_basics/detail/juce_WindowingHelpers.h>
#include <juce_gui_basics/detail/juce_AlertWindowHelpers.h>
#include <juce_gui_basics/detail/juce_TopLevelWindowManager.h>
#include <juce_gui_basics/detail/juce_StandardCachedComponentImage.h>

// ============================================================================
// WASM PlatformSpecificHandle for MouseCursor (must be before MouseCursor.cpp)
// ============================================================================
namespace juce {
class MouseCursor::PlatformSpecificHandle {
public:
    explicit PlatformSpecificHandle (const MouseCursor::StandardCursorType) {}
    explicit PlatformSpecificHandle (const detail::CustomMouseCursorInfo&) {}
    static void showInWindow (PlatformSpecificHandle*, ComponentPeer*) {}
    JUCE_DECLARE_NON_COPYABLE (PlatformSpecificHandle)
    JUCE_DECLARE_NON_MOVEABLE (PlatformSpecificHandle)
};
} // namespace juce

// ============================================================================
// All portable source files (exact order from juce_gui_basics.cpp)
// ============================================================================
#include <juce_gui_basics/accessibility/juce_AccessibilityHandler.cpp>
#include <juce_gui_basics/application/juce_Application.cpp>
#include <juce_gui_basics/buttons/juce_ArrowButton.cpp>
#include <juce_gui_basics/buttons/juce_Button.cpp>
#include <juce_gui_basics/buttons/juce_DrawableButton.cpp>
#include <juce_gui_basics/buttons/juce_HyperlinkButton.cpp>
#include <juce_gui_basics/buttons/juce_ImageButton.cpp>
#include <juce_gui_basics/buttons/juce_ShapeButton.cpp>
#include <juce_gui_basics/buttons/juce_TextButton.cpp>
#include <juce_gui_basics/buttons/juce_ToggleButton.cpp>
#include <juce_gui_basics/buttons/juce_ToolbarButton.cpp>
#include <juce_gui_basics/commands/juce_ApplicationCommandInfo.cpp>
#include <juce_gui_basics/commands/juce_ApplicationCommandManager.cpp>
#include <juce_gui_basics/commands/juce_ApplicationCommandTarget.cpp>
#include <juce_gui_basics/commands/juce_KeyPressMappingSet.cpp>
#include <juce_gui_basics/components/juce_Component.cpp>
#include <juce_gui_basics/components/juce_ComponentListener.cpp>
#include <juce_gui_basics/components/juce_FocusTraverser.cpp>
#include <juce_gui_basics/components/juce_ModalComponentManager.cpp>
#include <juce_gui_basics/desktop/juce_Desktop.cpp>
#include <juce_gui_basics/desktop/juce_Displays.cpp>
#include <juce_gui_basics/drawables/juce_Drawable.cpp>
#include <juce_gui_basics/drawables/juce_DrawableComposite.cpp>
#include <juce_gui_basics/drawables/juce_DrawableImage.cpp>
#include <juce_gui_basics/drawables/juce_DrawablePath.cpp>
#include <juce_gui_basics/drawables/juce_DrawableRectangle.cpp>
#include <juce_gui_basics/drawables/juce_DrawableShape.cpp>
#include <juce_gui_basics/drawables/juce_DrawableText.cpp>
#include <juce_gui_basics/drawables/juce_SVGParser.cpp>
#include <juce_gui_basics/filebrowser/juce_ContentSharer.cpp>
#include <juce_gui_basics/filebrowser/juce_DirectoryContentsDisplayComponent.cpp>
#include <juce_gui_basics/filebrowser/juce_DirectoryContentsList.cpp>
#include <juce_gui_basics/filebrowser/juce_FileBrowserComponent.cpp>
#include <juce_gui_basics/filebrowser/juce_FileChooser.cpp>
#include <juce_gui_basics/filebrowser/juce_FileChooserDialogBox.cpp>
#include <juce_gui_basics/filebrowser/juce_FileListComponent.cpp>
#include <juce_gui_basics/filebrowser/juce_FilenameComponent.cpp>
#include <juce_gui_basics/filebrowser/juce_FileSearchPathListComponent.cpp>
#include <juce_gui_basics/filebrowser/juce_FileTreeComponent.cpp>
#include <juce_gui_basics/filebrowser/juce_ImagePreviewComponent.cpp>
#include <juce_gui_basics/keyboard/juce_CaretComponent.cpp>
#include <juce_gui_basics/keyboard/juce_KeyboardFocusTraverser.cpp>
#include <juce_gui_basics/keyboard/juce_KeyListener.cpp>
#include <juce_gui_basics/keyboard/juce_KeyPress.cpp>
#include <juce_gui_basics/keyboard/juce_ModifierKeys.cpp>
#include <juce_gui_basics/layout/juce_ComponentAnimator.cpp>
#include <juce_gui_basics/layout/juce_ComponentBoundsConstrainer.cpp>
#include <juce_gui_basics/layout/juce_ComponentBuilder.cpp>
#include <juce_gui_basics/layout/juce_ComponentMovementWatcher.cpp>
#include <juce_gui_basics/layout/juce_ConcertinaPanel.cpp>
#include <juce_gui_basics/layout/juce_FlexBox.cpp>
#include <juce_gui_basics/layout/juce_Grid.cpp>
#include <juce_gui_basics/layout/juce_GridItem.cpp>
#include <juce_gui_basics/layout/juce_GroupComponent.cpp>
#include <juce_gui_basics/layout/juce_MultiDocumentPanel.cpp>
#include <juce_gui_basics/layout/juce_ResizableBorderComponent.cpp>
#include <juce_gui_basics/layout/juce_ResizableCornerComponent.cpp>
#include <juce_gui_basics/layout/juce_ResizableEdgeComponent.cpp>
#include <juce_gui_basics/layout/juce_ScrollBar.cpp>
#include <juce_gui_basics/layout/juce_SidePanel.cpp>
#include <juce_gui_basics/layout/juce_StretchableLayoutManager.cpp>
#include <juce_gui_basics/layout/juce_StretchableLayoutResizerBar.cpp>
#include <juce_gui_basics/layout/juce_StretchableObjectResizer.cpp>
#include <juce_gui_basics/layout/juce_TabbedButtonBar.cpp>
#include <juce_gui_basics/layout/juce_TabbedComponent.cpp>
#include <juce_gui_basics/layout/juce_Viewport.cpp>
#include <juce_gui_basics/lookandfeel/juce_LookAndFeel.cpp>
#include <juce_gui_basics/lookandfeel/juce_LookAndFeel_V1.cpp>
#include <juce_gui_basics/lookandfeel/juce_LookAndFeel_V2.cpp>
#include <juce_gui_basics/lookandfeel/juce_LookAndFeel_V3.cpp>
#include <juce_gui_basics/lookandfeel/juce_LookAndFeel_V4.cpp>
#include <juce_gui_basics/menus/juce_BurgerMenuComponent.cpp>
#include <juce_gui_basics/menus/juce_MenuBarComponent.cpp>
#include <juce_gui_basics/menus/juce_MenuBarModel.cpp>
#include <juce_gui_basics/menus/juce_PopupMenu.cpp>
#include <juce_gui_basics/misc/juce_BubbleComponent.cpp>
#include <juce_gui_basics/misc/juce_DropShadower.cpp>
#include <juce_gui_basics/misc/juce_FocusOutline.cpp>
#include <juce_gui_basics/mouse/juce_ComponentDragger.cpp>
#include <juce_gui_basics/mouse/juce_DragAndDropContainer.cpp>
#include <juce_gui_basics/mouse/juce_MouseCursor.cpp>
#include <juce_gui_basics/mouse/juce_MouseEvent.cpp>
#include <juce_gui_basics/mouse/juce_MouseInactivityDetector.cpp>
#include <juce_gui_basics/mouse/juce_MouseInputSource.cpp>
#include <juce_gui_basics/mouse/juce_MouseListener.cpp>
#include <juce_gui_basics/properties/juce_BooleanPropertyComponent.cpp>
#include <juce_gui_basics/properties/juce_ButtonPropertyComponent.cpp>
#include <juce_gui_basics/properties/juce_ChoicePropertyComponent.cpp>
#include <juce_gui_basics/properties/juce_MultiChoicePropertyComponent.cpp>
#include <juce_gui_basics/properties/juce_PropertyComponent.cpp>
#include <juce_gui_basics/properties/juce_PropertyPanel.cpp>
#include <juce_gui_basics/properties/juce_SliderPropertyComponent.cpp>
#include <juce_gui_basics/properties/juce_TextPropertyComponent.cpp>
#include <juce_gui_basics/widgets/juce_ComboBox.cpp>
#include <juce_gui_basics/widgets/juce_ImageComponent.cpp>
#include <juce_gui_basics/widgets/juce_Label.cpp>
#include <juce_gui_basics/widgets/juce_ListBox.cpp>
#include <juce_gui_basics/widgets/juce_ProgressBar.cpp>
#include <juce_gui_basics/widgets/juce_Slider.cpp>
#include <juce_gui_basics/widgets/juce_TableHeaderComponent.cpp>
#include <juce_gui_basics/widgets/juce_TableListBox.cpp>
// TextEditorModel must come before TextEditor (defines TextEditorStorage)
#include <juce_gui_basics/widgets/juce_TextEditorModel.cpp>
#include <juce_gui_basics/widgets/juce_TextEditor.cpp>
#include <juce_gui_basics/widgets/juce_Toolbar.cpp>
#include <juce_gui_basics/widgets/juce_ToolbarItemComponent.cpp>
#include <juce_gui_basics/widgets/juce_ToolbarItemPalette.cpp>
#include <juce_gui_basics/widgets/juce_TreeView.cpp>
// NativeMessageBox must come before AlertWindow (defines ResultCodeMappingMode)
#include <juce_gui_basics/windows/juce_NativeMessageBox.cpp>
#include <juce_gui_basics/windows/juce_AlertWindow.cpp>
#include <juce_gui_basics/windows/juce_CallOutBox.cpp>
#include <juce_gui_basics/windows/juce_ComponentPeer.cpp>
#include <juce_gui_basics/windows/juce_DialogWindow.cpp>
#include <juce_gui_basics/windows/juce_DocumentWindow.cpp>
#include <juce_gui_basics/windows/juce_ResizableWindow.cpp>
#include <juce_gui_basics/windows/juce_ThreadWithProgressWindow.cpp>
#include <juce_gui_basics/windows/juce_TooltipWindow.cpp>
#include <juce_gui_basics/windows/juce_TopLevelWindow.cpp>

// ============================================================================
// WASM stubs for platform-specific windowing
// ============================================================================
namespace juce {

// Desktop stubs
bool Desktop::canUseSemiTransparentWindows() noexcept { return false; }
Desktop::DisplayOrientation Desktop::getCurrentOrientation() const { return upright; }
double Desktop::getDefaultMasterScale() { return 1.0; }

// AccessibilityNativeImpl stub (platform-specific)
struct AccessibilityHandler::AccessibilityNativeImpl {};

// NativeDarkModeChangeDetector stub
struct Desktop::NativeDarkModeChangeDetectorImpl {};

// ComponentPeer stub
class WASMComponentPeer : public ComponentPeer {
public:
    WASMComponentPeer (Component& comp, int sf) : ComponentPeer (comp, sf) {}
    void* getNativeHandle() const override { return nullptr; }
    void setVisible (bool) override {}
    void setTitle (const String&) override {}
    void setBounds (const Rectangle<int>& r, bool) override { bounds = r; }
    Rectangle<int> getBounds() const override { return bounds; }
    Point<float> localToGlobal (Point<float> p) override { return p + bounds.getPosition().toFloat(); }
    Point<float> globalToLocal (Point<float> p) override { return p - bounds.getPosition().toFloat(); }
    void setMinimised (bool) override {}
    bool isMinimised() const override { return false; }
    bool isShowing() const override { return true; }
    void setFullScreen (bool) override {}
    bool isFullScreen() const override { return false; }
    bool contains (Point<int> p, bool) const override { return bounds.withZeroOrigin().contains(p); }
    OptionalBorderSize getFrameSizeIfPresent() const override { return ComponentPeer::OptionalBorderSize { BorderSize<int>() }; }
    BorderSize<int> getFrameSize() const override { return {}; }
    bool setAlwaysOnTop (bool) override { return false; }
    void toFront (bool) override {}
    void toBehind (ComponentPeer*) override {}
    bool isFocused() const override { return true; }
    void grabFocus() override {}
    void setIcon (const Image&) override {}
    StringArray getAvailableRenderingEngines() override { return { "Software" }; }
    void repaint (const Rectangle<int>&) override {}
    void performAnyPendingRepaintsNow() override {}
    void setAlpha (float) override {}
    void textInputRequired (Point<int>, TextInputTarget&) override {}
private:
    Rectangle<int> bounds;
};

ComponentPeer* Component::createNewPeer (int styleFlags, void*) {
    return new WASMComponentPeer (*this, styleFlags);
}

// Process stubs
bool Process::isForegroundProcess() { return true; }
void Process::makeForegroundProcess() {}
void Process::hide() {}

// Clipboard stubs
void SystemClipboard::copyTextToClipboard (const String&) {}
String SystemClipboard::getTextFromClipboard() { return {}; }

// FileChooser stubs
bool FileChooser::isPlatformDialogAvailable() { return false; }

// KeyPress static constants (normally defined in platform-specific windowing code)
const int KeyPress::spaceKey        = ' ';
const int KeyPress::returnKey       = 0x0d;
const int KeyPress::escapeKey       = 0x1b;
const int KeyPress::backspaceKey    = 0x08;
const int KeyPress::leftKey         = 0x1000;
const int KeyPress::rightKey        = 0x1001;
const int KeyPress::upKey           = 0x1002;
const int KeyPress::downKey         = 0x1003;
const int KeyPress::pageUpKey       = 0x1004;
const int KeyPress::pageDownKey     = 0x1005;
const int KeyPress::homeKey         = 0x1006;
const int KeyPress::endKey          = 0x1007;
const int KeyPress::deleteKey       = 0x1008;
const int KeyPress::insertKey       = 0x1009;
const int KeyPress::tabKey          = 0x09;
const int KeyPress::F1Key           = 0x2001;
const int KeyPress::F2Key           = 0x2002;
const int KeyPress::F3Key           = 0x2003;
const int KeyPress::F4Key           = 0x2004;
const int KeyPress::F5Key           = 0x2005;
const int KeyPress::F6Key           = 0x2006;
const int KeyPress::F7Key           = 0x2007;
const int KeyPress::F8Key           = 0x2008;
const int KeyPress::F9Key           = 0x2009;
const int KeyPress::F10Key          = 0x200a;
const int KeyPress::F11Key          = 0x200b;
const int KeyPress::F12Key          = 0x200c;
const int KeyPress::F13Key          = 0x200d;
const int KeyPress::F14Key          = 0x200e;
const int KeyPress::F15Key          = 0x200f;
const int KeyPress::F16Key          = 0x2010;
const int KeyPress::F17Key          = 0x2011;
const int KeyPress::F18Key          = 0x2012;
const int KeyPress::F19Key          = 0x2013;
const int KeyPress::F20Key          = 0x2014;
const int KeyPress::F21Key          = 0x2015;
const int KeyPress::F22Key          = 0x2016;
const int KeyPress::F23Key          = 0x2017;
const int KeyPress::F24Key          = 0x2018;
const int KeyPress::F25Key          = 0x2019;
const int KeyPress::F26Key          = 0x201a;
const int KeyPress::F27Key          = 0x201b;
const int KeyPress::F28Key          = 0x201c;
const int KeyPress::F29Key          = 0x201d;
const int KeyPress::F30Key          = 0x201e;
const int KeyPress::F31Key          = 0x201f;
const int KeyPress::F32Key          = 0x2020;
const int KeyPress::F33Key          = 0x2021;
const int KeyPress::F34Key          = 0x2022;
const int KeyPress::F35Key          = 0x2023;
const int KeyPress::numberPad0      = 0x3000;
const int KeyPress::numberPad1      = 0x3001;
const int KeyPress::numberPad2      = 0x3002;
const int KeyPress::numberPad3      = 0x3003;
const int KeyPress::numberPad4      = 0x3004;
const int KeyPress::numberPad5      = 0x3005;
const int KeyPress::numberPad6      = 0x3006;
const int KeyPress::numberPad7      = 0x3007;
const int KeyPress::numberPad8      = 0x3008;
const int KeyPress::numberPad9      = 0x3009;
const int KeyPress::numberPadAdd            = 0x300a;
const int KeyPress::numberPadSubtract       = 0x300b;
const int KeyPress::numberPadMultiply       = 0x300c;
const int KeyPress::numberPadDivide         = 0x300d;
const int KeyPress::numberPadSeparator      = 0x300e;
const int KeyPress::numberPadDecimalPoint   = 0x300f;
const int KeyPress::numberPadEquals         = 0x3010;
const int KeyPress::numberPadDelete         = 0x3011;
const int KeyPress::playKey         = 0x4000;
const int KeyPress::stopKey         = 0x4001;
const int KeyPress::fastForwardKey  = 0x4002;
const int KeyPress::rewindKey       = 0x4003;

// LookAndFeel platform audio stub
void LookAndFeel::playAlertSound() {}

// Desktop platform stubs
std::unique_ptr<Desktop::NativeDarkModeChangeDetectorImpl> Desktop::createNativeDarkModeChangeDetectorImpl() { return nullptr; }
void Desktop::setKioskComponent (Component*, bool, bool) {}
void Desktop::setScreenSaverEnabled (bool) {}

// Displays platform stub
void Displays::findDisplays (float) {
    displays.clear();
    Display d;
    d.userArea = d.totalArea = { 0, 0, 1920, 1080 };
    d.isMain = true;
    d.scale = 1.0;
    d.dpi = 96.0;
    displays.add (d);
}

// Accessibility stub
namespace detail {
void AccessibilityHelpers::notifyAccessibilityEvent (const AccessibilityHandler&, AccessibilityHelpers::Event) {}
}

// Mouse platform stubs
Point<float> MouseInputSource::getCurrentRawMousePosition() { return {}; }
void MouseInputSource::setRawMousePosition (Point<float>) {}

// MouseInputSourceList platform stubs
namespace detail {
bool MouseInputSourceList::addSource() { return true; }
bool MouseInputSourceList::canUseTouch() const { return false; }
}

// KeyPress platform stub
bool KeyPress::isKeyCurrentlyDown (int) { return false; }

// WindowUtils platform stub
bool WindowUtils::areThereAnyAlwaysOnTopWindows() { return false; }

} // namespace juce
