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

// ── MidiForwarder: listens for on-screen keyboard events and forwards to JS ──
class MidiForwarder : public juce::MidiKeyboardStateListener
{
public:
    void handleNoteOn(juce::MidiKeyboardState*, int channel, int note, float velocity) override
    {
        int vel = juce::jlimit(1, 127, (int)(velocity * 127.0f));
        EM_ASM({
            if (typeof window !== 'undefined' && window._obxfUIMidiCallback)
                window._obxfUIMidiCallback($0, $1, $2);
        }, 0x90 | (channel - 1), note, vel);
    }

    void handleNoteOff(juce::MidiKeyboardState*, int channel, int note, float velocity) override
    {
        (void)velocity;
        EM_ASM({
            if (typeof window !== 'undefined' && window._obxfUIMidiCallback)
                window._obxfUIMidiCallback($0, $1, $2);
        }, 0x80 | (channel - 1), note, 0);
    }
};

static MidiForwarder g_midiForwarder;

// ── Exported C functions ──────────────────────────────────────────────────────

extern "C" {

EMSCRIPTEN_KEEPALIVE
void obxf_ui_init()
{
    g_scale = 1.0f;
    g_fbWidth  = FB_WIDTH;
    g_fbHeight = FB_HEIGHT;

    g_processor = new ObxfAudioProcessor();
    g_editor = g_processor->createEditor();

    if (g_editor)
        g_editor->setSize(FB_WIDTH, FB_HEIGHT);

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_init_scaled(float scale)
{
    g_scale = scale;
    g_fbWidth  = (int)(FB_WIDTH * scale);
    g_fbHeight = (int)(FB_HEIGHT * scale);

    g_processor = new ObxfAudioProcessor();
    g_editor = g_processor->createEditor();

    if (g_editor)
    {
        g_editor->setSize(FB_WIDTH, FB_HEIGHT);
        g_editor->setTransform(juce::AffineTransform::scale(scale));
    }

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_tick()
{
    juce_wasm_dispatch_messages();

    if (g_editor && g_framebuffer)
    {
        juce::Graphics g(*g_framebuffer);
        g.fillAll(juce::Colours::black);
        g_editor->paintEntireComponent(g, false);
    }
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

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_down(int x, int y, int button)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;

    int sx = (int)(x / g_scale);
    int sy = (int)(y / g_scale);
    juce::ModifierKeys mods = button == 2
        ? juce::ModifierKeys(juce::ModifierKeys::rightButtonModifier)
        : juce::ModifierKeys(juce::ModifierKeys::leftButtonModifier);

    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           juce::Point<float>((float)sx, (float)sy),
                           mods, 0.0f, 0.0f, juce::Time::currentTimeMillis());
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_up(int x, int y, int button)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;

    int sx = (int)(x / g_scale);
    int sy = (int)(y / g_scale);

    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           juce::Point<float>((float)sx, (float)sy),
                           juce::ModifierKeys(), 0.0f, 0.0f, juce::Time::currentTimeMillis());
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_move(int x, int y, int buttons)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;

    int sx = (int)(x / g_scale);
    int sy = (int)(y / g_scale);

    juce::ModifierKeys mods;
    if (buttons & 1) mods = juce::ModifierKeys(juce::ModifierKeys::leftButtonModifier);
    if (buttons & 2) mods = juce::ModifierKeys(juce::ModifierKeys::rightButtonModifier);

    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           juce::Point<float>((float)sx, (float)sy),
                           mods, 0.0f, 0.0f, juce::Time::currentTimeMillis());
}

EMSCRIPTEN_KEEPALIVE
void obxf_ui_on_mouse_wheel(int x, int y, float deltaX, float deltaY)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;

    int sx = (int)(x / g_scale);
    int sy = (int)(y / g_scale);

    peer->handleMouseWheel(juce::MouseInputSource::InputSourceType::mouse,
                           juce::Point<float>((float)sx, (float)sy),
                           juce::Time::currentTimeMillis(),
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
    delete g_editor;   g_editor = nullptr;
    delete g_processor; g_processor = nullptr;
    delete g_framebuffer; g_framebuffer = nullptr;
}

} // extern "C"
