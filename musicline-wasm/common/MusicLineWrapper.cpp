// MusicLineWrapper.cpp
// C-linkage shim wrapping MlineBackend + MLModule for Emscripten export.
//
// Song API:   ml_init / ml_load / ml_render / ml_stop / ml_is_finished
//             ml_get_subsong_count / ml_set_subsong
//             ml_get_title / ml_get_author
//             ml_detect_duration
//             ml_get_position / ml_get_row / ml_get_speed
//
// Preview API: ml_preview_load / ml_preview_note_on / ml_preview_note_off
//              ml_preview_render / ml_preview_stop
//
// Utility:    ml_get_sample_rate

#include "mline_backend.h"
#include "../module.h"
#include "../structs.h"

#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <cstdio>

// ---------------------------------------------------------------------------
// Song instance
// ---------------------------------------------------------------------------
static MlineBackend* s_song    = nullptr;
static int           s_sampleRate = 28150; // INTERNAL_RATE; JS-side must resample

// ---------------------------------------------------------------------------
// Preview instance (separate backend so song playback is unaffected)
// ---------------------------------------------------------------------------
static MlineBackend* s_preview = nullptr;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
static const char* safe_str(const char* s) {
    return (s && s[0]) ? s : "";
}

extern "C" {

// ============================================================================
// Utility API
// ============================================================================

/**
 * ml_get_sample_rate() → 28150 (INTERNAL_RATE).
 * MlineBackend always outputs at this fixed rate; the JS worklet must resample
 * to the Web Audio context rate. Exported so the worklet can query it instead
 * of hardcoding the value.
 */
int ml_get_sample_rate() {
    return 28150; // INTERNAL_RATE — MlineBackend always outputs at this rate
}

// ============================================================================
// Song API
// ============================================================================

/**
 * ml_init(sampleRate)
 * Creates (or recreates) the song backend.
 * Note: MlineBackend always runs at INTERNAL_RATE (28150 Hz).
 * The JS layer is responsible for resampling if a different rate is wanted.
 * We keep sampleRate so we can expose it via ml_get_speed if needed.
 */
void ml_init(int sampleRate) {
    s_sampleRate = sampleRate;
    delete s_song;
    s_song = new MlineBackend();
}

/**
 * ml_load(data, len) → 1 on success, 0 on failure.
 * data must be a pointer inside WASM heap (allocated with malloc).
 */
int ml_load(uint8_t* data, int len) {
    if (!s_song || !data || len <= 0) return 0;
    return s_song->load(data, static_cast<size_t>(len)) ? 1 : 0;
}

/**
 * ml_render(buffer, frames) → frames written, 0 on song end, -1 on error.
 * buffer: float* pointing to F32 stereo interleaved output (frames*2 floats).
 * Native rate is 28150 Hz; the JS worklet must resample.
 */
int ml_render(float* buffer, int frames) {
    if (!s_song) {
        if (buffer) memset(buffer, 0, frames * 2 * sizeof(float));
        return -1;
    }
    return s_song->render(buffer, frames);
}

/**
 * ml_stop() — frees the current module; ml_load() must be called again to play.
 */
void ml_stop() {
    if (s_song) s_song->stop();
}

/**
 * ml_is_finished() → 1 if the song has ended or looped back to start.
 */
int ml_is_finished() {
    if (!s_song) return 1;
    return s_song->is_finished() ? 1 : 0;
}

// ----------------------------------------------------------------------------
// Subsong control
// ----------------------------------------------------------------------------

int ml_get_subsong_count() {
    if (!s_song) return 0;
    return s_song->get_subsong_count();
}

void ml_set_subsong(int subsong) {
    if (s_song) s_song->set_subsong(subsong);
}

// ----------------------------------------------------------------------------
// Metadata
// ----------------------------------------------------------------------------

/**
 * ml_get_title() → null-terminated C string (valid until next ml_load call).
 */
const char* ml_get_title() {
    if (!s_song) return "";
    return safe_str(s_song->get_info_title());
}

/**
 * ml_get_author() → null-terminated C string.
 */
const char* ml_get_author() {
    if (!s_song) return "";
    return safe_str(s_song->get_info_author());
}

// ----------------------------------------------------------------------------
// Duration detection
// ----------------------------------------------------------------------------

/**
 * ml_detect_duration() → song length in seconds (double), or 0.0 on error.
 * This runs a dry-run (no audio generation) forward scan to find loop/end.
 * Caps at 600 seconds.
 */
double ml_detect_duration() {
    if (!s_song) return 0.0;
    return s_song->detect_duration(600);
}

// ----------------------------------------------------------------------------
// Position / speed queries
// ----------------------------------------------------------------------------

/**
 * ml_get_position() → current tune-list position (0-based).
 * This is the row index within the tune's channel list (m_TunePos on ch 0).
 */
int ml_get_position() {
    if (!s_song) return 0;
    MLModule* mod = s_song->get_module();
    if (!mod) return 0;
    // Return the tune-position of the first active channel (channel 0 in ChannelBuf).
    // m_TunePos is a u8 (0-255) on the Channel object, not on MLModule directly.
    if (mod->m_ChannelBuf[0]) {
        return mod->m_ChannelBuf[0]->m_TunePos;
    }
    return 0;
}

/**
 * ml_get_row() → current pattern row (0-based) for channel 0.
 * This is m_PartPos on the first channel.
 */
int ml_get_row() {
    if (!s_song) return 0;
    MLModule* mod = s_song->get_module();
    if (!mod) return 0;
    if (mod->m_ChannelBuf[0]) {
        return mod->m_ChannelBuf[0]->m_PartPos;
    }
    return 0;
}

/**
 * ml_get_speed() → current tick size in samples (integer).
 * This is m_nCurrentTickSize on MLModule (562 or 563 at INTERNAL_RATE).
 */
int ml_get_speed() {
    if (!s_song) return 0;
    MLModule* mod = s_song->get_module();
    if (!mod) return 0;
    return static_cast<int>(mod->m_nCurrentTickSize);
}

// ----------------------------------------------------------------------------
// Pattern data queries (inspired by emoon's SA state reader gist)
// ----------------------------------------------------------------------------

/**
 * ml_get_channel_count() → number of active channels in the current song.
 */
int ml_get_channel_count() {
    if (!s_song) return 0;
    MLModule* mod = s_song->get_module();
    if (!mod) return 0;
    // Count non-null ChannelBuf entries
    int count = 0;
    for (int i = 0; i < MAXCHANS; i++) {
        if (mod->m_ChannelBuf[i]) count++;
        else break;
    }
    return count;
}

/**
 * ml_get_part_length() → number of rows per pattern (PartSize = 128).
 */
int ml_get_part_length() {
    return PartSize;
}

/**
 * ml_get_num_parts() → total number of patterns in the module.
 */
int ml_get_num_parts() {
    if (!s_song) return 0;
    MLModule* mod = s_song->get_module();
    if (!mod) return 0;
    return static_cast<int>(mod->m_PartNum);
}

/**
 * ml_get_channel_state(channel, outBuf)
 * Writes 8 bytes of channel state:
 *   [0] tunePos  (u8) — position in tune list
 *   [1] partPos  (u8) — current row in pattern
 *   [2-3] partNum (u16 LE) — current pattern number
 *   [4] transposeNum (s8) — current transpose
 *   [5] speed    (u8) — ticks per row for this channel
 *   [6] groove   (u8)
 *   [7] reserved
 * Returns 1 on success, 0 on failure.
 */
int ml_get_channel_state(int channel, uint8_t* outBuf) {
    if (!s_song || !outBuf) return 0;
    MLModule* mod = s_song->get_module();
    if (!mod) return 0;
    if (channel < 0 || channel >= MAXCHANS || !mod->m_ChannelBuf[channel]) return 0;

    Channel* ch = mod->m_ChannelBuf[channel];
    outBuf[0] = ch->m_TunePos;
    outBuf[1] = ch->m_PartPos;
    outBuf[2] = static_cast<uint8_t>(ch->m_PartNum & 0xFF);
    outBuf[3] = static_cast<uint8_t>((ch->m_PartNum >> 8) & 0xFF);
    outBuf[4] = static_cast<uint8_t>(ch->m_TransposeNum);
    outBuf[5] = ch->m_SpdPart;
    outBuf[6] = ch->m_GrvPart;
    outBuf[7] = 0;
    return 1;
}

/**
 * ml_get_pattern_data(partNum, outBuf, maxRows)
 * Reads pattern data for pattern `partNum` into outBuf.
 * Each row is 4 bytes: [note, instrument, fx_hi, fx_lo]
 * where fx is the first effect column (Fx[0]).
 * Returns the number of rows written (up to min(PartSize, maxRows)).
 */
int ml_get_pattern_data(int partNum, uint8_t* outBuf, int maxRows) {
    if (!s_song || !outBuf || maxRows <= 0) return 0;
    MLModule* mod = s_song->get_module();
    if (!mod) return 0;
    if (partNum < 0 || partNum >= 1025 || !mod->m_PartList[partNum]) return 0;

    Part* part = mod->m_PartList[partNum];
    int rows = (maxRows < PartSize) ? maxRows : PartSize;

    for (int r = 0; r < rows; r++) {
        PartLine& pl = part->Data[r];
        int off = r * 4;
        outBuf[off]     = pl.Note;
        outBuf[off + 1] = pl.Inst;
        // Pack first effect column: hi byte = flags/effect, lo byte = argument
        outBuf[off + 2] = static_cast<uint8_t>((pl.Fx[0] >> 8) & 0xFF);
        outBuf[off + 3] = static_cast<uint8_t>(pl.Fx[0] & 0xFF);
    }
    return rows;
}

// ============================================================================
// Preview API
// ============================================================================
// The preview backend loads the same .ml file as the song backend but is
// used only for single-note audition (instrument preview in the editor).
// It runs independently so song playback is unaffected.

/**
 * ml_preview_load(data, len) → 1 on success, 0 on failure.
 * Loads a module into the preview backend without affecting song playback.
 * After a successful load, renders a brief silent warmup to initialize
 * channel state so that ml_preview_note_on can safely call CheckInst()
 * without hitting uninitialized mixer state (null CMLineSfx pointers,
 * divide-by-zero in period calculation, etc.).
 */
int ml_preview_load(uint8_t* data, int len) {
    if (!data || len <= 0) return 0;
    delete s_preview;
    s_preview = new MlineBackend();
    bool ok = s_preview->load(data, static_cast<size_t>(len));
    if (ok) {
        // Warm up: render a few frames to initialize channel state.
        // This ensures ml_preview_note_on can safely call CheckInst().
        float warmup[128];
        s_preview->render(warmup, 64);
        // Don't stop here — the module naturally starts; we'll reset via note-on.
    }
    return ok ? 1 : 0;
}

/**
 * ml_preview_note_on(instIdx, midiNote, velocity)
 * Triggers a single note on the preview backend.
 *
 * MusicLine notes are 1-based (1=C-1 through 60=B-5 approximately).
 * MIDI note 60 = C4. We map: mlNote = midiNote - 24 (C2 on MIDI → note 1 in ML).
 * Clamp to [1, 60].
 *
 * Implementation: Sets m_PartNote and m_PartInst on channel 0's instrument slot,
 * then calls CheckInst() to trigger PlayInst(). This mirrors what PlayVoice does
 * in channel.cpp when it encounters a new note in the pattern data.
 */
void ml_preview_note_on(int instIdx, int midiNote, int /*velocity*/) {
    if (!s_preview) return;
    MLModule* mod = s_preview->get_module();
    if (!mod) return;

    // Bounds check instrument index (1-based in ML, indices into m_InstList).
    // instIdx from JS is 0-based; ML instruments are 1-based.
    int mlInst = instIdx + 1;
    if (mlInst < 1 || mlInst >= MAX_INSTURUMENTS) return;
    if (!mod->m_InstList[mlInst]) return;

    // Convert MIDI note to MusicLine note (empirically, MIDI 60=C4 → ML ~37).
    // ML note encoding: note 1 = C-1, stepping by semitone.
    // MIDI 36 (C2) → ML 1; offset = -35.
    int mlNote = midiNote - 35;
    if (mlNote < 1)  mlNote = 1;
    if (mlNote > 60) mlNote = 60;

    // Use channel 0.
    Channel* chan = mod->m_ChannelBuf[0];
    if (!chan) return;

    CPlayInst* pi = chan->GetPlayingInstrument(); // m_Instrument[m_InstNum]
    if (!pi) return;

    // Set the note and instrument so CheckInst → PlayInst can pick them up.
    pi->m_PartNote = static_cast<u8>(mlNote);
    pi->m_PartInst = static_cast<u8>(mlInst);

    // Call CheckInst to resolve instrument pointer and trigger PlayInst.
    pi->CheckInst(mod);
}

/**
 * ml_preview_note_off(instIdx)
 * Stops a note that was triggered via ml_preview_note_on.
 * Sets volume to 0 on the preview channel's sfx mixer entry.
 */
void ml_preview_note_off(int /*instIdx*/) {
    if (!s_preview) return;
    MLModule* mod = s_preview->get_module();
    if (!mod) return;

    // Silence channel 0's mix entry.
    CMLineSfx* sfx = mod->GetChannel(0); // m_pMixChord[0]
    if (sfx) {
        sfx->m_fVolume  = 0.0f;
        sfx->m_fOVolume = 0.0f;
        sfx->m_nVolumeInt = 0;
        sfx->m_bMix = false;
    }
    // Also clear the work channel.
    CMLineSfx* work = mod->GetWorkChannel(0); // m_pChannel[0]
    if (work) {
        work->m_fVolume  = 0.0f;
        work->m_fOVolume = 0.0f;
        work->m_nVolumeInt = 0;
        work->m_bMix = false;
    }
}

/**
 * ml_preview_render(buffer, frames) → frames written (or -1 on error).
 * Generates audio from the preview backend into buffer (F32 stereo interleaved).
 */
int ml_preview_render(float* buffer, int frames) {
    if (!s_preview) {
        if (buffer) memset(buffer, 0, frames * 2 * sizeof(float));
        return -1;
    }
    return s_preview->render(buffer, frames);
}

/**
 * ml_preview_stop() — silences the preview backend (does not free it).
 */
void ml_preview_stop() {
    if (!s_preview) return;
    MLModule* mod = s_preview->get_module();
    if (!mod) return;
    // Silence all mix channels.
    for (int i = 0; i < MAXCHANS; i++) {
        CMLineSfx* sfx = mod->GetChannel(i);
        if (sfx) {
            sfx->m_fVolume  = 0.0f;
            sfx->m_fOVolume = 0.0f;
            sfx->m_nVolumeInt = 0;
            sfx->m_bMix = false;
        }
    }
}

} // extern "C"
