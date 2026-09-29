/**
 * BuzzmachineWrapper.cpp
 *
 * C++ wrapper for buzzmachines to provide clean WASM exports.
 * Each buzzmachine will be compiled with this wrapper to provide
 * a standardized interface for the AudioWorklet.
 *
 * The machine implementation should include:
 * - CMachineInfo MacInfo (machine metadata)
 * - class mi : public CMachineInterface (machine implementation)
 * - DLL_EXPORTS macro (GetInfo and CreateMachine functions)
 */

#include <MachineInterface.h>
#ifdef USE_MDK
#include <mdk.h>
#include <mdkimp.h>
#endif
#include <cstdlib>
#include <cstring>
#include <cmath>

#ifdef EMSCRIPTEN
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

// These functions are provided by DLL_EXPORTS macro in the machine source
extern "C" {
    CMachineInfo const *GetInfo();
    CMachineInterface *CreateMachine();
}

// =============================================================================
// Host environment stubs - CMasterInfo and CMICallbacks
// =============================================================================

// Pre-computed oscillator tables (sine, saw, square, triangle, noise)
// Each table has 2048 samples for the base level
static short g_OscillatorTables[6][4096];  // 6 waveforms: sine, saw, pulse, tri, noise, 303saw
static bool g_TablesInitialized = false;

static void InitOscillatorTables() {
    if (g_TablesInitialized) return;

    // Sine wave
    for (int i = 0; i < 2048; i++) {
        g_OscillatorTables[OWF_SINE][i] = (short)(sin(2.0 * PI * i / 2048.0) * 32767.0);
    }

    // Sawtooth wave
    for (int i = 0; i < 2048; i++) {
        g_OscillatorTables[OWF_SAWTOOTH][i] = (short)((i - 1024) * 32767 / 1024);
    }

    // Square/Pulse wave
    for (int i = 0; i < 2048; i++) {
        g_OscillatorTables[OWF_PULSE][i] = (i < 1024) ? 32767 : -32767;
    }

    // Triangle wave
    for (int i = 0; i < 2048; i++) {
        if (i < 512) {
            g_OscillatorTables[OWF_TRIANGLE][i] = (short)(i * 32767 / 512);
        } else if (i < 1536) {
            g_OscillatorTables[OWF_TRIANGLE][i] = (short)((1024 - i) * 32767 / 512);
        } else {
            g_OscillatorTables[OWF_TRIANGLE][i] = (short)((i - 2048) * 32767 / 512);
        }
    }

    // Noise (pseudo-random)
    unsigned int seed = 12345;
    for (int i = 0; i < 2048; i++) {
        seed = seed * 1103515245 + 12345;
        g_OscillatorTables[OWF_NOISE][i] = (short)((seed >> 16) - 32768);
    }

    // 303 Sawtooth (same as regular saw for now)
    for (int i = 0; i < 2048; i++) {
        g_OscillatorTables[OWF_303_SAWTOOTH][i] = g_OscillatorTables[OWF_SAWTOOTH][i];
    }

    g_TablesInitialized = true;
}

// Global master info structure
static CMasterInfo g_MasterInfo = {
    120,        // BeatsPerMin
    4,          // TicksPerBeat
    44100,      // SamplesPerSec
    11025,      // SamplesPerTick (44100 / (120/60 * 4))
    0,          // PosInTick
    8.0f        // TicksPerSec
};

// Stub wave info
static CWaveInfo g_WaveInfo = { 0, 1.0f };
static CWaveLevel g_WaveLevel = { 0, nullptr, 60, 44100, 0, 0 };

/**
 * Stub implementation of CMICallbacks
 * Provides minimal functionality needed by most machines
 */
// One machine per WASM module instance (one per worklet node), so the host
// state below is the machine's own.
static int g_OutputChannels = 1;
static CMachineInterfaceEx *g_MachineEx = nullptr;

class StubCallbacks : public CMICallbacks {
public:
    virtual CWaveInfo const *GetWave(int const i) override {
        return &g_WaveInfo;
    }

    virtual CWaveLevel const *GetWaveLevel(int const i, int const level) override {
        return &g_WaveLevel;
    }

    virtual void MessageBox(char const *txt) override {
        // No-op in WASM
    }

