// Sonix preset generator: parse each Synthesis/MIDI .instr in a directory through the
// REAL Sonix decode + setters, then dump its SonixSynthParams as a JSON array on stdout.
// A wrapper (generate-sonix-presets.mjs) turns the JSON into src/generated/sonixPresets.ts.
// Mirrors the synthesis-instrument load block in sonix_io.c (single instrument, slot 0).
//
// Build: cc -O1 -w -I <repo>/sonix-wasm/src gen-presets.c -o gen -lm
// Run:   gen <instrumentsDir>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include "sonix/sonix.h"
#include "sonix/sonix.c"
#include "sonix/sonix_io.c"

static void dump_i8_array(const int8_t* a) {
    printf("[");
    for (int k = 0; k < 128; k++) printf("%s%d", k ? "," : "", (int)a[k]);
    printf("]");
}

// Returns 1 if the instrument parsed as a synth (dumped), 0 otherwise. Prints a leading
// ",\n" separator only when it actually emits and need_comma is set.
static int emit_instrument(const char* name, const uint8_t* instr_data, uint32_t instr_size, int need_comma) {
    SonixSong* s = sonix_song_create_scratch();
    if (!s) return 0;

    int is_synth = 0;
    int8_t* pcm = NULL; uint32_t pcm_len = 0;
    int8_t* wave128 = NULL; uint32_t wave_len = 0;
    uint16_t c2 = 0, c4 = 0;

    if (decode_synthesis_wave(instr_data, instr_size, &pcm, &pcm_len, &wave128, &wave_len, &c2, &c4)) {
        is_synth = 1;
        sonix_song_set_instrument_synth(s, 0, true);
        if (wave128) {
            sonix_song_set_synth_wave(s, 0, wave128);
            sonix_song_set_synth_blend_params(s, 0, c2, c4);
        }
        if (instr_size >= 0x1D0) {
            sonix_song_set_synth_vol_params(s, 0, sonix_read_be16(instr_data + 0x1CC), sonix_read_be16(instr_data + 0x1CE));
        }
        if (instr_size >= 0x1E6) {
            uint16_t env_vscale = sonix_read_be16(instr_data + 0x1D0);
            uint16_t slide_rate = sonix_read_be16(instr_data + 0x1D2);
            uint16_t env_pscale = sonix_read_be16(instr_data + 0x1D4);
            sonix_song_set_synth_slide_rate(s, 0, slide_rate);
            sonix_song_set_synth_filter_params(s, 0, sonix_read_be16(instr_data + 0x1D6),
                sonix_read_be16(instr_data + 0x1D8), sonix_read_be16(instr_data + 0x1DA));
            sonix_song_set_synth_env_params(s, 0, sonix_read_be16(instr_data + 0x1DC),
                (int16_t)sonix_read_be16(instr_data + 0x1DE), sonix_read_be16(instr_data + 0x1E0), env_vscale, env_pscale);
        }
        if (instr_size >= 0x1F6) {
            uint16_t targets[4], speeds[4];
            for (int j = 0; j < 4; j++) { targets[j] = sonix_read_be16(instr_data + 0x1E6 + j*2); speeds[j] = sonix_read_be16(instr_data + 0x1EE + j*2); }
            sonix_song_set_ss_envelope(s, 0, 0, targets, speeds);
        }
        if (instr_size >= 0xC4 + 128) sonix_song_set_synth_env_table(s, 0, (const int8_t*)(instr_data + 0xC4));
        if (instr_size >= 0x1C4) sonix_song_set_synth_lfo_wave(s, 0, (const int8_t*)(instr_data + 0x144));
    } else if (instr_size >= 4 && memcmp(instr_data, "MIDI", 4) == 0) {
        is_synth = 1;
        int8_t saw[128];
        for (int k = 0; k < 128; k++) saw[k] = (int8_t)(k * 2 - 128);
        sonix_song_set_instrument_synth(s, 0, true);
        sonix_song_set_synth_wave(s, 0, saw);
        sonix_song_set_synth_vol_params(s, 0, 128, 0);
    }

    free(pcm); free(wave128);

    if (is_synth) {
        if (need_comma) printf(",\n");
        printf("  {\"name\":\"%s\",\"baseVol\":%u,\"portFlag\":%u,\"c2\":%u,\"c4\":%u,",
            name, s->synth_base_vol[0], s->synth_port_flag[0], s->synth_c2[0], s->synth_c4[0]);
        printf("\"filterBase\":%u,\"filterRange\":%u,\"filterEnvSens\":%u,",
            s->synth_filter_base[0], s->synth_filter_range[0], s->synth_filter_env_sens[0]);
        printf("\"envScanRate\":%u,\"envLoopMode\":%d,\"envDelayInit\":%u,\"envVolScale\":%u,\"envPitchScale\":%u,\"slideRate\":%u,",
            s->synth_env_scan_rate[0], s->synth_env_loop_mode[0], s->synth_env_delay_init[0],
            s->synth_env_vol_scale[0], s->synth_env_pitch_scale[0], s->synth_slide_rate[0]);
        printf("\"wave\":"); dump_i8_array(s->synth_wave[0]);
        printf(",\"envTable\":"); dump_i8_array(s->synth_env_table[0]);
        printf(",\"lfoWave\":"); dump_i8_array(s->synth_lfo_wave[0]);
        printf(",\"egLevels\":[%u,%u,%u,%u]", s->ss_port_target[0][0], s->ss_port_target[0][1], s->ss_port_target[0][2], s->ss_port_target[0][3]);
        printf(",\"egRates\":[%u,%u,%u,%u]}", s->ss_port_speed[0][0], s->ss_port_speed[0][1], s->ss_port_speed[0][2], s->ss_port_speed[0][3]);
    }
    sonix_song_destroy(s);
    return is_synth;
}

int main(int argc, char** argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <instrumentsDir>\n", argv[0]); return 2; }
    DIR* dir = opendir(argv[1]);
    if (!dir) { fprintf(stderr, "cannot open %s\n", argv[1]); return 2; }
    struct dirent* e;
    char names[4096][128]; int n = 0;
    while ((e = readdir(dir)) && n < 4096) {
        const char* nm = e->d_name;
        size_t len = strlen(nm);
        if (len < 6 || strcmp(nm + len - 6, ".instr") != 0) continue;
        strncpy(names[n], nm, 127); names[n][127] = '\0'; n++;
    }
    closedir(dir);
    printf("[\n");
    int emitted = 0;
    for (int i = 0; i < n; i++) {
        char path[1024];
        snprintf(path, sizeof(path), "%s/%s", argv[1], names[i]);
        FILE* f = fopen(path, "rb");
        if (!f) continue;
        fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
        uint8_t* buf = (uint8_t*)malloc((size_t)sz);
        if (fread(buf, 1, (size_t)sz, f) != (size_t)sz) { fclose(f); free(buf); continue; }
        fclose(f);
        // strip ".instr" for the preset name
        char base[128]; strncpy(base, names[i], 127); base[127] = '\0';
        size_t bl = strlen(base); if (bl > 6) base[bl - 6] = '\0';
        // escape double quotes/backslashes minimally
        char safe[256]; int si = 0;
        for (int k = 0; base[k] && si < 250; k++) { if (base[k] == '"' || base[k] == '\\') safe[si++] = '\\'; safe[si++] = base[k]; }
        safe[si] = '\0';
        int ok = emit_instrument(safe, buf, (uint32_t)sz, emitted > 0);
        if (ok) emitted++;
        free(buf);
    }
    printf("\n]\n");
    fprintf(stderr, "emitted %d synth presets of %d .instr files\n", emitted, n);
    return 0;
}
