/*
 * DexedUIBridge.cpp — WASM bridge for Dexed's JUCE hardware UI
 *
 * Renders the original DX7 plugin editor (operator panels, global editor,
 * algorithm display, knobs, sliders) to a framebuffer via JUCE's software
 * renderer, then exports the pixel buffer for canvas blitting.
 *
 * Architecture:
 *   JS calls _dexed_ui_init() → creates DexedAudioProcessor + Editor
 *   JS calls _dexed_ui_tick() each rAF → runs timer callbacks + re-renders
 *   JS reads _dexed_ui_get_fb() → pointer to ARGB framebuffer
 *   JS forwards mouse events → dispatched through WasmComponentPeer into JUCE
 *
 * Pixel format: JUCE ARGB stored little-endian as [B,G,R,A].
 *   JS does BGRA→RGBA swap during canvas blit (same as Monique/AMSynth).
 *
 * Parameter changes go: JUCE UI → Ctrl::setValueFromHost → EM_ASM callback
 *   → window._dexedUIParamCallback(paramId, value) → audio worklet
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
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

// Dexed
#include "PluginProcessor.h"
#include "PluginEditor.h"

// Default framebuffer dimensions (Dexed editor is 866×674)
static constexpr int FB_WIDTH = 866;
static constexpr int FB_HEIGHT = 674;

// DPR scale factor
static float g_scale = 1.0f;

// Global state
static DexedAudioProcessor* g_processor = nullptr;
static juce::AudioProcessorEditor* g_editor = nullptr;

static juce::Image* g_framebuffer = nullptr;
static int g_fbWidth = FB_WIDTH;
static int g_fbHeight = FB_HEIGHT;

// Defined in juce_Messaging_wasm.cpp
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

//==============================================================================
// MidiForwarder — keyboard note events → JS callback
//==============================================================================
class MidiForwarder : public juce::MidiKeyboardState::Listener
{
public:
    void handleNoteOn(juce::MidiKeyboardState*, int, int midiNote, float velocity) override
    {
        int vel = juce::jlimit(0, 127, (int)(velocity * 127.0f));
        EM_ASM({
            if (window._dexedUIMidiCallback)
                window._dexedUIMidiCallback('noteOn', $0, $1);
        }, midiNote, vel);
    }

    void handleNoteOff(juce::MidiKeyboardState*, int, int midiNote, float) override
    {
        EM_ASM({
            if (window._dexedUIMidiCallback)
                window._dexedUIMidiCallback('noteOff', $0, 0);
        }, midiNote);
    }
};

static MidiForwarder* g_midiForwarder = nullptr;

extern "C" {

void dexed_ui_init_scaled(float scale);

EMSCRIPTEN_KEEPALIVE
void dexed_ui_init()
{
    dexed_ui_init_scaled(1.0f);
}

EMSCRIPTEN_KEEPALIVE
void dexed_ui_init_scaled(float scale)
{
    EM_ASM({ console.log("[DexedUI WASM] init called, scale=" + $0); }, (double)scale);

    if (scale < 1.0f) scale = 1.0f;
    if (scale > 4.0f) scale = 4.0f;
    g_scale = scale;

    juce::MessageManager::getInstance();

    // Create virtual filesystem directories
    EM_ASM({
        if (typeof FS !== 'undefined') {
            try { FS.mkdirTree('/dexed/Cartridges'); } catch(e) {}
        }
    });

    // Create the audio processor (stub — no DSP, just param management)
    g_processor = new DexedAudioProcessor();

    // Attach MIDI forwarder for the on-screen keyboard
    g_midiForwarder = new MidiForwarder();
    g_processor->keyboardState.addListener(g_midiForwarder);

    // Create the editor
    g_editor = g_processor->createEditor();

    juce_wasm_dispatch_messages();

    if (g_editor) {
        int nativeW = g_editor->getWidth();
        int nativeH = g_editor->getHeight();
        if (nativeW <= 0) nativeW = FB_WIDTH;
        if (nativeH <= 0) nativeH = FB_HEIGHT;

        g_editor->addToDesktop(0);
        g_editor->setVisible(true);
        juce_wasm_dispatch_messages();

        g_fbWidth = (int)(nativeW * g_scale);
        g_fbHeight = (int)(nativeH * g_scale);
    }

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);
    EM_ASM({ console.log("[DexedUI WASM] Init complete: " + $0 + "x" + $1 + " (scale=" + $2 + ")"); },
           g_fbWidth, g_fbHeight, (double)g_scale);
}

EMSCRIPTEN_KEEPALIVE
void dexed_ui_tick()
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
uint8_t* dexed_ui_get_fb()
{
    if (!g_framebuffer) return nullptr;
    juce::Image::BitmapData bitmapData(*g_framebuffer, juce::Image::BitmapData::readOnly);
    return bitmapData.data;
}

EMSCRIPTEN_KEEPALIVE
int dexed_ui_get_width()  { return g_fbWidth; }

EMSCRIPTEN_KEEPALIVE
int dexed_ui_get_height() { return g_fbHeight; }

EMSCRIPTEN_KEEPALIVE
void dexed_ui_on_mouse_down(int x, int y, int mods)
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
void dexed_ui_on_mouse_up(int x, int y, int mods)
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
void dexed_ui_on_mouse_move(int x, int y, int mods)
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
void dexed_ui_on_mouse_wheel(int x, int y, float deltaX, float deltaY)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
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
void dexed_ui_set_param(int paramId, float value)
{
    if (!g_processor || paramId < 0 || paramId >= g_processor->getNumParameters()) return;
    g_processor->setParameter(paramId, value);
}

EMSCRIPTEN_KEEPALIVE
float dexed_ui_get_param(int paramId)
{
    if (!g_processor || paramId < 0 || paramId >= g_processor->getNumParameters()) return 0.0f;
    return g_processor->getParameter(paramId);
}

EMSCRIPTEN_KEEPALIVE
int dexed_ui_get_param_count()
{
    if (!g_processor) return 0;
    return g_processor->getNumParameters();
}

EMSCRIPTEN_KEEPALIVE
void dexed_ui_load_sysex(const uint8_t* sysexData, int length)
{
    if (!g_processor || !sysexData || length < 155) return;
    // Copy 155 bytes of VCED data into the processor's voice data buffer
    memcpy(g_processor->data, sysexData, 155);
    g_processor->forceRefreshUI = true;
    g_processor->updateUI();
}

EMSCRIPTEN_KEEPALIVE
void dexed_ui_set_program(int program)
{
    if (!g_processor || program < 0 || program >= g_processor->getNumPrograms()) return;
    g_processor->setCurrentProgram(program);
}

EMSCRIPTEN_KEEPALIVE
int dexed_ui_get_program()
{
    if (!g_processor) return 0;
    return g_processor->getCurrentProgram();
}

EMSCRIPTEN_KEEPALIVE
int dexed_ui_get_program_count()
{
    if (!g_processor) return 0;
    return g_processor->getNumPrograms();
}

EMSCRIPTEN_KEEPALIVE
uint8_t* dexed_ui_get_voice_data()
{
    if (!g_processor) return nullptr;
    return g_processor->data;
}

EMSCRIPTEN_KEEPALIVE
void dexed_ui_shutdown()
{
    if (g_editor) {
        g_editor->removeFromDesktop();
    }

    if (g_processor && g_midiForwarder) {
        g_processor->keyboardState.removeListener(g_midiForwarder);
    }

    delete g_midiForwarder;  g_midiForwarder = nullptr;
    delete g_editor;         g_editor = nullptr;
    delete g_framebuffer;    g_framebuffer = nullptr;
    delete g_processor;      g_processor = nullptr;
}

} // extern "C"