    virtual void Lock() override {}
    virtual void Unlock() override {}

    virtual int GetWritePos() override { return 0; }
    virtual int GetPlayPos() override { return 0; }

    virtual float *GetAuxBuffer() override { return nullptr; }
    virtual void ClearAuxBuffer() override {}

    virtual int GetFreeWave() override { return 0; }
    virtual bool AllocateWave(int const i, int const size, char const *name) override { return false; }

    virtual void ScheduleEvent(int const time, dword const data) override {}
    virtual void MidiOut(int const dev, dword const data) override {}

    virtual short const *GetOscillatorTable(int const waveform) override {
        InitOscillatorTables();
        if (waveform >= 0 && waveform <= 5) {
            return g_OscillatorTables[waveform];
        }
        return g_OscillatorTables[OWF_SINE];
    }

    virtual int GetEnvSize(int const wave, int const env) override { return 0; }
    virtual bool GetEnvPoint(int const wave, int const env, int const i, word &x, word &y, int &flags) override { return false; }

    virtual CWaveLevel const *GetNearestWaveLevel(int const i, int const note) override {
#ifdef USE_MDK
        // MDK hack: sentinel (-1, -1) means "allocate a CMDKImplementation"
        // The MDK framework uses this to pass the implementation object through
        // the CMICallbacks interface (see mdkimp.cpp CMDKMachineInterface::Init)
        if (i == -1 && note == -1) {
            return (CWaveLevel const *)(new CMDKImplementation());
        }
#endif
        return &g_WaveLevel;
    }

    virtual void SetNumberOfTracks(int const n) override {}
    virtual CPattern *CreatePattern(char const *name, int const length) override { return nullptr; }
    virtual CPattern *GetPattern(int const index) override { return nullptr; }
    virtual char const *GetPatternName(CPattern *ppat) override { return ""; }
    virtual void RenamePattern(char const *oldname, char const *newname) override {}
    virtual void DeletePattern(CPattern *ppat) override {}
    virtual int GetPatternData(CPattern *ppat, int const row, int const group, int const track, int const field) override { return 0; }
    virtual void SetPatternData(CPattern *ppat, int const row, int const group, int const track, int const field, int const value) override {}

    virtual CSequence *CreateSequence() override { return nullptr; }
    virtual void DeleteSequence(CSequence *pseq) override {}
    virtual CPattern *GetSequenceData(int const row) override { return nullptr; }
    virtual void SetSequenceData(int const row, CPattern *ppat) override {}

    // Buzz 1.2 machines hand the host their extended interface here (MDK: in
    // Init); AddInput / Input live on it.
    virtual void SetMachineInterfaceEx(CMachineInterfaceEx *pex) override { g_MachineEx = pex; }
    virtual void ControlChange__obsolete__(int group, int track, int param, int value) override {}

    virtual int ADGetnumChannels(bool input) override { return 2; }
    virtual void ADWrite(int channel, float *psamples, int numsamples) override {}
    virtual void ADRead(int channel, float *psamples, int numsamples) override {}

    virtual CMachine *GetThisMachine() override { return nullptr; }
    virtual void ControlChange(CMachine *pmac, int group, int track, int param, int value) override {}

    virtual CSequence *GetPlayingSequence(CMachine *pmac) override { return nullptr; }
    virtual void *GetPlayingRow(CSequence *pseq, int group, int track) override { return nullptr; }

    virtual int GetStateFlags() override { return SF_PLAYING; }

    // The channel count an MDK machine asks for: 1 = Work(), 2 = WorkMonoToStereo().
    virtual void SetnumOutputChannels(CMachine *pmac, int n) override { g_OutputChannels = n; }
    virtual void SetEventHandler(CMachine *pmac, BEventType et, EVENT_HANDLER_PTR p, void *param) override {}

    virtual char const *GetWaveName(int const i) override { return ""; }
    virtual void SetInternalWaveName(CMachine *pmac, int const i, char const *name) override {}

    virtual void GetMachineNames(CMachineDataOutput *pout) override {}
    virtual CMachine *GetMachine(char const *name) override { return nullptr; }
    virtual CMachineInfo const *GetMachineInfo(CMachine *pmac) override { return GetInfo(); }
    virtual char const *GetMachineName(CMachine *pmac) override { return ""; }

