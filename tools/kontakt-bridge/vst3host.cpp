#include "vst3host.h"
#include "augui.h"

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
    sampleRate_.store(status_.sampleRate);
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
    std::map<int, PluginSlot> slots;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        slots.swap(slots_);
        status_.pluginLoaded = false;
        status_.pluginName.clear();
        status_.presetName.clear();
        status_.backend = "none";
    }

    for (auto& [slotId, slot] : slots) {
        closeGUI(slotId);
        disposeSlot(slot);
    }
#endif
}

std::vector<PluginInfo> KontaktHost::listPlugins() const {
    std::vector<PluginInfo> results;
#ifdef __APPLE__
    const UInt32 types[] = {
        kAudioUnitType_MusicDevice,
        kAudioUnitType_MusicEffect,
    };

    for (UInt32 auType : types) {
        AudioComponentDescription desc{};
        desc.componentType = auType;
        AudioComponent comp = nullptr;
        while ((comp = AudioComponentFindNext(comp, &desc)) != nullptr) {
            CFStringRef nameRef = nullptr;
            if (AudioComponentCopyName(comp, &nameRef) != noErr || !nameRef) {
                continue;
            }
            char name[256] = {};
            CFStringGetCString(nameRef, name, sizeof(name), kCFStringEncodingUTF8);
            CFRelease(nameRef);

            AudioComponentDescription compDesc{};
            AudioComponentGetDescription(comp, &compDesc);

            PluginInfo info;
            info.name = name;
            info.type = compDesc.componentType;
            info.subType = compDesc.componentSubType;
            info.mfr = compDesc.componentManufacturer;

            std::string nameStr(name);
            auto colon = nameStr.find(':');
            if (colon != std::string::npos) {
                info.manufacturer = nameStr.substr(0, colon);
            }

            results.push_back(std::move(info));
        }
    }
#endif
    return results;
}

int KontaktHost::loadPlugin(const std::string& name) {
#ifdef __APPLE__
    std::string lowerQuery = name;
    std::transform(lowerQuery.begin(), lowerQuery.end(), lowerQuery.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

    const UInt32 types[] = {
        kAudioUnitType_MusicDevice,
        kAudioUnitType_MusicEffect,
    };

    AudioComponent component = nullptr;
    std::string foundName;
    for (UInt32 auType : types) {
        AudioComponentDescription desc{};
        desc.componentType = auType;
        AudioComponent comp = nullptr;
        while ((comp = AudioComponentFindNext(comp, &desc)) != nullptr) {
            CFStringRef nameRef = nullptr;
            if (AudioComponentCopyName(comp, &nameRef) != noErr || !nameRef) {
                continue;
            }
            char cname[256] = {};
            CFStringGetCString(nameRef, cname, sizeof(cname), kCFStringEncodingUTF8);
            CFRelease(nameRef);

            std::string lowerName(cname);
            std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(),
                           [](unsigned char c) { return static_cast<char>(std::tolower(c)); });

            if (lowerName.find(lowerQuery) != std::string::npos) {
                component = comp;
                foundName = cname;
                break;
            }
        }
        if (component) break;
    }

    if (!component) {
        setError("AU plugin not found: " + name);
        return -1;
    }

    PluginSlot slot;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        slot.slotId = nextSlotId_++;
    }
    slot.component = component;
    slot.pluginName = foundName;

    std::cout << "[au-bridge] found: " << foundName << " (slot " << slot.slotId << ")" << std::endl;

    const UInt32 maxFrames = status_.blockSize;

    OSStatus err = NewAUGraph(&slot.graph);
    if (err != noErr) {
        setError("NewAUGraph failed: " + std::to_string(err));
        return -1;
    }

    AudioComponentDescription instrDesc{};
    AudioComponentGetDescription(slot.component, &instrDesc);
    err = AUGraphAddNode(slot.graph, &instrDesc, &slot.instrNode);
    if (err != noErr) {
        setError("AUGraphAddNode instrument failed: " + std::to_string(err));
        disposeSlot(slot);
        return -1;
    }

    AudioComponentDescription outputDesc{};
    outputDesc.componentType = kAudioUnitType_Output;
    outputDesc.componentSubType = kAudioUnitSubType_DefaultOutput;
    outputDesc.componentManufacturer = kAudioUnitManufacturer_Apple;
    err = AUGraphAddNode(slot.graph, &outputDesc, &slot.outputNode);
    if (err != noErr) {
        setError("AUGraphAddNode output failed: " + std::to_string(err));
        disposeSlot(slot);
        return -1;
    }

    err = AUGraphOpen(slot.graph);
    if (err != noErr) {
        setError("AUGraphOpen failed: " + std::to_string(err));
        disposeSlot(slot);
        return -1;
    }

    err = AUGraphNodeInfo(slot.graph, slot.instrNode, nullptr, &slot.unit);
    if (err != noErr || !slot.unit) {
        setError("Failed to get instrument unit from graph");
        disposeSlot(slot);
        return -1;
    }

    err = AUGraphNodeInfo(slot.graph, slot.outputNode, nullptr, &slot.outputUnit);
    if (err != noErr || !slot.outputUnit) {
        setError("Failed to get output unit from graph");
        disposeSlot(slot);
        return -1;
    }

    AudioUnitSetProperty(slot.unit, kAudioUnitProperty_MaximumFramesPerSlice,
                         kAudioUnitScope_Global, 0, &maxFrames, sizeof(maxFrames));
    installHostCallbacks(slot.unit);

    err = AUGraphConnectNodeInput(slot.graph, slot.instrNode, 0, slot.outputNode, 0);
    if (err != noErr) {
        setError("AUGraphConnectNodeInput failed: " + std::to_string(err));
        disposeSlot(slot);
        return -1;
    }

    if (slot.slotId == 0) {
        err = AUGraphAddRenderNotify(slot.graph, KontaktHost::outputRenderCallback, this);
        if (err != noErr) {
            setError("AUGraphAddRenderNotify failed: " + std::to_string(err));
            disposeSlot(slot);
            return -1;
        }
    }

    err = AUGraphInitialize(slot.graph);
    if (err != noErr) {
        setError("AUGraphInitialize failed: " + std::to_string(err));
        disposeSlot(slot);
        return -1;
    }

    err = AUGraphStart(slot.graph);
    if (err != noErr) {
        setError("AUGraphStart failed: " + std::to_string(err));
        disposeSlot(slot);
        return -1;
    }

    slot.loaded = true;

    bool startRenderThread = false;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        slots_[slot.slotId] = slot;
        status_.backend = "au";
        status_.pluginLoaded = true;
        status_.pluginName = slot.pluginName;
        status_.presetName = slot.presetName;
        status_.lastError.clear();
        startRenderThread = !running_.load();
        if (startRenderThread) {
            running_ = true;
        }
    }

    if (startRenderThread) {
        renderThread_ = std::thread(&KontaktHost::renderLoop, this);
    }

    std::cout << "[au-bridge] hosting slot " << slot.slotId << ": " << foundName << std::endl;
    std::signal(SIGPIPE, SIG_IGN);
    return slot.slotId;
