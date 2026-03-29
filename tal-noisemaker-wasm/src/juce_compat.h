/*
  Minimal JUCE compatibility shim for TAL-NoiseMaker standalone WASM build.
  Provides only the types used by the DSP engine: Point, Array, String,
  AudioPlayHead::CurrentPositionInfo.
*/
#ifndef JUCE_COMPAT_H
#define JUCE_COMPAT_H

#include <vector>
#include <string>
#include <cstring>
#include <cmath>
#include <algorithm>

namespace juce {

template <typename T>
class Point {
public:
    Point() : x_(0), y_(0) {}
    Point(T x, T y) : x_(x), y_(y) {}

    T getX() const { return x_; }
    T getY() const { return y_; }
    void setXY(T x, T y) { x_ = x; y_ = y; }
    void setX(T x) { x_ = x; }
    void setY(T y) { y_ = y; }

    Point<T> operator+(const Point<T>& o) const { return Point<T>(x_ + o.x_, y_ + o.y_); }
    Point<T> operator-(const Point<T>& o) const { return Point<T>(x_ - o.x_, y_ - o.y_); }
    Point<T> operator*(T s) const { return Point<T>(x_ * s, y_ * s); }
    Point<T>& operator+=(const Point<T>& o) { x_ += o.x_; y_ += o.y_; return *this; }
    Point<T>& operator-=(const Point<T>& o) { x_ -= o.x_; y_ -= o.y_; return *this; }

    float getDistanceFrom(const Point<T>& o) const {
        float dx = (float)(x_ - o.x_);
        float dy = (float)(y_ - o.y_);
        return sqrtf(dx * dx + dy * dy);
    }

private:
    T x_, y_;
};

template <typename T>
class Array {
public:
    Array() {}
    Array(const Array& o) : data_(o.data_) {}
    Array& operator=(const Array& o) { data_ = o.data_; return *this; }

    void add(T item) { data_.push_back(item); }
    void insert(int index, T item) { data_.insert(data_.begin() + index, item); }
    void remove(int index) { data_.erase(data_.begin() + index); }
    T removeAndReturn(int index) {
        T val = data_[index];
        data_.erase(data_.begin() + index);
        return val;
    }
    void clear() { data_.clear(); }
    int size() const { return (int)data_.size(); }
    T& operator[](int i) { return data_[i]; }
    const T& operator[](int i) const { return data_[i]; }

    template <typename Comparator>
    void sort(Comparator& comp, bool /*retainOrderOfEquivalentItems*/ = false) {
        std::sort(data_.begin(), data_.end(), [&](const T& a, const T& b) {
            return comp.compareElements(a, b) < 0;
        });
    }

    typedef typename std::vector<T>::iterator iterator;
    iterator begin() { return data_.begin(); }
    iterator end() { return data_.end(); }

private:
    std::vector<T> data_;
};

class String {
public:
    String() {}
    String(const char* s) : str_(s ? s : "") {}
    String(const std::string& s) : str_(s) {}
    String& operator=(const char* s) { str_ = s ? s : ""; return *this; }
    const char* toRawUTF8() const { return str_.c_str(); }
    bool isEmpty() const { return str_.empty(); }
private:
    std::string str_;
};

} // namespace juce

// Minimal AudioPlayHead stub
struct AudioPlayHead {
    struct CurrentPositionInfo {
        double bpm = 120.0;
        double ppqPosition = 0.0;
        bool isPlaying = false;
        int timeSigNumerator = 4;
        int timeSigDenominator = 4;
    };
};

// Make juce types available without namespace for files that use "using namespace juce"
using juce::Point;
using juce::Array;
using juce::String;

// Minimal Timer stub — EnvelopeEditor inherits from Timer but we don't need the timer
class Timer {
public:
    virtual ~Timer() {}
    virtual void timerCallback() {}
    void startTimer(int /*ms*/) {}
    void stopTimer() {}
};

// Minimal CriticalSection / ScopedLock stubs (single-threaded in WASM)
class CriticalSection {
public:
    void enter() {}
    void exit() {}
};

class ScopedLock {
public:
    ScopedLock(CriticalSection&) {}
};

#endif // JUCE_COMPAT_H
