/**
 * monique_juce_shim.h - Comprehensive JUCE compatibility layer for Monique WASM build
 *
 * Provides stub implementations for every JUCE type used by Monique's core DSP files:
 *   - monique_core_Synth.cpp / .h
 *   - monique_core_Datastructures.cpp / .h
 *   - monique_core_Parameters.cpp / .h
 *   - App.h, mono_AudioDeviceManager.h, monique_core_Processor.h (headers only)
 *
 * Strategy: single-threaded WASM means no-op locks, no-op timers, no-op file I/O.
 * Audio buffers and MIDI types are fully functional.
 */
#pragma once

// Prevent real JUCE module headers from being included
#define JUCE_AUDIO_PROCESSORS_H_INCLUDED 1
#define JUCE_AUDIO_FORMATS_H_INCLUDED 1
#define JUCE_AUDIO_UTILS_H_INCLUDED 1
#define JUCE_CORE_H_INCLUDED 1
#define JUCE_AUDIO_BASICS_H_INCLUDED 1
#define JUCE_AUDIO_DEVICES_H_INCLUDED 1
#define JUCE_EVENTS_H_INCLUDED 1
#define JUCE_DATA_STRUCTURES_H_INCLUDED 1
#define JUCE_GUI_BASICS_H_INCLUDED 1

// ============================================================================
// Platform macros (WASM = none of these)
// ============================================================================
#ifndef JUCE_LINUX
#define JUCE_LINUX 1  // Emscripten is Linux-like (prevents COLD→inline in App.h)
#endif
#ifndef JUCE_MAC
#define JUCE_MAC 0
#endif
#ifndef JUCE_WINDOWS
#define JUCE_WINDOWS 0
#endif
#ifndef JUCE_IOS
#define JUCE_IOS 0
#endif
#ifndef JUCE_ANDROID
#define JUCE_ANDROID 0
#endif
#ifndef JUCE_MSVC
#define JUCE_MSVC 0
#endif
#ifndef JUCE_BIG_ENDIAN
#define JUCE_BIG_ENDIAN 0
#endif

// ============================================================================
// JUCE utility macros
// ============================================================================
#define JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ClassName)
#define JUCE_DECLARE_NON_COPYABLE(ClassName)
#define JUCE_LEAK_DETECTOR(ClassName)

#ifndef forcedinline
#define forcedinline inline
#endif

#define JUCE_CALLTYPE
#define JUCE_UNDENORMALISE(x) { (x) += 1.0e-15f; (x) -= 1.0e-15f; }

#define jassert(x) ((void)0)
#define jassertfalse ((void)0)
#define DBG(x) ((void)0)

// ============================================================================
// Standard library includes
// ============================================================================
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>
#include <memory>
#include <functional>
#include <iostream>
#include <chrono>
#include <mutex>

namespace juce {

// ============================================================================
// Math Constants
// ============================================================================
template <typename T>
struct MathConstants {
    static constexpr T pi       = T(3.14159265358979323846);
    static constexpr T twoPi    = T(6.28318530717958647692);
    static constexpr T halfPi   = T(1.57079632679489661923);
    static constexpr T euler    = T(2.71828182845904523536);
    static constexpr T sqrt2    = T(1.41421356237309504880);
};

// ============================================================================
// Math utility functions
// ============================================================================
template <typename T> inline T jmax(T a, T b) { return a > b ? a : b; }
template <typename T> inline T jmax(T a, T b, T c) { return jmax(a, jmax(b, c)); }
template <typename T> inline T jmin(T a, T b) { return a < b ? a : b; }
template <typename T> inline T jmin(T a, T b, T c) { return jmin(a, jmin(b, c)); }
template <typename T> inline T jlimit(T lo, T hi, T v) { return v < lo ? lo : (v > hi ? hi : v); }

inline int roundToInt(float v) { return (int)(v + 0.5f); }
inline int roundToInt(double v) { return (int)(v + 0.5); }

template <typename T>
inline T* addBytesToPointer(T* ptr, int bytes) {
    return reinterpret_cast<T*>(const_cast<char*>(reinterpret_cast<const char*>(ptr)) + bytes);
}

inline float approximatelyEqual(float a, float b) { return std::abs(a - b) < 1.0e-6f; }

// ============================================================================
// Random
// ============================================================================
class Random {
public:
    Random() : state_(1) {}
    Random(int64_t seed) : state_(seed) {}
    int nextInt(int maxValue) {
        state_ = state_ * 6364136223846793005ULL + 1442695040888963407ULL;
        return (int)((state_ >> 33) % maxValue);
    }
    float nextFloat() {
        return (float)(nextInt(0x7fffffff)) / (float)0x7fffffff;
    }
private:
    uint64_t state_;
};

// ============================================================================
// String
// ============================================================================
class String {
public:
    String() {}
    String(const char* s) : str_(s ? s : "") {}
    String(const std::string& s) : str_(s) {}
    String(int v) : str_(std::to_string(v)) {}
    String(float v) : str_(std::to_string(v)) {}
    String(double v) : str_(std::to_string(v)) {}

    const char* toRawUTF8() const { return str_.c_str(); }
    const char* toUTF8() const { return str_.c_str(); }
    std::string toStdString() const { return str_; }
    int length() const { return (int)str_.length(); }
    bool isEmpty() const { return str_.empty(); }
    bool isNotEmpty() const { return !str_.empty(); }

    String operator+(const String& o) const { return String(str_ + o.str_); }
    String operator+(const char* s) const { return String(str_ + (s ? s : "")); }
    bool operator==(const String& o) const { return str_ == o.str_; }
    bool operator!=(const String& o) const { return str_ != o.str_; }
    operator std::string() const { return str_; }

    int getIntValue() const {
        if (str_.empty()) return 0;
        return std::atoi(str_.c_str());
    }
    float getFloatValue() const {
        if (str_.empty()) return 0.0f;
        return (float)std::atof(str_.c_str());
    }

    bool contains(const String& other) const {
        return str_.find(other.str_) != std::string::npos;
    }
    bool containsIgnoreCase(const String& other) const {
        std::string a = str_, b = other.str_;
        std::transform(a.begin(), a.end(), a.begin(), ::tolower);
        std::transform(b.begin(), b.end(), b.begin(), ::tolower);
        return a.find(b) != std::string::npos;
    }

