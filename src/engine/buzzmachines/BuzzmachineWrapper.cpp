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
static short g_OscillatorTables[5][4096];  // 5 waveforms, enough for all levels
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

    virtual void SetMachineInterfaceEx(CMachineInterfaceEx *pex) override {}
    virtual void ControlChange__obsolete__(int group, int track, int param, int value) override {}

    virtual int ADGetnumChannels(bool input) override { return 2; }
    virtual void ADWrite(int channel, float *psamples, int numsamples) override {}
    virtual void ADRead(int channel, float *psamples, int numsamples) override {}

    virtual CMachine *GetThisMachine() override { return nullptr; }
    virtual void ControlChange(CMachine *pmac, int group, int track, int param, int value) override {}

    virtual CSequence *GetPlayingSequence(CMachine *pmac) override { return nullptr; }
    virtual void *GetPlayingRow(CSequence *pseq, int group, int track) override { return nullptr; }

    virtual int GetStateFlags() override { return SF_PLAYING; }

    virtual void SetnumOutputChannels(CMachine *pmac, int n) override {}
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
extern "C" EXPORT void buzz_init(CMachineInterface *machine, CMachineDataInput *data) {
    if (machine) {
        // Ensure host environment is set up
        if (!machine->pMasterInfo) {
            machine->pMasterInfo = &g_MasterInfo;
        }
        if (!machine->pCB) {
            machine->pCB = &g_Callbacks;
        }
        machine->Init(data);
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
extern "C" EXPORT bool buzz_work(CMachineInterface *machine, float *samples, int numSamples, int mode) {
    if (machine) {
        return machine->Work(samples, numSamples, mode);
    }
    return false;
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
    if (machine && machine->GlobalVals) {
        // GlobalVals is a pointer to parameter struct
        // We need to set the value at the correct offset
        // This is tricky because parameter types vary (byte/word)
        // For now, we'll handle this in JavaScript by accessing GlobalVals directly
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