#else
    (void)name;
    setError("AU hosting is only supported on macOS");
    return -1;
#endif
}

void KontaktHost::unloadPlugin(int slot) {
#ifdef __APPLE__
    PluginSlot removed;
    bool found = false;
    bool stopRenderThread = false;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = slots_.find(slot);
        if (it == slots_.end()) {
            return;
        }
        removed = it->second;
        slots_.erase(it);
        found = true;
        status_.pluginLoaded = !slots_.empty();
        status_.pluginName.clear();
        status_.presetName.clear();
        status_.lastError.clear();
        status_.backend = slots_.empty() ? "none" : "au";
        stopRenderThread = slots_.empty();
        if (stopRenderThread) {
            running_ = false;
        }
    }

    if (!found) {
        return;
    }

    closeGUI(slot);
    disposeSlot(removed);

    if (stopRenderThread && renderThread_.joinable()) {
        renderThread_.join();
    }
#endif
}

bool KontaktHost::noteOn(int note, int velocity, int channel, int slot) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end() || !it->second.unit) {
        return false;
    }
    OSStatus err = MusicDeviceMIDIEvent(it->second.unit, static_cast<UInt32>(0x90 | (channel & 0x0f)), static_cast<UInt32>(note), static_cast<UInt32>(velocity), 0);
    fprintf(stderr, "[midi] noteOn ch=%d note=%d vel=%d err=%d\n", channel, note, velocity, (int)err);
    return err == noErr;
#else
    (void)note;
    (void)velocity;
    (void)channel;
    return false;
#endif
}

bool KontaktHost::noteOff(int note, int channel, int slot) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end() || !it->second.unit) {
        return false;
    }
    return MusicDeviceMIDIEvent(it->second.unit, static_cast<UInt32>(0x80 | (channel & 0x0f)), static_cast<UInt32>(note), 0, 0) == noErr;
#else
    (void)note;
    (void)channel;
    return false;
#endif
}

bool KontaktHost::controlChange(int cc, int value, int channel, int slot) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end() || !it->second.unit) {
        return false;
    }
    return MusicDeviceMIDIEvent(it->second.unit, static_cast<UInt32>(0xB0 | (channel & 0x0f)), static_cast<UInt32>(cc), static_cast<UInt32>(value), 0) == noErr;
#else
    (void)cc;
    (void)value;
    (void)channel;
    return false;
#endif
}

bool KontaktHost::programChange(int program, int channel, int slot) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end() || !it->second.unit) {
        return false;
    }
    return MusicDeviceMIDIEvent(it->second.unit, static_cast<UInt32>(0xC0 | (channel & 0x0f)), static_cast<UInt32>(program & 0x7f), 0, 0) == noErr;
