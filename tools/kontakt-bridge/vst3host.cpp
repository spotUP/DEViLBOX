#include "vst3host.h"

#include <algorithm>
#include <chrono>
#include <csignal>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

namespace {
std::string pathStem(const std::string& path) {
    return std::filesystem::path(path).stem().string();
}
}

KontaktHost::KontaktHost() {
    status_.backend = "none";
}

KontaktHost::~KontaktHost() {
    shutdown();
}

bool KontaktHost::initialize() {
#ifdef __APPLE__
    return initializeMacAU();
#elif defined(_WIN32)
    return initializeWindowsVst3Stub();
#else
    setError("Kontakt hosting is only supported on macOS and Windows");
    return false;
#endif
}

void KontaktHost::shutdown() {
    running_ = false;
    if (renderThread_.joinable()) {
        renderThread_.join();
    }

#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    if (unit_) {
        AudioUnitUninitialize(unit_);
        AudioComponentInstanceDispose(unit_);
        unit_ = nullptr;
    }
    component_ = nullptr;
#endif
}

bool KontaktHost::noteOn(int note, int velocity, int channel) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    if (!unit_) {
        return false;
    }
    return MusicDeviceMIDIEvent(unit_, static_cast<UInt32>(0x90 | (channel & 0x0f)), static_cast<UInt32>(note), static_cast<UInt32>(velocity), 0) == noErr;
#else
    (void)note;
    (void)velocity;
    (void)channel;
    return false;
#endif
}

bool KontaktHost::noteOff(int note, int channel) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    if (!unit_) {
        return false;
    }
    return MusicDeviceMIDIEvent(unit_, static_cast<UInt32>(0x80 | (channel & 0x0f)), static_cast<UInt32>(note), 0, 0) == noErr;
#else
    (void)note;
    (void)channel;
    return false;
#endif
}

bool KontaktHost::controlChange(int cc, int value, int channel) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    if (!unit_) {
        return false;
    }
    return MusicDeviceMIDIEvent(unit_, static_cast<UInt32>(0xB0 | (channel & 0x0f)), static_cast<UInt32>(cc), static_cast<UInt32>(value), 0) == noErr;
#else
    (void)cc;
    (void)value;
    (void)channel;
    return false;
#endif
}