    String paddedLeft(char padChar, int minimumLength) const {
        if ((int)str_.length() >= minimumLength) return *this;
        return String(std::string(minimumLength - str_.length(), padChar) + str_);
    }

    // Stream-style appending via operator<<
    String& operator<<(const String& other) { str_ += other.str_; return *this; }
    String& operator<<(const char* s) { if (s) str_ += s; return *this; }
    String& operator<<(int v) { str_ += std::to_string(v); return *this; }
    String& operator<<(float v) { str_ += std::to_string(v); return *this; }
    String& operator<<(double v) { str_ += std::to_string(v); return *this; }
    String& operator<<(char c) { str_ += c; return *this; }

    bool startsWith(const String& prefix) const {
        return str_.rfind(prefix.str_, 0) == 0;
    }
    bool endsWith(const String& suffix) const {
        if (suffix.str_.length() > str_.length()) return false;
        return str_.compare(str_.length() - suffix.str_.length(), suffix.str_.length(), suffix.str_) == 0;
    }
    String substring(int start, int end = -1) const {
        if (end < 0) return String(str_.substr(start));
        return String(str_.substr(start, end - start));
    }
    String replace(const String& target, const String& replacement) const {
        std::string result = str_;
        size_t pos = 0;
        while ((pos = result.find(target.str_, pos)) != std::string::npos) {
            result.replace(pos, target.str_.length(), replacement.str_);
            pos += replacement.str_.length();
        }
        return String(result);
    }

    friend String operator+(const char* a, const String& b) {
        return String(std::string(a ? a : "") + b.str_);
    }

private:
    std::string str_;
};

class StringRef {
public:
    StringRef() : ptr_("") {}
    StringRef(const char* s) : ptr_(s ? s : "") {}
    StringRef(const String& s) : ptr_(s.toRawUTF8()) {}
    const char* text = nullptr;
    operator const char*() const { return ptr_; }
private:
    const char* ptr_;
};

class StringArray {
public:
    StringArray() {}
    void add(const String& s) { items_.push_back(s); }
    int size() const { return (int)items_.size(); }
    const String& operator[](int i) const { return items_[i]; }
    String& getReference(int i) { return items_[i]; }
    void clear() { items_.clear(); }
    void clearQuick() { items_.clear(); }
    int indexOf(const String& s) const {
        for (int i = 0; i < (int)items_.size(); ++i)
            if (items_[i] == s) return i;
        return -1;
    }
    void sortNatural() {}
    bool contains(const String& s) const { return indexOf(s) >= 0; }
private:
    std::vector<String> items_;
};

// ============================================================================
// AudioBuffer<T>
// ============================================================================
template <typename SampleType>
class AudioBuffer {
public:
    AudioBuffer() : numChannels_(0), numSamples_(0) {}
    AudioBuffer(int numChannels, int numSamples)
        : numChannels_(numChannels), numSamples_(numSamples) {
        allocate();
    }
    AudioBuffer(const AudioBuffer& other)
        : numChannels_(other.numChannels_), numSamples_(other.numSamples_), data_(other.data_) {}
    AudioBuffer& operator=(const AudioBuffer& other) {
        if (this != &other) {
            numChannels_ = other.numChannels_;
            numSamples_ = other.numSamples_;
            data_ = other.data_;
        }
        return *this;
    }

    int getNumChannels() const { return numChannels_; }
    int getNumSamples() const { return numSamples_; }

    const SampleType* getReadPointer(int channel, int startSample = 0) const {
        if (channel < 0 || channel >= numChannels_) return nullptr;
        return data_[channel].data() + startSample;
    }
    SampleType* getWritePointer(int channel, int startSample = 0) {
        if (channel < 0 || channel >= numChannels_) return nullptr;
        return data_[channel].data() + startSample;
    }

    void setSize(int numChannels, int numSamples,
                 bool keepExistingContent = false,
                 bool clearExtraSpace = false,
                 bool avoidReallocating = false) {
        (void)avoidReallocating;
        int oldChannels = numChannels_;
        int oldSamples = numSamples_;
        numChannels_ = numChannels;
        numSamples_ = numSamples;
        data_.resize(numChannels);
        for (int ch = 0; ch < numChannels; ++ch) {
            if (keepExistingContent && ch < oldChannels) {
                int oldSize = (int)data_[ch].size();
                data_[ch].resize(numSamples, SampleType(0));
                if (clearExtraSpace && numSamples > oldSize) {
                    std::fill(data_[ch].begin() + oldSize, data_[ch].end(), SampleType(0));
                }
            } else {
                data_[ch].assign(numSamples, SampleType(0));
            }
        }
        (void)oldSamples;
    }

    void clear() {
        for (auto& ch : data_)
            std::fill(ch.begin(), ch.end(), SampleType(0));
    }
    void clear(int channel, int startSample, int numSamples) {
        if (channel >= 0 && channel < numChannels_) {
            int end = std::min(startSample + numSamples, (int)data_[channel].size());
            std::fill(data_[channel].begin() + startSample, data_[channel].begin() + end, SampleType(0));
        }
    }

    void addFrom(int destChannel, int destStartSample,
                 const AudioBuffer& source, int sourceChannel, int sourceStartSample,
                 int numSamples, SampleType gainToApplyToSource = SampleType(1)) {
        auto* dest = getWritePointer(destChannel, destStartSample);
        auto* src = source.getReadPointer(sourceChannel, sourceStartSample);
        if (dest && src) {
            for (int i = 0; i < numSamples; ++i)
                dest[i] += src[i] * gainToApplyToSource;
        }
    }

    void copyFrom(int destChannel, int destStartSample,
                  const SampleType* source, int numSamples) {
        auto* dest = getWritePointer(destChannel, destStartSample);
        if (dest && source)
            std::memcpy(dest, source, numSamples * sizeof(SampleType));
    }

