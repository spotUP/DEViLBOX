#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string>

struct uade_state;
struct uade_config;
struct ThreadWrapper;

class UadeBackend {
  public:
    UadeBackend();
    ~UadeBackend();

    // Initialize UADE with path to data directory (containing eagleplayer.conf, players/, etc.)
    bool init(const char* uade_data_path);

    // Load a music file
    bool load(const char* filepath);
    bool load(const uint8_t* data, size_t len, const char* filename_hint = nullptr);

    // Subsong control
    void set_subsong(int subsong);
    int get_subsong_count() const;
    int get_current_subsong() const;
    const char* get_format_name() const;
    const char* get_module_name() const;

    // Generate audio samples
    // Output: F32 stereo interleaved @ configured sample rate
    // Returns number of frames written, or -1 on error, 0 on song end
    int render(float* buffer, int frames);

    // Check if song has finished
    bool is_finished() const;

    // Stop current playback
    void stop();

    // Cleanup
    void shutdown();

    // Set sample rate (must be called before init())
    void set_sample_rate(int rate) {
        m_sample_rate = rate;
    }

    // Get current sample rate
    int get_sample_rate() const {
        return m_sample_rate;
    }

  private:
    uade_state* m_state = nullptr;
    uade_config* m_config = nullptr;
    ThreadWrapper* m_thread_wrapper = nullptr;
    std::string m_base_dir;
    // Native Amiga mixer rate: PAL_CLOCK / 126 = 28150 Hz
    int m_sample_rate = 28150;
    std::atomic<bool> m_finished { false };
    bool m_initialized = false;
    bool m_playing = false;
};
