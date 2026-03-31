// Stub juce_graphics module for WASM builds
// Provides minimal type declarations needed by juce_gui_basics and juce_audio_processors.
// Real implementations are not needed — these are GUI types we never call.
#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

namespace juce
{

// Geometry types
template <typename T> class Point { public: T x{}, y{}; Point() = default; Point(T x_, T y_) : x(x_), y(y_) {} };
template <typename T> class Line { public: Point<T> start, end; };
template <typename T> class Rectangle {
public:
    Rectangle() = default;
    Rectangle(T x, T y, T w, T h) : x_(x), y_(y), w_(w), h_(h) {}
    Rectangle(int, int) {}
    T getX() const { return x_; } T getY() const { return y_; }
    T getWidth() const { return w_; } T getHeight() const { return h_; }
    Rectangle withSizeKeepingCentre(T, T) const { return *this; }
    Rectangle reduced(T) const { return *this; }
    Rectangle removeFromTop(T) { return *this; }
    Rectangle removeFromBottom(T) { return *this; }
    Rectangle removeFromLeft(T) { return *this; }
    Rectangle removeFromRight(T) { return *this; }
    bool isEmpty() const { return w_ <= 0 || h_ <= 0; }
    Point<T> getCentre() const { return {x_ + w_/2, y_ + h_/2}; }
    bool contains(Point<T>) const { return false; }
    bool contains(T, T) const { return false; }
    template <typename U> Rectangle<U> toType() const { return {}; }
    Rectangle<float> toFloat() const { return {}; }
    Rectangle<int> toNearestInt() const { return {}; }
private:
    T x_{}, y_{}, w_{}, h_{};
};
template <typename T> class RectanglePlacement { public: RectanglePlacement(int) {} };
class AffineTransform {
public:
    AffineTransform() = default;
    static AffineTransform identity;
    AffineTransform translated(float, float) const { return {}; }
    AffineTransform scaled(float) const { return {}; }
    AffineTransform scaled(float, float) const { return {}; }
    AffineTransform rotated(float) const { return {}; }
};
template <typename T> class BorderSize { public: BorderSize() = default; BorderSize(T) {} BorderSize(T,T,T,T) {} };

// Colour
class Colour {
public:
    Colour() = default;
    Colour(uint32) {}
    Colour(uint8, uint8, uint8) {}
    Colour(uint8, uint8, uint8, uint8) {}
    static Colour fromRGBA(uint8, uint8, uint8, uint8) { return {}; }
    static Colour fromHSV(float, float, float, float) { return {}; }
    Colour withAlpha(float) const { return {}; }
    Colour brighter(float = 0.4f) const { return {}; }
    Colour darker(float = 0.4f) const { return {}; }
    float getRed() const { return 0; }
    float getGreen() const { return 0; }
    float getBlue() const { return 0; }
    float getAlpha() const { return 1; }
    uint32 getARGB() const { return 0; }
    bool isTransparent() const { return false; }
    bool isOpaque() const { return true; }
    bool operator==(const Colour&) const { return true; }
    bool operator!=(const Colour&) const { return false; }
};
class ColourGradient { public: ColourGradient() = default; };
struct Colours {
    static inline Colour black{0xff000000};
    static inline Colour white{0xffffffff};
    static inline Colour red{0xffff0000};
    static inline Colour green{0xff00ff00};
    static inline Colour blue{0xff0000ff};
    static inline Colour transparentBlack{};
    static inline Colour transparentWhite{};
    static inline Colour grey{};
    static inline Colour yellow{};
    static inline Colour orange{};
};

// Font
class Typeface : public ReferenceCountedObject { public: using Ptr = ReferenceCountedObjectPtr<Typeface>; };
class Font {
public:
    Font() = default;
    Font(float) {}
    Font(const String&, float, int) {}
    float getHeight() const { return 12; }
    Font withHeight(float) const { return {}; }
    float getStringWidthFloat(const String&) const { return 0; }
    int getStringWidth(const String&) const { return 0; }
};

// Graphics
class Image {
public:
    Image() = default;
    enum PixelFormat { ARGB, RGB, SingleChannel, UnknownFormat };
    bool isNull() const { return true; }
    bool isValid() const { return false; }
    int getWidth() const { return 0; }
    int getHeight() const { return 0; }
};
class ImageCache { public: static Image getFromMemory(const void*, int) { return {}; } };
class Path {
public:
    void addRectangle(float, float, float, float) {}
    void addRoundedRectangle(float, float, float, float, float) {}
    void addEllipse(float, float, float, float) {}
    void lineTo(float, float) {}
    void startNewSubPath(float, float) {}
    void closeSubPath() {}
};
struct PathStrokeType { PathStrokeType(float) {} };
class Graphics {
public:
    void setColour(Colour) {}
    void fillAll() {}
    void fillAll(Colour) {}
    void fillRect(Rectangle<int>) {}
    void fillRect(Rectangle<float>) {}
    void fillRect(int, int, int, int) {}
    void drawRect(Rectangle<int>, int = 1) {}
    void drawRect(int, int, int, int, int = 1) {}
    void drawText(const String&, Rectangle<int>, int, bool = false) {}
    void drawText(const String&, int, int, int, int, int, bool = false) {}
    void setFont(Font) {}
    void setFont(float) {}
    void drawLine(float, float, float, float, float = 1.0f) {}
    void fillPath(const Path&) {}
    void strokePath(const Path&, const PathStrokeType&) {}
    void drawImage(const Image&, Rectangle<float>, int = 0) {}
    void drawImageAt(const Image&, int, int) {}
    void setOpacity(float) {}
    Rectangle<int> getClipBounds() const { return {}; }
};
class GlyphArrangement { public: void addLineOfText(const Font&, const String&, float, float) {} };
struct Justification {
    Justification(int) {}
    enum Flags { left = 1, right = 2, centred = 4, centredLeft = 5, centredRight = 6, top = 8, bottom = 16 };
};
class AttributedString { public: void append(const String&, Font, Colour) {} void setJustification(Justification) {} };
class TextLayout { public: void createLayout(const AttributedString&, float) {} void draw(Graphics&, Rectangle<float>) {} };
class Drawable { public: virtual ~Drawable() = default; };
class DrawableButton {};
class DropShadow { public: DropShadow() = default; DropShadow(Colour, int, Point<int>) {} };
class DropShadower {};

} // namespace juce
