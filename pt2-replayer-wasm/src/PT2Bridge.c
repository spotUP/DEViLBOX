/**
 * PT2Bridge.c — WASM bridge for the pt2-clone replayer.
 *
 * Provides EMSCRIPTEN_KEEPALIVE functions for:
 * - Module loading/saving from memory buffers
 * - Playback control (play/stop/position)
 * - Audio rendering (synchronous, called from AudioWorklet)
 * - Pattern/sample data access for editing
 * - Channel state for VU meters and mute/solo
 */

#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#include "pt2_header.h"
#include "pt2_structs.h"
#include "pt2_replayer.h"
#include "pt2_audio.h"
#include "pt2_paula.h"
#include "pt2_module_loader.h"
#include "pt2_module_saver.h"
#include "pt2_config.h"
#include "pt2_tables.h"

// ─── Initialization ─────────────────────────────────────────────────────────

static bool initialized = false;
static float *renderBufL = NULL;
static float *renderBufR = NULL;
static int16_t *renderBuf16 = NULL;
static uint32_t renderBufSize = 0;

EMSCRIPTEN_KEEPALIVE
int pt2_init(int sampleRate)
{
    if (initialized) return 1;

    memset(&editor, 0, sizeof(editor_t));
    memset(&cursor, 0, sizeof(cursor_t));
    memset(&audio, 0, sizeof(audio_t));

    audio.outputRate = (uint32_t)sampleRate;
    audio.oversamplingFlag = (sampleRate < 96000);

    // Initialize Paula emulator
    paulaSetup((double)sampleRate, MODEL_A500);

    // Generate BPM timing tables
    generateBpmTable((double)sampleRate, false);

    // Set default BPM (125)
    audio.samplesPerTickInt = audio.samplesPerTickIntTab[125 - MIN_BPM];
    audio.samplesPerTickFrac = audio.samplesPerTickFracTab[125 - MIN_BPM];
    audio.tickSampleCounter = 0;
    audio.tickSampleCounterFrac = 0;

    // Default stereo separation (Amiga panning)
    audioSetStereoSeparation(100);

    // Set default editor state
    editor.editMoveAdd = 1;
    editor.keyOctave = 2;
    editor.initialTempo = 125;
    editor.initialSpeed = 6;
    editor.f6Pos = 0;
    editor.f7Pos = 16;
    editor.f8Pos = 32;
    editor.f9Pos = 48;
    editor.f10Pos = 63;

    initialized = true;
    return 1;
}

// ─── Module Loading ─────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
int pt2_load_module(const uint8_t *data, int length)
{
    if (!initialized) return 0;

    // Free existing module
    if (song != NULL)
    {
        editor.songPlaying = false;
        turnOffVoices();
        modFree();
    }

    // Write data to a temp file (module loader expects FILE*)
    FILE *f = fopen("/tmp/mod.tmp", "wb");
    if (!f) return 0;
    fwrite(data, 1, (size_t)length, f);
    fclose(f);

    // Load module
    song = modLoad("/tmp/mod.tmp");
    if (song == NULL) return 0;

    // Initialize module
    song->loaded = true;
    editor.modLoaded = true;
    editor.currSample = 0;
    editor.songPlaying = false;

    initializeModuleChannels(song);

    // Set default BPM/speed
    modSetTempo(song->currBPM > 0 ? song->currBPM : 125, false);
    modSetSpeed(song->currSpeed > 0 ? song->currSpeed : 6);

    return 1;
}

// ─── Audio Rendering ────────────────────────────────────────────────────────
// This replaces the SDL audio callback. Called from AudioWorklet process().

