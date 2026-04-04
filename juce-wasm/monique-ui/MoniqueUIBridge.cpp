/*
 * MoniqueUIBridge.cpp — WASM bridge for Monique's full JUCE hardware UI
 *
 * Renders the original 45K LOC JUCE Component tree to a framebuffer via
 * JUCE's software renderer, then exports the pixel buffer for canvas blitting.
 *
 * Architecture:
 *   JS calls _monique_ui_init() → creates MoniqueAudioProcessor (which builds everything)
 *   JS calls _monique_ui_tick() each rAF → runs timer callbacks + re-renders
 *   JS reads _monique_ui_get_fb() → pointer to ARGB framebuffer
 *   JS forwards mouse events → dispatched through WasmComponentPeer into JUCE Component tree
 *
 * Pixel format: JUCE ARGB stored little-endian as [B,G,R,A].
 *   JS does BGRA→RGBA swap during canvas blit (same as PT2/FT2 hardware UIs).
 */

#include <emscripten.h>
#include <emscripten/bind.h>

// Real JUCE (backed by libjuce-wasm.a, all 12 modules)
// MUST be included FIRST to set include guards BEFORE the access hack
#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

// Access hack — makes Monique's private/protected members accessible.
// JUCE headers above are already processed (include guards set), so they
// won't be reprocessed when Monique headers re-include them.
#define private public
#define protected public

// Monique core
#include "core/monique_core_Synth.h"
#include "core/monique_core_Datastructures.h"
#include "core/monique_core_Processor.h"

// Monique UI
#include "ui/monique_ui_LookAndFeel.h"
#include "ui/monique_ui_Refresher.h"
#include "ui/monique_ui_MainWindow.h"

// Default framebuffer dimensions (non-POLY mode)
static constexpr int FB_WIDTH = 1465;
static constexpr int FB_HEIGHT = 1210;

//==============================================================================
// MidiForwarder — listens to the processor's MidiKeyboardState (which the
// on-screen JUCE keyboard updates) and calls back into JS so the real
// audio engine can trigger noteOn/noteOff.
//==============================================================================
class MidiForwarder : public juce::MidiKeyboardState::Listener
{
public:
    void handleNoteOn (juce::MidiKeyboardState*, int midiChannel, int midiNote, float velocity) override
    {
        int vel = juce::jlimit(0, 127, (int)(velocity * 127.0f));
        EM_ASM({
            if (window._moniqueUIMidiCallback)
                window._moniqueUIMidiCallback('noteOn', $0, $1);
        }, midiNote, vel);
    }

    void handleNoteOff (juce::MidiKeyboardState*, int midiChannel, int midiNote, float /*velocity*/) override
    {
        EM_ASM({
            if (window._moniqueUIMidiCallback)
                window._moniqueUIMidiCallback('noteOff', $0, 0);
        }, midiNote);
    }
};

// Global state
static MoniqueAudioProcessor* g_processor = nullptr;
static juce::AudioProcessorEditor* g_editor = nullptr;
static MidiForwarder* g_midiForwarder = nullptr;

static juce::Image* g_framebuffer = nullptr;
static int g_fbWidth = FB_WIDTH;
static int g_fbHeight = FB_HEIGHT;

// Parameter change tracking — snapshot of values from last tick
static float* g_paramSnapshot = nullptr;
static int g_numParams = 0;

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

