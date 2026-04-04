/**
 * sfizz_bridge.cpp — C bridge for sfizz SFZ sample player WASM module
 *
 * Exposes a minimal C API for the AudioWorklet to drive sfizz:
 *   create/destroy, load SFZ, note on/off, CC, render audio, etc.
 *
 * Sfizz uses MEMFS for file I/O — SFZ files and referenced WAV samples
 * must be written to the virtual filesystem before calling load.
 *
 * Pthread stubs: sfizz's FilePool uses pthreads for background loading.
 * In WASM/AudioWorklet we run single-threaded with freewheeling mode,
 * so we stub out the scheduler functions that aren't in Emscripten's
 * non-pthreads build.
 */

#include <sfizz.h>
#include <cstdlib>
#include <cstring>
#include <cstdio>

#ifdef __EMSCRIPTEN__
#include <sched.h>
#include <pthread.h>

extern "C" {
  /* ── Pthread stubs for single-threaded AudioWorklet ──
   *
   * sfizz's FilePool creates two std::thread members in its constructor.
   * Emscripten's no-pthread stubs return EAGAIN from pthread_create,
   * which makes std::thread throw system_error → abort().
   *
   * We use --wrap linker flag to intercept these calls. The linker
   * redirects all calls to pthread_create → __wrap_pthread_create.
   * With freewheeling mode, samples load synchronously — background
   * threads aren't needed.
   */
  int sched_get_priority_min(int policy) { (void)policy; return 0; }
  int sched_get_priority_max(int policy) { (void)policy; return 0; }

  int pthread_setschedparam(pthread_t thread, int policy, const struct sched_param *param) {
    (void)thread; (void)policy; (void)param;
    return 0;
  }

  /* --wrap interceptors: linker redirects pthread_X → __wrap_pthread_X */
  int __wrap_pthread_create(pthread_t *thread, const pthread_attr_t *attr,
                            void *(*start_routine)(void *), void *arg) {
    (void)attr; (void)start_routine; (void)arg;
    if (thread) *thread = (pthread_t)1; // non-zero = "valid" handle
    return 0; // pretend success — thread won't actually run
  }

  int __wrap_pthread_join(pthread_t thread, void **retval) {
    (void)thread;
    if (retval) *retval = nullptr;
    return 0;
  }

  int __wrap_pthread_detach(pthread_t thread) {
    (void)thread;
    return 0;
  }
}
#endif