EMSCRIPTEN_KEEPALIVE
void pt2_render(float *outL, float *outR, int numFrames)
{
    if (!initialized || !song)
    {
        memset(outL, 0, (size_t)numFrames * sizeof(float));
        memset(outR, 0, (size_t)numFrames * sizeof(float));
        return;
    }

    // Ensure int16 buffer is large enough
    uint32_t needed = (uint32_t)numFrames * 2; // stereo interleaved
    if (needed > renderBufSize)
    {
        free(renderBuf16);
        renderBuf16 = (int16_t *)malloc(needed * sizeof(int16_t));
        renderBufSize = needed;
    }

    int16_t *streamOut = renderBuf16;
    int32_t samplesLeft = numFrames;

    while (samplesLeft > 0)
    {
        if (audio.tickSampleCounter == 0)
        {
            if (editor.songPlaying)
            {
                intMusic();
            }

            audio.tickSampleCounter = audio.samplesPerTickInt;
            audio.tickSampleCounterFrac += audio.samplesPerTickFrac;
            if (audio.tickSampleCounterFrac >= BPM_FRAC_SCALE)
            {
                audio.tickSampleCounterFrac &= BPM_FRAC_MASK;
                audio.tickSampleCounter++;
            }
        }

        uint32_t samplesToMix = (uint32_t)samplesLeft;
        if (samplesToMix > audio.tickSampleCounter)
            samplesToMix = audio.tickSampleCounter;

        outputAudio(streamOut, (int32_t)samplesToMix);
        streamOut += samplesToMix * 2;

        audio.tickSampleCounter -= samplesToMix;
        samplesLeft -= (int32_t)samplesToMix;
    }

    // Convert interleaved int16 to separate float channels
    const float scale = 1.0f / 32768.0f;
    for (int i = 0; i < numFrames; i++)
    {
        outL[i] = (float)renderBuf16[i * 2]     * scale;
        outR[i] = (float)renderBuf16[i * 2 + 1] * scale;
    }
}

// ─── Playback Control ───────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
void pt2_play(int position, int row)
{
    if (!song) return;
    modPlay(-1, (int16_t)position, (int8_t)row);
}

EMSCRIPTEN_KEEPALIVE
void pt2_play_pattern(int row)
{
    if (!song) return;
    playPattern((int8_t)row);
}