#else
    (void)program;
    (void)channel;
    return false;
#endif
}

bool KontaktHost::loadPreset(const std::string& path, int slot) {
    fprintf(stderr, "[Bridge] loadPreset: %s\n", path.c_str());
    if (!std::filesystem::exists(path)) {
        setError("Preset file not found: " + path);
        return false;
    }

#ifdef __APPLE__
    fprintf(stderr, "[Bridge] loadPreset: acquiring mutex for slot %d...\n", slot);
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end() || !it->second.unit) {
        status_.lastError = "Kontakt AU slot is not initialized";
        std::cerr << "[kontakt-bridge] " << status_.lastError << std::endl;
        return false;
    }
    auto& pluginSlot = it->second;
    auto setLockedError = [&](const std::string& message) {
        status_.lastError = message;
        std::cerr << "[kontakt-bridge] " << message << std::endl;
    };
    fprintf(stderr, "[Bridge] loadPreset: mutex acquired for slot %d\n", slot);

    // Read the entire file
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) {
        setLockedError("Cannot open file: " + path);
        return false;
    }
    auto fileSize = file.tellg();
    file.seekg(0);
    std::vector<uint8_t> fileData(static_cast<size_t>(fileSize));
    file.read(reinterpret_cast<char*>(fileData.data()), fileSize);
    file.close();

    fprintf(stderr, "[Bridge] loadPreset: read %lld bytes from file\n", (long long)fileSize);

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

    // ── Strategy 0a: Try ClassInfoFromDocument FIRST for .nki files ──
    // This Apple-designed property tells the AU to load a document/preset from a file URL.
    // For .nki files, this should trigger Kontakt's native file loading pipeline
    // (sample resolution, .nkc monolith loading, etc.) instead of just restoring state.
    {
        std::string ext = path.substr(path.find_last_of('.') + 1);
        std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
        if (ext == "nki" || ext == "nkm" || ext == "nkb" || ext == "nkp") {
            fprintf(stderr, "[Bridge] loadPreset: trying ClassInfoFromDocument FIRST for .%s file: %s\n", ext.c_str(), path.c_str());
            CFURLRef url = CFURLCreateFromFileSystemRepresentation(kCFAllocatorDefault,
                                                                    reinterpret_cast<const UInt8*>(path.c_str()),
                                                                    static_cast<CFIndex>(path.size()),
                                                                    false);
            if (url) {
                OSStatus result = AudioUnitSetProperty(pluginSlot.unit,
                                                         kAudioUnitProperty_ClassInfoFromDocument,
                                                         kAudioUnitScope_Global,
                                                         0,
                                                         &url,
                                                         sizeof(url));
                fprintf(stderr, "[Bridge] loadPreset: ClassInfoFromDocument result=%d\n", (int)result);
                loaded = (result == noErr);
                if (loaded) {
                    std::cout << "[kontakt-bridge] preset loaded via ClassInfoFromDocument (.nki)" << std::endl;
                }
                CFRelease(url);
            }
        }
    }

    // ── Strategy 0b: Try Kontakt-specific AU properties for file loading ──
    if (!loaded) {
        // Scan for writable properties that might accept file paths or instrument data
        fprintf(stderr, "[Bridge] loadPreset: scanning for NI-specific writable properties...\n");
        for (UInt32 propId = 64000; propId <= 64100; propId++) {
            UInt32 dataSize = 0;
            Boolean writable = false;
            OSStatus err = AudioUnitGetPropertyInfo(pluginSlot.unit, propId,
                                                    kAudioUnitScope_Global, 0,
                                                    &dataSize, &writable);
            if (err == noErr && writable) {
                fprintf(stderr, "[Bridge]   WRITABLE property %u: size=%u\n", propId, dataSize);
            }
        }
        // Also check 65536+ range
        for (UInt32 propId = 65536; propId <= 65600; propId++) {
            UInt32 dataSize = 0;
            Boolean writable = false;
            OSStatus err = AudioUnitGetPropertyInfo(pluginSlot.unit, propId,
                                                    kAudioUnitScope_Global, 0,
                                                    &dataSize, &writable);
            if (err == noErr && writable) {
                fprintf(stderr, "[Bridge]   WRITABLE property %u: size=%u\n", propId, dataSize);
            }
        }
    }

    // ── Strategy 0: Query factory presets (diagnostic) ──
    {
        CFArrayRef factoryPresets = nullptr;
        UInt32 fpSize = sizeof(factoryPresets);
        OSStatus fpErr = AudioUnitGetProperty(pluginSlot.unit,
                                               kAudioUnitProperty_FactoryPresets,
                                               kAudioUnitScope_Global,
                                               0,
                                               &factoryPresets,
                                               &fpSize);
        if (fpErr == noErr && factoryPresets) {
            CFIndex count = CFArrayGetCount(factoryPresets);
            fprintf(stderr, "[Bridge] loadPreset: %ld factory presets available\n", (long)count);
            for (CFIndex i = 0; i < count && i < 10; i++) {
                AUPreset* preset = (AUPreset*)CFArrayGetValueAtIndex(factoryPresets, i);
                char nameBuf[256] = {};
                if (preset->presetName) {
                    CFStringGetCString(preset->presetName, nameBuf, sizeof(nameBuf), kCFStringEncodingUTF8);
                }
                fprintf(stderr, "[Bridge]   factory[%ld] = #%d '%s'\n", (long)i, (int)preset->presetNumber, nameBuf);
            }
            CFRelease(factoryPresets);
        } else {
            fprintf(stderr, "[Bridge] loadPreset: no factory presets (err=%d)\n", (int)fpErr);
        }
    }

    // ── Strategy 1: Get current Kontakt state, dump its format for diagnostics ──
    {
        CFPropertyListRef currentState = nullptr;
        UInt32 stateSize = sizeof(currentState);
        OSStatus getErr = AudioUnitGetProperty(pluginSlot.unit,
                                                kAudioUnitProperty_ClassInfo,
                                                kAudioUnitScope_Global,
                                                0,
                                                &currentState,
                                                &stateSize);
        if (getErr == noErr && currentState) {
            fprintf(stderr, "[Bridge] loadPreset: got current ClassInfo state\n");
            CFDictionaryRef stateDict = (CFDictionaryRef)currentState;
            CFIndex n = CFDictionaryGetCount(stateDict);
            std::vector<const void*> keys(n), vals(n);
            CFDictionaryGetKeysAndValues(stateDict, keys.data(), vals.data());
            for (CFIndex i = 0; i < n; i++) {
                CFStringRef key = (CFStringRef)keys[i];
                char keyBuf[256] = {};
                CFStringGetCString(key, keyBuf, sizeof(keyBuf), kCFStringEncodingUTF8);
                CFTypeID typeId = CFGetTypeID(vals[i]);
                if (typeId == CFDataGetTypeID()) {
                    CFDataRef d = (CFDataRef)vals[i];
                    long len = (long)CFDataGetLength(d);
                    fprintf(stderr, "[Bridge]   key '%s' = Data (%ld bytes)\n", keyBuf, len);
                } else {
                    fprintf(stderr, "[Bridge]   key '%s'\n", keyBuf);
                }
            }
            CFRelease(currentState);
        } else {
            fprintf(stderr, "[Bridge] loadPreset: could not get ClassInfo (err=%d)\n", (int)getErr);
        }
    }

    // ── Strategy 1b: Scan for NI custom AU properties ──
    {
        fprintf(stderr, "[Bridge] loadPreset: scanning custom AU properties...\n");
        // Check known NI property IDs and common custom ranges
        UInt32 propIds[] = {
            64000, 64001, 64002, 64003, 64004, 64005,
            65536, 65537, 65538, 65539, 65540,
            // kAudioUnitProperty range for custom
            100000, 100001, 100002,
            // Try some standard ones
            1000, 1001, 1002, 1003, 1004, 1005,
        };
        for (UInt32 propId : propIds) {
            UInt32 dataSize = 0;
            Boolean writable = false;
            OSStatus err = AudioUnitGetPropertyInfo(pluginSlot.unit, propId,
                                                    kAudioUnitScope_Global, 0,
                                                    &dataSize, &writable);
            if (err == noErr) {
                fprintf(stderr, "[Bridge]   property %u: size=%u writable=%d\n",
                        propId, dataSize, (int)writable);
            }
        }
    }

    // ── Strategy 2: PCHK extraction from NKSF RIFF container ──
    if (!pchkBlob.empty()) {
        AudioComponentDescription auDesc{};
        AudioComponentGetDescription(pluginSlot.component, &auDesc);

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
        OSStatus result = AudioUnitSetProperty(pluginSlot.unit,
                                                kAudioUnitProperty_ClassInfo,
                                                kAudioUnitScope_Global,
                                                0,
                                                &plist,
                                                sizeof(plist));
        loaded = (result == noErr);
        if (!loaded) {
            fprintf(stderr, "[Bridge] loadPreset: PCHK ClassInfo failed: %d\n", (int)result);
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

    // ── Strategy 3: Raw file bytes as ClassInfo data blob ──
    if (!loaded) {
        fprintf(stderr, "[Bridge] loadPreset: trying raw file as ClassInfo data blob...\n");
        AudioComponentDescription auDesc{};
        AudioComponentGetDescription(pluginSlot.component, &auDesc);

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
        CFDataRef blobData = CFDataCreate(kCFAllocatorDefault, fileData.data(), static_cast<CFIndex>(fileData.size()));

        CFDictionarySetValue(dict, CFSTR("type"), typeNum);
        CFDictionarySetValue(dict, CFSTR("subtype"), subtypeNum);
        CFDictionarySetValue(dict, CFSTR("manufacturer"), mfrNum);
        CFDictionarySetValue(dict, CFSTR("version"), versionNum);
        CFDictionarySetValue(dict, CFSTR("name"), presetNameCF);
        CFDictionarySetValue(dict, CFSTR("data"), blobData);

        CFPropertyListRef plist = dict;
        OSStatus result = AudioUnitSetProperty(pluginSlot.unit,
                                                kAudioUnitProperty_ClassInfo,
                                                kAudioUnitScope_Global,
                                                0,
                                                &plist,
                                                sizeof(plist));
        loaded = (result == noErr);
        if (!loaded) {
            fprintf(stderr, "[Bridge] loadPreset: raw file ClassInfo (data key) failed: %d\n", (int)result);
        } else {
            std::cout << "[kontakt-bridge] preset loaded via raw file ClassInfo" << std::endl;
        }

        // Strategy 3b: Try with "vstdata" key (NI Kontakt uses this instead of "data")
        if (!loaded) {
            fprintf(stderr, "[Bridge] loadPreset: trying raw file with 'vstdata' key...\n");
            CFDictionaryRemoveValue(dict, CFSTR("data"));
            CFDictionarySetValue(dict, CFSTR("vstdata"), blobData);
            plist = dict;
            result = AudioUnitSetProperty(pluginSlot.unit,
                                          kAudioUnitProperty_ClassInfo,
                                          kAudioUnitScope_Global,
                                          0,
                                          &plist,
                                          sizeof(plist));
            loaded = (result == noErr);
            if (!loaded) {
                fprintf(stderr, "[Bridge] loadPreset: raw file ClassInfo (vstdata key) failed: %d\n", (int)result);
            } else {
                std::cout << "[kontakt-bridge] preset loaded via vstdata ClassInfo" << std::endl;
            }
        }

        CFRelease(blobData);
        CFRelease(presetNameCF);
        CFRelease(versionNum);
        CFRelease(mfrNum);
        CFRelease(subtypeNum);
        CFRelease(typeNum);
        CFRelease(dict);
    }

    // ── Strategy 4: ClassInfoFromDocument ──
    if (!loaded) {
        fprintf(stderr, "[Bridge] loadPreset: trying ClassInfoFromDocument for: %s\n", path.c_str());
        CFURLRef url = CFURLCreateFromFileSystemRepresentation(kCFAllocatorDefault,
                                                               reinterpret_cast<const UInt8*>(path.c_str()),
                                                               static_cast<CFIndex>(path.size()),
                                                               false);
        if (url) {
            const auto result = AudioUnitSetProperty(pluginSlot.unit,
                                                     kAudioUnitProperty_ClassInfoFromDocument,
                                                     kAudioUnitScope_Global,
                                                     0,
                                                     &url,
                                                     sizeof(url));
            fprintf(stderr, "[Bridge] loadPreset: ClassInfoFromDocument result=%d\n", (int)result);
            loaded = (result == noErr);
            if (loaded) {
                std::cout << "[kontakt-bridge] preset loaded via ClassInfoFromDocument" << std::endl;
            }
            CFRelease(url);
        }
    }

    if (!loaded) {
        setLockedError("Could not load preset: " + pathStem(path));
        return false;
    }

    pluginSlot.presetName = pathStem(path);
    status_.presetName = pluginSlot.presetName;
    status_.lastError.clear();
    return true;
#else
    setError("Preset loading is not implemented in the Windows VST3 stub");
    return false;
#endif
}

bool KontaktHost::saveState(const std::string& path, int slot) {
#ifdef __APPLE__
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end() || !it->second.unit) {
        status_.lastError = "No AU loaded in slot " + std::to_string(slot);
        std::cerr << "[kontakt-bridge] " << status_.lastError << std::endl;
        return false;
    }
    auto& pluginSlot = it->second;
    auto setLockedError = [&](const std::string& message) {
        status_.lastError = message;
        std::cerr << "[kontakt-bridge] " << message << std::endl;
    };

    CFPropertyListRef currentState = nullptr;
    UInt32 stateSize = sizeof(currentState);
    OSStatus err = AudioUnitGetProperty(pluginSlot.unit,
                                         kAudioUnitProperty_ClassInfo,
                                         kAudioUnitScope_Global,
                                         0,
                                         &currentState,
                                         &stateSize);
    if (err != noErr || !currentState) {
        setLockedError("Failed to get ClassInfo");
        return false;
    }

    // Extract vstdata blob
    CFDictionaryRef dict = (CFDictionaryRef)currentState;
    CFDataRef vstdata = (CFDataRef)CFDictionaryGetValue(dict, CFSTR("vstdata"));
    if (!vstdata || CFGetTypeID(vstdata) != CFDataGetTypeID()) {
        CFRelease(currentState);
        setLockedError("No vstdata in ClassInfo");
        return false;
    }

    const uint8_t* bytes = CFDataGetBytePtr(vstdata);
    long len = CFDataGetLength(vstdata);

    std::ofstream out(path, std::ios::binary);
    if (!out) {
        CFRelease(currentState);
        setLockedError("Cannot write to " + path);
        return false;
    }
    out.write(reinterpret_cast<const char*>(bytes), len);
    out.close();

    fprintf(stderr, "[Bridge] saveState: wrote %ld bytes of vstdata to %s\n", len, path.c_str());

    // Also dump first 128 bytes as hex
    long dumpLen = len < 128 ? len : 128;
    fprintf(stderr, "[Bridge] saveState hex: ");
    for (long j = 0; j < dumpLen; j++) {
        fprintf(stderr, "%02x", bytes[j]);
        if (j % 4 == 3) fprintf(stderr, " ");
    }
    fprintf(stderr, "\n");

    CFRelease(currentState);
    status_.lastError.clear();
    return true;
#else
    (void)path;
    (void)slot;
    return false;
#endif
}