    void applyGain(SampleType gain) {
        for (auto& ch : data_)
            for (auto& s : ch)
                s *= gain;
    }
    void applyGain(int channel, int startSample, int numSamples, SampleType gain) {
        auto* d = getWritePointer(channel, startSample);
        if (d) {
            for (int i = 0; i < numSamples; ++i)
                d[i] *= gain;
        }
    }

private:
    void allocate() {
        data_.resize(numChannels_);
        for (auto& ch : data_)
            ch.assign(numSamples_, SampleType(0));
    }
    int numChannels_;
    int numSamples_;
    std::vector<std::vector<SampleType>> data_;
};

using AudioSampleBuffer = AudioBuffer<float>;

// ============================================================================
// FloatVectorOperations
// ============================================================================
struct FloatVectorOperations {
    static void clear(float* dest, int numValues) {
        std::memset(dest, 0, numValues * sizeof(float));
    }
    static void fill(float* dest, float value, int numValues) {
        for (int i = 0; i < numValues; ++i) dest[i] = value;
    }
    static void copy(float* dest, const float* source, int numValues) {
        std::memcpy(dest, source, numValues * sizeof(float));
    }
    static void add(float* dest, const float* source, int numValues) {
        for (int i = 0; i < numValues; ++i) dest[i] += source[i];
    }
    static void add(float* dest, float amount, int numValues) {
        for (int i = 0; i < numValues; ++i) dest[i] += amount;
    }
    static void multiply(float* dest, float multiplier, int numValues) {
        for (int i = 0; i < numValues; ++i) dest[i] *= multiplier;
    }
    static void multiply(float* dest, const float* source, int numValues) {
        for (int i = 0; i < numValues; ++i) dest[i] *= source[i];
    }
    static float findMinimum(const float* data, int numValues) {
        float m = data[0];
        for (int i = 1; i < numValues; ++i) m = std::min(m, data[i]);
        return m;
    }
    static float findMaximum(const float* data, int numValues) {
        float m = data[0];
        for (int i = 1; i < numValues; ++i) m = std::max(m, data[i]);
        return m;
    }
};

// ============================================================================
// MidiMessage
// ============================================================================
class MidiMessage {
public:
    MidiMessage() : noteNumber_(0), velocity_(0), channel_(1), timestamp_(0), type_(Type::None) {}
    MidiMessage(const MidiMessage& o) = default;
    MidiMessage& operator=(const MidiMessage& o) = default;

    // Factory methods
    static MidiMessage noteOn(int channel, int noteNumber, float velocity) {
        MidiMessage m;
        m.type_ = Type::NoteOn;
        m.channel_ = channel;
        m.noteNumber_ = noteNumber;
        m.velocity_ = (int)(velocity * 127.0f);
        return m;
    }
    static MidiMessage noteOn(int channel, int noteNumber, uint8_t velocity) {
        MidiMessage m;
        m.type_ = Type::NoteOn;
        m.channel_ = channel;
        m.noteNumber_ = noteNumber;
        m.velocity_ = velocity;
        return m;
    }
    static MidiMessage noteOff(int channel, int noteNumber, float velocity = 0.0f) {
        MidiMessage m;
        m.type_ = Type::NoteOff;
        m.channel_ = channel;
        m.noteNumber_ = noteNumber;
        m.velocity_ = (int)(velocity * 127.0f);
        return m;
    }
    static MidiMessage noteOff(int channel, int noteNumber, uint8_t velocity) {
        MidiMessage m;
        m.type_ = Type::NoteOff;
        m.channel_ = channel;
        m.noteNumber_ = noteNumber;
        m.velocity_ = velocity;
        return m;
    }
    static MidiMessage controllerEvent(int channel, int controller, int value) {
        MidiMessage m;
        m.type_ = Type::Controller;
        m.channel_ = channel;
        m.noteNumber_ = controller;
        m.velocity_ = value;
        return m;
    }
    static MidiMessage pitchWheel(int channel, int position) {
        MidiMessage m;
        m.type_ = Type::PitchWheel;
        m.channel_ = channel;
        m.velocity_ = position;
        return m;
    }
    static MidiMessage programChange(int channel, int programNumber) {
        MidiMessage m;
        m.type_ = Type::ProgramChange;
        m.channel_ = channel;
        m.noteNumber_ = programNumber;
        return m;
    }
    static MidiMessage midiClock() {
        MidiMessage m;
        m.type_ = Type::Clock;
        return m;
    }
    static MidiMessage midiStart() {
        MidiMessage m;
        m.type_ = Type::Start;
        return m;
    }
    static MidiMessage midiStop() {
        MidiMessage m;
        m.type_ = Type::Stop;
        return m;
    }
    static MidiMessage allNotesOff(int channel) {
        return controllerEvent(channel, 123, 0);
    }

    // Queries
    bool isNoteOn(bool returnTrueForVelocity0 = false) const {
        return type_ == Type::NoteOn && (returnTrueForVelocity0 || velocity_ > 0);
    }
    bool isNoteOff(bool returnTrueForNoteOnVelocity0 = true) const {
        if (type_ == Type::NoteOff) return true;
        if (returnTrueForNoteOnVelocity0 && type_ == Type::NoteOn && velocity_ == 0) return true;
        return false;
    }
    bool isNoteOnOrOff() const { return type_ == Type::NoteOn || type_ == Type::NoteOff; }
    bool isController() const { return type_ == Type::Controller; }
    bool isPitchWheel() const { return type_ == Type::PitchWheel; }
    bool isProgramChange() const { return type_ == Type::ProgramChange; }
    bool isMidiClock() const { return type_ == Type::Clock; }
    bool isMidiStart() const { return type_ == Type::Start; }
    bool isMidiStop() const { return type_ == Type::Stop; }
    bool isAllNotesOff() const { return isController() && getControllerNumber() == 123; }
    bool isSustainPedalOn() const { return isController() && getControllerNumber() == 64 && getControllerValue() >= 64; }
    bool isSustainPedalOff() const { return isController() && getControllerNumber() == 64 && getControllerValue() < 64; }
    bool isSostenutoPedalOn() const { return isController() && getControllerNumber() == 66 && getControllerValue() >= 64; }
    bool isSostenutoPedalOff() const { return isController() && getControllerNumber() == 66 && getControllerValue() < 64; }
    bool isSoftPedalOn() const { return isController() && getControllerNumber() == 67 && getControllerValue() >= 64; }
    bool isSoftPedalOff() const { return isController() && getControllerNumber() == 67 && getControllerValue() < 64; }
    bool isAftertouch() const { return false; }
    bool isChannelPressure() const { return false; }
    bool isSysEx() const { return false; }
    bool isAllSoundOff() const { return isController() && getControllerNumber() == 120; }