EMSCRIPTEN_KEEPALIVE
void pt2_stop(void)
{
    if (!song) return;
    modStop();
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_position(int position, int row)
{
    if (!song) return;
    modSetPos((int16_t)position, (int16_t)row);
}

// ─── Position/State Getters ─────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
int pt2_get_position(void) { return song ? song->currPos : 0; }

EMSCRIPTEN_KEEPALIVE
int pt2_get_row(void) { return song ? song->currRow : 0; }

EMSCRIPTEN_KEEPALIVE
int pt2_get_pattern(void) { return song ? song->currPattern : 0; }

EMSCRIPTEN_KEEPALIVE
int pt2_get_speed(void) { return song ? song->currSpeed : 6; }

EMSCRIPTEN_KEEPALIVE
int pt2_get_bpm(void) { return song ? song->currBPM : 125; }

EMSCRIPTEN_KEEPALIVE
int pt2_is_playing(void) { return editor.songPlaying ? 1 : 0; }

EMSCRIPTEN_KEEPALIVE
int pt2_get_song_length(void) { return song ? song->header.songLength : 0; }

EMSCRIPTEN_KEEPALIVE
int pt2_get_num_channels(void) { return PAULA_VOICES; }

EMSCRIPTEN_KEEPALIVE
int pt2_get_song_name(char *buf, int maxLen)
{
    if (!song) { buf[0] = 0; return 0; }
    int len = (int)strlen(song->header.name);
    if (len > maxLen - 1) len = maxLen - 1;
    memcpy(buf, song->header.name, (size_t)len);
    buf[len] = 0;
    return len;
}

// ─── Order List ─────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
int pt2_get_order_entry(int position)
{
    if (!song || position < 0 || position >= 128) return 0;
    return song->header.patternTable[position];
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_order_entry(int position, int patternIndex)
{
    if (!song || position < 0 || position >= 128) return;
    if (patternIndex < 0 || patternIndex >= MAX_PATTERNS) return;
    song->header.patternTable[position] = (uint16_t)patternIndex;
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_song_length(int length)
{
    if (!song || length < 1 || length > 128) return;
    song->header.songLength = (uint16_t)length;
}

// ─── Pattern Data ───────────────────────────────────────────────────────────
// Pattern layout: 64 rows × 4 channels, each cell is note_t {param, sample, command, period}

EMSCRIPTEN_KEEPALIVE
int pt2_get_pattern_cell(int pattern, int row, int channel, int *outNote, int *outSample, int *outCmd, int *outParam)
{
    if (!song || pattern < 0 || pattern >= MAX_PATTERNS) return 0;
    if (!song->patterns[pattern]) return 0;
    if (row < 0 || row >= MOD_ROWS || channel < 0 || channel >= PAULA_VOICES) return 0;

    note_t *note = &song->patterns[pattern][(row * PAULA_VOICES) + channel];
    *outNote = note->period;
    *outSample = note->sample;
    *outCmd = note->command;
    *outParam = note->param;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_pattern_cell(int pattern, int row, int channel, int period, int sample, int command, int param)
{
    if (!song || pattern < 0 || pattern >= MAX_PATTERNS) return;
    if (!song->patterns[pattern]) return;
    if (row < 0 || row >= MOD_ROWS || channel < 0 || channel >= PAULA_VOICES) return;

    note_t *note = &song->patterns[pattern][(row * PAULA_VOICES) + channel];
    note->period = (uint16_t)period;
    note->sample = (uint8_t)sample;
    note->command = (uint8_t)command;
    note->param = (uint8_t)param;
}

// Get a raw pointer to pattern data for bulk reads
EMSCRIPTEN_KEEPALIVE
note_t *pt2_get_pattern_ptr(int pattern)
{
    if (!song || pattern < 0 || pattern >= MAX_PATTERNS) return NULL;
    return song->patterns[pattern];
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_num_patterns(void)
{
    if (!song) return 0;
    int max = 0;
    for (int i = 0; i < (int)song->header.songLength; i++)
    {
        if (song->header.patternTable[i] > max)
            max = song->header.patternTable[i];
    }
    return max + 1;
}

// ─── Sample/Instrument Data ─────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
int pt2_get_sample_name(int sampleIndex, char *buf, int maxLen)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) { buf[0] = 0; return 0; }
    moduleSample_t *s = &song->samples[sampleIndex];
    int len = (int)strlen(s->text);
    if (len > maxLen - 1) len = maxLen - 1;
    memcpy(buf, s->text, (size_t)len);
    buf[len] = 0;
    return len;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_sample_length(int sampleIndex)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return 0;
    return song->samples[sampleIndex].length;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_sample_loop_start(int sampleIndex)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return 0;
    return song->samples[sampleIndex].loopStart;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_sample_loop_length(int sampleIndex)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return 0;
    return song->samples[sampleIndex].loopLength;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_sample_volume(int sampleIndex)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return 0;
    return song->samples[sampleIndex].volume;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_sample_finetune(int sampleIndex)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return 0;
    return song->samples[sampleIndex].fineTune;
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_sample_volume(int sampleIndex, int volume)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return;
    song->samples[sampleIndex].volume = (int8_t)(volume > 64 ? 64 : volume);
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_sample_finetune(int sampleIndex, int finetune)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return;
    song->samples[sampleIndex].fineTune = (uint8_t)(finetune & 0xF);
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_sample_loop_start(int sampleIndex, int loopStart)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return;
    song->samples[sampleIndex].loopStart = loopStart;
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_sample_loop_length(int sampleIndex, int loopLength)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return;
    song->samples[sampleIndex].loopLength = loopLength;
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_sample_name(int sampleIndex, const char *name)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return;
    strncpy(song->samples[sampleIndex].text, name, 22);
    song->samples[sampleIndex].text[22] = 0;
}

// Get raw sample data pointer for waveform display
EMSCRIPTEN_KEEPALIVE
int8_t *pt2_get_sample_data_ptr(int sampleIndex)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return NULL;
    return song->sampleData + song->samples[sampleIndex].offset;
}

// Load sample data from a buffer
EMSCRIPTEN_KEEPALIVE
int pt2_set_sample_data(int sampleIndex, const int8_t *data, int length)
{
    if (!song || sampleIndex < 0 || sampleIndex >= MOD_SAMPLES) return 0;
    if (length > 65534) length = 65534; // MOD max sample length
    if (length & 1) length--; // must be even

    moduleSample_t *s = &song->samples[sampleIndex];

    // Copy to sample data area (MOD format uses a contiguous block)
    int8_t *dst = song->sampleData + s->offset;
    if (length > 0)
        memcpy(dst, data, (size_t)length);

    s->length = length;
    if (s->loopLength <= 2)
    {
        s->loopStart = 0;
        s->loopLength = 2;
    }
    else if (s->loopStart + s->loopLength > length)
    {
        s->loopLength = length - s->loopStart;
        if (s->loopLength < 2) s->loopLength = 2;
    }

    return 1;
}

// ─── Channel State (VU meters, mute/solo) ───────────────────────────────────

EMSCRIPTEN_KEEPALIVE
int pt2_get_channel_volume(int channel)
{
    if (!song || channel < 0 || channel >= PAULA_VOICES) return 0;
    return song->channels[channel].n_volume;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_channel_period(int channel)
{
    if (!song || channel < 0 || channel >= PAULA_VOICES) return 0;
    return song->channels[channel].n_period;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_channel_sample(int channel)
{
    if (!song || channel < 0 || channel >= PAULA_VOICES) return 0;
    return song->channels[channel].n_samplenum;
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_mute(int channel, int muted)
{
    if (channel < 0 || channel >= PAULA_VOICES) return;
    editor.muted[channel] = muted ? true : false;
}

EMSCRIPTEN_KEEPALIVE
int pt2_get_mute(int channel)
{
    if (channel < 0 || channel >= PAULA_VOICES) return 0;
    return editor.muted[channel] ? 1 : 0;
}

// ─── Configuration ──────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
void pt2_set_stereo_separation(int percent)
{
    audioSetStereoSeparation((uint8_t)(percent > 100 ? 100 : percent));
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_amiga_model(int model)
{
    setAmigaFilterModel((uint8_t)model);
    paulaSetup((double)audio.outputRate, (uint32_t)model);
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_led_filter(int on)
{
    setLEDFilter(on ? true : false);
}

EMSCRIPTEN_KEEPALIVE
void pt2_set_oversampling(int on)
{
    audio.oversamplingFlag = on ? true : false;
}

// ─── Module Saving ──────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
int pt2_save_module(uint8_t *outBuf, int maxLen)
{
    if (!song) return 0;

    // Save to temp file, then read back
    const char *tmpPath = "/tmp/mod_save.tmp";
    FILE *f = fopen(tmpPath, "wb");
    if (!f) return 0;

    // Write MOD header
    fwrite(song->header.name, 1, 20, f);

    for (int i = 0; i < MOD_SAMPLES; i++)
    {
        moduleSample_t *s = &song->samples[i];
        fwrite(s->text, 1, 22, f);

        uint16_t len = (uint16_t)(s->length / 2);
        uint8_t hi = (uint8_t)(len >> 8);
        uint8_t lo = (uint8_t)(len & 0xFF);
        fputc(hi, f); fputc(lo, f);

        fputc(s->fineTune & 0xF, f);
        fputc((uint8_t)(s->volume > 64 ? 64 : s->volume), f);

        uint16_t ls = (uint16_t)(s->loopStart / 2);
        hi = (uint8_t)(ls >> 8); lo = (uint8_t)(ls & 0xFF);
        fputc(hi, f); fputc(lo, f);

        uint16_t ll = (uint16_t)(s->loopLength / 2);
        hi = (uint8_t)(ll >> 8); lo = (uint8_t)(ll & 0xFF);
        fputc(hi, f); fputc(lo, f);
    }

    // Song length + restart byte
    fputc((uint8_t)song->header.songLength, f);
    fputc(0x7F, f); // restart byte

    // Pattern table
    for (int i = 0; i < 128; i++)
        fputc((uint8_t)song->header.patternTable[i], f);

    // M.K. signature
    fwrite("M.K.", 1, 4, f);

    // Pattern data
    int numPats = pt2_get_num_patterns();
    for (int p = 0; p < numPats; p++)
    {
        note_t *pat = song->patterns[p];
        if (!pat) {
            // Write empty pattern
            uint8_t zero[4] = {0, 0, 0, 0};
            for (int r = 0; r < MOD_ROWS * PAULA_VOICES; r++)
                fwrite(zero, 1, 4, f);
            continue;
        }
        for (int r = 0; r < MOD_ROWS; r++)
        {
            for (int c = 0; c < PAULA_VOICES; c++)
            {
                note_t *n = &pat[(r * PAULA_VOICES) + c];
                uint8_t bytes[4];
                bytes[0] = (uint8_t)((n->sample & 0xF0) | ((n->period >> 8) & 0x0F));
                bytes[1] = (uint8_t)(n->period & 0xFF);
                bytes[2] = (uint8_t)(((n->sample & 0x0F) << 4) | (n->command & 0x0F));
                bytes[3] = n->param;
                fwrite(bytes, 1, 4, f);
            }
        }
    }

    // Sample data
    for (int i = 0; i < MOD_SAMPLES; i++)
    {
        moduleSample_t *s = &song->samples[i];
        if (s->length > 0)
            fwrite(song->sampleData + s->offset, 1, (size_t)s->length, f);
    }

    fclose(f);

    // Read back
    f = fopen(tmpPath, "rb");
    if (!f) return 0;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz > maxLen) { fclose(f); return 0; }
    int bytesRead = (int)fread(outBuf, 1, (size_t)sz, f);
    fclose(f);

    return bytesRead;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
void pt2_free(void)
{
    if (song)
    {
        editor.songPlaying = false;
        turnOffVoices();
        modFree();
    }

    free(renderBuf16);
    renderBuf16 = NULL;
    renderBufSize = 0;
    initialized = false;
}
