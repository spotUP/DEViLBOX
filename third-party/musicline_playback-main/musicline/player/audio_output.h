#pragma once

#include <atomic>
#include <cstdint>
#include <mutex>
#include <vector>

#include "miniaudio.h"

#ifdef HAVE_UADE
class UadeBackend;
#endif
class MlineBackend;

class AudioOutput {
  public:
    enum class Source {
        UADE,
        MLINE,
    };

    AudioOutput();
    ~AudioOutput();

    bool init(int sample_rate = 28150);

    void set_source(Source src);
    Source get_source() const {
        return m_source;
    }

#ifdef HAVE_UADE
    void set_backends(UadeBackend* uade, MlineBackend* mline);
#else
    void set_backends(MlineBackend* mline);
#endif

    void start();
    void stop();

    bool is_playing() const {
        return m_playing;
    }

    void shutdown();

    int get_sample_rate() const {
        return m_sample_rate;
    }

    double get_time() const {
        return static_cast<double>(m_frames_played.load()) / m_sample_rate;
    }

  private:
    static void data_callback(ma_device* device, void* output, const void* input, ma_uint32 frame_count);
    void fill_audio(float* buffer, int frames);

    ma_device m_device {};
    int m_sample_rate = 28150;
    std::atomic<Source> m_source { Source::MLINE };
    std::atomic<bool> m_playing { false };
    std::atomic<uint64_t> m_frames_played { 0 };
    bool m_initialized = false;

#ifdef HAVE_UADE
    UadeBackend* m_uade = nullptr;
#endif
    MlineBackend* m_mline = nullptr;

    std::vector<float> m_render_buffer;
    std::mutex m_mutex;
};
