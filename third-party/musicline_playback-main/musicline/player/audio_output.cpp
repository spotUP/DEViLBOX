#include "audio_output.h"
#include "mline_backend.h"
#ifdef HAVE_UADE
#include "uade_backend.h"
#endif

#include <cstdio>
#include <cstring>

AudioOutput::AudioOutput() = default;

AudioOutput::~AudioOutput() {
    shutdown();
}

bool AudioOutput::init(int sample_rate) {
    if (m_initialized) {
        return true;
    }

    m_sample_rate = sample_rate;

    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.format = ma_format_f32;
    config.playback.channels = 2;
    config.sampleRate = sample_rate;
    config.dataCallback = data_callback;
    config.pUserData = this;
    config.periodSizeInFrames = 1024;

    if (ma_device_init(nullptr, &config, &m_device) != MA_SUCCESS) {
        fprintf(stderr, "AudioOutput: Failed to initialize audio device\n");
        return false;
    }

    m_sample_rate = m_device.sampleRate;
    m_render_buffer.resize(m_device.playback.internalPeriodSizeInFrames * 2);

    m_initialized = true;
    printf("AudioOutput: Initialized at %d Hz\n", m_sample_rate);
    return true;
}

void AudioOutput::set_source(Source src) {
    m_source = src;
}

#ifdef HAVE_UADE
void AudioOutput::set_backends(UadeBackend* uade, MlineBackend* mline) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_uade = uade;
    m_mline = mline;
}
#else
void AudioOutput::set_backends(MlineBackend* mline) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_mline = mline;
}
#endif

void AudioOutput::start() {
    if (!m_initialized || m_playing) {
        return;
    }

    if (ma_device_start(&m_device) != MA_SUCCESS) {
        fprintf(stderr, "AudioOutput: Failed to start audio device\n");
        return;
    }
    m_playing = true;
}

void AudioOutput::stop() {
    if (!m_initialized || !m_playing) {
        return;
    }

    ma_device_stop(&m_device);
    m_playing = false;
}

void AudioOutput::shutdown() {
    stop();

    if (m_initialized) {
        ma_device_uninit(&m_device);
        m_initialized = false;
    }
}

void AudioOutput::data_callback(ma_device* device, void* output, const void* /*input*/, ma_uint32 frame_count) {
    AudioOutput* self = static_cast<AudioOutput*>(device->pUserData);
    float* buffer = static_cast<float*>(output);

    self->fill_audio(buffer, static_cast<int>(frame_count));
}

void AudioOutput::fill_audio(float* buffer, int frames) {
    std::lock_guard<std::mutex> lock(m_mutex);

    Source src = m_source.load();

    if (m_render_buffer.size() < static_cast<size_t>(frames * 2)) {
        m_render_buffer.resize(frames * 2);
    }

    bool have_data = false;

#ifdef HAVE_UADE
    if (src == Source::UADE && m_uade) {
        int ret = m_uade->render(buffer, frames);
        have_data = (ret > 0);
    } else
#endif
    if (src == Source::MLINE && m_mline) {
        int ret = m_mline->render(buffer, frames);
        have_data = (ret > 0);
    }

    if (!have_data) {
        memset(buffer, 0, frames * 2 * sizeof(float));
    }

    m_frames_played.fetch_add(frames);
}