bool KontaktHost::restoreState(const std::string& path, int slot) {
#ifdef __APPLE__
    if (!std::filesystem::exists(path)) {
        setError("State file not found: " + path);
        return false;
    }

    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file) {
        setError("Cannot open state file: " + path);
        return false;
    }
    auto fileSize = file.tellg();
    file.seekg(0);
    std::vector<uint8_t> data(static_cast<size_t>(fileSize));
    file.read(reinterpret_cast<char*>(data.data()), fileSize);
    file.close();

    fprintf(stderr, "[Bridge] restoreState: read %lld bytes from %s\n", (long long)fileSize, path.c_str());

    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end() || !it->second.unit) {
        status_.lastError = "No AU loaded in slot " + std::to_string(slot);
        std::cerr << "[kontakt-bridge] " << status_.lastError << std::endl;
        return false;
    }
    auto& pluginSlot = it->second;
    auto setLockedError = [&](const std::string& message) {
        status_.lastError = message;
        std::cerr << "[kontakt-bridge] " << message << std::endl;
    };

    // Build ClassInfo dict with vstdata
    AudioComponentDescription auDesc{};
    AudioComponentGetDescription(pluginSlot.component, &auDesc);

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

    CFStringRef nameStr = CFStringCreateWithCString(kCFAllocatorDefault, "Restored", kCFStringEncodingUTF8);
    CFDataRef vstdata = CFDataCreate(kCFAllocatorDefault, data.data(), static_cast<CFIndex>(data.size()));
    CFDataRef emptyData = CFDataCreate(kCFAllocatorDefault, nullptr, 0);

    CFDictionarySetValue(dict, CFSTR("type"), typeNum);
    CFDictionarySetValue(dict, CFSTR("subtype"), subtypeNum);
    CFDictionarySetValue(dict, CFSTR("manufacturer"), mfrNum);
    CFDictionarySetValue(dict, CFSTR("version"), versionNum);
    CFDictionarySetValue(dict, CFSTR("name"), nameStr);
    CFDictionarySetValue(dict, CFSTR("vstdata"), vstdata);
    CFDictionarySetValue(dict, CFSTR("data"), emptyData);

    CFPropertyListRef plist = dict;
    OSStatus result = AudioUnitSetProperty(pluginSlot.unit,
                                            kAudioUnitProperty_ClassInfo,
                                            kAudioUnitScope_Global,
                                            0,
                                            &plist,
                                            sizeof(plist));

    CFRelease(emptyData);
    CFRelease(vstdata);
    CFRelease(nameStr);
    CFRelease(versionNum);
    CFRelease(mfrNum);
    CFRelease(subtypeNum);
    CFRelease(typeNum);
    CFRelease(dict);

    if (result != noErr) {
        fprintf(stderr, "[Bridge] restoreState: ClassInfo set failed: %d\n", (int)result);
        setLockedError("Failed to restore state (error " + std::to_string(result) + ")");
        return false;
    }

    fprintf(stderr, "[Bridge] restoreState: success!\n");
    pluginSlot.presetName = "Restored";
    status_.presetName = pluginSlot.presetName;
    status_.lastError.clear();
    return true;