    static double getMidiNoteInHertz(int noteNumber, double frequencyOfA = 440.0) {
        return frequencyOfA * std::pow(2.0, (noteNumber - 69.0) / 12.0);
    }

    int getNoteNumber() const { return noteNumber_; }
    int getVelocity() const { return velocity_; }
    float getFloatVelocity() const { return velocity_ / 127.0f; }
    int getControllerNumber() const { return noteNumber_; }
    int getControllerValue() const { return velocity_; }
    int getPitchWheelValue() const { return velocity_; }
    int getProgramChangeNumber() const { return noteNumber_; }
    int getChannel() const { return channel_; }
    int getAfterTouchValue() const { return 0; }
    int getChannelPressureValue() const { return 0; }

    double getTimeStamp() const { return timestamp_; }
    void setTimeStamp(double t) { timestamp_ = t; }

    const uint8_t* getRawData() const { return nullptr; }
    int getRawDataSize() const { return 0; }

    MidiMessage withTimeStamp(double newTimestamp) const {
        MidiMessage m = *this;
        m.timestamp_ = newTimestamp;
        return m;
    }

private:
    enum class Type { None, NoteOn, NoteOff, Controller, PitchWheel, ProgramChange,
                      Clock, Start, Stop, Continue };
    int noteNumber_;
    int velocity_;
    int channel_;
    double timestamp_;
    Type type_;
};

// ============================================================================
// MidiBuffer
// ============================================================================
class MidiBuffer {
public:
    struct Event {
        MidiMessage message;
        int samplePosition;
    };

    MidiBuffer() {}

    void addEvent(const MidiMessage& msg, int samplePosition) {
        events_.push_back({msg, samplePosition});
    }
    int getNumEvents() const { return (int)events_.size(); }
    bool isEmpty() const { return events_.empty(); }
    void clear() { events_.clear(); }
    void clear(int startSample, int numSamples) {
        events_.erase(
            std::remove_if(events_.begin(), events_.end(),
                [startSample, numSamples](const Event& e) {
                    return e.samplePosition >= startSample &&
                           e.samplePosition < startSample + numSamples;
                }),
            events_.end());
    }

    // Legacy Iterator
    class Iterator {
    public:
        Iterator(const MidiBuffer& buffer) : buffer_(buffer), index_(0) {}
        bool getNextEvent(MidiMessage& result, int& samplePosition) {
            if (index_ >= (int)buffer_.events_.size()) return false;
            result = buffer_.events_[index_].message;
            samplePosition = buffer_.events_[index_].samplePosition;
            ++index_;
            return true;
        }
        void setNextSamplePosition(int samplePos) {
            index_ = 0;
            while (index_ < (int)buffer_.events_.size() &&
                   buffer_.events_[index_].samplePosition < samplePos) {
                ++index_;
            }
        }
    private:
        const MidiBuffer& buffer_;
        int index_;
    };

    // Range-based for loop support
    struct MidiEventMetadata {
        MidiMessage message;
        int samplePosition;
        const Event* event;
        MidiMessage getMessage() const { return message; }
    };

    const std::vector<Event>& getEvents() const { return events_; }

    // begin/end for range-based iteration
    struct ConstIterator {
        const Event* ptr;
        bool operator!=(const ConstIterator& o) const { return ptr != o.ptr; }
        ConstIterator& operator++() { ++ptr; return *this; }
        MidiEventMetadata operator*() const { return {ptr->message, ptr->samplePosition, ptr}; }
    };
    ConstIterator begin() const {
        return {events_.empty() ? nullptr : events_.data()};
    }
    ConstIterator end() const {
        return {events_.empty() ? nullptr : events_.data() + events_.size()};
    }

private:
    friend class Iterator;
    std::vector<Event> events_;
};

// ============================================================================
// MidiInput / MidiOutput / MidiInputCallback / MidiMessageCollector
// ============================================================================
class MidiInput {
public:
    String getName() const { return ""; }
};

class MidiOutput {
public:
    void sendMessageNow(const MidiMessage&) {}
};

class MidiInputCallback {
public:
    virtual ~MidiInputCallback() {}
    virtual void handleIncomingMidiMessage(MidiInput*, const MidiMessage&) = 0;
};

class MidiMessageCollector {
public:
    void reset(double) {}
    void addMessageToQueue(const MidiMessage& msg) {
        buffer_.push_back(msg);
    }
    void removeNextBlockOfMessages(MidiBuffer& dest, int numSamples) {
        for (auto& msg : buffer_)
            dest.addEvent(msg, 0);
        buffer_.clear();
        (void)numSamples;
    }
private:
    std::vector<MidiMessage> buffer_;
};

class MidiKeyboardState {
public:
    virtual ~MidiKeyboardState() {}
    void processNextMidiEvent(const MidiMessage&) {}
    void allNotesOff(int) {}
    void reset() {}
};

// ============================================================================
// CriticalSection / ScopedLock (placed before Synthesiser which uses it)
// ============================================================================
class CriticalSection {
public:
    void enter() const {}
    void exit() const {}
    bool tryEnter() const { return true; }
    class ScopedLockType {
    public:
        ScopedLockType(const CriticalSection&) {}
    };
};

using ScopedLock = CriticalSection::ScopedLockType;

// ============================================================================
// SynthesiserSound / SynthesiserVoice / Synthesiser
// ============================================================================
class SynthesiserSound {
public:
    using Ptr = std::shared_ptr<SynthesiserSound>;
    virtual ~SynthesiserSound() {}
    virtual bool appliesToNote(int) = 0;
    virtual bool appliesToChannel(int) = 0;
};

class SynthesiserVoice {
public:
    virtual ~SynthesiserVoice() {}
    virtual bool canPlaySound(SynthesiserSound*) = 0;
    virtual void startNote(int midiNoteNumber, float velocity,
                           SynthesiserSound* sound, int currentPitchWheelPosition) = 0;
    virtual void stopNote(float velocity, bool allowTailOff) = 0;
    virtual void renderNextBlock(AudioSampleBuffer& outputBuffer,
                                  int startSample, int numSamples) = 0;
    virtual void pitchWheelMoved(int newPitchWheelValue) = 0;
    virtual void controllerMoved(int controllerNumber, int newControllerValue) = 0;