EMSCRIPTEN_KEEPALIVE
void monique_ui_init(int sampleRate)
{
    EM_ASM({ console.log("[MoniqueUI WASM] init called, sampleRate=" + $0); }, sampleRate);

    juce::MessageManager::getInstance();

    g_processor = new MoniqueAudioProcessor();
    g_processor->prepareToPlay((double)sampleRate, 512);

    // MoniqueAudioProcessor IS a MidiKeyboardState — register our forwarder
    // so UI keyboard clicks get sent to JS → real audio engine.
    // Must disambiguate because MoniqueAudioProcessor inherits both
    // AudioProcessor::addListener and MidiKeyboardState::addListener.
    g_midiForwarder = new MidiForwarder();
    static_cast<juce::MidiKeyboardState*>(g_processor)->addListener(g_midiForwarder);

    g_editor = g_processor->createEditor();
    juce_wasm_dispatch_messages();

    if (g_editor) {
        g_fbWidth = g_editor->getWidth();
        g_fbHeight = g_editor->getHeight();
        if (g_fbWidth <= 0) g_fbWidth = FB_WIDTH;
        if (g_fbHeight <= 0) g_fbHeight = FB_HEIGHT;

        // addToDesktop sets hasHeavyweightPeerFlag, which is required for
        // Component::getPeer() to work — without it, JUCE mouse dispatch
        // can't find the peer and all events are silently dropped.
        g_editor->setSize(g_fbWidth, g_fbHeight);
        g_editor->addToDesktop(0);
        g_editor->setVisible(true);
        juce_wasm_dispatch_messages();
    }

    g_framebuffer = new juce::Image(juce::Image::ARGB, g_fbWidth, g_fbHeight, true);

    // Initialize parameter change tracking
    if (g_processor->synth_data) {
        auto& params = g_processor->synth_data->get_atomateable_parameters();
        g_numParams = params.size();
        g_paramSnapshot = new float[g_numParams];
        for (int i = 0; i < g_numParams; i++) {
            g_paramSnapshot[i] = params.getUnchecked(i)->get_value();
        }
    }

    EM_ASM({ console.log("[MoniqueUI WASM] Init complete: " + $0 + "x" + $1 + ", params=" + $2); },
            g_fbWidth, g_fbHeight, g_numParams);
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_tick()
{
    if (!g_editor || !g_framebuffer) return;

    juce_wasm_dispatch_messages();

    if (g_processor->ui_refresher)
        g_processor->ui_refresher->timerCallback();

    // Poll for parameter changes and notify JS
    if (g_paramSnapshot && g_processor->synth_data) {
        auto& params = g_processor->synth_data->get_atomateable_parameters();
        for (int i = 0; i < g_numParams && i < params.size(); i++) {
            float val = params.getUnchecked(i)->get_value();
            if (val != g_paramSnapshot[i]) {
                g_paramSnapshot[i] = val;
                EM_ASM({
                    if (window._moniqueUIParamCallback)
                        window._moniqueUIParamCallback($0, $1);
                }, i, val);
            }
        }
    }

    juce::Graphics g(*g_framebuffer);
    g.fillAll(juce::Colours::black);
    g_editor->paintEntireComponent(g, true);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* monique_ui_get_fb()
{
    if (!g_framebuffer) return nullptr;
    juce::Image::BitmapData bitmapData(*g_framebuffer, juce::Image::BitmapData::readOnly);
    return bitmapData.data;
}

EMSCRIPTEN_KEEPALIVE
int monique_ui_get_width()  { return g_fbWidth; }

EMSCRIPTEN_KEEPALIVE
int monique_ui_get_height() { return g_fbHeight; }

EMSCRIPTEN_KEEPALIVE
void monique_ui_on_mouse_down(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x, (float)y);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, true), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_on_mouse_up(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x, (float)y);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, false), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_on_mouse_move(int x, int y, int mods)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x, (float)y);
    auto time = (juce::int64)juce::Time::currentTimeMillis();
    peer->handleMouseEvent(juce::MouseInputSource::InputSourceType::mouse,
                           pos, modsFromJS(mods, (mods & 16) != 0), 0.0f, 0.0f, time);
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_on_mouse_wheel(int x, int y, float deltaX, float deltaY)
{
    if (!g_editor) return;
    auto* peer = g_editor->getPeer();
    if (!peer) return;
    auto pos = juce::Point<float>((float)x, (float)y);
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
int monique_ui_get_num_params()
{
    return g_numParams;
}

EMSCRIPTEN_KEEPALIVE
float monique_ui_get_param(int index)
{
    if (!g_processor || !g_processor->synth_data) return 0.0f;
    auto& params = g_processor->synth_data->get_atomateable_parameters();
    if (index < 0 || index >= params.size()) return 0.0f;
    return params.getUnchecked(index)->get_value();
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_set_param(int index, float value)
{
    if (!g_processor || !g_processor->synth_data) return;
    auto& params = g_processor->synth_data->get_atomateable_parameters();
    if (index < 0 || index >= params.size()) return;
    params.getUnchecked(index)->set_value(value);
    if (g_paramSnapshot && index < g_numParams)
        g_paramSnapshot[index] = value; // update snapshot to avoid re-triggering callback
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_shutdown()
{
    if (g_editor) {
        g_editor->removeFromDesktop();
    }
    if (g_processor && g_midiForwarder) {
        static_cast<juce::MidiKeyboardState*>(g_processor)->removeListener(g_midiForwarder);
    }
    delete g_midiForwarder; g_midiForwarder = nullptr;
    delete g_editor;      g_editor = nullptr;
    delete g_framebuffer; g_framebuffer = nullptr;
    delete[] g_paramSnapshot; g_paramSnapshot = nullptr; g_numParams = 0;
    delete g_processor;   g_processor = nullptr;
}

} // extern "C"
