#include "uade_backend.h"

#include <cstdio>
#include <cstring>
#include <signal.h>
#include <thread>
#include <uade/uade.h>

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Thread wrapper for UADE's threading model
// UADE requires the application to provide these callback functions

struct ThreadWrapper {
    std::thread* thread = nullptr;
};

extern "C" void uade_run_thread(void (*f)(void*), void* data, void* user_data) {
    ThreadWrapper* wrapper = (ThreadWrapper*)user_data;
    wrapper->thread = new std::thread(f, data);
}

extern "C" void uade_wait_thread(void* user_data) {
    ThreadWrapper* wrapper = (ThreadWrapper*)user_data;
    if (wrapper->thread) {
        wrapper->thread->join();
        delete wrapper->thread;
        wrapper->thread = nullptr;
    }
}

UadeBackend::UadeBackend() {
    m_thread_wrapper = new ThreadWrapper();
}

UadeBackend::~UadeBackend() {
    shutdown();
    delete m_thread_wrapper;
    m_thread_wrapper = nullptr;
}

bool UadeBackend::init(const char* uade_data_path) {
    if (m_initialized) {
        return true;
    }

    m_base_dir = uade_data_path;

    // Ignore SIGPIPE - UADE documentation says we should do this
#ifndef _WIN32
    signal(SIGPIPE, SIG_IGN);
#endif

    // Create config
    m_config = uade_new_config();
    if (!m_config) {
        fprintf(stderr, "UadeBackend: Failed to create UADE config\n");
        return false;
    }

    // Set base directory for UADE data files
    uade_config_set_option(m_config, UC_BASE_DIR, m_base_dir.c_str());

    // Set sample rate
    char rate_str[32];
    snprintf(rate_str, sizeof(rate_str), "%d", m_sample_rate);
    uade_config_set_option(m_config, UC_FREQUENCY, rate_str);

    // Match reference plugin configuration
    uade_config_set_option(m_config, UC_ONE_SUBSONG, nullptr);
    uade_config_set_option(m_config, UC_IGNORE_PLAYER_CHECK, nullptr);
    uade_config_set_option(m_config, UC_NO_EP_END, nullptr);
    uade_config_set_option(m_config, UC_NO_PANNING, nullptr); // Disable stereo crossfeed to match C++ hard-pan
    uade_config_set_option(m_config, UC_NO_FILTER, nullptr);  // Disable A500 reconstruction filter for raw Paula output

    // Enable content detection
    uade_config_set_option(m_config, UC_CONTENT_DETECTION, nullptr);

    m_initialized = true;
    return true;
}

bool UadeBackend::load(const char* filepath) {
    if (!m_initialized) {
        fprintf(stderr, "UadeBackend: Not initialized\n");
        return false;
    }

    // Stop any current playback
    stop();

    // Create new state (spawn=1 for spawning thread, user_data=thread wrapper)
    m_state = uade_new_state(m_config, 1, m_thread_wrapper);
    if (!m_state) {
        fprintf(stderr, "UadeBackend: Failed to create UADE state\n");
        return false;
    }

    // Try to play the file
    int ret = uade_play(filepath, -1, m_state);
    if (ret <= 0) {
        fprintf(stderr, "UadeBackend: Failed to play file: %s (ret=%d)\n", filepath, ret);
        uade_cleanup_state(m_state, 1, m_thread_wrapper);
        m_state = nullptr;
        return false;
    }

    // Process any initial notifications
    struct uade_notification notification;
    while (uade_read_notification(&notification, m_state)) {
        uade_cleanup_notification(&notification);
    }

    m_playing = true;
    m_finished = false;
    return true;
}

