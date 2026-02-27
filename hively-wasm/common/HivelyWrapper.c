/*
 * HivelyWrapper.c - WASM binding layer for HivelyTracker replayer
 *
 * Provides EMSCRIPTEN_KEEPALIVE exports for song playback and instrument query.
 * The replayer produces int16 stereo at 50Hz frame rate; this wrapper converts
 * to float32 separate L/R channels for the AudioWorklet.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hvl_types.h"
#include "hvl_replay.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/* ---- State ---- */
static struct hvl_tune *g_tune = NULL;
static uint32 g_sampleRate = 48000;
static int16 *g_mixBufL = NULL;
static int16 *g_mixBufR = NULL;
static uint32 g_mixBufSize = 0; /* in samples */
static int g_initialized = 0;

/* ---- Helpers ---- */

static void ensure_mix_buffer(uint32 samples) {
    if (samples > g_mixBufSize) {
        free(g_mixBufL);
        free(g_mixBufR);
        g_mixBufL = (int16 *)malloc(samples * sizeof(int16));
        g_mixBufR = (int16 *)malloc(samples * sizeof(int16));
        g_mixBufSize = samples;
    }
}

/* ---- Song Playback API ---- */

EMSCRIPTEN_KEEPALIVE
void hively_init(uint32 sampleRate) {
    if (!g_initialized) {
        hvl_InitReplayer();
        g_initialized = 1;
    }
    g_sampleRate = sampleRate;
}

EMSCRIPTEN_KEEPALIVE
int hively_load_tune(uint8 *buf, uint32 len, int32 defstereo) {
    if (g_tune) {
        hvl_FreeTune(g_tune);
        g_tune = NULL;
    }

    /* hvl_reset copies the buffer internally, so we pass freeit=FALSE */
    g_tune = hvl_reset(buf, len, defstereo, g_sampleRate, FALSE);
    if (!g_tune) {
        return 0; /* failure */
    }

    /* Allocate mix buffer for one frame: freq/50 samples */
    uint32 frameSamples = g_sampleRate / 50;
    ensure_mix_buffer(frameSamples);

    /* Init first subsong */
    hvl_InitSubsong(g_tune, 0);

    return 1; /* success */
}

EMSCRIPTEN_KEEPALIVE
void hively_free_tune(void) {
    if (g_tune) {
        hvl_FreeTune(g_tune);
        g_tune = NULL;
    }
}

EMSCRIPTEN_KEEPALIVE
int hively_init_subsong(uint32 nr) {
    if (!g_tune) return 0;
    return hvl_InitSubsong(g_tune, nr) ? 1 : 0;
}

/*
 * Decode one frame of audio (~freq/50 samples).
 * Writes float32 to outL/outR arrays. Returns number of samples written.
 */
EMSCRIPTEN_KEEPALIVE
uint32 hively_decode_frame(float *outL, float *outR) {
    if (!g_tune) return 0;

    uint32 frameSamples = g_sampleRate / 50;
    ensure_mix_buffer(frameSamples);

    /* Clear mix buffers */
    memset(g_mixBufL, 0, frameSamples * sizeof(int16));
    memset(g_mixBufR, 0, frameSamples * sizeof(int16));

    /* Decode frame - outputs int16 stereo */
    hvl_DecodeFrame(g_tune, (int8 *)g_mixBufL, (int8 *)g_mixBufR, 2);

    /* Convert int16 → float32 normalized to [-1, 1] */
    const float scale = 1.0f / 32768.0f;
    for (uint32 i = 0; i < frameSamples; i++) {
        outL[i] = (float)g_mixBufL[i] * scale;
        outR[i] = (float)g_mixBufR[i] * scale;
    }

    return frameSamples;
}

EMSCRIPTEN_KEEPALIVE
uint32 hively_get_frame_samples(void) {
    return g_sampleRate / 50;
}

EMSCRIPTEN_KEEPALIVE
int hively_is_song_end(void) {
    if (!g_tune) return 1;
    return g_tune->ht_SongEndReached ? 1 : 0;
}

/* ---- Transport Getters ---- */

