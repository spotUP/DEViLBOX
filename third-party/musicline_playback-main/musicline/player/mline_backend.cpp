#include "mline_backend.h"
#include "../defines.h"
#include "../module.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>

static bool s_initialized = false;

MlineBackend::MlineBackend() {
    if (!s_initialized) {
        InitRoutine();
        s_initialized = true;
    }
    m_module = new MLModule();
}

MlineBackend::~MlineBackend() {
    // Don't call stop() here - delete module will call ~MLModule()
    // which calls FreeMod(). Calling stop() first causes double-free.
    delete m_module;
    m_module = nullptr;
}

bool MlineBackend::load(const char* filepath) {
    // Read file into buffer
    std::ifstream file(filepath, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
        fprintf(stderr, "MlineBackend: Failed to open file: %s\n", filepath);
        return false;
    }

    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);

    m_file_data.resize(size);
    if (!file.read(reinterpret_cast<char*>(m_file_data.data()), size)) {
        fprintf(stderr, "MlineBackend: Failed to read file: %s\n", filepath);
        return false;
    }

    return load(m_file_data.data(), m_file_data.size());
}

bool MlineBackend::load(const uint8_t* data, size_t len) {
    // Stop any current playback
    stop();

    // Keep a copy of the data (MLModule may need it to stay alive)
    m_file_data.assign(data, data + len);

    // Load the module
    if (!m_module->LoadMod(m_file_data.data(), static_cast<uint32_t>(len))) {
        fprintf(stderr, "MlineBackend: Failed to load module\n");
        return false;
    }

    // Initialize first playable tune
    int idx = m_module->SubSongIndex(0);
    if (idx < 0 || !m_module->InitTune(static_cast<uint32_t>(idx))) {
        fprintf(stderr, "MlineBackend: Failed to initialize tune 0\n");
        return false;
    }

    m_current_subsong = 0;
    m_loaded = true;
    return true;
}

void MlineBackend::set_subsong(int subsong) {
    if (!m_loaded) {
        return;
    }

    int count = get_subsong_count();
    if (subsong < 0 || subsong >= count) {
        return;
    }

    int idx = m_module->SubSongIndex(subsong);
    if (idx >= 0 && m_module->InitTune(static_cast<uint32_t>(idx))) {
        m_current_subsong = subsong;
    }
}

int MlineBackend::get_subsong_count() const {
    if (!m_loaded) {
        return 0;
    }
    return m_module->SubSongCount();
}

int MlineBackend::get_current_subsong() const {
    return m_current_subsong;
}

const char* MlineBackend::get_subsong_name(int subsong) const {
    if (!m_loaded) {
        return "";
    }

    // Note: SubSongName returns s8* (signed char*), we cast to const char*
    const char* name = reinterpret_cast<const char*>(m_module->SubSongName(subsong));
    return name ? name : "";
}

int MlineBackend::render(float* buffer, int frames) {
    if (!m_loaded) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return -1;
    }

    if (m_module->isSongEnd()) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return 0;
    }

    // MLModule::Output expects buffer size in bytes
    // Output format: S16 stereo interleaved
    size_t bytes_needed = frames * 2 * sizeof(int16_t);

    // Resize temp buffer if needed
    if (m_temp_buffer.size() < static_cast<size_t>(frames * 2)) {
        m_temp_buffer.resize(frames * 2);
    }

    // Generate samples
    m_module->Output(m_temp_buffer.data(), static_cast<uint32_t>(bytes_needed));

    // Convert S16 to F32
    for (int i = 0; i < frames * 2; i++) {
        buffer[i] = static_cast<float>(m_temp_buffer[i]) / 32768.0f;
    }

    return frames;
}

bool MlineBackend::is_finished() const {
    if (!m_loaded || !m_module)
        return true;
    // Song finished if all channels hit END (VoiceOff) or if EndTune fired (IntMode=0)
    return m_module->isSongEnd() || m_module->m_IntMode == 0;
}

void MlineBackend::stop() {
    if (m_loaded && m_module) {
        m_module->FreeMod();
        m_loaded = false;
    }
    m_file_data.clear();
}

void MlineBackend::set_single_channel(int ch) {
    if (m_module) {
        m_module->m_nSingleChannel = ch;
        m_module->m_nValidSingleChannel = ch; // Also set the valid channel for playback
    }
}

const char* MlineBackend::get_info_title() const {
    return (m_module && m_loaded) ? m_module->GetInfoTitle() : "";
}

const char* MlineBackend::get_info_author() const {
    return (m_module && m_loaded) ? m_module->GetInfoAuthor() : "";
}

const char* MlineBackend::get_info_date() const {
    return (m_module && m_loaded) ? m_module->GetInfoDate() : "";
}

const char* MlineBackend::get_info_duration() const {
    return (m_module && m_loaded) ? m_module->GetInfoDuration() : "";
}

const char* MlineBackend::get_info_text(int idx) const {
    return (m_module && m_loaded) ? m_module->GetInfoText(idx) : "";
}

int MlineBackend::get_sample_rate() const {
    if (m_module)
        return m_module->GetOutputRate();
    return 28150;
}

int MlineBackend::get_channel_count() const {
    if (m_module && m_loaded) {
        return m_module->m_ChanNum;
    }
    return 0;
}

bool MlineBackend::is_loop_detected() const {
    return (m_module && m_loaded) ? m_module->isLoopDetected() : false;
}

double MlineBackend::get_loop_duration_seconds() const {
    return (m_module && m_loaded) ? m_module->getLoopDurationSeconds() : 0.0;
}

double MlineBackend::detect_duration(int max_seconds) {
    if (!m_module || !m_loaded)
        return 0.0;

    // Dry-run: call PlayMusic() in a tight loop without generating audio.
    // m_dryRun skips ClearMixBuff/PlaySongEffects (volume, DMA, mixing)
    // which would crash without allocated audio buffers.
    const int SAMPLE_RATE = m_module->GetOutputRate();
    uint64_t max_samples = (uint64_t)max_seconds * SAMPLE_RATE;
    uint64_t total_samples = 0;

    m_module->m_dryRun = true;

    while (!m_module->isLoopDetected() && !m_module->isSongEnd() && m_module->m_IntMode != 0) {
        if (total_samples >= max_samples)
            break;

        // Compute tick size using fractional accumulator (same as Output loop)
        m_module->m_fTickAccum += m_module->m_fSamplesPerTick;
        m_module->m_nCurrentTickSize = (uint32_t)m_module->m_fTickAccum;
        m_module->m_fTickAccum -= m_module->m_nCurrentTickSize;

        m_module->PlayMusic();

        m_module->SetSongSpeed(m_module->m_TuneTmp);
        total_samples += m_module->m_nCurrentTickSize;
        m_module->m_nTickCount++;
    }

    m_module->m_dryRun = false;

    if (m_module->isLoopDetected()) {
        return m_module->getLoopDurationSeconds(SAMPLE_RATE);
    }

    // Song ended (all channels hit END)
    return (double)total_samples / SAMPLE_RATE;
}
