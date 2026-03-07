#pragma once

#include <cstdint>
#include <vector>

// Write stereo 16-bit PCM WAV file
void write_wav(const char* filename, const std::vector<int16_t>& samples, int sample_rate);

// Write mono 16-bit PCM WAV file
void write_wav_mono(const char* filename, const int16_t* samples, int num_samples, int sample_rate);