    virtual bool GetInput(int index, float *psamples, int numsamples, bool stereo, float *extrabuffer) override { return false; }
};

// Global callbacks instance
static StubCallbacks g_Callbacks;

// =============================================================================
// WASM Exports
// =============================================================================

/**
 * Get machine information (name, parameters, etc.)
 * Returns pointer to CMachineInfo struct
 */
extern "C" EXPORT CMachineInfo const *buzz_get_info() {
    return GetInfo();
}

/**
 * Create a new machine instance and set up host environment
 * Returns opaque pointer to CMachineInterface
 */
extern "C" EXPORT CMachineInterface *buzz_create_machine() {
    CMachineInterface *machine = CreateMachine();
    if (machine) {
        // Set up the host environment pointers
        machine->pMasterInfo = &g_MasterInfo;
        machine->pCB = &g_Callbacks;
    }
    return machine;
}

/**
 * Set sample rate for the machine
 * Should be called before Init()
 */
extern "C" EXPORT void buzz_set_sample_rate(int sampleRate) {
    g_MasterInfo.SamplesPerSec = sampleRate;
    // Recalculate derived values
    g_MasterInfo.SamplesPerTick = (int)((60.0 * sampleRate) / (g_MasterInfo.BeatsPerMin * g_MasterInfo.TicksPerBeat));
    g_MasterInfo.TicksPerSec = (float)sampleRate / (float)g_MasterInfo.SamplesPerTick;
}

/**
 * Set BPM for the machine
 */
extern "C" EXPORT void buzz_set_bpm(int bpm) {
    g_MasterInfo.BeatsPerMin = bpm;
    g_MasterInfo.SamplesPerTick = (int)((60.0 * g_MasterInfo.SamplesPerSec) / (bpm * g_MasterInfo.TicksPerBeat));
    g_MasterInfo.TicksPerSec = (float)g_MasterInfo.SamplesPerSec / (float)g_MasterInfo.SamplesPerTick;
}

/**
 * Initialize machine with optional saved data
 * @param machine Pointer to machine instance
 * @param data Optional initialization data (can be NULL)
 */
/**
 * The Buzz host contract: a machine's values start at their defaults.
 * Attributes take DefValue before Init; after Init every state parameter
 * (MPF_STATE) takes DefValue and notes/triggers take NoValue, in the packed
 * global values and in every track's values (maxTracks of them).
 *
 * This host skipped it, so every value started at 0: Jeskola Delay's track
 * length was 0 and its WorkTrack loop never advanced (the whole audio thread
 * hung - the browser tab froze), and machines whose gain or mix defaulted to
 * 0 were silent (2026-09-29).
 */
static void writeParamDefault(unsigned char *&p, CMachineParameter const *par) {
    const int v = (par->Flags & MPF_STATE) ? par->DefValue : par->NoValue;
    if (par->Type == pt_word) {
        const unsigned short w = (unsigned short)v;
        std::memcpy(p, &w, 2);
        p += 2;
    } else {
        *p = (unsigned char)v;
        p += 1;
    }
}

static void writeAttributeDefaults(CMachineInterface *machine, CMachineInfo const *info) {
    if (!machine->AttrVals || !info) return;
    for (int i = 0; i < info->numAttributes; i++) machine->AttrVals[i] = info->Attributes[i]->DefValue;
}

static void writeParameterDefaults(CMachineInterface *machine, CMachineInfo const *info) {
    if (!info) return;
    if (machine->GlobalVals) {
        unsigned char *p = (unsigned char *)machine->GlobalVals;
        for (int i = 0; i < info->numGlobalParameters; i++) writeParamDefault(p, info->Parameters[i]);
    }
    if (machine->TrackVals && info->numTrackParameters > 0) {
        unsigned char *p = (unsigned char *)machine->TrackVals;
        for (int t = 0; t < info->maxTracks; t++)
            for (int i = 0; i < info->numTrackParameters; i++)
                writeParamDefault(p, info->Parameters[info->numGlobalParameters + i]);
    }
}

