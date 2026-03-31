/*
 * OBXfUIBridge.cpp — WASM framebuffer bridge for OB-Xf UI
 * Follows the proven Dexed UI bridge pattern exactly.
 */

#include <emscripten.h>
#include <emscripten/bind.h>

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include "PluginProcessor.h"
#include "PluginEditor.h"

// Default framebuffer dimensions (OB-Xf is 1440x450)
constexpr int FB_WIDTH  = 1440;
constexpr int FB_HEIGHT = 450;

static float g_scale = 1.0f;
static ObxfAudioProcessor* g_processor = nullptr;
static juce::AudioProcessorEditor* g_editor = nullptr;
static juce::Image* g_framebuffer = nullptr;
static int g_fbWidth  = FB_WIDTH;
static int g_fbHeight = FB_HEIGHT;

// Defined in libjuce-wasm.a (juce_Messaging_wasm.cpp)
extern "C" void juce_wasm_dispatch_messages();

// ── ParamForwarder: catches JUCE param changes and sends to JS ──
class ParamForwarder : public juce::AudioProcessorParameter::Listener
{
public:
    void parameterValueChanged(int parameterIndex, float newValue) override
    {
        EM_ASM({
            if (typeof window !== 'undefined' && window._obxfUIParamCallback)
                window._obxfUIParamCallback($0, $1);
        }, parameterIndex, (double)newValue);
    }

    void parameterGestureChanged(int, bool) override {}
};

static ParamForwarder* g_paramForwarder = nullptr;

// ── MidiForwarder: listens for on-screen keyboard events and forwards to JS ──
class MidiForwarder : public juce::MidiKeyboardStateListener
{
public:
    void handleNoteOn(juce::MidiKeyboardState*, int channel, int note, float velocity) override
    {
        int vel = juce::jlimit(1, 127, (int)(velocity * 127.0f));
        EM_ASM({
            if (typeof window !== 'undefined' && window._obxfUIMidiCallback)
                window._obxfUIMidiCallback('noteOn', $0, $1);
        }, note, vel);
    }

    void handleNoteOff(juce::MidiKeyboardState*, int channel, int note, float velocity) override
    {
        (void)velocity;
        EM_ASM({
            if (typeof window !== 'undefined' && window._obxfUIMidiCallback)
                window._obxfUIMidiCallback('noteOff', $0, 0);
        }, note);
    }
};

static MidiForwarder g_midiForwarder;

// ── Exported C functions ──────────────────────────────────────────────────────

extern "C" {

// ── Helper: shared init logic ──
static void obxf_ui_init_common(float scale)
{
    if (scale < 1.0f) scale = 1.0f;
    if (scale > 4.0f) scale = 4.0f;
    g_scale = scale;

    juce::MessageManager::getInstance();

    g_processor = new ObxfAudioProcessor();

    // Attach parameter forwarder to all params
    g_paramForwarder = new ParamForwarder();
    auto& params = g_processor->getParameters();
    for (auto* p : params)
        p->addListener(g_paramForwarder);

    g_editor = g_processor->createEditor();
    juce_wasm_dispatch_messages();

    if (g_editor)
    {
        int nativeW = g_editor->getWidth();
        int nativeH = g_editor->getHeight();
        if (nativeW <= 0) nativeW = FB_WIDTH;
        if (nativeH <= 0) nativeH = FB_HEIGHT;

        // addToDesktop creates a ComponentPeer — REQUIRED for mouse event dispatch
        g_editor->addToDesktop(0);
        g_editor->setVisible(true);
        juce_wasm_dispatch_messages();

        g_fbWidth  = (int)(nativeW * g_scale);
        g_fbHeight = (int)(nativeH * g_scale);
    }

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);
    EM_ASM({ console.log("[OBXfUI WASM] Init complete: " + $0 + "x" + $1 + " (scale=" + $2 + ")"); },
           g_fbWidth, g_fbHeight, (double)g_scale);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_init()
{
    obxf_ui_init_common(1.0f);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_init_scaled(float scale)
{
    obxf_ui_init_common(scale);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_tick()
{
    if (!g_editor || !g_framebuffer) return;

    juce_wasm_dispatch_messages();

    juce::Graphics g(*g_framebuffer);
    g.fillAll(juce::Colours::black);
    if (g_scale != 1.0f)
        g.addTransform(juce::AffineTransform::scale(g_scale));
    g_editor->paintEntireComponent(g, true);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* obxf_ui_get_fb()
{
    if (!g_framebuffer) return nullptr;
    juce::Image::BitmapData bmp(*g_framebuffer, juce::Image::BitmapData::readOnly);
    return bmp.data;
}

EMSCRIPTEN_KEEPALIVE
int obxf_ui_get_width()
{
    return g_fbWidth;
}

EMSCRIPTEN_KEEPALIVE
int obxf_ui_get_height()
{
    return g_fbHeight;
}

// ── Mouse events ──

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

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_down(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, true), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_up(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, false), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_move(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, (mods & 16) != 0), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_wheel(int x, int y, float deltaX, float deltaY)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseWheel(juce::MouseInputSource::InputSourceType::mouse,
                           pos, time,
                           juce::MouseWheelDetails{deltaX, deltaY, false, false});
}

// ── Parameter access ──

EMSCRIPTEN_KEEPALIVE
void obxf_ui_set_param(int index, float value)
{
    if (!g_processor) return;
    auto& params = g_processor->getParameters();
    if (index >= 0 && index < params.size())
        params[index]->setValue(value);
}

EMSCRIPTEN_KEEPALIVE
float obxf_ui_get_param(int index)
{
    if (!g_processor) return 0.0f;
    auto& params = g_processor->getParameters();
    if (index >= 0 && index < params.size())
        return params[index]->getValue();
    return 0.0f;
}

EMSCRIPTEN_KEEPALIVE
int obxf_ui_get_param_count()
{
    if (!g_processor) return 0;
    return g_processor->getParameters().size();
}

// ── Program access ──

EMSCRIPTEN_KEEPALIVE
int obxf_ui_get_program() { return g_processor ? g_processor->getCurrentProgram() : 0; }

EMSCRIPTEN_KEEPALIVE
void obxf_ui_set_program(int p) { if (g_processor) g_processor->setCurrentProgram(p); }

EMSCRIPTEN_KEEPALIVE
int obxf_ui_get_program_count() { return g_processor ? g_processor->getNumPrograms() : 0; }

// ── Cleanup ──

EMSCRIPTEN_KEEPALIVE
void obxf_ui_shutdown()
{
    if (g_processor && g_paramForwarder) {
        auto& params = g_processor->getParameters();
        for (auto* p : params)
            p->removeListener(g_paramForwarder);
    }
    delete g_paramForwarder; g_paramForwarder = nullptr;
    delete g_editor;   g_editor = nullptr;
    delete g_processor; g_processor = nullptr;
    delete g_framebuffer; g_framebuffer = nullptr;
}

} // extern "C"
