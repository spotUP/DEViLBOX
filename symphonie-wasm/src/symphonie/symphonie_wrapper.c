/**
 * symphonie_wrapper.c — Emscripten WASM bridge for Symphonie Pro replayer
 *
 * Provides EMSCRIPTEN_KEEPALIVE functions called from the AudioWorklet.
 * Receives parsed song data from TypeScript (instruments, patterns, positions, sequences).
 */

#include "symphonie_player.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

static SymSong s_song;
static int     s_loaded = 0;
static float   s_sampleRate = 44100.0f;

/* ---- Init / lifecycle ---- */

EMSCRIPTEN_KEEPALIVE
void player_init(int sampleRate) {
    s_sampleRate = (float)sampleRate;
    sym_init(&s_song);
    s_song.outputRate = s_sampleRate;
    s_loaded = 0;
}

EMSCRIPTEN_KEEPALIVE
void player_stop(void) {
    sym_stop(&s_song);
    s_loaded = 0;
}

EMSCRIPTEN_KEEPALIVE
int player_is_finished(void) {
    return s_song.finished ? 1 : 0;
}

/* ---- Song configuration (called from JS before play) ---- */

EMSCRIPTEN_KEEPALIVE
void player_set_num_channels(int n) {
    s_song.numChannels = n;
}

EMSCRIPTEN_KEEPALIVE
void player_set_speed(int speed) {
    s_song.speed = speed;
}

EMSCRIPTEN_KEEPALIVE
void player_set_master_volume(int vol) {
    s_song.masterVolume = vol;
}

EMSCRIPTEN_KEEPALIVE
void player_set_interp_mode(int mode) {
    /* 0=none (original), 1=linear, 2=cubic */
    s_song.interpMode = (mode < 0) ? 0 : (mode > 2) ? 2 : mode;
}

EMSCRIPTEN_KEEPALIVE
void player_set_sample_diff(int diff) {
    /* Stereo sample offset: R channel sample start is offset by this many bytes.
     * ASM clamps to 0-2000. */
    if (diff < 0) diff = 0;
    if (diff > 2000) diff = 2000;
    s_song.sampleDiff = diff;
}

/* ---- Instrument setup ---- */

EMSCRIPTEN_KEEPALIVE
void player_set_instrument(int idx, int type, int volume, int tune, int finetune,
                            int playFlags, int multiChannel, float sampledFreq) {
    if (idx < 0 || idx >= SYM_MAX_INSTRUMENTS) return;
    SymInstrument* inst = &s_song.instruments[idx];
    inst->type = (int16_t)type;
    inst->volume = (uint8_t)volume;
    inst->tune = (int16_t)tune;
    inst->finetune = (int16_t)finetune;
    inst->playFlags = (uint16_t)playFlags;
    inst->multiChannel = (uint8_t)multiChannel;
    inst->sampledFreq = sampledFreq > 0 ? sampledFreq : 8363.0f;
    if (idx >= s_song.numInstruments) s_song.numInstruments = idx + 1;
}