extern "C" EXPORT void buzz_init(CMachineInterface *machine, CMachineDataInput *data) {
    if (machine) {
        // Ensure host environment is set up
        if (!machine->pMasterInfo) {
            machine->pMasterInfo = &g_MasterInfo;
        }
        if (!machine->pCB) {
            machine->pCB = &g_Callbacks;
        }
        CMachineInfo const *info = GetInfo();
        writeAttributeDefaults(machine, info);
        machine->Init(data);
        writeParameterDefaults(machine, info);
        // The host announces the attribute values after loading them; machines
        // size their buffers here (Jeskola Delay / CrossDelay: MaxDelay stayed 0,
        // every track length clamped to 0, and WorkTrack never advanced).
        if (info && info->numAttributes > 0) machine->AttributesChanged();
        // An input-mixing (MDK) machine receives its audio through Input(), from
        // inputs it has been told about: this host feeds it one stereo input.
        if (info && (info->Flags & MIF_DOES_INPUT_MIXING) && g_MachineEx) g_MachineEx->AddInput("DEViLBOX", true);
    }
}

/**
 * Process parameters for current tick
 * Call this before Work() to update parameter changes
 */
extern "C" EXPORT void buzz_tick(CMachineInterface *machine) {
    if (machine) {
        // Update position in tick
        g_MasterInfo.PosInTick = 0;
        machine->Tick();
    }
}

/**
 * Process audio samples
 * @param machine Pointer to machine instance
 * @param samples Stereo float buffer (interleaved L/R)
 * @param numSamples Number of stereo sample pairs (max 256)
 * @param mode WM_NOIO=0, WM_READ=1, WM_WRITE=2, WM_READWRITE=3
 * @return true if machine produced audio, false if silent
 */
/*
 * `samples` is always interleaved stereo (numSamples pairs), in and out. Each
 * machine gets the buffer shape its flags ask for:
 *   MIF_DOES_INPUT_MIXING  Input(stereo) then Work (mono) or
 *                          WorkMonoToStereo, as the machine chose through
 *                          SetnumOutputChannels
 *   MIF_MONO_TO_STEREO     WorkMonoToStereo(mono in, stereo out)
 *   otherwise              Work(mono) - Buzz machines are mono
 * This host used to call Work() on every machine with the interleaved buffer:
 * input-mixing machines never received audio (silent), mono-to-stereo ones
 * never ran, and mono ones processed L,R,L,R... as consecutive samples.
 */
static float g_Mono[1024];

static void monoToStereo(float *samples, int n) {
    for (int i = n - 1; i >= 0; i--) { samples[2 * i] = g_Mono[i]; samples[2 * i + 1] = g_Mono[i]; }
}

extern "C" EXPORT bool buzz_work(CMachineInterface *machine, float *samples, int numSamples, int mode) {
    if (!machine || numSamples <= 0) return false;
    const int n = numSamples > 1024 ? 1024 : numSamples;
    CMachineInfo const *info = GetInfo();
    const int flags = info ? info->Flags : 0;
    const bool reads = (mode & WM_READ) != 0;

    for (int i = 0; i < n; i++) g_Mono[i] = reads ? 0.5f * (samples[2 * i] + samples[2 * i + 1]) : 0.0f;

    if ((flags & MIF_DOES_INPUT_MIXING) && g_MachineEx) {
        g_MachineEx->Input(reads ? samples : nullptr, n, 1.0f);
        // The mono input goes in `pin` too: the MDK's own WorkMonoToStereo
        // ignores it (it mixed Input() into a buffer), but a machine that
        // overrides WorkMonoToStereo (WhiteNoise WhiteChorus) reads it.
        if (g_OutputChannels >= 2) return machine->WorkMonoToStereo(g_Mono, samples, n, mode);
        const bool ret = machine->Work(g_Mono, n, mode);
        monoToStereo(samples, n);
        return ret;
    }

    if (flags & MIF_MONO_TO_STEREO) return machine->WorkMonoToStereo(g_Mono, samples, n, mode);

    const bool ret = machine->Work(g_Mono, n, mode);
    monoToStereo(samples, n);
    return ret;
}

/**
 * Stop/release all notes
 */
extern "C" EXPORT void buzz_stop(CMachineInterface *machine) {
    if (machine) {
        machine->Stop();
    }
}

/**
 * Set a global parameter value
 * @param machine Pointer to machine instance
 * @param index Parameter index
 * @param value Parameter value
 */