bool KontaktHost::loadPreset(const std::string& path) {
    if (!std::filesystem::exists(path)) {
        setError("Preset file not found: " + path);
        return false;
    }

#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    if (!unit_) {
        setError("Kontakt AU is not initialized");
        return false;
    }

    // Read the entire file
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) {
        setError("Cannot open file: " + path);
        return false;
    }
    auto fileSize = file.tellg();
    file.seekg(0);
    std::vector<uint8_t> fileData(static_cast<size_t>(fileSize));
    file.read(reinterpret_cast<char*>(fileData.data()), fileSize);
    file.close();

    // Try to extract PCHK blob from NKSF RIFF container
    std::vector<uint8_t> pchkBlob;
    if (fileSize >= 12) {
        uint32_t riffId = 0;
        std::memcpy(&riffId, fileData.data(), 4);
        // "RIFF" = 0x46464952 little-endian
        if (riffId == 0x46464952u) {
            // Skip RIFF header (4 bytes ID + 4 bytes size + 4 bytes form type)
            size_t offset = 12;
            while (offset + 8 <= fileData.size()) {
                uint32_t chunkId = 0;
                uint32_t chunkSize = 0;
                std::memcpy(&chunkId, fileData.data() + offset, 4);
                std::memcpy(&chunkSize, fileData.data() + offset + 4, 4); // LE

                // "PCHK" = 0x4B484350 big-endian
                if (chunkId == 0x4B484350u) {
                    // PCHK chunk: skip 4-byte version, rest is plugin state blob
                    if (offset + 8 + 4 <= fileData.size() && chunkSize > 4) {
                        size_t blobStart = offset + 8 + 4;
                        size_t blobSize = chunkSize - 4;
                        if (blobStart + blobSize <= fileData.size()) {
                            pchkBlob.assign(fileData.data() + blobStart,
                                            fileData.data() + blobStart + blobSize);
                            std::cout << "[kontakt-bridge] extracted PCHK blob: " << blobSize << " bytes" << std::endl;
                        }
                    }
                    break;
                }

                // Advance to next chunk (aligned to 2-byte boundary per RIFF spec)
                offset += 8 + chunkSize;
                if (offset % 2 != 0) offset++;
            }
        }
    }

    bool loaded = false;

    if (!pchkBlob.empty()) {
        // Build an AUPreset CFDictionary with the PCHK blob as the "data" key
        AudioComponentDescription auDesc{};
        AudioComponentGetDescription(component_, &auDesc);

        CFMutableDictionaryRef dict = CFDictionaryCreateMutable(
            kCFAllocatorDefault, 0,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks);

        SInt32 typeVal = static_cast<SInt32>(auDesc.componentType);
        SInt32 subtypeVal = static_cast<SInt32>(auDesc.componentSubType);
        SInt32 mfrVal = static_cast<SInt32>(auDesc.componentManufacturer);
        SInt32 versionVal = 0;

        CFNumberRef typeNum = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &typeVal);
        CFNumberRef subtypeNum = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &subtypeVal);
        CFNumberRef mfrNum = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &mfrVal);
        CFNumberRef versionNum = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &versionVal);

        CFStringRef presetNameCF = CFStringCreateWithCString(kCFAllocatorDefault, pathStem(path).c_str(), kCFStringEncodingUTF8);
        CFDataRef blobData = CFDataCreate(kCFAllocatorDefault, pchkBlob.data(), static_cast<CFIndex>(pchkBlob.size()));

        CFDictionarySetValue(dict, CFSTR("type"), typeNum);
        CFDictionarySetValue(dict, CFSTR("subtype"), subtypeNum);
        CFDictionarySetValue(dict, CFSTR("manufacturer"), mfrNum);
        CFDictionarySetValue(dict, CFSTR("version"), versionNum);
        CFDictionarySetValue(dict, CFSTR("name"), presetNameCF);
        CFDictionarySetValue(dict, CFSTR("data"), blobData);

        CFPropertyListRef plist = dict;
        OSStatus result = AudioUnitSetProperty(unit_,
                                                kAudioUnitProperty_ClassInfo,
                                                kAudioUnitScope_Global,
                                                0,
                                                &plist,
                                                sizeof(plist));
        loaded = (result == noErr);
        if (!loaded) {
            std::cerr << "[kontakt-bridge] kAudioUnitProperty_ClassInfo failed: " << result << std::endl;
        } else {
            std::cout << "[kontakt-bridge] preset restored via ClassInfo" << std::endl;
        }

        CFRelease(blobData);
        CFRelease(presetNameCF);
        CFRelease(versionNum);
        CFRelease(mfrNum);
        CFRelease(subtypeNum);
        CFRelease(typeNum);
        CFRelease(dict);
    }

    // Fallback: try ClassInfoFromDocument (works for .aupreset and some .nki)
    if (!loaded) {
        CFURLRef url = CFURLCreateFromFileSystemRepresentation(kCFAllocatorDefault,
                                                               reinterpret_cast<const UInt8*>(path.c_str()),
                                                               static_cast<CFIndex>(path.size()),
                                                               false);
        if (url) {
            const auto result = AudioUnitSetProperty(unit_,
                                                     kAudioUnitProperty_ClassInfoFromDocument,
                                                     kAudioUnitScope_Global,
                                                     0,
                                                     &url,
                                                     sizeof(url));
            loaded = (result == noErr);
            if (loaded) {
                std::cout << "[kontakt-bridge] preset loaded via ClassInfoFromDocument" << std::endl;
            }
            CFRelease(url);
        }
    }

    if (!loaded) {
        setError("Could not load preset: " + pathStem(path));
        return false;
    }

    status_.presetName = pathStem(path);
    status_.lastError.clear();
    return true;
#else
    setError("Preset loading is not implemented in the Windows VST3 stub");
    return false;
#endif
}

void KontaktHost::setAudioCallback(AudioCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    audioCallback_ = std::move(callback);
}

KontaktHost::Status KontaktHost::getStatus() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return status_;
}

