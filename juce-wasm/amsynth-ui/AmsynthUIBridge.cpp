/*
 * AmsynthUIBridge.cpp — WASM bridge for amsynth's JUCE skin-based UI
 *
 * Renders the original ControlPanel (bitmap skin with 41 knobs/buttons/popups)
 * to a framebuffer via JUCE's software renderer, then exports the pixel buffer
 * for canvas blitting.
 *
 * Architecture:
 *   JS calls _amsynth_ui_init() → creates PresetController + ControlPanel
 *   JS calls _amsynth_ui_tick() each rAF → runs timer callbacks + re-renders
 *   JS reads _amsynth_ui_get_fb() → pointer to ARGB framebuffer
 *   JS forwards mouse events → dispatched through WasmComponentPeer into JUCE
 *
 * Pixel format: JUCE ARGB stored little-endian as [B,G,R,A].
 *   JS does BGRA→RGBA swap during canvas blit (same pattern as Monique/PT2/FT2).
 *
 * Skin files are embedded via Emscripten --embed-file at /amsynth/skins/default/
 */

#include <emscripten.h>
#include <emscripten/bind.h>

// Real JUCE (backed by libjuce-wasm.a)
#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>

// amsynth core
#include "core/synth/PresetController.h"
#include "core/synth/MidiController.h"
#include "core/synth/Parameter.h"
#include "core/controls.h"

// amsynth GUI
#include "core/gui/ControlPanel.h"

// Default framebuffer dimensions (amsynth default skin is 600×400)
static constexpr int FB_WIDTH = 600;
static constexpr int FB_HEIGHT = 400;

// DPR scale factor — set by amsynth_ui_init_scaled()
static float g_scale = 1.0f;

//==============================================================================
// ParamForwarder — observes all 41 parameters and forwards changes to JS
//==============================================================================
class ParamForwarder : public Parameter::Observer
{
public:
    void parameterDidChange(const Parameter& param) override
    {
        int id = param.getId();
        float value = param.getNormalisedValue();
        EM_ASM({
            if (window._amsynthUIParamCallback)
                window._amsynthUIParamCallback($0, $1);
        }, id, (double)value);
    }
};

// Global state
static PresetController* g_presetController = nullptr;
static ControlPanel* g_controlPanel = nullptr;
static ParamForwarder* g_paramForwarder = nullptr;

static juce::Image* g_framebuffer = nullptr;
static int g_fbWidth = FB_WIDTH;
static int g_fbHeight = FB_HEIGHT;

// Defined in juce_Messaging_wasm.cpp — drains the deferred message queue
extern "C" void juce_wasm_dispatch_messages();

// Convert JS modifier bitmask to JUCE ModifierKeys
static juce::ModifierKeys modsFromJS(int mods, bool isDown = false)
{
    int flags = 0;
    if (mods & 1) flags |= juce::ModifierKeys::shiftModifier;
    if (mods & 2) flags |= juce::ModifierKeys::ctrlModifier;
    if (mods & 4) flags |= juce::ModifierKeys::altModifier;
    if (mods & 8) flags |= juce::ModifierKeys::commandModifier;
    if (isDown)   flags |= juce::ModifierKeys::leftButtonModifier;
    return juce::ModifierKeys(flags);
}