#else
    (void)path;
    (void)slot;
    return false;
#endif
}

void KontaktHost::setTransport(bool playing, double bpm, double beatPosition) {
    bool wasPlaying = transportPlaying_.load();
    transportPlaying_ = playing;
    transportTempo_ = bpm;
    // beat < 0 means "keep current position" (tempo-only update)
    if (beatPosition >= 0.0) {
        transportBeatPosition_ = beatPosition;
        transportSamplePosition_ = (beatPosition / bpm) * 60.0 * sampleRate_.load();
    }
    if (playing != wasPlaying) {
        transportStateChanged_ = true;
    }
    fprintf(stderr, "[bridge] transport: %s bpm=%.1f beat=%.2f\n",
            playing ? "PLAY" : "STOP", bpm,
            beatPosition >= 0.0 ? beatPosition : transportBeatPosition_.load());
}

void KontaktHost::installHostCallbacks(AudioUnit unit) {
#ifdef __APPLE__
    if (!unit) return;

    HostCallbackInfo cbInfo{};
    cbInfo.hostUserData = this;
    cbInfo.beatAndTempoProc = KontaktHost::hostGetBeatAndTempo;
    cbInfo.musicalTimeLocationProc = KontaktHost::hostGetMusicalTimeLocation;
    cbInfo.transportStateProc = KontaktHost::hostGetTransportState;

    OSStatus err = AudioUnitSetProperty(unit, kAudioUnitProperty_HostCallbacks,
                                         kAudioUnitScope_Global, 0,
                                         &cbInfo, sizeof(cbInfo));
    if (err != noErr) {
        fprintf(stderr, "[bridge] failed to set host callbacks: %d\n", (int)err);
    } else {
        fprintf(stderr, "[bridge] host callbacks installed (tempo/transport)\n");
    }
#endif
}

