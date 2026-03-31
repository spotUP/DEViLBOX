// Stub juce_gui_basics module for WASM builds
// Provides minimal type declarations for GUI types that juce_audio_processors references.
// IMPORTANT: Do NOT redefine types that exist in real JUCE modules (core, audio_basics, events, data_structures).
#pragma once

#include <juce_graphics/juce_graphics.h>
#include <juce_data_structures/juce_data_structures.h>

namespace juce
{

// Forward declarations
class Component;
class LookAndFeel;

// Mouse
class MouseCursor { public: enum StandardCursorType { NormalCursor, ParentCursor }; MouseCursor() = default; MouseCursor(StandardCursorType) {} };
struct MouseWheelDetails { float deltaX = 0, deltaY = 0; bool isReversed = false, isSmooth = false, isInertial = false; };
class MouseInputSource { public: bool isMouse() const { return true; } bool isTouch() const { return false; } };
class ModifierKeys {
public:
    ModifierKeys() = default;
    ModifierKeys(int f) : flags(f) {}
    bool isShiftDown() const { return false; }
    bool isCtrlDown() const { return false; }
    bool isAltDown() const { return false; }
    bool isCommandDown() const { return false; }
    bool isLeftButtonDown() const { return false; }
    bool isRightButtonDown() const { return false; }
    int getRawFlags() const { return flags; }
    static ModifierKeys currentModifiers;
private:
    int flags = 0;
};
class MouseEvent {
public:
    int x = 0, y = 0;
    MouseInputSource source{};
    ModifierKeys mods;
    Point<int> getPosition() const { return {x, y}; }
    Point<float> position;
    int getNumberOfClicks() const { return 1; }
};
class MouseListener { public: virtual ~MouseListener() = default; };

// Keyboard
class KeyPress {
public:
    KeyPress() = default;
    KeyPress(int, ModifierKeys = {}, juce_wchar = 0) {}
    bool isValid() const { return false; }
    static bool isKeyCurrentlyDown(int) { return false; }
};

// Component hierarchy
class ComponentPeer { public: virtual ~ComponentPeer() = default; };
class ComponentBoundsConstrainer { public: virtual ~ComponentBoundsConstrainer() = default; };

class Component {
public:
    Component() = default;
    Component(const String&) {}
    virtual ~Component() = default;
    virtual void paint(Graphics&) {}
    virtual void resized() {}
    virtual void mouseDown(const MouseEvent&) {}
    virtual void mouseUp(const MouseEvent&) {}
    virtual void mouseDrag(const MouseEvent&) {}
    virtual void mouseMove(const MouseEvent&) {}
    virtual void mouseEnter(const MouseEvent&) {}
    virtual void mouseExit(const MouseEvent&) {}
    virtual void mouseWheelMove(const MouseEvent&, const MouseWheelDetails&) {}
    virtual void mouseDoubleClick(const MouseEvent&) {}
    virtual bool keyPressed(const KeyPress&) { return false; }
    void setSize(int, int) {}
    void setBounds(int, int, int, int) {}
    void setBounds(Rectangle<int>) {}
    Rectangle<int> getBounds() const { return {}; }
    Rectangle<int> getLocalBounds() const { return {}; }
    int getWidth() const { return 0; }
    int getHeight() const { return 0; }
    int getX() const { return 0; }
    int getY() const { return 0; }
    void setVisible(bool) {}
    bool isVisible() const { return false; }
    void repaint() {}
    void repaint(int, int, int, int) {}
    void addAndMakeVisible(Component*) {}
    void addAndMakeVisible(Component&) {}
    void addChildComponent(Component*) {}
    void removeChildComponent(Component*) {}
    Component* getParentComponent() const { return nullptr; }
    void setOpaque(bool) {}
    void setName(const String&) {}
    const String& getName() const { static String s; return s; }
    void toFront(bool) {}
    void setAlwaysOnTop(bool) {}
    void setWantsKeyboardFocus(bool) {}
    void grabKeyboardFocus() {}
    bool hasKeyboardFocus(bool) const { return false; }
    void addMouseListener(MouseListener*, bool) {}
    void removeMouseListener(MouseListener*) {}
    void setMouseCursor(const MouseCursor&) {}
    Point<int> getMouseXYRelative() const { return {}; }
    void setBufferedToImage(bool) {}
    virtual void lookAndFeelChanged() {}
    void setLookAndFeel(LookAndFeel*) {}
    LookAndFeel& getLookAndFeel() const;
};

// LookAndFeel
class LookAndFeel {
public:
    LookAndFeel() = default;
    virtual ~LookAndFeel() = default;
    static void setDefaultLookAndFeel(LookAndFeel*) {}
};
class LookAndFeel_V2 : public LookAndFeel {};
class LookAndFeel_V3 : public LookAndFeel_V2 {};
class LookAndFeel_V4 : public LookAndFeel_V3 {};

// Common GUI widgets (all stubs)
class Button : public Component {
public:
    Button(const String& = {}) {}
    virtual ~Button() = default;
    class Listener { public: virtual ~Listener() = default; virtual void buttonClicked(Button*) = 0; };
    void addListener(Listener*) {}
    void removeListener(Listener*) {}
    bool getToggleState() const { return false; }
    void setToggleState(bool, NotificationType) {}
    void setButtonText(const String&) {}
    String getButtonText() const { return {}; }
    void setClickingTogglesState(bool) {}
    void setTriggeredOnMouseDown(bool) {}
    void setColour(int, Colour) {}
};
class TextButton : public Button { public: TextButton(const String& = {}) {} enum ColourIds { buttonColourId, buttonOnColourId, textColourOffId, textColourOnId }; };
class ToggleButton : public Button { public: ToggleButton(const String& = {}) {} };
class ImageButton : public Button { public: ImageButton(const String& = {}) {} void setImages(bool, bool, bool, const Image&, float, Colour, const Image&, float, Colour, const Image&, float, Colour) {} };
class HyperlinkButton : public Button { public: HyperlinkButton(const String& = {}, const juce::URL& = {}) {} };

class Slider : public Component {
public:
    Slider() = default;
    Slider(const String&) {}
    virtual ~Slider() = default;
    enum SliderStyle { LinearHorizontal, LinearVertical, Rotary, RotaryHorizontalDrag, RotaryVerticalDrag, RotaryHorizontalVerticalDrag, LinearBar };
    enum TextEntryBoxPosition { NoTextBox, TextBoxLeft, TextBoxRight, TextBoxAbove, TextBoxBelow };
    class Listener { public: virtual ~Listener() = default; virtual void sliderValueChanged(Slider*) = 0; virtual void sliderDragStarted(Slider*) {} virtual void sliderDragEnded(Slider*) {} };
    void addListener(Listener*) {}
    void removeListener(Listener*) {}
    double getValue() const { return 0; }
    void setValue(double, NotificationType = sendNotificationAsync) {}
    void setRange(double, double, double = 0) {}
    void setSliderStyle(SliderStyle) {}
    void setTextBoxStyle(TextEntryBoxPosition, bool, int, int) {}
    void setColour(int, Colour) {}
};

class Label : public Component {
public:
    Label(const String& = {}, const String& = {}) {}
    void setText(const String&, NotificationType) {}
    String getText(bool = false) const { return {}; }
    void setFont(Font) {}
    void setColour(int, Colour) {}
    void setJustificationType(Justification) {}
    class Listener { public: virtual ~Listener() = default; virtual void labelTextChanged(Label*) {} };
    void addListener(Listener*) {}
};

class TextEditor : public Component {
public:
    TextEditor(const String& = {}) {}
    String getText() const { return {}; }
    void setText(const String&, bool = true) {}
    class Listener { public: virtual ~Listener() = default; virtual void textEditorTextChanged(TextEditor&) {} virtual void textEditorReturnKeyPressed(TextEditor&) {} virtual void textEditorFocusLost(TextEditor&) {} };
    void addListener(Listener*) {}
};

class ComboBox : public Component {
public:
    ComboBox(const String& = {}) {}
    void addItem(const String&, int) {}
    int getSelectedId() const { return 0; }
    void setSelectedId(int, NotificationType = sendNotificationAsync) {}
    class Listener { public: virtual ~Listener() = default; virtual void comboBoxChanged(ComboBox*) = 0; };
    void addListener(Listener*) {}
};

class ListBox : public Component { public: ListBox(const String& = {}, void* = nullptr) {} };
class TreeView : public Component {};
class GroupComponent : public Component { public: GroupComponent(const String& = {}, const String& = {}) {} };
class ScrollBar : public Component {};
class ProgressBar : public Component { public: ProgressBar(double&) {} };
class PropertyComponent : public Component { public: PropertyComponent(const String&, int = 25) {} };
class TextPropertyComponent : public PropertyComponent { public: TextPropertyComponent(const String& = {}, int = 25) : PropertyComponent("") {} };
class BubbleComponent : public Component {};
class CaretComponent : public Component {};
class Toolbar : public Component {};
class TabbedComponent : public Component { public: TabbedComponent(int) {} };
class TabbedButtonBar : public Component {};
class ColourSelector : public Component {};

// Window types
class ResizableCornerComponent : public Component { public: ResizableCornerComponent(Component*, ComponentBoundsConstrainer*) {} };
class ResizableWindow : public Component {
public:
    ResizableWindow(const String&, bool) {}
    virtual ~ResizableWindow() = default;
};
class DocumentWindow : public ResizableWindow {
public:
    DocumentWindow(const String&, Colour, int, bool = true) : ResizableWindow("", false) {}
    enum TitleBarButtons { minimiseButton = 1, maximiseButton = 2, closeButton = 4 };
};
class AlertWindow {
public:
    AlertWindow(const String&, const String&, int) {}
    static void showMessageBoxAsync(int, const String&, const String&, const String& = {}) {}
    enum AlertIconType { NoIcon, QuestionIcon, WarningIcon, InfoIcon };
};
class FileChooserDialogBox {};
class PopupMenu {
public:
    void addItem(int, const String&, bool = true, bool = false) {}
    void addSeparator() {}
    int show() { return 0; }
};
class TooltipWindow : public Component { public: TooltipWindow(Component* = nullptr, int = 700) {} };
class SystemClipboard { public: static void copyTextToClipboard(const String&) {} static String getTextFromClipboard() { return {}; } };
class Desktop {
public:
    static Desktop& getInstance() { static Desktop d; return d; }
    class Displays { public: struct Display { Rectangle<int> totalArea; float scale = 1; }; };
    const Displays& getDisplays() const { static Displays d; return d; }
};
class DirectoryContentsDisplayComponent {};
class FileSearchPathListComponent : public Component {};
// Forward declare types from juce_audio_basics that GUI stubs reference
class MidiKeyboardState;

class MidiKeyboardComponent : public Component {
public:
    MidiKeyboardComponent(MidiKeyboardState&, int) {}
    enum Orientation { horizontalKeyboard, verticalKeyboardFacingLeft, verticalKeyboardFacingRight };
};

inline LookAndFeel& Component::getLookAndFeel() const { static LookAndFeel_V4 lf; return lf; }

} // namespace juce
