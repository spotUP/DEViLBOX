// build_juce_graphics.cpp — WASM build for juce_graphics
// Strategy: include the real unity build file.
// For WASM, we need FreeType (software rendering) but can't pretend to be Linux
// because that triggers Linux system headers (sys/prctl.h etc.).
// Instead, we provide WASM-specific stubs for platform-dependent symbols.
#include "JuceWasmConfig.h"

// Make platform selection choose the FreeType path
#define JUCE_USE_FREETYPE 1
#define JUCE_USE_FREETYPE_LICENSING 0
#define JUCE_USE_FONTCONFIG 0
#define JUCE_ETW_TRACELOGGING 0
#define JUCE_CORE_INCLUDE_NATIVE_HEADERS 1

// FreeType headers (from Emscripten ports)
#include <ft2build.h>
#include FT_FREETYPE_H

// Use the real unity build file — includes all cross-platform code
#include <juce_graphics/juce_graphics.cpp>

// WASM stubs for symbols that are normally provided by platform-specific code
// (juce_Fonts_linux.cpp, juce_XWindowSystem_linux.cpp, etc.)
namespace juce {

// NativeImageType::create — on Linux/BSD this is in juce_Image.cpp behind an #if guard
// For WASM, delegate to software renderer
ImagePixelData::Ptr NativeImageType::create (Image::PixelFormat format, int width, int height, bool clearImage) const
{
    return new SoftwarePixelData (format, width, height, clearImage);
}

// Font platform stubs (normally from juce_Fonts_linux.cpp)
StringArray Font::findAllTypefaceNames()    { return { "Sans-Serif" }; }
StringArray Font::findAllTypefaceStyles (const String&) { return { "Regular" }; }

// FreeType font directory stub (normally from juce_Fonts_linux.cpp)
StringArray FTTypefaceList::getDefaultFontDirectories() { return {}; }

// Default typeface stub — returns nullptr to use FreeType fallback
Typeface::Ptr Font::Native::getDefaultPlatformTypefaceForFont (const Font&) { return nullptr; }

} // namespace juce