    bool isVoiceActive() const { return voiceActive_; }
    int getCurrentlyPlayingNote() const { return currentNote_; }
    double getSampleRate() const { return sampleRate_; }
    void setSampleRate(double sr) { sampleRate_ = sr; }
    bool isKeyDown() const { return keyIsDown_; }
    void clearCurrentNote() { currentNote_ = -1; voiceActive_ = false; }

protected:
    bool voiceActive_ = false;
    bool keyIsDown_ = false;
    int currentNote_ = -1;
    double sampleRate_ = 44100.0;
};

class Synthesiser {
public:
    virtual ~Synthesiser() {}

    SynthesiserVoice* addVoice(SynthesiserVoice* newVoice) {
        voices_.push_back(newVoice);
        return newVoice;
    }
    SynthesiserSound* addSound(const SynthesiserSound::Ptr& sound) {
        sounds_.push_back(sound);
        return sound.get();
    }

    void setCurrentPlaybackSampleRate(double sr) {
        sampleRate_ = sr;
        for (auto* v : voices_) v->setSampleRate(sr);
    }

    void noteOn(int midiChannel, int midiNoteNumber, float velocity) {
        (void)midiChannel;
        for (auto* v : voices_) {
            if (!v->isVoiceActive() || v->getCurrentlyPlayingNote() == midiNoteNumber) {
                auto* sound = sounds_.empty() ? nullptr : sounds_[0].get();
                v->startNote(midiNoteNumber, velocity, sound, lastPitchWheel_);
                return;
            }
        }
        // Steal oldest if all busy
        if (!voices_.empty()) {
            auto* sound = sounds_.empty() ? nullptr : sounds_[0].get();
            voices_[0]->startNote(midiNoteNumber, velocity, sound, lastPitchWheel_);
        }
    }

    void noteOff(int midiChannel, int midiNoteNumber, float velocity, bool allowTailOff) {
        (void)midiChannel;
        for (auto* v : voices_) {
            if (v->getCurrentlyPlayingNote() == midiNoteNumber) {
                v->stopNote(velocity, allowTailOff);
            }
        }
    }

    void allNotesOff(int midiChannel, bool allowTailOff) {
        (void)midiChannel;
        for (auto* v : voices_)
            v->stopNote(0, allowTailOff);
    }

    virtual void renderNextBlock(AudioBuffer<float>& outputAudio,
                                  const MidiBuffer& inputMidi,
                                  int startSample, int numSamples) {
        (void)inputMidi;
        for (auto* v : voices_) {
            if (v->isVoiceActive())
                v->renderNextBlock(outputAudio, startSample, numSamples);
        }
    }

    virtual void handleAftertouch(int, int, int) {}
    virtual void handleChannelPressure(int, int) {}
    virtual void handleSustainPedal(int, bool) {}
    virtual void handleSostenutoPedal(int, bool) {}
    virtual void handleSoftPedal(int, bool) {}
    virtual void handleController(int, int, int) {}
    virtual void handlePitchWheel(int, int) {}
    virtual void handleProgramChange(int, int) {}

    int getNumVoices() const { return (int)voices_.size(); }
    SynthesiserVoice* getVoice(int index) { return voices_[index]; }

protected:
    virtual void renderVoices(AudioBuffer<float>& outputAudio,
                              int startSample, int numSamples) {
        for (auto* v : voices_) {
            if (v->isVoiceActive())
                v->renderNextBlock(outputAudio, startSample, numSamples);
        }
    }

    CriticalSection lock;
    double sampleRate_ = 44100.0;
    int lastPitchWheel_ = 8192;
    int lastPitchWheelValues[16] = {8192,8192,8192,8192,8192,8192,8192,8192,
                                     8192,8192,8192,8192,8192,8192,8192,8192};
    std::vector<SynthesiserVoice*> voices_;
    std::vector<SynthesiserSound::Ptr> sounds_;
};

// ============================================================================
// MemoryBlock / MemoryInputStream (must appear before AudioProcessor)
// ============================================================================
class MemoryBlock {
public:
    MemoryBlock() {}
    MemoryBlock(size_t initialSize, bool initialiseToZero = false) {
        data_.resize(initialSize, initialiseToZero ? 0 : 0);
    }
    void* getData() { return data_.data(); }
    const void* getData() const { return data_.data(); }
    size_t getSize() const { return data_.size(); }
    void setSize(size_t newSize, bool initialiseNewSpaceToZero = false) {
        data_.resize(newSize, initialiseNewSpaceToZero ? 0 : 0);
    }
    void append(const void* data, size_t numBytes) {
        auto oldSize = data_.size();
        data_.resize(oldSize + numBytes);
        std::memcpy(data_.data() + oldSize, data, numBytes);
    }
private:
    std::vector<uint8_t> data_;
};

class InputStream {
public:
    virtual ~InputStream() {}
    virtual int read(void*, int) { return 0; }
    virtual int64_t getTotalLength() { return 0; }
    virtual bool isExhausted() { return true; }
    virtual int64_t getPosition() { return 0; }
    virtual bool setPosition(int64_t) { return false; }
};

class MemoryInputStream : public InputStream {
public:
    MemoryInputStream(const void*, size_t, bool) {}
    MemoryInputStream(const MemoryBlock&, bool) {}
};

// ============================================================================
// AudioProcessor / AudioProcessorEditor / AudioPlayHead
// ============================================================================
struct AudioPlayHead {
    struct CurrentPositionInfo {
        double bpm = 120.0;
        double ppqPosition = 0.0;
        double ppqPositionOfLastBarStart = 0.0;
        int timeSigNumerator = 4;
        int timeSigDenominator = 4;
        bool isPlaying = false;
        bool isRecording = false;
        bool isLooping = false;
        double editOriginTime = 0.0;
        int64_t timeInSamples = 0;
        double timeInSeconds = 0.0;
    };
    virtual ~AudioPlayHead() {}
    virtual bool getCurrentPosition(CurrentPositionInfo&) { return false; }
};

class AudioProcessorEditor {
public:
    virtual ~AudioProcessorEditor() {}
};

class AudioProcessor {
public:
    enum WrapperType {
        wrapperType_Undefined = 0,
        wrapperType_VST,
        wrapperType_VST3,
        wrapperType_AudioUnit,
        wrapperType_AudioUnitv3,
        wrapperType_AAX,
        wrapperType_Standalone
    };

