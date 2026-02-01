#include <cstdint>
#include <cmath>
#include <vector>

// Include Open303 headers
// We will compile with -I to point to the source directory
#include "rosic_Open303.h"

using namespace rosic;

extern "C" {

    // Singleton instance
    static Open303* instance = nullptr;
    static float* audioBufferL = nullptr;
    static float* audioBufferR = nullptr;
    static int bufferSize = 0;

    // Initialize the engine
    void jc303_init(float sampleRate) {
        if (instance == nullptr) {
            instance = new Open303();
        }
        instance->setSampleRate((double)sampleRate);
        instance->setTuning(440.0);
    }

    // Set buffer size for processing
    void jc303_set_buffer_size(int size) {
        if (bufferSize != size) {
            if (audioBufferL) delete[] audioBufferL;
            if (audioBufferR) delete[] audioBufferR;
            
            bufferSize = size;
            audioBufferL = new float[bufferSize];
            audioBufferR = new float[bufferSize];
        }
    }

    // Get pointer to audio buffer (for JS to read/write)
    float* jc303_get_buffer_pointer(int channel) {
        if (channel == 0) return audioBufferL;
        return audioBufferR;
    }

    // Note On
    void jc303_note_on(int note, int velocity, double detune) {
        if (instance) {
            instance->noteOn(note, velocity, detune);
        }
    }

    // All Notes Off
    void jc303_all_notes_off() {
        if (instance) {
            instance->allNotesOff();
        }
    }

    // Parameters
    void jc303_set_waveform(double value) { if(instance) instance->setWaveform(value); }
    void jc303_set_tuning(double value) { if(instance) instance->setTuning(value); }
    void jc303_set_cutoff(double value) { if(instance) instance->setCutoff(value); }
    void jc303_set_resonance(double value) { if(instance) instance->setResonance(value); }
    void jc303_set_env_mod(double value) { if(instance) instance->setEnvMod(value); }
    void jc303_set_decay(double value) { if(instance) instance->setDecay(value); }
    void jc303_set_accent(double value) { if(instance) instance->setAccent(value); }
    void jc303_set_volume(double value) { if(instance) instance->setVolume(value); }
    void jc303_set_slide_time(double value) { if(instance) instance->setSlideTime(value); }

    // Process a block of audio
    // We fill the internal buffers, JS can then read them
    void jc303_process(int samples) {
        if (!instance || !audioBufferL) return;

        for (int i = 0; i < samples; i++) {
            // Open303 is mono, so we duplicate to stereo
            double sample = instance->getSample();
            
            // Open303 output is often quite hot or quiet depending on settings, 
            // but let's just pass it through. Soft clipping handles safety in JS.
            
            audioBufferL[i] = (float)sample;
            audioBufferR[i] = (float)sample;
        }
    }

    // Cleanup
    void jc303_destroy() {
        if (instance) {
            delete instance;
            instance = nullptr;
        }
        if (audioBufferL) {
            delete[] audioBufferL;
            audioBufferL = nullptr;
        }
        if (audioBufferR) {
            delete[] audioBufferR;
            audioBufferR = nullptr;
        }
    }
}
