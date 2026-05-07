#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

#ifdef __APPLE__
#include <AudioToolbox/AudioToolbox.h>
#endif

class KontaktHost {
public:
    using AudioCallback = std::function<void(const float* left, const float* right, std::uint32_t sampleCount)>;

    struct Status {
        bool pluginLoaded = false;
        std::string backend;
        std::string presetName;
        double sampleRate = 44100.0;
        std::uint32_t blockSize = 512;
        std::string lastError;
    };

    KontaktHost();
    ~KontaktHost();

    bool initialize();
    void shutdown();

    bool noteOn(int note, int velocity, int channel);
    bool noteOff(int note, int channel);
    bool controlChange(int cc, int value, int channel);
    bool loadPreset(const std::string& path);

    void setAudioCallback(AudioCallback callback);
    Status getStatus() const;

private:
    bool initializeMacAU();
    bool initializeWindowsVst3Stub();
    void renderLoop();
    void setError(const std::string& message);

    mutable std::mutex mutex_;
    AudioCallback audioCallback_;
    std::atomic<bool> running_{false};
    std::thread renderThread_;
    Status status_;

#ifdef __APPLE__
    AudioComponent component_ = nullptr;
    AudioUnit unit_ = nullptr;
#endif
};