    struct BusesLayout {};

    virtual ~AudioProcessor() {}

    // Pure virtuals that MoniqueAudioProcessor overrides
    virtual void processBlock(AudioSampleBuffer&, MidiBuffer&) {}
    virtual void processBlockBypassed(AudioSampleBuffer&, MidiBuffer&) {}
    virtual void prepareToPlay(double, int) {}
    virtual void releaseResources() {}
    virtual void reset() {}
    virtual bool hasEditor() const { return false; }
    virtual AudioProcessorEditor* createEditor() { return nullptr; }
    virtual const String getName() const { return "Monique"; }
    virtual bool acceptsMidi() const { return true; }
    virtual bool producesMidi() const { return false; }
    virtual bool silenceInProducesSilenceOut() const { return false; }
    virtual double getTailLengthSeconds() const { return 0; }
    virtual int getNumPrograms() { return 1; }
    virtual int getCurrentProgram() { return 0; }
    virtual void setCurrentProgram(int) {}
    virtual const String getProgramName(int) { return ""; }
    virtual void changeProgramName(int, const String&) {}
    virtual void getStateInformation(MemoryBlock&) {}
    virtual void setStateInformation(const void*, int) {}
    virtual int getNumParameters() { return 0; }
    virtual float getParameter(int) { return 0.0f; }
    virtual void setParameter(int, float) {}
    virtual const String getParameterName(int) { return ""; }
    virtual const String getParameterText(int) { return ""; }
    virtual String getParameterLabel(int) const { return ""; }
    virtual int getParameterNumSteps(int) { return 0x7fffffff; }
    virtual float getParameterDefaultValue(int) { return 0.0f; }
    virtual bool isParameterAutomatable(int) const { return true; }
    virtual bool isMetaParameter(int) const { return false; }
    virtual bool isInputChannelStereoPair(int) const { return true; }
    virtual bool isOutputChannelStereoPair(int) const { return true; }
    virtual bool isBusesLayoutSupported(const BusesLayout&) const { return true; }

    AudioProcessorEditor* getActiveEditor() { return nullptr; }
    AudioPlayHead* getPlayHead() { return nullptr; }
    double getSampleRate() const { return sampleRate_; }
    int getBlockSize() const { return blockSize_; }

protected:
    double sampleRate_ = 44100.0;
    int blockSize_ = 512;
};

// ============================================================================
// AudioFormatManager / AudioFormatReader (stubs)
// ============================================================================
class AudioFormatReader {
public:
    virtual ~AudioFormatReader() {}
    double sampleRate = 44100.0;
    int64_t lengthInSamples = 0;
    int numChannels = 0;
};

class AudioFormatManager {
public:
    void registerBasicFormats() {}
    AudioFormatReader* createReaderFor(const class File&) { return nullptr; }
};

// ============================================================================
// AudioDeviceManager (stub for non-standalone)
// ============================================================================
class AudioDeviceManager {
public:
    virtual ~AudioDeviceManager() {}
};

// ============================================================================
// AudioChannelSet
// ============================================================================
struct AudioChannelSet {
    static AudioChannelSet mono() { return AudioChannelSet(); }
    static AudioChannelSet stereo() { return AudioChannelSet(); }
};

// ============================================================================
// AudioDataConverters
// ============================================================================
struct AudioDataConverters {
    static void convertFloatToInt16LE(const float*, void*, int) {}
    static void convertInt16LEToFloat(const void*, float*, int) {}
};

// ============================================================================
// PluginHostType
// ============================================================================
struct PluginHostType {
    static constexpr AudioProcessor::WrapperType jucePlugInClientCurrentWrapperType =
        AudioProcessor::wrapperType_Standalone;
};

// ============================================================================
// Array<T>
// ============================================================================
template <typename T>
class Array {
public:
    Array() {}
    Array(const Array& other) : items_(other.items_) {}
    Array& operator=(const Array& other) {
        if (this != &other) {
            items_.clear();
            items_.reserve(other.items_.size());
            for (const auto& item : other.items_)
                items_.push_back(item);
        }
        return *this;
    }

    void add(const T& item) { items_.push_back(item); }
    void add(T&& item) { items_.push_back(std::move(item)); }
    void insert(int index, const T& item) {
        if (index >= (int)items_.size()) items_.push_back(item);
        else items_.insert(items_.begin() + index, item);
    }
    void remove(int index) {
        if (index >= 0 && index < (int)items_.size())
            items_.erase(items_.begin() + index);
    }
    void removeFirstMatchingValue(const T& val) {
        for (auto it = items_.begin(); it != items_.end(); ++it) {
            if (*it == val) { items_.erase(it); return; }
        }
    }
    void swap(int a, int b) {
        if (a >= 0 && a < (int)items_.size() && b >= 0 && b < (int)items_.size())
            std::swap(items_[a], items_[b]);
    }
    int indexOf(const T& val) const {
        for (int i = 0; i < (int)items_.size(); ++i)
            if (items_[i] == val) return i;
        return -1;
    }
    bool contains(const T& val) const { return indexOf(val) >= 0; }