extern "C" EXPORT void buzz_set_parameter(CMachineInterface *machine, int index, int value) {
    if (!machine || !machine->GlobalVals) return;

    CMachineInfo const *info = GetInfo();
    if (!info) return;

    // Compute byte offset by walking parameter types
    int byteOffset = 0;
    int targetGroup = 0; // 0=global, 1=track
    int targetIndex = index;

    // Check if index falls within global params
    if (index < info->numGlobalParameters) {
        for (int i = 0; i < index; i++) {
            CMachineParameter const *p = info->Parameters[i];
            if (!p) continue;
            switch (p->Type) {
                case pt_note:
                case pt_switch:
                case pt_byte:
                    byteOffset += 1;
                    break;
                case pt_word:
                    byteOffset += 2;
                    break;
            }
        }
        targetGroup = 0;
    } else {
        // Track parameter — compute offset into track vals
        int trackParamIndex = index - info->numGlobalParameters;
        byteOffset = 0;
        for (int i = info->numGlobalParameters; i < info->numGlobalParameters + trackParamIndex; i++) {
            CMachineParameter const *p = info->Parameters[i];
            if (!p) continue;
            switch (p->Type) {
                case pt_note:
                case pt_switch:
                case pt_byte:
                    byteOffset += 1;
                    break;
                case pt_word:
                    byteOffset += 2;
                    break;
            }
        }
        targetGroup = 1;
    }

    // Get target pointer
    unsigned char *target;
    if (targetGroup == 0) {
        target = (unsigned char *)machine->GlobalVals;
    } else {
        target = (unsigned char *)machine->TrackVals;
        if (!target) return;
    }

    // Get param type
    CMachineParameter const *param = info->Parameters[index];
    if (!param) return;

    // Write value at correct offset with correct size
    switch (param->Type) {
        case pt_note:
        case pt_switch:
        case pt_byte:
            target[byteOffset] = (unsigned char)(value & 0xFF);
            break;
        case pt_word:
            *(unsigned short *)(target + byteOffset) = (unsigned short)(value & 0xFFFF);
            break;
    }
}

/**
 * Destroy machine instance
 */
extern "C" EXPORT void buzz_delete_machine(CMachineInterface *machine) {
    if (machine) {
        delete machine;
    }
}

/**
 * Get pointer to global parameter values
 * Returns pointer to parameter struct (varies by machine)
 */
extern "C" EXPORT void *buzz_get_global_vals(CMachineInterface *machine) {
    if (machine) {
        return machine->GlobalVals;
    }
    return nullptr;
}

/**
 * Set number of tracks (for multi-track machines)
 */
extern "C" EXPORT void buzz_set_num_tracks(CMachineInterface *machine, int numTracks) {
    if (machine) {
        machine->SetNumTracks(numTracks);
    }
}

/**
 * Get pointer to track parameter values for a specific track
 * Returns pointer to track parameter struct (varies by machine)
 * @param machine Pointer to machine instance
 * @param trackIndex Track index (0-based)
 */
extern "C" EXPORT void *buzz_get_track_vals(CMachineInterface *machine, int trackIndex) {
    if (machine && machine->TrackVals) {
        // Get machine info to determine track parameter size
        CMachineInfo const *info = GetInfo();
        if (info) {
            // Calculate size of one track's parameters
            int trackSize = 0;
            for (int i = info->numGlobalParameters; i < info->numGlobalParameters + info->numTrackParameters; i++) {
                CMachineParameter const *param = info->Parameters[i];
                if (param) {
                    switch (param->Type) {
                        case pt_note:
                        case pt_switch:
                        case pt_byte:
                            trackSize += 1;
                            break;
                        case pt_word:
                            trackSize += 2;
                            break;
                    }
                }
            }
            if (trackSize > 0) {
                // Return pointer to the specified track's values
                return (char *)machine->TrackVals + (trackIndex * trackSize);
            }
        }
        // Fallback: just return TrackVals (track 0)
        return machine->TrackVals;
    }
    return nullptr;
}

/**
 * Get machine info pointer for inspecting parameters
 */
extern "C" EXPORT CMachineInfo const *buzz_get_machine_info(CMachineInterface *machine) {
    return GetInfo();
}