#ifdef __APPLE__
OSStatus KontaktHost::hostGetBeatAndTempo(void* ctx, Float64* outCurrentBeat, Float64* outCurrentTempo) {
    auto* self = static_cast<KontaktHost*>(ctx);
    if (outCurrentBeat) *outCurrentBeat = self->transportBeatPosition_.load();
    if (outCurrentTempo) *outCurrentTempo = self->transportTempo_.load();
    return noErr;
}

OSStatus KontaktHost::hostGetTransportState(void* ctx, Boolean* outIsPlaying,
                                             Boolean* outTransportStateChanged,
                                             Float64* outCurrentSampleInTimeLine,
                                             Boolean* outIsCycling,
                                             Float64* outCycleStartBeat,
                                             Float64* outCycleEndBeat) {
    auto* self = static_cast<KontaktHost*>(ctx);
    if (outIsPlaying) *outIsPlaying = self->transportPlaying_.load() ? 1 : 0;
    if (outTransportStateChanged) {
        *outTransportStateChanged = self->transportStateChanged_.exchange(false) ? 1 : 0;
    }
    if (outCurrentSampleInTimeLine) *outCurrentSampleInTimeLine = self->transportSamplePosition_.load();
    if (outIsCycling) *outIsCycling = 0;
    if (outCycleStartBeat) *outCycleStartBeat = 0.0;
    if (outCycleEndBeat) *outCycleEndBeat = 0.0;
    return noErr;
}

