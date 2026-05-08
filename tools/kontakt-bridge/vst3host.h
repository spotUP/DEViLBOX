#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#ifdef __APPLE__
#include <AudioToolbox/AudioToolbox.h>
#endif

struct PluginInfo {
    std::string name;
    std::string manufacturer;
    std::uint32_t type = 0;
    std::uint32_t subType = 0;
    std::uint32_t mfr = 0;
};

struct PluginSlot {
    int slotId = -1;
#ifdef __APPLE__
    AudioComponent component = nullptr;
    AudioUnit unit = nullptr;
    AudioUnit outputUnit = nullptr;
    AUGraph graph = nullptr;
    AUNode instrNode = 0;
    AUNode outputNode = 0;
#endif
    std::string pluginName;
    std::string presetName;
    bool loaded = false;
};

class KontaktHost {
public:
    using AudioCallback = std::function<void(const float* left, const float* right, std::uint32_t sampleCount)>;

    struct Status {
        bool pluginLoaded = false;
        std::string backend;
        std::string pluginName;
        std::string presetName;
        double sampleRate = 44100.0;
        std::uint32_t blockSize = 512;
        std::string lastError;
    };

    KontaktHost();
    ~KontaktHost();

    bool initialize();
    void shutdown();

    std::vector<PluginInfo> listPlugins() const;
    int loadPlugin(const std::string& name);
    void unloadPlugin(int slot = 0);

    bool noteOn(int note, int velocity, int channel, int slot = 0);
    bool noteOff(int note, int channel, int slot = 0);
    bool controlChange(int cc, int value, int channel, int slot = 0);
    bool programChange(int program, int channel, int slot = 0);
    bool loadPreset(const std::string& path, int slot = 0);
    bool saveState(const std::string& path, int slot = 0);
    bool restoreState(const std::string& path, int slot = 0);

    void showGUI(int slot = 0);
    void closeGUI(int slot = 0);

    void setAudioCallback(AudioCallback callback);
    void setDirectAudio(bool enable);
    Status getStatus(int slot = 0) const;
    std::vector<int> getSlotIds() const;
    PluginSlot* getSlot(int slot);

    // Transport sync — called from WS message handler
    void setTransport(bool playing, double bpm, double beatPosition);

private:
    bool initializeMacAU();
    bool initializeWindowsVst3Stub();
    void renderLoop();
    void setError(const std::string& message);

#ifdef __APPLE__
    void installHostCallbacks(AudioUnit unit);
    void disposeSlot(PluginSlot& slot);
    static OSStatus outputRenderCallback(void* ctx,
                                         AudioUnitRenderActionFlags* ioFlags,
                                         const AudioTimeStamp* inTimeStamp,
                                         UInt32 inBus,
                                         UInt32 inNumFrames,
                                         AudioBufferList* ioData);

    // AU host callback functions (static, called from real-time thread)
    static OSStatus hostGetBeatAndTempo(void* ctx, Float64* outCurrentBeat, Float64* outCurrentTempo);
    static OSStatus hostGetTransportState(void* ctx, Boolean* outIsPlaying,
                                          Boolean* outTransportStateChanged,
                                          Float64* outCurrentSampleInTimeLine,
                                          Boolean* outIsCycling,
                                          Float64* outCycleStartBeat,
                                          Float64* outCycleEndBeat);
    static OSStatus hostGetMusicalTimeLocation(void* ctx, UInt32* outDeltaSampleOffsetToNextBeat,
                                                Float32* outTimeSig_Numerator,
                                                UInt32* outTimeSig_Denominator,
                                                Float64* outCurrentMeasureDownBeat);
#endif

    mutable std::mutex mutex_;
    std::shared_ptr<AudioCallback> audioCallback_;
    std::atomic<bool> running_{false};
    std::atomic<bool> directAudio_{true};
    std::atomic<double> sampleRate_{44100.0};
    std::thread renderThread_;
    Status status_;

    // Transport state (atomics for lock-free access from real-time thread)
    std::atomic<bool> transportPlaying_{false};
    std::atomic<double> transportTempo_{120.0};
    std::atomic<double> transportBeatPosition_{0.0};
    std::atomic<double> transportSamplePosition_{0.0};
    std::atomic<bool> transportStateChanged_{false};

#ifdef __APPLE__
    std::map<int, PluginSlot> slots_;
    int nextSlotId_ = 0;
#endif
};