    T& getReference(int index) { return items_[index]; }
    const T& getReference(int index) const { return items_[index]; }
    T getUnchecked(int index) const { return items_[index]; }
    T& operator[](int index) { return items_[index]; }
    const T& operator[](int index) const { return items_[index]; }
    T getLast() const { return items_.empty() ? T() : items_.back(); }
    T getFirst() const { return items_.empty() ? T() : items_.front(); }

    int size() const { return (int)items_.size(); }
    bool isEmpty() const { return items_.empty(); }
    void clear() { items_.clear(); }
    void clearQuick() { items_.clear(); }
    void addArray(const Array& other) {
        items_.reserve(items_.size() + other.items_.size());
        for (size_t i = 0; i < other.items_.size(); ++i)
            items_.push_back(other.items_[i]);
    }
    void resize(int newSize) { items_.resize(newSize); }
    void ensureStorageAllocated(int minNumElements) { items_.reserve(minNumElements); }
    void minimiseStorageOverheads() { items_.shrink_to_fit(); }

    T* begin() { return items_.data(); }
    T* end() { return items_.data() + items_.size(); }
    const T* begin() const { return items_.data(); }
    const T* end() const { return items_.data() + items_.size(); }

    T* getRawDataPointer() { return items_.data(); }
    const T* getRawDataPointer() const { return items_.data(); }

private:
    std::vector<T> items_;
};

// ============================================================================
// OwnedArray<T>
// ============================================================================
template <typename T>
class OwnedArray {
public:
    OwnedArray() {}
    ~OwnedArray() { clear(); }

    T* add(T* item) { items_.push_back(item); return item; }
    void insert(int index, T* item) {
        if (index >= (int)items_.size()) items_.push_back(item);
        else items_.insert(items_.begin() + index, item);
    }
    void remove(int index, bool deleteObject = true) {
        if (index >= 0 && index < (int)items_.size()) {
            if (deleteObject) delete items_[index];
            items_.erase(items_.begin() + index);
        }
    }
    void clear(bool deleteObjects = true) {
        if (deleteObjects)
            for (auto* item : items_) delete item;
        items_.clear();
    }
    void clearQuick(bool deleteObjects = true) { clear(deleteObjects); }

    T* operator[](int index) const { return items_[index]; }
    T* getUnchecked(int index) const { return items_[index]; }
    T* getLast() const { return items_.empty() ? nullptr : items_.back(); }
    T* getFirst() const { return items_.empty() ? nullptr : items_.front(); }

    int size() const { return (int)items_.size(); }
    bool isEmpty() const { return items_.empty(); }
    void minimiseStorageOverheads() { items_.shrink_to_fit(); }

    T** begin() { return items_.data(); }
    T** end() { return items_.data() + items_.size(); }

private:
    OwnedArray(const OwnedArray&) = delete;
    OwnedArray& operator=(const OwnedArray&) = delete;
    std::vector<T*> items_;
};

// ============================================================================
// HeapBlock<T>
// ============================================================================
template <typename T>
class HeapBlock {
public:
    HeapBlock() : data_(nullptr), size_(0) {}
    HeapBlock(size_t numElements) { allocate(numElements, true); }
    ~HeapBlock() { freeData(data_); }

    void allocate(size_t numElements, bool initialiseToZero = false) {
        freeData(data_);
        size_ = numElements;
        data_ = (T*)::malloc(numElements * sizeof(T));
        if (initialiseToZero && data_)
            std::memset(data_, 0, numElements * sizeof(T));
    }
    // JUCE-compatible malloc alias
    void malloc(size_t numElements, size_t elementSize = sizeof(T)) {
        allocate(numElements * elementSize / sizeof(T), false);
    }
    void calloc(size_t numElements, size_t elementSize = sizeof(T)) {
        allocate(numElements * elementSize / sizeof(T), true);
    }
    void clear(size_t numElements) {
        if (data_) std::memset(data_, 0, numElements * sizeof(T));
    }
    void free() { ::free(data_); data_ = nullptr; size_ = 0; }

    operator T*() const { return data_; }
    T* get() const { return data_; }
    T& operator[](int index) { return data_[index]; }
    const T& operator[](int index) const { return data_[index]; }

private:
    HeapBlock(const HeapBlock&) = delete;
    HeapBlock& operator=(const HeapBlock&) = delete;
    T* data_;
    size_t size_;

    static void freeData(T* ptr) { if (ptr) ::free(ptr); }
};

// (MemoryBlock / MemoryInputStream defined above, before AudioProcessor)

// ============================================================================
// ContainerDeletePolicy
// ============================================================================
template <typename T>
struct ContainerDeletePolicy {
    static void destroy(T* object) { delete object; }
};

class MessageManagerLock {
public:
    MessageManagerLock() {}
    bool lockWasGained() const { return true; }
};

// ============================================================================
// Timer
// ============================================================================
class Timer {
public:
    virtual ~Timer() {}
    void startTimer(int) {}
    void startTimerHz(int) {}
    void stopTimer() {}
    bool isTimerRunning() const { return false; }
    virtual void timerCallback() = 0;
};

// ============================================================================
// Time
// ============================================================================
struct Time {
    static uint32_t getMillisecondCounter() {
        return (uint32_t)(getMillisecondCounterHiRes());
    }
    static double getMillisecondCounterHiRes() {
        using namespace std::chrono;
        return duration_cast<microseconds>(
            steady_clock::now().time_since_epoch()).count() / 1000.0;
    }
    static int64_t currentTimeMillis() {
        return (int64_t)getMillisecondCounterHiRes();
    }
};

// ============================================================================
// SystemStats
// ============================================================================
struct SystemStats {
    static String getStackBacktrace() { return ""; }
    static void setApplicationCrashHandler(void(*)(void*)) {}
};

// ============================================================================
// File
// ============================================================================
class File {
public:
    enum SpecialLocationType {
        userHomeDirectory,
        userDocumentsDirectory,
        userDesktopDirectory,
        userMusicDirectory,
        userMoviesDirectory,
        userPicturesDirectory,
        userApplicationDataDirectory,
        commonApplicationDataDirectory,
        commonDocumentsDirectory,
        tempDirectory,
        currentExecutableFile,
        currentApplicationFile,
        invokedExecutableFile,
        hostApplicationPath,
        globalApplicationsDirectory,
        ROOT_FOLDER
    };

