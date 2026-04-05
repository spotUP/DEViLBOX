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

// Parameter change tracking — direct pointers to synth_data fields
// in the same order as the audio WASM's MoniqueParams enum (120 params).
static constexpr int AUDIO_PARAM_COUNT = 120;
static Parameter* g_audioParams[AUDIO_PARAM_COUNT] = {};
static float g_audioSnapshot[AUDIO_PARAM_COUNT] = {};

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

    // Build direct parameter pointer array matching audio WASM's MoniqueParams enum.
    // This ensures index parity between UI polling and audio setParam.
    if (g_processor->synth_data) {
        auto* sd = g_processor->synth_data;
        int p = 0;
        // Master (5): volume, glide, octave_offset, note_offset, sync
        g_audioParams[p++] = &sd->volume;
        g_audioParams[p++] = &sd->glide;
        g_audioParams[p++] = &sd->octave_offset;
        g_audioParams[p++] = &sd->note_offset;
        g_audioParams[p++] = &sd->sync;
        // Osc1-3 (4 each = 12): wave, tune, fm_amount, sync
        for (int i = 0; i < 3; i++) {
            g_audioParams[p++] = &sd->osc_datas[i]->wave;
            g_audioParams[p++] = &sd->osc_datas[i]->tune;
            g_audioParams[p++] = &sd->osc_datas[i]->fm_amount;
            g_audioParams[p++] = &sd->osc_datas[i]->sync;
        }
        // FM Osc (4): fm_freq, fm_shape, fm_swing, master_shift
        g_audioParams[p++] = &sd->fm_osc_data->fm_freq;
        g_audioParams[p++] = &sd->fm_osc_data->fm_shape;
        g_audioParams[p++] = &sd->fm_osc_data->fm_swing;
        g_audioParams[p++] = &sd->fm_osc_data->master_shift;
        // Filter1-3 (7 each = 21): type, cutoff, resonance, distortion, output, pan, adsr_lfo_mix
        for (int i = 0; i < 3; i++) {
            g_audioParams[p++] = &sd->filter_datas[i]->filter_type;
            g_audioParams[p++] = &sd->filter_datas[i]->cutoff;
            g_audioParams[p++] = &sd->filter_datas[i]->resonance;
            g_audioParams[p++] = &sd->filter_datas[i]->distortion;
            g_audioParams[p++] = &sd->filter_datas[i]->output;
            g_audioParams[p++] = &sd->filter_datas[i]->pan;
            g_audioParams[p++] = &sd->filter_datas[i]->adsr_lfo_mix;
        }
        // FiltEnv1-3 via filter_datas[i]->env_data (6 each = 18)
        for (int i = 0; i < 3; i++) {
            g_audioParams[p++] = &sd->filter_datas[i]->env_data->attack;
            g_audioParams[p++] = &sd->filter_datas[i]->env_data->decay;
            g_audioParams[p++] = &sd->filter_datas[i]->env_data->sustain;
            g_audioParams[p++] = &sd->filter_datas[i]->env_data->sustain_time;
            g_audioParams[p++] = &sd->filter_datas[i]->env_data->release;
            g_audioParams[p++] = &sd->filter_datas[i]->env_data->shape;
        }
        // Env — main output (6)
        g_audioParams[p++] = &sd->env_data->attack;
        g_audioParams[p++] = &sd->env_data->decay;
        g_audioParams[p++] = &sd->env_data->sustain;
        g_audioParams[p++] = &sd->env_data->sustain_time;
        g_audioParams[p++] = &sd->env_data->release;
        g_audioParams[p++] = &sd->env_data->shape;
        // LFO1-3 (3 each = 9): speed, wave, phase_shift
        for (int i = 0; i < 3; i++) {
            g_audioParams[p++] = &sd->lfo_datas[i]->speed;
            g_audioParams[p++] = &sd->lfo_datas[i]->wave;
            g_audioParams[p++] = &sd->lfo_datas[i]->phase_shift;
        }
        // MFO1-4 (3 each = 12): speed, wave, phase_shift
        for (int i = 0; i < 4; i++) {
            g_audioParams[p++] = &sd->mfo_datas[i]->speed;
            g_audioParams[p++] = &sd->mfo_datas[i]->wave;
            g_audioParams[p++] = &sd->mfo_datas[i]->phase_shift;
        }
        // Routing — filter input sustain levels (3 filters x 3 oscs = 9)
        for (int f = 0; f < 3; f++)
            for (int o = 0; o < 3; o++)
                g_audioParams[p++] = &sd->filter_datas[f]->input_sustains[o];
        // FX (8): distortion, shape, delay, delay_pan, reverb room, reverb mix, chorus mod, bypass
        g_audioParams[p++] = &sd->distortion;
        g_audioParams[p++] = &sd->shape;
        g_audioParams[p++] = &sd->delay;
        g_audioParams[p++] = &sd->delay_pan;
        g_audioParams[p++] = &sd->reverb_data->room;
        g_audioParams[p++] = &sd->reverb_data->dry_wet_mix;
        g_audioParams[p++] = &sd->chorus_data->modulation;
        g_audioParams[p++] = &sd->effect_bypass;
        // Morph (4)
        for (int i = 0; i < 4; i++)
            g_audioParams[p++] = &sd->morhp_states[i];
        // Arp (4): is_on, is_sequencer, speed_multi, shuffle
        g_audioParams[p++] = &sd->arp_sequencer_data->is_on;
        g_audioParams[p++] = &sd->arp_sequencer_data->connect;
        g_audioParams[p++] = &sd->arp_sequencer_data->speed_multi;
        g_audioParams[p++] = &sd->arp_sequencer_data->shuffle;
        // EQ (8): 7 bands + bypass
        for (int i = 0; i < 7; i++)
            g_audioParams[p++] = &sd->eq_data->velocity[i];
        g_audioParams[p++] = &sd->eq_data->bypass;

        // Initialize snapshot
        for (int i = 0; i < AUDIO_PARAM_COUNT; i++) {
            g_audioSnapshot[i] = g_audioParams[i] ? g_audioParams[i]->get_value() : 0.0f;
        }
        EM_ASM({ console.log("[MoniqueUI WASM] Mapped " + $0 + " audio params for sync"); }, p);
    }

    EM_ASM({ console.log("[MoniqueUI WASM] Init complete: " + $0 + "x" + $1 + ", params=" + $2); },
            g_fbWidth, g_fbHeight, AUDIO_PARAM_COUNT);
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_tick()
{
    if (!g_editor || !g_framebuffer) return;

    juce_wasm_dispatch_messages();

    if (g_processor->ui_refresher)
        g_processor->ui_refresher->timerCallback();

    // Poll synth_data parameters and forward changes to audio engine.
    // Use tolerance to avoid flooding from smoother micro-changes.
    // Batch all changes into a single JS call to reduce postMessage overhead.
    {
        static int changedIndices[AUDIO_PARAM_COUNT];
        static float changedValues[AUDIO_PARAM_COUNT];
        int numChanged = 0;

        for (int i = 0; i < AUDIO_PARAM_COUNT; i++) {
            if (!g_audioParams[i]) continue;
            float val = g_audioParams[i]->get_value();
            float diff = val - g_audioSnapshot[i];
            if (diff > 0.001f || diff < -0.001f) {
                g_audioSnapshot[i] = val;
                changedIndices[numChanged] = i;
                changedValues[numChanged] = val;
                numChanged++;
            }
        }

        // Send changes one at a time (EM_ASM doesn't support arrays easily)
        for (int j = 0; j < numChanged; j++) {
            EM_ASM({
                if (window._moniqueUIParamCallback)
                    window._moniqueUIParamCallback($0, $1);
            }, changedIndices[j], changedValues[j]);
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
    return AUDIO_PARAM_COUNT;
}

EMSCRIPTEN_KEEPALIVE
float monique_ui_get_param(int index)
{
    if (index < 0 || index >= AUDIO_PARAM_COUNT || !g_audioParams[index]) return 0.0f;
    return g_audioParams[index]->get_value();
}

EMSCRIPTEN_KEEPALIVE
void monique_ui_set_param(int index, float value)
{
    if (index < 0 || index >= AUDIO_PARAM_COUNT || !g_audioParams[index]) return;
    g_audioParams[index]->set_value(value);
    g_audioSnapshot[index] = value;
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
    for (int i = 0; i < AUDIO_PARAM_COUNT; i++) g_audioParams[i] = nullptr;
    delete g_processor;   g_processor = nullptr;
}

} // extern "C"
