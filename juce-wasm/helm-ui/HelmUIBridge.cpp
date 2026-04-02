/*
 * HelmUIBridge.cpp — WASM framebuffer bridge for Helm UI
 * Follows the proven OBXf/Dexed/Odin2 pattern: JUCE editor → software framebuffer → WASM exports.
 */

#include <emscripten.h>

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include "helm_plugin.h"
#include "helm_editor.h"

static float g_scale = 1.0f;
static HelmPlugin* g_processor = nullptr;
static juce::AudioProcessorEditor* g_editor = nullptr;
static juce::Image* g_framebuffer = nullptr;
static int g_fbWidth  = 992;
static int g_fbHeight = 734;

extern "C" void juce_wasm_dispatch_messages();

// ParamForwarder: catches JUCE param changes and sends to JS
class ParamForwarder : public juce::AudioProcessorParameter::Listener
{
public:
    void parameterValueChanged(int parameterIndex, float newValue) override
    {
        EM_ASM({
            if (typeof window !== 'undefined' && window._helmUIParamCallback)
                window._helmUIParamCallback($0, $1);
        }, parameterIndex, (double)newValue);
    }
    void parameterGestureChanged(int, bool) override {}
};

static ParamForwarder* g_paramForwarder = nullptr;

extern "C" {

static void helm_ui_init_common(float scale)
{
    if (scale < 1.0f) scale = 1.0f;
    if (scale > 4.0f) scale = 4.0f;
    g_scale = scale;

    juce::MessageManager::getInstance();

    g_processor = new HelmPlugin();

    // Attach parameter forwarder
    g_paramForwarder = new ParamForwarder();
    auto& params = g_processor->getParameters();
    for (auto* p : params)
        p->addListener(g_paramForwarder);

    // Emit parameter names to JS
    EM_ASM({ window._helmParamIds = []; });
    for (int i = 0; i < params.size(); i++)
    {
        EM_ASM({ window._helmParamIds.push(UTF8ToString($0)); },
               params[i]->getName(128).toRawUTF8());
    }

    g_editor = g_processor->createEditor();
    juce_wasm_dispatch_messages();

    if (g_editor)
    {
        int nativeW = g_editor->getWidth();
        int nativeH = g_editor->getHeight();
        if (nativeW <= 0) nativeW = 992;
        if (nativeH <= 0) nativeH = 734;

        g_editor->addToDesktop(0);
        g_editor->setVisible(true);
        juce_wasm_dispatch_messages();

        g_fbWidth  = (int)(nativeW * g_scale);
        g_fbHeight = (int)(nativeH * g_scale);
    }

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);
    EM_ASM({ console.log("[HelmUI WASM] Init: " + $0 + "x" + $1 + " scale=" + $2); },
           g_fbWidth, g_fbHeight, (double)g_scale);
}

EMSCRIPTEN_KEEPALIVE void helm_ui_init() { helm_ui_init_common(1.0f); }
EMSCRIPTEN_KEEPALIVE void helm_ui_init_scaled(float scale) { helm_ui_init_common(scale); }

EMSCRIPTEN_KEEPALIVE
void helm_ui_tick()
{
    if (!g_editor || !g_framebuffer) return;
    juce_wasm_dispatch_messages();
    juce::Graphics g(*g_framebuffer);
    g.fillAll(juce::Colours::black);
    if (g_scale != 1.0f)
        g.addTransform(juce::AffineTransform::scale(g_scale));
    g_editor->paintEntireComponent(g, true);
}

EMSCRIPTEN_KEEPALIVE uint8_t* helm_ui_get_fb()
{
    if (!g_framebuffer) return nullptr;
    juce::Image::BitmapData bmp(*g_framebuffer, juce::Image::BitmapData::readOnly);
    return bmp.data;
}

EMSCRIPTEN_KEEPALIVE int helm_ui_get_width()  { return g_fbWidth; }
EMSCRIPTEN_KEEPALIVE int helm_ui_get_height() { return g_fbHeight; }

// Mouse events
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

EMSCRIPTEN_KEEPALIVE void helm_ui_on_mouse_down(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, true), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE void helm_ui_on_mouse_up(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, false), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE void helm_ui_on_mouse_move(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, (mods & 16) != 0), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE void helm_ui_on_mouse_wheel(int x, int y, float dx, float dy)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x / g_scale, (float)y / g_scale);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseWheel(juce::MouseInputSource::InputSourceType::mouse,
                           pos, time,
                           juce::MouseWheelDetails{dx, dy, false, false});
}

// Parameter access
EMSCRIPTEN_KEEPALIVE void helm_ui_set_param(int idx, float val)
{
    if (!g_processor) return;
    auto& params = g_processor->getParameters();
    if (idx >= 0 && idx < params.size())
        params[idx]->setValue(val);
}

EMSCRIPTEN_KEEPALIVE float helm_ui_get_param(int idx)
{
    if (!g_processor) return 0.0f;
    auto& params = g_processor->getParameters();
    if (idx >= 0 && idx < params.size())
        return params[idx]->getValue();
    return 0.0f;
}

EMSCRIPTEN_KEEPALIVE int helm_ui_get_param_count()
{
    if (!g_processor) return 0;
    return g_processor->getParameters().size();
}

// Programs
EMSCRIPTEN_KEEPALIVE int helm_ui_get_program() { return g_processor ? g_processor->getCurrentProgram() : 0; }
EMSCRIPTEN_KEEPALIVE void helm_ui_set_program(int p) {
    if (g_processor) {
        g_processor->setCurrentProgram(p);
        // Force editor repaint after preset change
        if (g_editor) g_editor->repaint();
    }
}
EMSCRIPTEN_KEEPALIVE int helm_ui_get_program_count() { return g_processor ? g_processor->getNumPrograms() : 0; }

static char g_program_name_buf[256];
EMSCRIPTEN_KEEPALIVE const char* helm_ui_get_program_name(int p) {
    if (!g_processor) return "";
    juce::String name = g_processor->getProgramName(p);
    strncpy(g_program_name_buf, name.toRawUTF8(), 255);
    g_program_name_buf[255] = 0;
    return g_program_name_buf;
}

EMSCRIPTEN_KEEPALIVE void helm_ui_shutdown()
{
    if (g_processor && g_paramForwarder) {
        auto& params = g_processor->getParameters();
        for (auto* p : params)
            p->removeListener(g_paramForwarder);
    }
    delete g_paramForwarder; g_paramForwarder = nullptr;
    delete g_editor; g_editor = nullptr;
    delete g_processor; g_processor = nullptr;
    delete g_framebuffer; g_framebuffer = nullptr;
}

} // extern "C"
