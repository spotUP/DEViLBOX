/**
 * AelapseUIBridge.cpp — WASM framebuffer bridge for the ÆLAPSE JUCE editor.
 *
 * Mirrors juce-wasm/obxf-ui/OBXfUIBridge.cpp: we spin up a JUCE MessageManager,
 * instantiate a stub PluginProcessor + real PluginEditor, render the editor
 * into a software framebuffer every tick, and route mouse events from JS
 * back into the JUCE component hierarchy.
 *
 * Parameter forwarding: every AudioProcessorParameter gets a listener that
 * pushes change events to JS via `window._aelapseUIParamCallback(index, val)`.
 * The React hardware UI wrapper (AelapseHardwareUI.tsx) catches those and
 * forwards to the DSP worklet's setParameter.
 *
 * The springs OpenGL visualization is stubbed out in the JUCE editor build
 * (see src/GUI/SpringsGL.h AELAPSE_WASM_UI gate). An overlay WebGL2 canvas
 * renders the real shader on top of the framebuffer canvas in React.
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

#include "PluginProcessor.h"
#include "GUI/PluginEditor.h"

// Default framebuffer dimensions — matches the reference plugin's editor size
// (aelapse uses ~900x600 at 1x). If the editor reports different dimensions
// we'll use those instead.
constexpr int FB_WIDTH  = 900;
constexpr int FB_HEIGHT = 600;

static float g_scale = 1.0f;
static juce::AudioProcessor*       g_processor = nullptr;
static juce::AudioProcessorEditor* g_editor    = nullptr;
static juce::Image*                g_framebuffer = nullptr;
static int g_fbWidth  = FB_WIDTH;
static int g_fbHeight = FB_HEIGHT;

// Defined in libjuce-wasm.a (juce_Messaging_wasm.cpp)
extern "C" void juce_wasm_dispatch_messages();

// Provided by AelapseStubs.cpp
namespace aelapse { juce::AudioProcessor *loadPlugin(); }

// ── ParamForwarder: catches JUCE param changes and sends to JS ──────────────

class ParamForwarder : public juce::AudioProcessorParameter::Listener
{
public:
    void parameterValueChanged(int parameterIndex, float newValue) override
    {
        EM_ASM({
            if (typeof window !== 'undefined' && window._aelapseUIParamCallback)
                window._aelapseUIParamCallback($0, $1);
        }, parameterIndex, (double)newValue);
    }

    void parameterGestureChanged(int, bool) override {}
};

static ParamForwarder* g_paramForwarder = nullptr;

// ── Exported C functions ────────────────────────────────────────────────────

extern "C" {

static void aelapse_ui_init_common(float scale)
{
    if (scale < 1.0f) scale = 1.0f;
    if (scale > 4.0f) scale = 4.0f;
    g_scale = scale;

    juce::MessageManager::getInstance();

    g_processor = aelapse::loadPlugin();

    // Attach parameter forwarder to every parameter so the React wrapper
    // learns about knob changes made inside the JUCE UI.
    g_paramForwarder = new ParamForwarder();
    auto& params = g_processor->getParameters();
    for (auto* p : params)
        p->addListener(g_paramForwarder);

    // Emit parameter ID array to JS so the React wrapper can map indices to
    // DEViLBOX AelapseEffect setters by name.
    EM_ASM({ window._aelapseParamIds = []; });
    for (int i = 0; i < params.size(); ++i)
    {
        if (auto* pwid = dynamic_cast<juce::AudioProcessorParameterWithID*>(params[i]))
        {
            EM_ASM({ window._aelapseParamIds.push(UTF8ToString($0)); },
                   pwid->paramID.toRawUTF8());
        }
        else
        {
            EM_ASM({ window._aelapseParamIds.push(""); });
        }
    }

    g_editor = g_processor->createEditor();
    juce_wasm_dispatch_messages();

    if (g_editor)
    {
        int nativeW = g_editor->getWidth();
        int nativeH = g_editor->getHeight();
        if (nativeW <= 0) nativeW = FB_WIDTH;
        if (nativeH <= 0) nativeH = FB_HEIGHT;

        // addToDesktop creates a ComponentPeer — required for mouse dispatch.
        g_editor->addToDesktop(0);
        g_editor->setVisible(true);
        juce_wasm_dispatch_messages();

        g_fbWidth  = (int)(nativeW * g_scale);
        g_fbHeight = (int)(nativeH * g_scale);
    }

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);
    EM_ASM({ console.log("[AelapseUI WASM] Init complete: " + $0 + "x" + $1 + " (scale=" + $2 + ")"); },
           g_fbWidth, g_fbHeight, (double)g_scale);
}

EMSCRIPTEN_KEEPALIVE
void aelapse_ui_init() { aelapse_ui_init_common(1.0f); }

EMSCRIPTEN_KEEPALIVE
void aelapse_ui_init_scaled(float scale) { aelapse_ui_init_common(scale); }

EMSCRIPTEN_KEEPALIVE
void aelapse_ui_tick()
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
uint8_t* aelapse_ui_get_fb()
{
    if (!g_framebuffer) return nullptr;
    juce::Image::BitmapData bmp(*g_framebuffer, juce::Image::BitmapData::readOnly);
    return bmp.data;
}

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_width()  { return g_fbWidth; }

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_height() { return g_fbHeight; }

// ── Mouse events ────────────────────────────────────────────────────────────

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
void aelapse_ui_on_mouse_down(int x, int y, int mods)
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
void aelapse_ui_on_mouse_up(int x, int y, int mods)
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
void aelapse_ui_on_mouse_move(int x, int y, int mods)
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
void aelapse_ui_on_mouse_wheel(int x, int y, float deltaX, float deltaY)
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

// ── Parameter access ────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
void aelapse_ui_set_param(int index, float value)
{
    if (!g_processor) return;
    auto& params = g_processor->getParameters();
    if (index >= 0 && index < params.size())
        params[index]->setValue(value);
}

EMSCRIPTEN_KEEPALIVE
float aelapse_ui_get_param(int index)
{
    if (!g_processor) return 0.0f;
    auto& params = g_processor->getParameters();
    if (index >= 0 && index < params.size())
        return params[index]->getValue();
    return 0.0f;
}

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_param_count()
{
    if (!g_processor) return 0;
    return g_processor->getParameters().size();
}

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_program() { return g_processor ? g_processor->getCurrentProgram() : 0; }

EMSCRIPTEN_KEEPALIVE
void aelapse_ui_set_program(int p) { if (g_processor) g_processor->setCurrentProgram(p); }

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_program_count() { return g_processor ? g_processor->getNumPrograms() : 0; }

// ── Springs overlay bounds ──────────────────────────────────────────────────
// Returns the editor-relative bounds [x, y, w, h] of the SpringsGL stub
// component so the React wrapper can position the WebGL2 overlay canvas
// exactly on top of the region the JUCE editor left empty.
//
// Both SpringsSection and SpringsGL have setName("Springs") in the aelapse
// source, so we search for the LEAF (no children) to find the GL stub.

static juce::Component* findSpringsLeaf()
{
    if (!g_editor) return nullptr;
    std::function<juce::Component*(juce::Component*)> find =
        [&](juce::Component* c) -> juce::Component* {
            for (int i = 0; i < c->getNumChildComponents(); ++i) {
                if (auto* r = find(c->getChildComponent(i))) return r;
            }
            if (c->getName() == "Springs" && c->getNumChildComponents() == 0) return c;
            return nullptr;
        };
    return find(g_editor);
}

static juce::Point<int> springsEditorPos()
{
    auto* spr = findSpringsLeaf();
    if (!spr) return {};
    auto pos = spr->getPosition();
    for (auto* p = spr->getParentComponent(); p && p != g_editor; p = p->getParentComponent())
        pos += p->getPosition();
    return pos;
}

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_springs_x() { return static_cast<int>(springsEditorPos().x * g_scale); }

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_springs_y() { return static_cast<int>(springsEditorPos().y * g_scale); }

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_springs_w() { auto* s = findSpringsLeaf(); return s ? static_cast<int>(s->getWidth() * g_scale) : 0; }

EMSCRIPTEN_KEEPALIVE
int aelapse_ui_get_springs_h() { auto* s = findSpringsLeaf(); return s ? static_cast<int>(s->getHeight() * g_scale) : 0; }

// ── Cleanup ─────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
void aelapse_ui_shutdown()
{
    if (g_processor && g_paramForwarder)
    {
        auto& params = g_processor->getParameters();
        for (auto* p : params)
            p->removeListener(g_paramForwarder);
    }
    delete g_paramForwarder; g_paramForwarder = nullptr;
    delete g_editor;         g_editor = nullptr;
    delete g_processor;      g_processor = nullptr;
    delete g_framebuffer;    g_framebuffer = nullptr;
}

} // extern "C"