extern "C" {

// Forward declaration
void amsynth_ui_init_scaled(float scale);

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_init()
{
    amsynth_ui_init_scaled(1.0f);
}

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_init_scaled(float scale)
{
    EM_ASM({ console.log("[AmsynthUI WASM] init called, scale=" + $0); }, (double)scale);

    if (scale < 1.0f) scale = 1.0f;
    if (scale > 4.0f) scale = 4.0f;
    g_scale = scale;

    juce::MessageManager::getInstance();

    // Pre-create directories that filesystem/PresetController expect
    // to suppress harmless "Error: could not create" warnings
    EM_ASM({
        if (typeof FS !== 'undefined') {
            try { FS.mkdirTree('/home/web_user/.local/share/amsynth/banks'); } catch(e) {}
            try { FS.mkdirTree('/home/web_user/.config/amsynth'); } catch(e) {}
        }
    });

    // Create PresetController (initializes 41 params with default values)
    g_presetController = new PresetController();

    // Attach param forwarder to all parameters
    g_paramForwarder = new ParamForwarder();
    auto& preset = g_presetController->getCurrentPreset();
    for (int i = 0; i < kAmsynthParameterCount; i++) {
        preset.getParameter(i).addObserver(g_paramForwarder);
    }

    // Create ControlPanel (loads skin, creates controls for all 41 params)
    // MidiController is null — we don't need MIDI learn in the hardware UI
    g_controlPanel = new ControlPanel(nullptr, g_presetController);

    juce_wasm_dispatch_messages();

    if (g_controlPanel) {
        // Component stays at native skin size — scaling is done in Graphics
        int nativeW = g_controlPanel->getWidth();
        int nativeH = g_controlPanel->getHeight();
        if (nativeW <= 0) nativeW = FB_WIDTH;
        if (nativeH <= 0) nativeH = FB_HEIGHT;

        g_controlPanel->setSize(nativeW, nativeH);
        g_controlPanel->addToDesktop(0);
        g_controlPanel->setVisible(true);
        juce_wasm_dispatch_messages();

        // Framebuffer at scaled resolution for Retina crispness
        g_fbWidth = (int)(nativeW * g_scale);
        g_fbHeight = (int)(nativeH * g_scale);
    }

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);
    EM_ASM({ console.log("[AmsynthUI WASM] Init complete: " + $0 + "x" + $1 + " (scale=" + $2 + ")"); },
           g_fbWidth, g_fbHeight, (double)g_scale);
}

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_tick()
{
    if (!g_controlPanel || !g_framebuffer) return;

    juce_wasm_dispatch_messages();

    juce::Graphics g(*g_framebuffer);
    g.fillAll(juce::Colours::black);
    // Scale the graphics context so the 600×400 component paints into
    // the larger framebuffer (e.g., 1200×800 at 2x DPR)
    if (g_scale != 1.0f)
        g.addTransform(juce::AffineTransform::scale(g_scale));
    g_controlPanel->paintEntireComponent(g, true);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* amsynth_ui_get_fb()
{
    if (!g_framebuffer) return nullptr;
    juce::Image::BitmapData bitmapData(*g_framebuffer, juce::Image::BitmapData::readOnly);
    return bitmapData.data;
}

EMSCRIPTEN_KEEPALIVE
int amsynth_ui_get_width()  { return g_fbWidth; }

EMSCRIPTEN_KEEPALIVE
int amsynth_ui_get_height() { return g_fbHeight; }

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_on_mouse_down(int x, int y, int mods)
{
    if (!g_controlPanel) return;
    auto* peer = g_controlPanel->getPeer();
    if (!peer) return;
    // Input coords are in framebuffer space — divide by scale for component space
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, true), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_on_mouse_up(int x, int y, int mods)
{
    if (!g_controlPanel) return;
    auto* peer = g_controlPanel->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, false), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_on_mouse_move(int x, int y, int mods)
{
    if (!g_controlPanel) return;
    auto* peer = g_controlPanel->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, (mods & 16) != 0), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_on_mouse_wheel(int x, int y, float deltaX, float deltaY)
{
    if (!g_controlPanel) return;
    auto* peer = g_controlPanel->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    juce::MouseWheelDetails wheel;
    wheel.deltaX = deltaX * 0.01f;
    wheel.deltaY = deltaY * -0.01f;
    wheel.isReversed = false;
    wheel.isSmooth = true;
    wheel.isInertial = false;
    peer->handleMouseWheel(juce::MouseInputSource::InputSourceType::mouse,
                           pos, time, wheel);
}

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_set_param(int paramId, float normalizedValue)
{
    if (!g_presetController || paramId < 0 || paramId >= kAmsynthParameterCount) return;
    auto& param = g_presetController->getCurrentPreset().getParameter(paramId);
    param.setNormalisedValue(normalizedValue);
}

EMSCRIPTEN_KEEPALIVE
float amsynth_ui_get_param(int paramId)
{
    if (!g_presetController || paramId < 0 || paramId >= kAmsynthParameterCount) return 0.0f;
    return g_presetController->getCurrentPreset().getParameter(paramId).getNormalisedValue();
}

EMSCRIPTEN_KEEPALIVE
int amsynth_ui_get_param_count()
{
    return kAmsynthParameterCount;
}

EMSCRIPTEN_KEEPALIVE
void amsynth_ui_shutdown()
{
    if (g_controlPanel) {
        g_controlPanel->removeFromDesktop();
    }

    // Remove param observer from all parameters
    if (g_presetController && g_paramForwarder) {
        auto& preset = g_presetController->getCurrentPreset();
        for (int i = 0; i < kAmsynthParameterCount; i++) {
            preset.getParameter(i).removeObserver(g_paramForwarder);
        }
    }

    delete g_paramForwarder; g_paramForwarder = nullptr;
    delete g_controlPanel;   g_controlPanel = nullptr;
    delete g_framebuffer;    g_framebuffer = nullptr;
    delete g_presetController; g_presetController = nullptr;
}

} // extern "C"