EMSCRIPTEN_KEEPALIVE
int32 hively_get_position(void) {
    return g_tune ? g_tune->ht_PosNr : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_row(void) {
    return g_tune ? g_tune->ht_NoteNr : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_speed(void) {
    return g_tune ? g_tune->ht_Tempo : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_channels(void) {
    return g_tune ? (int32)g_tune->ht_Channels : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_positions(void) {
    return g_tune ? (int32)g_tune->ht_PositionNr : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_subsongs(void) {
    return g_tune ? (int32)g_tune->ht_SubsongNr : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_track_length(void) {
    return g_tune ? (int32)g_tune->ht_TrackLength : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_speed_multiplier(void) {
    return g_tune ? (int32)g_tune->ht_SpeedMultiplier : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_restart(void) {
    return g_tune ? (int32)g_tune->ht_Restart : 0;
}

EMSCRIPTEN_KEEPALIVE
const char *hively_get_name(void) {
    return g_tune ? g_tune->ht_Name : "";
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_mixgain(void) {
    return g_tune ? g_tune->ht_mixgain : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_stereo_mode(void) {
    return g_tune ? g_tune->ht_defstereo : 0;
}

EMSCRIPTEN_KEEPALIVE
int32 hively_get_version(void) {
    return g_tune ? (int32)g_tune->ht_Version : 0;
}

/* ---- Instrument Query API ---- */

EMSCRIPTEN_KEEPALIVE
int32 hively_get_num_instruments(void) {
    return g_tune ? (int32)g_tune->ht_InstrumentNr : 0;
}

EMSCRIPTEN_KEEPALIVE
const char *hively_get_instrument_name(int32 idx) {
    if (!g_tune || idx < 0 || idx > g_tune->ht_InstrumentNr)
        return "";
    return g_tune->ht_Instruments[idx].ins_Name;
}

/*
 * Pack instrument data into a flat byte array for JS consumption.
 * Layout (22 bytes):
 *   [0]  volume
 *   [1]  waveLength
 *   [2]  filterLowerLimit
 *   [3]  filterUpperLimit
 *   [4]  filterSpeed
 *   [5]  squareLowerLimit
 *   [6]  squareUpperLimit
 *   [7]  squareSpeed
 *   [8]  vibratoDelay
 *   [9]  vibratoSpeed
 *   [10] vibratoDepth
 *   [11] hardCutRelease
 *   [12] hardCutReleaseFrames
 *   [13] envelope.aFrames (int16, 2 bytes)
 *   [15] envelope.aVolume (int16, 2 bytes)
 *   [17] envelope.dFrames (int16, 2 bytes)
 *   [19] envelope.dVolume (int16, 2 bytes)
 *   [21] envelope.sFrames (int16, 2 bytes)
 *   [23] envelope.rFrames (int16, 2 bytes)
 *   [25] envelope.rVolume (int16, 2 bytes)
 *   [27] plist.speed (int16, 2 bytes)
 *   [29] plist.length (int16, 2 bytes)
 * Total: 31 bytes
 * Returns bytes written.
 */
EMSCRIPTEN_KEEPALIVE
int32 hively_get_instrument_data(int32 idx, uint8 *outBuf) {
    if (!g_tune || idx < 0 || idx > g_tune->ht_InstrumentNr)
        return 0;

    struct hvl_instrument *ins = &g_tune->ht_Instruments[idx];
    int32 pos = 0;

    outBuf[pos++] = ins->ins_Volume;
    outBuf[pos++] = ins->ins_WaveLength;
    outBuf[pos++] = ins->ins_FilterLowerLimit;
    outBuf[pos++] = ins->ins_FilterUpperLimit;
    outBuf[pos++] = ins->ins_FilterSpeed;
    outBuf[pos++] = ins->ins_SquareLowerLimit;
    outBuf[pos++] = ins->ins_SquareUpperLimit;
    outBuf[pos++] = ins->ins_SquareSpeed;
    outBuf[pos++] = ins->ins_VibratoDelay;
    outBuf[pos++] = ins->ins_VibratoSpeed;
    outBuf[pos++] = ins->ins_VibratoDepth;
    outBuf[pos++] = ins->ins_HardCutRelease;
    outBuf[pos++] = ins->ins_HardCutReleaseFrames;

    /* Envelope - write as int16 little-endian pairs */
    outBuf[pos++] = ins->ins_Envelope.aFrames & 0xFF;
    outBuf[pos++] = (ins->ins_Envelope.aFrames >> 8) & 0xFF;
    outBuf[pos++] = ins->ins_Envelope.aVolume & 0xFF;
    outBuf[pos++] = (ins->ins_Envelope.aVolume >> 8) & 0xFF;
    outBuf[pos++] = ins->ins_Envelope.dFrames & 0xFF;
    outBuf[pos++] = (ins->ins_Envelope.dFrames >> 8) & 0xFF;
    outBuf[pos++] = ins->ins_Envelope.dVolume & 0xFF;
    outBuf[pos++] = (ins->ins_Envelope.dVolume >> 8) & 0xFF;
    outBuf[pos++] = ins->ins_Envelope.sFrames & 0xFF;
    outBuf[pos++] = (ins->ins_Envelope.sFrames >> 8) & 0xFF;
    outBuf[pos++] = ins->ins_Envelope.rFrames & 0xFF;
    outBuf[pos++] = (ins->ins_Envelope.rFrames >> 8) & 0xFF;
    outBuf[pos++] = ins->ins_Envelope.rVolume & 0xFF;
    outBuf[pos++] = (ins->ins_Envelope.rVolume >> 8) & 0xFF;

    /* PList metadata */
    outBuf[pos++] = ins->ins_PList.pls_Speed & 0xFF;
    outBuf[pos++] = (ins->ins_PList.pls_Speed >> 8) & 0xFF;
    outBuf[pos++] = ins->ins_PList.pls_Length & 0xFF;
    outBuf[pos++] = (ins->ins_PList.pls_Length >> 8) & 0xFF;

    return pos; /* 31 bytes */
}

/*
 * Get one performance list entry for an instrument.
 * Layout (6 bytes):
 *   [0] note
 *   [1] waveform
 *   [2] fixed (int16 collapsed to uint8, 0 or 1)
 *   [3] fx[0]
 *   [4] fx[1]
 *   [5] fxParam[0]
 *   [6] fxParam[1]
 * Returns bytes written (7) or 0 on error.
 */
EMSCRIPTEN_KEEPALIVE
int32 hively_get_plist_entry(int32 insIdx, int32 entryIdx, uint8 *outBuf) {
    if (!g_tune || insIdx < 0 || insIdx > g_tune->ht_InstrumentNr)
        return 0;

    struct hvl_instrument *ins = &g_tune->ht_Instruments[insIdx];
    if (entryIdx < 0 || entryIdx >= ins->ins_PList.pls_Length)
        return 0;

    struct hvl_plsentry *e = &ins->ins_PList.pls_Entries[entryIdx];
    outBuf[0] = e->ple_Note;
    outBuf[1] = e->ple_Waveform;
    outBuf[2] = e->ple_Fixed ? 1 : 0;
    outBuf[3] = (uint8)e->ple_FX[0];
    outBuf[4] = (uint8)e->ple_FX[1];
    outBuf[5] = (uint8)e->ple_FXParam[0];
    outBuf[6] = (uint8)e->ple_FXParam[1];

    return 7;
}

/* ---- Standalone Instrument Player ---- */

/*
 * For playing HVL instruments as standalone synths in the tracker.
 * Creates a minimal hvl_tune with 1 channel and 1 instrument.
 *
 * The approach: create a full tune struct, inject the instrument data,
 * and trigger notes by directly setting voice state (replicating hvl_process_step
 * behavior). Rendering uses the existing hvl_process_frame + hvl_mixchunk pipeline.
 */

/* Forward declarations for internal replay functions */
extern void hvl_process_frame( struct hvl_tune *ht, struct hvl_voice *voice );
extern void hvl_set_audio( struct hvl_voice *voice, float64 freqf );
extern void hvl_mixchunk( struct hvl_tune *ht, uint32 samples, int8 *buf1, int8 *buf2, int32 bufmod );
extern uint32 panning_left[256];
extern uint32 panning_right[256];
extern int8 waves[];

/* Wave offset constants (from replay.c) */
#define WO_TRIANGLE_04  (0)
#define WO_TRIANGLE_08  (0x04)
#define WO_TRIANGLE_10  (0x04+0x08)
#define WO_TRIANGLE_20  (0x04+0x08+0x10)
#define WO_TRIANGLE_40  (0x04+0x08+0x10+0x20)
#define WO_TRIANGLE_80  (0x04+0x08+0x10+0x20+0x40)
#define WO_SAWTOOTH_04  (0x04+0x08+0x10+0x20+0x40+0x80)
#define WO_SAWTOOTH_08  (0x04+0x08+0x10+0x20+0x40+0x80+0x04)
#define WO_SAWTOOTH_10  (0x04+0x08+0x10+0x20+0x40+0x80+0x04+0x08)
#define WO_SAWTOOTH_20  (0x04+0x08+0x10+0x20+0x40+0x80+0x04+0x08+0x10)
#define WO_SAWTOOTH_40  (0x04+0x08+0x10+0x20+0x40+0x80+0x04+0x08+0x10+0x20)
#define WO_SAWTOOTH_80  (0x04+0x08+0x10+0x20+0x40+0x80+0x04+0x08+0x10+0x20+0x40)
#define WHITENOISELEN   (0x280*3)
#define WO_WHITENOISE   (WO_SAWTOOTH_80+0x80)

#define MAX_PLAYERS 4
static struct hvl_tune *g_players[MAX_PLAYERS] = {NULL};
static int16 *g_playerMixL[MAX_PLAYERS] = {NULL};
static int16 *g_playerMixR[MAX_PLAYERS] = {NULL};
static uint32 g_playerMixSize[MAX_PLAYERS] = {0};
static uint8 g_playerActive[MAX_PLAYERS] = {0};
static uint32 g_playerSamplesLeft[MAX_PLAYERS] = {0};

static void ensure_player_mix_buffer(int32 handle, uint32 samples) {
    if (samples > g_playerMixSize[handle]) {
        free(g_playerMixL[handle]);
        free(g_playerMixR[handle]);
        g_playerMixL[handle] = (int16 *)malloc(samples * sizeof(int16));
        g_playerMixR[handle] = (int16 *)malloc(samples * sizeof(int16));
        g_playerMixSize[handle] = samples;
    }
}

/*
 * Create a standalone instrument player. Returns handle (0-3) or -1 on error.
 */
EMSCRIPTEN_KEEPALIVE
int32 hively_create_player(uint32 sampleRate) {
    if (!g_initialized) {
        hvl_InitReplayer();
        g_initialized = 1;
    }

    /* Find free slot */
    int32 handle = -1;
    for (int32 i = 0; i < MAX_PLAYERS; i++) {
        if (!g_players[i]) { handle = i; break; }
    }
    if (handle < 0) return -1;

    /* Allocate a minimal tune struct */
    /* We need: tune + 1 position + 2 instruments (0=empty, 1=actual) + 1 plist entry */
    uint32 sz = sizeof(struct hvl_tune)
              + sizeof(struct hvl_position)
              + sizeof(struct hvl_instrument) * 2
              + sizeof(struct hvl_plsentry) * 256; /* Max plist entries */

    struct hvl_tune *ht = (struct hvl_tune *)calloc(1, sz);
    if (!ht) return -1;

    ht->ht_Frequency = sampleRate;
    ht->ht_FreqF = (float64)sampleRate;
    ht->ht_Channels = 1;
    ht->ht_PositionNr = 1;
    ht->ht_TrackLength = 1;
    ht->ht_TrackNr = 0;
    ht->ht_InstrumentNr = 1;
    ht->ht_SubsongNr = 0;
    ht->ht_SpeedMultiplier = 1;
    ht->ht_Tempo = 6;
    ht->ht_defstereo = 0;
    ht->ht_defpanleft = 128;
    ht->ht_defpanright = 128;
    ht->ht_mixgain = (71 * 256) / 100;
    ht->ht_Version = 1;

    /* Point positions and instruments into the allocated space after the tune struct */
    ht->ht_Positions = (struct hvl_position *)(&ht[1]);
    ht->ht_Instruments = (struct hvl_instrument *)(&ht->ht_Positions[1]);

    /* Waveform tables */
    ht->ht_WaveformTab[0] = &waves[WO_TRIANGLE_04];
    ht->ht_WaveformTab[1] = &waves[WO_SAWTOOTH_04];
    ht->ht_WaveformTab[3] = &waves[WO_WHITENOISE];

    /* Initialize voice */
    ht->ht_Voices[0].vc_Delta = 1;
    ht->ht_Voices[0].vc_WNRandom = 0x280;
    ht->ht_Voices[0].vc_VoiceNum = 0;
    ht->ht_Voices[0].vc_TrackMasterVolume = 0x40;
    ht->ht_Voices[0].vc_TrackOn = 1;
    ht->ht_Voices[0].vc_MixSource = ht->ht_Voices[0].vc_VoiceBuffer;
    ht->ht_Voices[0].vc_Pan = 128;
    ht->ht_Voices[0].vc_SetPan = 128;
    ht->ht_Voices[0].vc_PanMultLeft = panning_left[128];
    ht->ht_Voices[0].vc_PanMultRight = panning_right[128];

    /* Default instrument (index 1) with basic square wave */
    struct hvl_instrument *ins = &ht->ht_Instruments[1];
    memset(ins, 0, sizeof(struct hvl_instrument));
    ins->ins_Volume = 64;
    ins->ins_WaveLength = 3; /* 32-sample */
    ins->ins_Envelope.aFrames = 1;
    ins->ins_Envelope.aVolume = 64;
    ins->ins_Envelope.dFrames = 1;
    ins->ins_Envelope.dVolume = 64;
    ins->ins_Envelope.sFrames = 1;
    ins->ins_Envelope.rFrames = 1;
    ins->ins_Envelope.rVolume = 0;
    ins->ins_PList.pls_Speed = 1;
    ins->ins_PList.pls_Length = 1;
    /* PList entries follow the instrument array */
    ins->ins_PList.pls_Entries = (struct hvl_plsentry *)(&ht->ht_Instruments[2]);
    ins->ins_PList.pls_Entries[0].ple_Waveform = 2; /* square */
    ins->ins_PList.pls_Entries[0].ple_Note = 0;
    ins->ins_PList.pls_Entries[0].ple_Fixed = 0;

    /* Empty track 0 */
    memset(&ht->ht_Tracks[0], 0, sizeof(struct hvl_step) * 64);
    ht->ht_Positions[0].pos_Track[0] = 0;
    ht->ht_Positions[0].pos_Transpose[0] = 0;

    g_players[handle] = ht;
    g_playerActive[handle] = 0;

    return handle;
}

EMSCRIPTEN_KEEPALIVE
void hively_destroy_player(int32 handle) {
    if (handle < 0 || handle >= MAX_PLAYERS || !g_players[handle]) return;
    free(g_players[handle]);
    g_players[handle] = NULL;
    free(g_playerMixL[handle]);
    free(g_playerMixR[handle]);
    g_playerMixL[handle] = NULL;
    g_playerMixR[handle] = NULL;
    g_playerMixSize[handle] = 0;
    g_playerActive[handle] = 0;
    g_playerSamplesLeft[handle] = 0;
}

/*
 * Set instrument data for the standalone player.
 * Takes the same 22-byte binary format that hvl_reset parses for instruments,
 * plus plist entries (5 bytes each).
 * totalLen = 22 + plistLength * 5
 */
EMSCRIPTEN_KEEPALIVE
int32 hively_player_set_instrument(int32 handle, uint8 *data, uint32 totalLen) {
    if (handle < 0 || handle >= MAX_PLAYERS || !g_players[handle]) return 0;
    if (totalLen < 22) return 0;

    struct hvl_tune *ht = g_players[handle];
    struct hvl_instrument *ins = &ht->ht_Instruments[1];
    struct hvl_plsentry *ple = (struct hvl_plsentry *)(&ht->ht_Instruments[2]);

    ins->ins_Volume = data[0];
    ins->ins_FilterSpeed = ((data[1] >> 3) & 0x1f) | ((data[12] >> 2) & 0x20);
    ins->ins_WaveLength = data[1] & 0x07;
    ins->ins_Envelope.aFrames = data[2];
    ins->ins_Envelope.aVolume = data[3];
    ins->ins_Envelope.dFrames = data[4];
    ins->ins_Envelope.dVolume = data[5];
    ins->ins_Envelope.sFrames = data[6];
    ins->ins_Envelope.rFrames = data[7];
    ins->ins_Envelope.rVolume = data[8];
    ins->ins_FilterLowerLimit = data[12] & 0x7f;
    ins->ins_VibratoDelay = data[13];
    ins->ins_HardCutReleaseFrames = (data[14] >> 4) & 0x07;
    ins->ins_HardCutRelease = data[14] & 0x80 ? 1 : 0;
    ins->ins_VibratoDepth = data[14] & 0x0f;
    ins->ins_VibratoSpeed = data[15];
    ins->ins_SquareLowerLimit = data[16];
    ins->ins_SquareUpperLimit = data[17];
    ins->ins_SquareSpeed = data[18];
    ins->ins_FilterUpperLimit = data[19] & 0x3f;
    ins->ins_PList.pls_Speed = data[20];
    ins->ins_PList.pls_Length = data[21];
    ins->ins_PList.pls_Entries = ple;

    uint8 *bptr = &data[22];
    for (int32 j = 0; j < ins->ins_PList.pls_Length && j < 256; j++) {
        ple[j].ple_FX[0] = bptr[0] & 0xf;
        ple[j].ple_FX[1] = (bptr[1] >> 3) & 0xf;
        ple[j].ple_Waveform = bptr[1] & 7;
        ple[j].ple_Fixed = (bptr[2] >> 6) & 1;
        ple[j].ple_Note = bptr[2] & 0x3f;
        ple[j].ple_FXParam[0] = bptr[3];
        ple[j].ple_FXParam[1] = bptr[4];
        bptr += 5;
    }

    return 1;
}

/*
 * Trigger a note on the standalone player (replicates hvl_process_step logic).
 * note: 1-60 (HVL note values, C-0 = 1)
 * velocity: 0-127 (maps to volume)
 */
EMSCRIPTEN_KEEPALIVE
void hively_player_note_on(int32 handle, int32 note, int32 velocity) {
    if (handle < 0 || handle >= MAX_PLAYERS || !g_players[handle]) return;
    if (note < 1 || note > 60) return;

    struct hvl_tune *ht = g_players[handle];
    struct hvl_voice *voice = &ht->ht_Voices[0];
    struct hvl_instrument *Ins = &ht->ht_Instruments[1];
    int16 SquareLower, SquareUpper, d6, d3, d4;

    /* Reset pan */
    voice->vc_Pan = voice->vc_SetPan;
    voice->vc_PanMultLeft = panning_left[voice->vc_Pan];
    voice->vc_PanMultRight = panning_right[voice->vc_Pan];

    voice->vc_PeriodSlideSpeed = voice->vc_PeriodSlidePeriod = voice->vc_PeriodSlideLimit = 0;
    voice->vc_PerfSubVolume = 0x40;
    voice->vc_ADSRVolume = 0;
    voice->vc_Instrument = Ins;
    voice->vc_SamplePos = 0;

    /* ADSR setup (1:1 from hvl_process_step) */
    voice->vc_ADSR.aFrames = Ins->ins_Envelope.aFrames;
    voice->vc_ADSR.aVolume = voice->vc_ADSR.aFrames ? Ins->ins_Envelope.aVolume * 256 / voice->vc_ADSR.aFrames : Ins->ins_Envelope.aVolume * 256;
    voice->vc_ADSR.dFrames = Ins->ins_Envelope.dFrames;
    voice->vc_ADSR.dVolume = voice->vc_ADSR.dFrames ? (Ins->ins_Envelope.dVolume - Ins->ins_Envelope.aVolume) * 256 / voice->vc_ADSR.dFrames : Ins->ins_Envelope.dVolume * 256;
    voice->vc_ADSR.sFrames = Ins->ins_Envelope.sFrames;
    voice->vc_ADSR.rFrames = Ins->ins_Envelope.rFrames;
    voice->vc_ADSR.rVolume = voice->vc_ADSR.rFrames ? (Ins->ins_Envelope.rVolume - Ins->ins_Envelope.dVolume) * 256 / voice->vc_ADSR.rFrames : Ins->ins_Envelope.rVolume * 256;

    voice->vc_WaveLength = Ins->ins_WaveLength;
    /* Scale volume by velocity */
    voice->vc_NoteMaxVolume = (Ins->ins_Volume * velocity) / 127;

    voice->vc_VibratoCurrent = 0;
    voice->vc_VibratoDelay = Ins->ins_VibratoDelay;
    voice->vc_VibratoDepth = Ins->ins_VibratoDepth;
    voice->vc_VibratoSpeed = Ins->ins_VibratoSpeed;
    voice->vc_VibratoPeriod = 0;

    voice->vc_HardCutRelease = Ins->ins_HardCutRelease;
    voice->vc_HardCut = Ins->ins_HardCutReleaseFrames;

    /* Square sweep */
    voice->vc_IgnoreSquare = voice->vc_SquareSlidingIn = 0;
    voice->vc_SquareWait = voice->vc_SquareOn = 0;
    SquareLower = Ins->ins_SquareLowerLimit >> (5 - voice->vc_WaveLength);
    SquareUpper = Ins->ins_SquareUpperLimit >> (5 - voice->vc_WaveLength);
    if (SquareUpper < SquareLower) { int16 t = SquareUpper; SquareUpper = SquareLower; SquareLower = t; }
    voice->vc_SquareUpperLimit = SquareUpper;
    voice->vc_SquareLowerLimit = SquareLower;

    /* Filter sweep */
    voice->vc_IgnoreFilter = voice->vc_FilterWait = voice->vc_FilterOn = 0;
    voice->vc_FilterSlidingIn = 0;
    d6 = Ins->ins_FilterSpeed;
    d3 = Ins->ins_FilterLowerLimit;
    d4 = Ins->ins_FilterUpperLimit;
    if (d3 & 0x80) d6 |= 0x20;
    if (d4 & 0x80) d6 |= 0x40;
    voice->vc_FilterSpeed = d6;
    d3 &= ~0x80;
    d4 &= ~0x80;
    if (d3 > d4) { int16 t = d3; d3 = d4; d4 = t; }
    voice->vc_FilterUpperLimit = d4;
    voice->vc_FilterLowerLimit = d3;
    voice->vc_FilterPos = 32;

    /* Performance list */
    voice->vc_PerfWait = voice->vc_PerfCurrent = 0;
    voice->vc_PerfSpeed = Ins->ins_PList.pls_Speed;
    voice->vc_PerfList = &voice->vc_Instrument->ins_PList;

    /* No ring modulation */
    voice->vc_RingMixSource = NULL;
    voice->vc_RingSamplePos = 0;
    voice->vc_RingPlantPeriod = 0;
    voice->vc_RingNewWaveform = 0;

    voice->vc_PeriodSlideOn = 0;
    voice->vc_VolumeSlideUp = 0;
    voice->vc_VolumeSlideDown = 0;

    /* Set note period (from period_tab, same as hvl_process_stepfx_2) */
    voice->vc_TrackPeriod = note;
    voice->vc_PlantPeriod = 1;

    g_playerActive[handle] = 1;
    g_playerSamplesLeft[handle] = 0; /* fire hvl_process_frame immediately on first render */
}

EMSCRIPTEN_KEEPALIVE
void hively_player_note_off(int32 handle) {
    if (handle < 0 || handle >= MAX_PLAYERS || !g_players[handle]) return;

    struct hvl_voice *voice = &g_players[handle]->ht_Voices[0];
    /* Trigger release phase of ADSR by setting NoteMaxVolume to 0 */
    voice->vc_NoteMaxVolume = 0;
}

/*
 * Render audio from the standalone player.
 * Renders numSamples float samples to outL/outR.
 * Processes frames at 50Hz rate internally.
 * Returns number of samples written.
 */
EMSCRIPTEN_KEEPALIVE
uint32 hively_player_render(int32 handle, float *outL, float *outR, uint32 numSamples) {
    if (handle < 0 || handle >= MAX_PLAYERS || !g_players[handle]) return 0;
    if (!g_playerActive[handle]) {
        memset(outL, 0, numSamples * sizeof(float));
        memset(outR, 0, numSamples * sizeof(float));
        return numSamples;
    }

    struct hvl_tune *ht = g_players[handle];
    struct hvl_voice *voice = &ht->ht_Voices[0];
    ensure_player_mix_buffer(handle, numSamples);

    uint32 written = 0;
    const uint32 samplesPerFrame = ht->ht_Frequency / 50;
    if (samplesPerFrame == 0) {
        memset(outL, 0, numSamples * sizeof(float));
        memset(outR, 0, numSamples * sizeof(float));
        return numSamples;
    }
    const float scale = 1.0f / 32768.0f;

    while (written < numSamples) {
        /* Fire voice state update at 50 Hz */
        if (g_playerSamplesLeft[handle] == 0) {
            hvl_process_frame(ht, voice);
            hvl_set_audio(voice, ht->ht_FreqF);
            g_playerSamplesLeft[handle] = samplesPerFrame;
        }

        /* Render up to the end of the current 50Hz frame */
        uint32 toRender = numSamples - written;
        if (toRender > g_playerSamplesLeft[handle])
            toRender = g_playerSamplesLeft[handle];

        memset(&g_playerMixL[handle][0], 0, toRender * sizeof(int16));
        memset(&g_playerMixR[handle][0], 0, toRender * sizeof(int16));

        hvl_mixchunk(ht, toRender, (int8 *)g_playerMixL[handle], (int8 *)g_playerMixR[handle], 2);

        for (uint32 i = 0; i < toRender; i++) {
            outL[written + i] = (float)g_playerMixL[handle][i] * scale;
            outR[written + i] = (float)g_playerMixR[handle][i] * scale;
        }

        written += toRender;
        g_playerSamplesLeft[handle] -= toRender;
    }

    return written;
}

/* ---- Position/Track Query (for import verification) ---- */

EMSCRIPTEN_KEEPALIVE
int32 hively_get_track_nr(void) {
    return g_tune ? (int32)g_tune->ht_TrackNr : 0;
}

/*
 * Get position data: track index and transpose for each channel.
 * Writes chann * 2 bytes: [track0, transpose0, track1, transpose1, ...]
 * Returns bytes written.
 */
EMSCRIPTEN_KEEPALIVE
int32 hively_get_position_data(int32 posIdx, uint8 *outBuf) {
    if (!g_tune || posIdx < 0 || posIdx >= g_tune->ht_PositionNr)
        return 0;

    struct hvl_position *pos = &g_tune->ht_Positions[posIdx];
    int32 chans = g_tune->ht_Channels;
    for (int32 i = 0; i < chans; i++) {
        outBuf[i * 2]     = pos->pos_Track[i];
        outBuf[i * 2 + 1] = (uint8)pos->pos_Transpose[i];
    }
    return chans * 2;
}

/*
 * Get step data for a track.
 * Layout per step (6 bytes): note, instrument, fx, fxParam, fxb, fxbParam
 * Writes trackLength * 6 bytes.
 * Returns bytes written.
 */
EMSCRIPTEN_KEEPALIVE
int32 hively_get_track_data(int32 trackIdx, uint8 *outBuf) {
    if (!g_tune || trackIdx < 0 || trackIdx > 255)
        return 0;

    int32 trkLen = g_tune->ht_TrackLength;
    for (int32 i = 0; i < trkLen; i++) {
        struct hvl_step *s = &g_tune->ht_Tracks[trackIdx][i];
        outBuf[i * 6]     = s->stp_Note;
        outBuf[i * 6 + 1] = s->stp_Instrument;
        outBuf[i * 6 + 2] = s->stp_FX;
        outBuf[i * 6 + 3] = s->stp_FXParam;
        outBuf[i * 6 + 4] = s->stp_FXb;
        outBuf[i * 6 + 5] = s->stp_FXbParam;
    }
    return trkLen * 6;
}