extern "C" {

/* ── Lifecycle ─────────────────────────────────────────────── */

void* sfizz_bridge_create(int sampleRate, int samplesPerBlock) {
    sfizz_synth_t* synth = sfizz_create_synth();
    if (!synth) return nullptr;
    sfizz_set_sample_rate(synth, (float)sampleRate);
    sfizz_set_samples_per_block(synth, samplesPerBlock);
    sfizz_set_num_voices(synth, 64);
    sfizz_set_volume(synth, 0.0f); // 0 dB
    sfizz_set_sample_quality(synth, SFIZZ_PROCESS_LIVE, 2);
    sfizz_set_oscillator_quality(synth, SFIZZ_PROCESS_LIVE, 1);
    return synth;
}

void sfizz_bridge_destroy(void* ptr) {
    if (ptr) sfizz_free((sfizz_synth_t*)ptr);
}

/* ── Loading ───────────────────────────────────────────────── */

int sfizz_bridge_load_file(void* ptr, const char* path) {
    if (!ptr || !path) return 0;
    sfizz_synth_t* synth = (sfizz_synth_t*)ptr;
    bool ok = sfizz_load_file(synth, path);
    if (ok) {
        // sfizz's loadSfzFile calls clear() which resets the buffer pool.
        // Re-set samples_per_block to force buffer re-allocation.
        sfizz_set_samples_per_block(synth, 128);
    }
    return ok ? 1 : 0;
}

int sfizz_bridge_load_string(void* ptr, const char* sfzText, const char* virtualPath) {
    if (!ptr || !sfzText) return 0;
    sfizz_synth_t* synth = (sfizz_synth_t*)ptr;
    const char* vpath = virtualPath ? virtualPath : "/virtual.sfz";
    bool ok = sfizz_load_string(synth, vpath, sfzText);
    if (ok) {
        sfizz_set_samples_per_block(synth, 128);
    }
    return ok ? 1 : 0;
}

/* ── MIDI Events ───────────────────────────────────────────── */

void sfizz_bridge_note_on(void* ptr, int delay, int note, float velocity) {
    if (!ptr) return;
    sfizz_send_hd_note_on((sfizz_synth_t*)ptr, delay, note, velocity);
}

void sfizz_bridge_note_off(void* ptr, int delay, int note, float velocity) {
    if (!ptr) return;
    sfizz_send_hd_note_off((sfizz_synth_t*)ptr, delay, note, velocity);
}

void sfizz_bridge_send_cc(void* ptr, int delay, int cc, float value) {
    if (!ptr) return;
    sfizz_automate_hdcc((sfizz_synth_t*)ptr, delay, cc, value);
}

void sfizz_bridge_pitch_wheel(void* ptr, int delay, int pitch) {
    if (!ptr) return;
    sfizz_send_pitch_wheel((sfizz_synth_t*)ptr, delay, pitch);
}

void sfizz_bridge_aftertouch(void* ptr, int delay, int value) {
    if (!ptr) return;
    sfizz_send_channel_aftertouch((sfizz_synth_t*)ptr, delay, value);
}

void sfizz_bridge_poly_aftertouch(void* ptr, int delay, int note, int value) {
    if (!ptr) return;
    sfizz_send_poly_aftertouch((sfizz_synth_t*)ptr, delay, note, value);
}

void sfizz_bridge_program_change(void* ptr, int delay, int program) {
    if (!ptr) return;
    sfizz_send_program_change((sfizz_synth_t*)ptr, delay, program);
}

/* ── Audio Rendering ───────────────────────────────────────── */

void sfizz_bridge_render(void* ptr, float* left, float* right, int numFrames) {
    if (!ptr || !left || !right) return;
    float* channels[2] = { left, right };
    sfizz_render_block((sfizz_synth_t*)ptr, channels, 2, numFrames);
}

/* ── Configuration ─────────────────────────────────────────── */

void sfizz_bridge_set_volume(void* ptr, float volume) {
    if (!ptr) return;
    sfizz_set_volume((sfizz_synth_t*)ptr, volume);
}

float sfizz_bridge_get_volume(void* ptr) {
    if (!ptr) return 0.0f;
    return sfizz_get_volume((sfizz_synth_t*)ptr);
}

void sfizz_bridge_set_num_voices(void* ptr, int numVoices) {
    if (!ptr) return;
    sfizz_set_num_voices((sfizz_synth_t*)ptr, numVoices);
}

int sfizz_bridge_get_num_voices(void* ptr) {
    if (!ptr) return 0;
    return sfizz_get_num_voices((sfizz_synth_t*)ptr);
}

void sfizz_bridge_set_oversampling(void* ptr, int factor) {
    if (!ptr) return;
    sfizz_oversampling_factor_t f;
    switch (factor) {
        case 2:  f = SFIZZ_OVERSAMPLING_X2; break;
        case 4:  f = SFIZZ_OVERSAMPLING_X4; break;
        case 8:  f = SFIZZ_OVERSAMPLING_X8; break;
        default: f = SFIZZ_OVERSAMPLING_X1; break;
    }
    sfizz_set_oversampling_factor((sfizz_synth_t*)ptr, f);
}

int sfizz_bridge_get_oversampling(void* ptr) {
    if (!ptr) return 1;
    return (int)sfizz_get_oversampling_factor((sfizz_synth_t*)ptr);
}

void sfizz_bridge_set_preload_size(void* ptr, unsigned int size) {
    if (!ptr) return;
    sfizz_set_preload_size((sfizz_synth_t*)ptr, size);
}

unsigned int sfizz_bridge_get_preload_size(void* ptr) {
    if (!ptr) return 0;
    return sfizz_get_preload_size((sfizz_synth_t*)ptr);
}

void sfizz_bridge_set_sample_quality(void* ptr, int quality) {
    if (!ptr) return;
    sfizz_set_sample_quality((sfizz_synth_t*)ptr, SFIZZ_PROCESS_LIVE, quality);
}

void sfizz_bridge_set_oscillator_quality(void* ptr, int quality) {
    if (!ptr) return;
    sfizz_set_oscillator_quality((sfizz_synth_t*)ptr, SFIZZ_PROCESS_LIVE, quality);
}

void sfizz_bridge_set_sustain_cancels_release(void* ptr, int value) {
    if (!ptr) return;
    sfizz_set_sustain_cancels_release((sfizz_synth_t*)ptr, value != 0);
}

void sfizz_bridge_set_sample_rate(void* ptr, float sampleRate) {
    if (!ptr) return;
    sfizz_set_sample_rate((sfizz_synth_t*)ptr, sampleRate);
}

void sfizz_bridge_set_samples_per_block(void* ptr, int samplesPerBlock) {
    if (!ptr) return;
    sfizz_set_samples_per_block((sfizz_synth_t*)ptr, samplesPerBlock);
}

/* ── Tuning ────────────────────────────────────────────────── */

void sfizz_bridge_set_scala_root_key(void* ptr, int key) {
    if (!ptr) return;
    sfizz_set_scala_root_key((sfizz_synth_t*)ptr, key);
}

void sfizz_bridge_set_tuning_frequency(void* ptr, float freq) {
    if (!ptr) return;
    sfizz_set_tuning_frequency((sfizz_synth_t*)ptr, freq);
}

int sfizz_bridge_load_scala_string(void* ptr, const char* scl) {
    if (!ptr || !scl) return 0;
    return sfizz_load_scala_string((sfizz_synth_t*)ptr, scl) ? 1 : 0;
}

/* ── Transport ─────────────────────────────────────────────── */

void sfizz_bridge_set_tempo(void* ptr, float bpm) {
    if (!ptr) return;
    sfizz_send_bpm_tempo((sfizz_synth_t*)ptr, 0, bpm);
}

void sfizz_bridge_set_time_signature(void* ptr, int beatsPerBar, int beatUnit) {
    if (!ptr) return;
    sfizz_send_time_signature((sfizz_synth_t*)ptr, 0, beatsPerBar, beatUnit);
}

void sfizz_bridge_set_time_position(void* ptr, int bar, double barBeat) {
    if (!ptr) return;
    sfizz_send_time_position((sfizz_synth_t*)ptr, 0, bar, barBeat);
}

void sfizz_bridge_set_playback_state(void* ptr, int state) {
    if (!ptr) return;
    sfizz_send_playback_state((sfizz_synth_t*)ptr, 0, state);
}

/* ── Query ─────────────────────────────────────────────────── */

int sfizz_bridge_get_num_regions(void* ptr) {
    if (!ptr) return 0;
    return sfizz_get_num_regions((sfizz_synth_t*)ptr);
}

int sfizz_bridge_get_num_groups(void* ptr) {
    if (!ptr) return 0;
    return sfizz_get_num_groups((sfizz_synth_t*)ptr);
}

int sfizz_bridge_get_num_active_voices(void* ptr) {
    if (!ptr) return 0;
    return sfizz_get_num_active_voices((sfizz_synth_t*)ptr);
}

int sfizz_bridge_get_num_preloaded_samples(void* ptr) {
    if (!ptr) return 0;
    return (int)sfizz_get_num_preloaded_samples((sfizz_synth_t*)ptr);
}

/* ── Misc ──────────────────────────────────────────────────── */

void sfizz_bridge_all_sound_off(void* ptr) {
    if (!ptr) return;
    sfizz_all_sound_off((sfizz_synth_t*)ptr);
}

void sfizz_bridge_enable_freewheeling(void* ptr) {
    if (!ptr) return;
    sfizz_enable_freewheeling((sfizz_synth_t*)ptr);
}

void sfizz_bridge_disable_freewheeling(void* ptr) {
    if (!ptr) return;
    sfizz_disable_freewheeling((sfizz_synth_t*)ptr);
}

} // extern "C"
