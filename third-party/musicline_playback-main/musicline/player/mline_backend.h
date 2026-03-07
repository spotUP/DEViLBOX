#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

class MLModule;

class MlineBackend {
  public:
    MlineBackend();
    ~MlineBackend();

    // Load a music file
    bool load(const char* filepath);
    bool load(const uint8_t* data, size_t len);

    // Subsong control
    void set_subsong(int subsong);
    int get_subsong_count() const;
    int get_current_subsong() const;
    const char* get_subsong_name(int subsong) const;

    // Generate audio samples
    // Output: F32 stereo interleaved @ 28150 Hz (native Amiga Paula rate)
    // Returns number of frames written, or -1 on error, 0 on song end
    int render(float* buffer, int frames);

    // Check if song has finished (not implemented yet - MLModule doesn't expose this clearly)
    bool is_finished() const;

    // Stop/reset playback
    void stop();

    // Get current sample rate
    int get_sample_rate() const;

    // Channel control (-1 = all channels)
    void set_single_channel(int ch);
    int get_channel_count() const;

    // INFO chunk metadata
    const char* get_info_title() const;
    const char* get_info_author() const;
    const char* get_info_date() const;
    const char* get_info_duration() const;
    const char* get_info_text(int idx) const;

    // Loop detection / duration scanning
    bool is_loop_detected() const;
    double get_loop_duration_seconds() const;
    double detect_duration(int max_seconds = 600);

    // Per-channel capture access
    MLModule* get_module() {
        return m_module;
    }

  private:
    MLModule* m_module = nullptr;
    std::vector<uint8_t> m_file_data; // Keep file data alive
    std::vector<int16_t> m_temp_buffer;
    int m_current_subsong = 0;
    bool m_loaded = false;
};