OSStatus KontaktHost::hostGetMusicalTimeLocation(void* ctx, UInt32* outDeltaSampleOffsetToNextBeat,
                                                  Float32* outTimeSig_Numerator,
                                                  UInt32* outTimeSig_Denominator,
                                                  Float64* outCurrentMeasureDownBeat) {
    auto* self = static_cast<KontaktHost*>(ctx);
    double beat = self->transportBeatPosition_.load();
    // Assume 4/4 time
    if (outTimeSig_Numerator) *outTimeSig_Numerator = 4.0f;
    if (outTimeSig_Denominator) *outTimeSig_Denominator = 4;
    if (outCurrentMeasureDownBeat) {
        // Downbeat of the current measure (beat 0-based, 4 beats per measure)
        *outCurrentMeasureDownBeat = std::floor(beat / 4.0) * 4.0;
    }
    if (outDeltaSampleOffsetToNextBeat) {
        double tempo = self->transportTempo_.load();
        double sr = self->sampleRate_.load();
        double fractBeat = beat - std::floor(beat);
        double samplesPerBeat = (60.0 / tempo) * sr;
        *outDeltaSampleOffsetToNextBeat = static_cast<UInt32>((1.0 - fractBeat) * samplesPerBeat);
    }
    return noErr;
}
#endif

void KontaktHost::setAudioCallback(AudioCallback callback) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::atomic_store(&audioCallback_, std::make_shared<AudioCallback>(std::move(callback)));
}

void KontaktHost::setDirectAudio(bool enable) {
    directAudio_.store(enable);
    fprintf(stderr, "[bridge] direct audio %s\n", enable ? "ON" : "OFF");
}

KontaktHost::Status KontaktHost::getStatus(int slot) const {
    std::lock_guard<std::mutex> lock(mutex_);
    Status status = status_;
#ifdef __APPLE__
    status.pluginLoaded = false;
    status.pluginName.clear();
    status.presetName.clear();
    auto it = slots_.find(slot);
    if (it != slots_.end()) {
        status.pluginLoaded = it->second.loaded;
        status.pluginName = it->second.pluginName;
        status.presetName = it->second.presetName;
    }
#endif
    return status;
}

std::vector<int> KontaktHost::getSlotIds() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<int> slotIds;
#ifdef __APPLE__
    slotIds.reserve(slots_.size());
    for (const auto& [slotId, _] : slots_) {
        slotIds.push_back(slotId);
    }
#endif
    return slotIds;
}

PluginSlot* KontaktHost::getSlot(int slot) {
#ifdef __APPLE__
    static thread_local PluginSlot slotSnapshot;
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = slots_.find(slot);
    if (it == slots_.end()) {
        return nullptr;
    }
    slotSnapshot = it->second;
    return &slotSnapshot;
#else
    (void)slot;
    return nullptr;
#endif
}