EMSCRIPTEN_KEEPALIVE
void player_set_instrument_sample(int idx, const int16_t* data, int numSamples) {
    if (idx < 0 || idx >= SYM_MAX_INSTRUMENTS) return;
    SymInstrument* inst = &s_song.instruments[idx];

    /* Free previous sample data */
    if (inst->sampleData) {
        free(inst->sampleData);
        inst->sampleData = NULL;
    }

    if (data && numSamples > 0) {
        inst->sampleData = (int16_t*)malloc(numSamples * sizeof(int16_t));
        if (inst->sampleData) {
            memcpy(inst->sampleData, data, numSamples * sizeof(int16_t));
            inst->numSamples = numSamples;
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void player_set_instrument_loop(int idx, int loopStart, int loopEnd,
                                 int sustStart, int sustEnd, int loopNumb) {
    if (idx < 0 || idx >= SYM_MAX_INSTRUMENTS) return;
    SymInstrument* inst = &s_song.instruments[idx];
    inst->loopStart = loopStart;
    inst->loopEnd = loopEnd;
    inst->sustStart = sustStart;
    inst->sustEnd = sustEnd;
    inst->loopNumb = (int16_t)loopNumb;
}

/* ---- Pattern setup ---- */

EMSCRIPTEN_KEEPALIVE
void player_set_pattern(int idx, int numRows) {
    if (idx < 0 || idx >= SYM_MAX_PATTERNS) return;
    SymPattern* pat = &s_song.patterns[idx];

    /* Free previous data */
    if (pat->data) { free(pat->data); pat->data = NULL; }

    int numChannels = s_song.numChannels / 2;
    if (numChannels < 1) numChannels = 1;

    pat->numRows = numRows;
    pat->data = (SymNote*)calloc(numRows * numChannels, sizeof(SymNote));

    /* Init all notes to "empty" */
    for (int i = 0; i < numRows * numChannels; i++) {
        pat->data[i].pitch = 0xFF;
    }

    if (idx >= s_song.numPatterns) s_song.numPatterns = idx + 1;
}

EMSCRIPTEN_KEEPALIVE
void player_set_pattern_note(int patIdx, int row, int channel,
                              int fx, int pitch, int volume, int instr) {
    if (patIdx < 0 || patIdx >= SYM_MAX_PATTERNS) return;
    SymPattern* pat = &s_song.patterns[patIdx];
    if (!pat->data) return;

    int numChannels = s_song.numChannels / 2;
    if (numChannels < 1) numChannels = 1;
    int noteIdx = row * numChannels + channel;
    if (noteIdx < 0 || noteIdx >= pat->numRows * numChannels) return;

    pat->data[noteIdx].fx = (uint8_t)fx;
    pat->data[noteIdx].pitch = (uint8_t)pitch;
    pat->data[noteIdx].volume = (uint8_t)volume;
    pat->data[noteIdx].instr = (uint8_t)instr;
}

/* ---- Position setup ---- */

EMSCRIPTEN_KEEPALIVE
void player_set_position(int idx, int patternIdx, int startRow, int length,
                          int speed, int tune, int loopNumb) {
    if (idx < 0 || idx >= SYM_MAX_POSITIONS) return;
    SymPosition* pos = &s_song.positions[idx];
    pos->patternIdx = (int16_t)patternIdx;
    pos->startRow = (int16_t)startRow;
    pos->length = (int16_t)length;
    pos->speed = (int16_t)speed;
    pos->tune = (int16_t)tune;
    pos->loopNumb = (int16_t)(loopNumb > 0 ? loopNumb : 1);
    pos->loopCount = pos->loopNumb;
    if (idx >= s_song.numPositions) s_song.numPositions = idx + 1;
}

/* ---- Sequence setup ---- */

EMSCRIPTEN_KEEPALIVE
void player_set_sequence(int idx, int startPos, int length, int loop, int info, int tune) {
    if (idx < 0 || idx >= SYM_MAX_SEQUENCES) return;
    SymSequence* seq = &s_song.sequences[idx];
    seq->startPos = (int16_t)startPos;
    seq->length = (int16_t)length;
    seq->loop = (int16_t)loop;
    seq->info = (int16_t)info;
    seq->tune = (int16_t)tune;
    if (idx >= s_song.numSequences) s_song.numSequences = idx + 1;
}

/* ---- Playback ---- */

EMSCRIPTEN_KEEPALIVE
void player_play(void) {
    s_song.outputRate = s_sampleRate;
    sym_play(&s_song);
    s_loaded = 1;
}

EMSCRIPTEN_KEEPALIVE
int player_render(float* buffer, int frames) {
    if (!s_loaded) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return 0;
    }
    return sym_render(&s_song, buffer, frames);
}

/* ---- Position queries ---- */

EMSCRIPTEN_KEEPALIVE
int player_get_seq_idx(void) { return s_song.seqIdx; }

EMSCRIPTEN_KEEPALIVE
int player_get_pos_idx(void) { return s_song.posIdx; }

EMSCRIPTEN_KEEPALIVE
int player_get_row_idx(void) { return s_song.rowIdx; }

/* ---- Editing setters ---- */

EMSCRIPTEN_KEEPALIVE
void player_set_pattern_step(int pattern, int row, int channel,
                              int fx, int pitch, int volume, int instr) {
    /* Alias for player_set_pattern_note */
    player_set_pattern_note(pattern, row, channel, fx, pitch, volume, instr);
}

/* ---- Debug getters ---- */

EMSCRIPTEN_KEEPALIVE
int player_debug_playing(void) { return s_song.playing; }

EMSCRIPTEN_KEEPALIVE
int player_debug_num_channels(void) { return s_song.numChannels; }

EMSCRIPTEN_KEEPALIVE
int player_debug_num_instruments(void) { return s_song.numInstruments; }

EMSCRIPTEN_KEEPALIVE
int player_debug_num_patterns(void) { return s_song.numPatterns; }

EMSCRIPTEN_KEEPALIVE
int player_debug_num_positions(void) { return s_song.numPositions; }

EMSCRIPTEN_KEEPALIVE
int player_debug_num_sequences(void) { return s_song.numSequences; }

EMSCRIPTEN_KEEPALIVE
int player_debug_speed(void) { return s_song.speed; }

EMSCRIPTEN_KEEPALIVE
int player_debug_speed_count(void) { return s_song.speedCount; }

EMSCRIPTEN_KEEPALIVE
float player_debug_samples_per_tick(void) { return s_song.samplesPerTick; }

EMSCRIPTEN_KEEPALIVE
float player_debug_tick_accum(void) { return s_song.tickAccum; }

EMSCRIPTEN_KEEPALIVE
int player_debug_voice_status(int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return -1;
    return s_song.voices[ch].status;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_voice_end_reached(int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return -1;
    return s_song.voices[ch].endReached;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_voice_freq(int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return 0;
    return s_song.voices[ch].freq;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_voice_volume(int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return 0;
    return s_song.voices[ch].volume;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_voice_has_sample(int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return 0;
    return s_song.voices[ch].samplePtr != NULL ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_voice_has_instrument(int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return 0;
    return s_song.voices[ch].instrument != NULL ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_inst_type(int idx) {
    if (idx < 0 || idx >= SYM_MAX_INSTRUMENTS) return -99;
    return s_song.instruments[idx].type;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_inst_num_samples(int idx) {
    if (idx < 0 || idx >= SYM_MAX_INSTRUMENTS) return 0;
    return s_song.instruments[idx].numSamples;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_inst_has_data(int idx) {
    if (idx < 0 || idx >= SYM_MAX_INSTRUMENTS) return 0;
    return s_song.instruments[idx].sampleData != NULL ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_pat_num_rows(int idx) {
    if (idx < 0 || idx >= SYM_MAX_PATTERNS) return 0;
    return s_song.patterns[idx].numRows;
}

EMSCRIPTEN_KEEPALIVE
int player_debug_pat_has_data(int idx) {
    if (idx < 0 || idx >= SYM_MAX_PATTERNS) return 0;
    return s_song.patterns[idx].data != NULL ? 1 : 0;
}

/* Read a pattern note for debugging */
EMSCRIPTEN_KEEPALIVE
int player_debug_pat_note(int patIdx, int noteIdx) {
    if (patIdx < 0 || patIdx >= SYM_MAX_PATTERNS) return -1;
    SymPattern* pat = &s_song.patterns[patIdx];
    if (!pat->data) return -1;
    int numCh = s_song.numChannels / 2;
    if (numCh < 1) numCh = 1;
    if (noteIdx < 0 || noteIdx >= pat->numRows * numCh) return -1;
    SymNote* n = &pat->data[noteIdx];
    /* Pack into int: fx<<24 | pitch<<16 | volume<<8 | instr */
    return (n->fx << 24) | (n->pitch << 16) | (n->volume << 8) | n->instr;
}

/* ---- Heap access for sample data transfer ---- */

EMSCRIPTEN_KEEPALIVE
void* player_malloc(int bytes) {
    return malloc(bytes);
}

EMSCRIPTEN_KEEPALIVE
void player_free(void* ptr) {
    free(ptr);
}