bool UadeBackend::load(const uint8_t* data, size_t len, const char* filename_hint) {
    if (!m_initialized) {
        fprintf(stderr, "UadeBackend: Not initialized\n");
        return false;
    }

    // Stop any current playback
    stop();

    // Create new state (spawn=1 for spawning thread, user_data=thread wrapper)
    m_state = uade_new_state(m_config, 1, m_thread_wrapper);
    if (!m_state) {
        fprintf(stderr, "UadeBackend: Failed to create UADE state\n");
        return false;
    }

    // Try to play from buffer
    int ret = uade_play_from_buffer(filename_hint, data, len, -1, m_state);
    if (ret <= 0) {
        fprintf(stderr, "UadeBackend: Failed to play from buffer (ret=%d)\n", ret);
        uade_cleanup_state(m_state, 1, m_thread_wrapper);
        m_state = nullptr;
        return false;
    }

    m_playing = true;
    m_finished = false;
    return true;
}

void UadeBackend::set_subsong(int subsong) {
    if (!m_state || !m_playing) {
        return;
    }

    // Seek to the beginning of the specified subsong
    uade_seek(UADE_SEEK_SUBSONG_RELATIVE, 0.0, subsong, m_state);
}

int UadeBackend::get_subsong_count() const {
    if (!m_state) {
        return 0;
    }

    const struct uade_song_info* info = uade_get_song_info(m_state);
    if (!info) {
        return 1;
    }

    return info->subsongs.max - info->subsongs.min + 1;
}

int UadeBackend::get_current_subsong() const {
    if (!m_state) {
        return 0;
    }

    const struct uade_song_info* info = uade_get_song_info(m_state);
    if (!info) {
        return 0;
    }

    return info->subsongs.cur;
}

const char* UadeBackend::get_format_name() const {
    if (!m_state) {
        return "";
    }

    const struct uade_song_info* info = uade_get_song_info(m_state);
    if (!info) {
        return "";
    }

    return info->formatname;
}

const char* UadeBackend::get_module_name() const {
    if (!m_state) {
        return "";
    }

    const struct uade_song_info* info = uade_get_song_info(m_state);
    if (!info) {
        return "";
    }

    return info->modulename;
}

int UadeBackend::render(float* buffer, int frames) {
    if (!m_state || !m_playing || m_finished) {
        // Fill with silence
        memset(buffer, 0, frames * 2 * sizeof(float));
        return m_finished ? 0 : -1;
    }

    // UADE outputs S16 stereo, we need to convert to F32
    // Calculate bytes needed: frames * 2 channels * 2 bytes per sample
    size_t bytes_needed = frames * UADE_BYTES_PER_FRAME;

    // Temporary buffer for S16 samples
    int16_t* temp_buffer = new int16_t[frames * 2];

    ssize_t bytes_read = uade_read(temp_buffer, bytes_needed, m_state);

    if (bytes_read < 0) {
        // Error
        delete[] temp_buffer;
        m_finished = true;
        memset(buffer, 0, frames * 2 * sizeof(float));
        return -1;
    }

    if (bytes_read == 0) {
        // Song ended
        delete[] temp_buffer;
        m_finished = true;
        memset(buffer, 0, frames * 2 * sizeof(float));
        return 0;
    }

    // Check for notifications (song end, etc.)
    struct uade_notification notification;
    while (uade_read_notification(&notification, m_state)) {
        if (notification.type == UADE_NOTIFICATION_SONG_END) {
            if (notification.song_end.stopnow) {
                m_finished = true;
            }
        }
        uade_cleanup_notification(&notification);
    }

    // Convert S16 to F32
    int frames_read = bytes_read / UADE_BYTES_PER_FRAME;

    for (int i = 0; i < frames_read * 2; i++) {
        buffer[i] = static_cast<float>(temp_buffer[i]) / 32768.0f;
    }

    // Zero-fill any remaining frames
    for (int i = frames_read * 2; i < frames * 2; i++) {
        buffer[i] = 0.0f;
    }

    delete[] temp_buffer;
    return frames_read;
}

bool UadeBackend::is_finished() const {
    return m_finished;
}

void UadeBackend::stop() {
    if (m_state && m_playing) {
        uade_stop(m_state);
        uade_cleanup_state(m_state, 1, m_thread_wrapper);
        m_state = nullptr;
        m_playing = false;
    }
}

void UadeBackend::shutdown() {
    stop();

    if (m_config) {
        free(m_config);
        m_config = nullptr;
    }

    m_initialized = false;
}