bool KontaktHost::initializeMacAU() {
#ifdef __APPLE__
    AudioComponentDescription desc{};
    desc.componentType = kAudioUnitType_MusicDevice;
    desc.componentSubType = 0;
    desc.componentManufacturer = 0;
    desc.componentFlags = 0;
    desc.componentFlagsMask = 0;

    while ((component_ = AudioComponentFindNext(component_, &desc)) != nullptr) {
        CFStringRef nameRef = nullptr;
        if (AudioComponentCopyName(component_, &nameRef) != noErr || !nameRef) {
            continue;
        }

        char name[256] = {};
        CFStringGetCString(nameRef, name, sizeof(name), kCFStringEncodingUTF8);
        CFRelease(nameRef);

        std::string lowerName(name);
        std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });

        if (lowerName.find("kontakt 8") != std::string::npos || lowerName.find("kontakt") != std::string::npos) {
            std::cout << "[kontakt-bridge] found AU: " << name << std::endl;
            break;
        }
    }

    if (!component_) {
        setError("Kontakt 8 AU was not found in /Library/Audio/Plug-Ins/Components");
        return false;
    }

    if (AudioComponentInstanceNew(component_, &unit_) != noErr || !unit_) {
        setError("Failed to instantiate Kontakt AU");
        return false;
    }

    Float64 sampleRate = status_.sampleRate;
    UInt32 maxFrames = status_.blockSize;
    AudioUnitSetProperty(unit_, kAudioUnitProperty_SampleRate, kAudioUnitScope_Output, 0, &sampleRate, sizeof(sampleRate));
    AudioUnitSetProperty(unit_, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxFrames, sizeof(maxFrames));

    AudioStreamBasicDescription format{};
    format.mSampleRate = sampleRate;
    format.mFormatID = kAudioFormatLinearPCM;
    format.mFormatFlags = kAudioFormatFlagsNativeFloatPacked | kAudioFormatFlagIsNonInterleaved;
    format.mBitsPerChannel = 32;
    format.mChannelsPerFrame = 2;
    format.mFramesPerPacket = 1;
    format.mBytesPerFrame = sizeof(float);
    format.mBytesPerPacket = sizeof(float);

    AudioUnitSetProperty(unit_, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &format, sizeof(format));

    if (AudioUnitInitialize(unit_) != noErr) {
        setError("AudioUnitInitialize failed for Kontakt AU");
        AudioComponentInstanceDispose(unit_);
        unit_ = nullptr;
        return false;
    }

    {
        std::lock_guard<std::mutex> lock(mutex_);
        status_.backend = "au";
        status_.pluginLoaded = true;
        status_.lastError.clear();
    }

    running_ = true;
    renderThread_ = std::thread(&KontaktHost::renderLoop, this);
    std::cout << "[kontakt-bridge] hosting Kontakt via Audio Unit" << std::endl;
    return true;
#else
    return false;
#endif
}

bool KontaktHost::initializeWindowsVst3Stub() {
#ifdef _WIN32
    status_.backend = "vst3-stub";
    setError("Windows VST3 hosting stub compiled. Wire Steinberg interfaces in vst3host.cpp to enable Kontakt.");
    return false;
#else
    return false;
#endif
}

void KontaktHost::renderLoop() {
#ifdef __APPLE__
    // Block SIGPIPE on this thread — AU plugins may override process-wide
    // SIG_IGN on their own threads, so we need thread-level masking
    sigset_t sigpipeMask;
    sigemptyset(&sigpipeMask);
    sigaddset(&sigpipeMask, SIGPIPE);
    pthread_sigmask(SIG_BLOCK, &sigpipeMask, nullptr);
    
    std::vector<float> left(status_.blockSize, 0.0f);
    std::vector<float> right(status_.blockSize, 0.0f);
    std::uint64_t framePosition = 0;
    std::uint64_t frameCount = 0;

    struct StereoBufferList {
        UInt32 mNumberBuffers;
        AudioBuffer mBuffers[2];
    } bufferList{};

    bufferList.mNumberBuffers = 2;
    bufferList.mBuffers[0].mNumberChannels = 1;
    bufferList.mBuffers[0].mDataByteSize = static_cast<UInt32>(left.size() * sizeof(float));
    bufferList.mBuffers[0].mData = left.data();
    bufferList.mBuffers[1].mNumberChannels = 1;
    bufferList.mBuffers[1].mDataByteSize = static_cast<UInt32>(right.size() * sizeof(float));
    bufferList.mBuffers[1].mData = right.data();

    while (running_) {
        // Clear buffers before each render (AU may not zero them)
        std::fill(left.begin(), left.end(), 0.0f);
        std::fill(right.begin(), right.end(), 0.0f);

        AudioTimeStamp timeStamp{};
        timeStamp.mFlags = kAudioTimeStampSampleTimeValid;
        timeStamp.mSampleTime = static_cast<Float64>(framePosition);

        OSStatus result = noErr;
        AudioCallback callback;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (!unit_) {
                break;
            }
            result = AudioUnitRender(unit_, nullptr, &timeStamp, 0, status_.blockSize, reinterpret_cast<AudioBufferList*>(&bufferList));
            callback = audioCallback_;
        }

        if (result != noErr) {
            if (frameCount < 5) {
                std::cerr << "[kontakt-bridge] AudioUnitRender error: " << result << " at frame " << framePosition << std::endl;
            }
            std::fill(left.begin(), left.end(), 0.0f);
            std::fill(right.begin(), right.end(), 0.0f);
        }
        frameCount++;

        if (callback) {
            callback(left.data(), right.data(), status_.blockSize);
        }

        framePosition += status_.blockSize;
        const auto blockDuration = std::chrono::duration<double>(static_cast<double>(status_.blockSize) / status_.sampleRate);
        std::this_thread::sleep_for(std::chrono::duration_cast<std::chrono::milliseconds>(blockDuration));
    }
#endif
}

void KontaktHost::setError(const std::string& message) {
    std::lock_guard<std::mutex> lock(mutex_);
    status_.lastError = message;
    std::cerr << "[kontakt-bridge] " << message << std::endl;
}