bool KontaktHost::initializeMacAU() {
#ifdef __APPLE__
    // Just load Kontakt via the standard loadPlugin path (which uses AUGraph)
    return loadPlugin("kontakt") >= 0;
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

#ifdef __APPLE__
OSStatus KontaktHost::outputRenderCallback(void* ctx,
                                           AudioUnitRenderActionFlags* ioFlags,
                                           const AudioTimeStamp* /*inTimeStamp*/,
                                           UInt32 /*inBus*/,
                                           UInt32 inNumFrames,
                                           AudioBufferList* ioData) {
    // When used as AUGraph render notify, we get called pre and post render.
    // Only process post-render (kAudioUnitRenderAction_PostRender).
    if (ioFlags && !(*ioFlags & kAudioUnitRenderAction_PostRender)) {
        return noErr;
    }

    auto* self = static_cast<KontaktHost*>(ctx);

    // Diagnostic: check if AU is producing audio
    if (ioData && ioData->mNumberBuffers >= 1) {
        float peak = 0.0f;
        const float* samples = static_cast<const float*>(ioData->mBuffers[0].mData);
        for (UInt32 i = 0; i < inNumFrames; i++) {
            float s = samples[i] < 0 ? -samples[i] : samples[i];
            if (s > peak) peak = s;
        }
        static int diagCount = 0;
        if (peak > 0.001f || (diagCount++ % 500 == 0)) {
            fprintf(stderr, "[audio] frames=%u bufs=%u peak=%.6f direct=%d\n",
                    (unsigned)inNumFrames, (unsigned)ioData->mNumberBuffers, peak,
                    self->directAudio_.load() ? 1 : 0);
        }
    }

    // Advance beat position if transport is playing
    if (self->transportPlaying_.load()) {
        double tempo = self->transportTempo_.load();
        double sr = self->sampleRate_.load();
        double beatsPerSample = tempo / (60.0 * sr);
        double beatAdvance = beatsPerSample * inNumFrames;
        double curBeat = self->transportBeatPosition_.load();
        self->transportBeatPosition_.store(curBeat + beatAdvance);
        double curSample = self->transportSamplePosition_.load();
        self->transportSamplePosition_.store(curSample + inNumFrames);
    }

    // Send rendered audio to browser via WS for effects processing
    auto audioCallback = std::atomic_load(&self->audioCallback_);
    if (ioData && ioData->mNumberBuffers >= 2 && audioCallback && *audioCallback) {
        (*audioCallback)(
            static_cast<const float*>(ioData->mBuffers[0].mData),
            static_cast<const float*>(ioData->mBuffers[1].mData),
            inNumFrames);
    }

    return noErr;
}
#endif

void KontaktHost::renderLoop() {
#ifdef __APPLE__
    // CoreAudio output unit drives rendering via callback — no manual loop needed.
    // This method is kept as the render thread entry but now just waits for shutdown.
    while (running_) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
#endif
}

void KontaktHost::showGUI(int slot) {
#ifdef __APPLE__
    AudioUnit unit = nullptr;
    std::string pluginName;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = slots_.find(slot);
        if (it == slots_.end() || !it->second.unit) {
            return;
        }
        unit = it->second.unit;
        pluginName = it->second.pluginName;
    }
    showAUPluginGUI(unit, pluginName.c_str(), slot);
#else
    (void)slot;
#endif
}

void KontaktHost::closeGUI(int slot) {
#ifdef __APPLE__
    closeAUPluginGUI(slot);
#else
    (void)slot;
#endif
}

#ifdef __APPLE__
void KontaktHost::disposeSlot(PluginSlot& slot) {
    if (slot.graph) {
        AUGraphStop(slot.graph);
        AUGraphUninitialize(slot.graph);
        AUGraphClose(slot.graph);
        DisposeAUGraph(slot.graph);
        slot.graph = nullptr;
        slot.instrNode = 0;
        slot.outputNode = 0;
        slot.unit = nullptr;
        slot.outputUnit = nullptr;
    } else {
        if (slot.outputUnit) {
            AudioOutputUnitStop(slot.outputUnit);
            AudioUnitUninitialize(slot.outputUnit);
            AudioComponentInstanceDispose(slot.outputUnit);
            slot.outputUnit = nullptr;
        }
        if (slot.unit) {
            AudioUnitUninitialize(slot.unit);
            AudioComponentInstanceDispose(slot.unit);
            slot.unit = nullptr;
        }
    }
    slot.component = nullptr;
    slot.pluginName.clear();
    slot.presetName.clear();
    slot.loaded = false;
}
#endif

void KontaktHost::setError(const std::string& message) {
    std::lock_guard<std::mutex> lock(mutex_);
    status_.lastError = message;
    std::cerr << "[kontakt-bridge] " << message << std::endl;
}