    File() {}
    File(const String& path) : path_(path) {}

    String getFullPathName() const { return path_; }
    String getFileName() const { return path_; }
    String getFileNameWithoutExtension() const { return path_; }
    String getFileExtension() const { return ""; }
    bool exists() const { return false; }
    bool existsAsFile() const { return false; }
    bool isDirectory() const { return false; }
    bool createDirectory() const { return false; }
    bool moveFileTo(const File&) const { return false; }
    bool deleteFile() const { return false; }
    File getChildFile(const String& relativePath) const { return File(path_ + "/" + relativePath); }
    File getParentDirectory() const { return File(""); }

    Array<File> findChildFiles(int, bool, const String& = "*") const { return Array<File>(); }
    void findChildFiles(Array<File>&, int, bool, const String& = "*") const {}
    void appendText(const String&, bool = false, bool = false, const char* = nullptr) const {}
    enum TypesOfFileToFind { findFiles = 1, findDirectories = 2, findFilesAndDirectories = 3 };

    static File getSpecialLocation(SpecialLocationType) { return File("/tmp"); }
    static File getCurrentWorkingDirectory() { return File("."); }
    static char getSeparatorChar() { return '/'; }
    static String getSeparatorString() { return "/"; }

private:
    String path_;
};

// ============================================================================
// XmlElement / XmlDocument
// ============================================================================
class XmlElement {
public:
    XmlElement(const String& tagName) : tagName_(tagName) {}
    ~XmlElement() {}

    bool hasTagName(const String& name) const { return tagName_ == name; }
    String getTagName() const { return tagName_; }

    void setAttribute(const String&, const String&) {}
    void setAttribute(const String&, int) {}
    void setAttribute(const String&, double) {}
    void setAttribute(const String&, float) {}

    String getStringAttribute(const String&, const String& defaultValue = "") const { return defaultValue; }
    int getIntAttribute(const String&, int defaultValue = 0) const { return defaultValue; }
    double getDoubleAttribute(const String&, double defaultValue = 0) const { return defaultValue; }
    bool getBoolAttribute(const String&, bool defaultValue = false) const { return defaultValue; }

    XmlElement* getChildByName(const String&) const { return nullptr; }
    XmlElement* getFirstChildElement() const { return nullptr; }
    XmlElement* getNextElement() const { return nullptr; }
    int getNumChildElements() const { return 0; }
    void addChildElement(XmlElement*) {}
    XmlElement* createNewChildElement(const String& tagName) {
        return new XmlElement(tagName);
    }
    void removeAllAttributes() {}
    void deleteAllChildElements() {}

    struct XmlElement_OutputOptions {};
    bool writeTo(const File&, const XmlElement_OutputOptions& = {}) const { return false; }
    String toString() const { return ""; }

private:
    String tagName_;
};

class XmlDocument {
public:
    XmlDocument(const String&) {}
    XmlDocument(const File&) {}
    std::unique_ptr<XmlElement> getDocumentElement() { return nullptr; }
    String getLastParseError() const { return ""; }
    static std::unique_ptr<XmlElement> parse(const String&) { return nullptr; }
    static std::unique_ptr<XmlElement> parse(const char*) { return nullptr; }
};

// ============================================================================
// ZipFile (stub)
// ============================================================================
class ZipFile {
public:
    ZipFile(const File&) {}
    ZipFile(InputStream&) {}
    int getNumEntries() const { return 0; }
    bool uncompressTo(const String&, bool = true) { return false; }
};

// ============================================================================
// DeletedAtShutdown
// ============================================================================
class DeletedAtShutdown {
public:
    virtual ~DeletedAtShutdown() {}
};

// ============================================================================
// IIRFilter / IIRCoefficients
// ============================================================================
struct IIRCoefficients {
    float coefficients[5] = {1,0,0,0,0};
    static IIRCoefficients makeHighPass(double, double, double = 1.0) { return IIRCoefficients(); }
    static IIRCoefficients makeLowPass(double, double, double = 1.0) { return IIRCoefficients(); }
    static IIRCoefficients makeBandPass(double, double, double = 1.0) { return IIRCoefficients(); }
};

class IIRFilter {
public:
    void setCoefficients(const IIRCoefficients&) {}
    float processSingleSampleRaw(float sample) { return sample; }
    void reset() {}
};

// ============================================================================
// Component / LookAndFeel (minimal stubs for forward-declared references)
// ============================================================================
class Component {
public:
    virtual ~Component() {}
    void repaint() {}
    void repaint(int, int, int, int) {}
    void setVisible(bool) {}
    bool isVisible() const { return false; }
    int getWidth() const { return 0; }
    int getHeight() const { return 0; }
};

class LookAndFeel {
public:
    virtual ~LookAndFeel() {}
};

// ============================================================================
// AlertWindow (stub)
// ============================================================================
class AlertWindow {
public:
    static void showMessageBox(int, const String&, const String&, const String& = "") {}
    static bool showOkCancelBox(int, const String&, const String&, const String& = "",
                                const String& = "") { return false; }
    enum AlertIconType { NoIcon, WarningIcon, InfoIcon, QuestionIcon };
};

// ============================================================================
// AudioProcessorPlayer (stub)
// ============================================================================
class AudioProcessorPlayer {
public:
    void setProcessor(AudioProcessor*) {}
};

// ============================================================================
// AudioIODevice / AudioIODeviceType (stub)
// ============================================================================
class AudioIODevice {
public:
    virtual ~AudioIODevice() {}
};

class AudioIODeviceType {
public:
    virtual ~AudioIODeviceType() {}
};

} // namespace juce

// ============================================================================
// JUCE_CALLTYPE for createPluginFilter (global scope)
// ============================================================================
#ifndef JUCE_CALLTYPE
#define JUCE_CALLTYPE
#endif

// ============================================================================
// WASM hack: open private/protected access for Monique headers
// This MUST come AFTER all standard library includes (above) but BEFORE
// any Monique source headers are processed. The force-include mechanism
// ensures this shim is processed first, then Monique headers see all
// private/protected as public.
// ============================================================================
#define private public
#define protected public
