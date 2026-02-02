#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>
#include <map>

// Include Open303 headers
#include "rosic_Open303.h"

using namespace rosic;

extern "C" {

    struct JC303Instance {
        Open303* core;
        float* bufferL;
        float* bufferR;
        int bufferSize;
        double lastSample;
        double currentNoteFreq;
        
        struct Params {
            double cutoff;
            double resonance;
            double envMod;
            double decay;
            double accent;
            double volume;
            double waveform;
            double tuning;
            double slideTime;
            // Devil Fish / Advanced
            double ampSustain;
            double normalAttack;
            double accentAttack;
            double accentDecay;
            double ampDecay;
            double ampRelease;
            double preFilterHP;
            double feedbackHP;
            double postFilterHP;
            // Native Mods
            double filterTracking;
            double filterFM;
            double muffler; // 0=off, 1=soft, 2=hard
        } current, target;
    };

    static std::map<int, JC303Instance*> instances;
    static int nextId = 1;
    static const double SMOOTHING = 0.5;

    inline void smooth(double& current, double target) {
        current += (target - current) * SMOOTHING;
        if (std::abs(target - current) < 0.001) current = target;
    }

    int jc303_create(float sampleRate) {
        JC303Instance* inst = new JC303Instance();
        inst->core = new Open303();
        inst->core->setSampleRate((double)sampleRate);
        inst->core->setTuning(440.0);
        
        inst->bufferL = nullptr;
        inst->bufferR = nullptr;
        inst->bufferSize = 0;
        inst->lastSample = 0;
        inst->currentNoteFreq = 440.0;
        
        inst->target = { 
            800.0, 65.0, 60.0, 200.0, 70.0, -12.0, 0.0, 440.0, 60.0, // Core
            -100.0, 0.3, 3.0, 200.0, 3000.0, 1000.0, 150.0, 150.0, 150.0, // Advanced
            0.0, 0.0, 0.0 // Mods
        };
        inst->current = inst->target;
        
        int id = nextId++;
        instances[id] = inst;
        return id;
    }

    void jc303_set_buffer_size(int id, int size) {
        if (instances.find(id) == instances.end()) return;
        JC303Instance* inst = instances[id];
        if (inst->bufferSize != size) {
            if (inst->bufferL) delete[] inst->bufferL;
            if (inst->bufferR) delete[] inst->bufferR;
            inst->bufferSize = size;
            inst->bufferL = new float[size];
            inst->bufferR = new float[size];
        }
    }

    float* jc303_get_buffer_pointer(int id, int channel) {
        if (instances.find(id) == instances.end()) return nullptr;
        return (channel == 0) ? instances[id]->bufferL : instances[id]->bufferR;
    }

    void jc303_note_on(int id, int note, int velocity, double detune) {
        if (instances.find(id) != instances.end()) {
            instances[id]->core->noteOn(note, velocity, detune);
            // Track frequency for key tracking
            instances[id]->currentNoteFreq = 440.0 * pow(2.0, (double)(note-69)/12.0);
        }
    }

    void jc303_all_notes_off(int id) {
        if (instances.find(id) != instances.end()) {
            instances[id]->core->allNotesOff();
        }
    }

    // Setters
    void jc303_set_waveform(int id, double val) { if(instances.count(id)) instances[id]->target.waveform = std::max(0.0, std::min(1.0, val)); }
    void jc303_set_tuning(int id, double val) { if(instances.count(id)) instances[id]->target.tuning = val; }
    void jc303_set_cutoff(int id, double val) { if(instances.count(id)) instances[id]->target.cutoff = std::max(100.0, std::min(16000.0, val)); }
    void jc303_set_resonance(int id, double val) { if(instances.count(id)) instances[id]->target.resonance = std::max(0.0, std::min(100.0, val)); }
    void jc303_set_env_mod(int id, double val) { if(instances.count(id)) instances[id]->target.envMod = std::max(0.0, std::min(100.0, val)); }
    void jc303_set_decay(int id, double val) { if(instances.count(id)) instances[id]->target.decay = std::max(30.0, std::min(3000.0, val)); }
    void jc303_set_accent(int id, double val) { if(instances.count(id)) instances[id]->target.accent = std::max(0.0, std::min(100.0, val)); }
    void jc303_set_volume(int id, double val) { if(instances.count(id)) instances[id]->target.volume = val; }
    void jc303_set_slide_time(int id, double val) { if(instances.count(id)) instances[id]->target.slideTime = std::max(10.0, std::min(500.0, val)); }

    void jc303_set_amp_sustain(int id, double val) { if(instances.count(id)) instances[id]->target.ampSustain = val; }
    void jc303_set_normal_attack(int id, double val) { if(instances.count(id)) instances[id]->target.normalAttack = val; }
    void jc303_set_accent_attack(int id, double val) { if(instances.count(id)) instances[id]->target.accentAttack = val; }
    void jc303_set_accent_decay(int id, double val) { if(instances.count(id)) instances[id]->target.accentDecay = val; }
    void jc303_set_amp_decay(int id, double val) { if(instances.count(id)) instances[id]->target.ampDecay = val; }
    void jc303_set_amp_release(int id, double val) { if(instances.count(id)) instances[id]->target.ampRelease = val; }
    void jc303_set_pre_filter_hp(int id, double val) { if(instances.count(id)) instances[id]->target.preFilterHP = val; }
    void jc303_set_feedback_hp(int id, double val) { if(instances.count(id)) instances[id]->target.feedbackHP = val; }
    void jc303_set_post_filter_hp(int id, double val) { if(instances.count(id)) instances[id]->target.postFilterHP = val; }

    void jc303_set_filter_tracking(int id, double val) { if(instances.count(id)) instances[id]->target.filterTracking = val; }
    void jc303_set_filter_fm(int id, double val) { if(instances.count(id)) instances[id]->target.filterFM = val; }
    void jc303_set_muffler(int id, double val) { if(instances.count(id)) instances[id]->target.muffler = val; }

    void jc303_process(int id, int samples) {
        if (instances.find(id) == instances.end()) return;
        JC303Instance* inst = instances[id];
        
        #define SYNC_PARAM(NAME, SETTER) \
            if (inst->current.NAME != inst->target.NAME) { \
                smooth(inst->current.NAME, inst->target.NAME); \
                inst->core->SETTER(inst->current.NAME); \
            }

        SYNC_PARAM(cutoff, setCutoff)
        SYNC_PARAM(resonance, setResonance)
        SYNC_PARAM(envMod, setEnvMod)
        SYNC_PARAM(decay, setDecay)
        SYNC_PARAM(accent, setAccent)
        SYNC_PARAM(volume, setVolume)
        SYNC_PARAM(waveform, setWaveform)
        SYNC_PARAM(tuning, setTuning)
        SYNC_PARAM(slideTime, setSlideTime)
        SYNC_PARAM(ampSustain, setAmpSustain)
        SYNC_PARAM(normalAttack, setNormalAttack)
        SYNC_PARAM(accentAttack, setAccentAttack)
        SYNC_PARAM(accentDecay, setAccentDecay)
        SYNC_PARAM(ampDecay, setAmpDecay)
        SYNC_PARAM(ampRelease, setAmpRelease)
        SYNC_PARAM(preFilterHP, setPreFilterHighpass)
        SYNC_PARAM(feedbackHP, setFeedbackHighpass)
        SYNC_PARAM(postFilterHP, setPostFilterHighpass)

        #undef SYNC_PARAM
        
        // Also smooth local mod params
        smooth(inst->current.filterTracking, inst->target.filterTracking);
        smooth(inst->current.filterFM, inst->target.filterFM);
        smooth(inst->current.muffler, inst->target.muffler);

        for (int i = 0; i < samples; i++) {
            // Audio-rate Key Tracking & FM logic
            // Offset cutoff based on note frequency and previous output
            double trackingOffset = (inst->currentNoteFreq / 440.0) * inst->current.filterTracking * 10.0;
            double fmOffset = inst->lastSample * inst->current.filterFM * 500.0;
            
            if (std::abs(trackingOffset) > 0.01 || std::abs(fmOffset) > 0.01) {
                inst->core->setCutoff(inst->current.cutoff + trackingOffset + fmOffset);
            }

            double sample = inst->core->getSample();
            
            // Muffler (Soft Clipping)
            if (inst->current.muffler > 0.5) {
                double drive = (inst->current.muffler > 1.5) ? 4.0 : 2.0;
                sample = std::tanh(sample * drive);
            }
            
            inst->lastSample = sample;
            inst->bufferL[i] = inst->bufferR[i] = (float)sample;
        }
    }

    void jc303_destroy(int id) {
        if (instances.find(id) != instances.end()) {
            JC303Instance* inst = instances[id];
            delete inst->core;
            if (inst->bufferL) delete[] inst->bufferL;
            if (inst->bufferR) delete[] inst->bufferR;
            delete inst;
            instances.erase(id);
        }
    }
}
