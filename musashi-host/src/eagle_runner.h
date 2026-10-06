/*
 * eagle_runner.h - any UADE eagleplayer on musashi-host
 *
 * UADE's sound core `score` (third-party/uade-3.05/amigasrc/score, the
 * committed binary UADE's own wasm embeds) is the eagleplayer ABI host: it
 * relocates the player's hunks, parses its DTP_/EP_ tags, provides the
 * DeliTracker/EaglePlayer globals and the exec/dos/CIA/timer calls players
 * use, runs DTP_Check/Config/ExtLoad/InitPlayer/SubSong/InitSound and then
 * calls DTP_Interrupt every frame (or installs its CIA/VBlank interrupt).
 * This runner is the emulator side UAE gives it in src/uade.c: the boot
 * block at $100-$198, the memory layout, and the TRAP #5 messages ($200
 * score -> host, $300 host -> score). A format is therefore data: a player
 * file and a module, no per-format C.
 */
#ifndef EAGLE_RUNNER_H
#define EAGLE_RUNNER_H
#include <stddef.h>
#include <stdint.h>

/* A file a player may open beside the module (DTP_ExtLoad / dos Open):
 * matched by base name, case-insensitively. Copied; clear with
 * eagle_clear_files(). */
int eagle_add_file(const char *name, const uint8_t *data, size_t len);
void eagle_clear_files(void);

/* Boot score with `player` (an AmigaOS hunk executable, as in
 * third-party/uade-3.05/players) and `module`, and run until the player
 * starts sound (AMIGAMSG_START_OUTPUT). `moduleName` is the name the player
 * sees (dtg_PathArrayPtr / file requests). `subsong` < 0 = the player's
 * default. `options` = eagleplayer options (eagleplayer.conf "epopt"), or
 * NULL.
 * Returns 0, or -1 bad arguments / no room, -2 the player is not a hunk
 * executable, -3 the player refused the module (DTP_Check), -4 score died or
 * crashed, -5 no sound within the boot budget. */
int eagle_load(const uint8_t *score, size_t scoreLen,
               const uint8_t *player, size_t playerLen,
               const uint8_t *module, size_t moduleLen, const char *moduleName,
               int subsong, const char *options, int sampleRate);

/* Render interleaved stereo float. `voices` (NULL or 4 planar buffers
 * `stride` floats apart) gets each Paula voice. Returns frames written. */
int eagle_render(float *out, float *voices, int frames, int stride);

/* Mixer mute/solo: bit N set = Paula voice N audible. */
void eagle_set_voice_mask(uint32_t mask);

/* Ask score for another subsong (AMIGAMSG_SETSUBSONG, taken next frame). */
void eagle_set_subsong(int subsong);
int eagle_subsong_min(void);
int eagle_subsong_max(void);
int eagle_subsong_current(void);

/* Song end detection (SCORE_HAVE_SONGEND, on by default): off, the player
 * keeps being called after it reports its end, as UADE with
 * UADE_COMMAND_SONG_END_NOT_POSSIBLE. */
void eagle_set_song_end_detection(int on);

/* Player ticks since the (sub)song started: score calls the player's
 * DTP_Interrupt from CIA-A timer B (UADE counts the same timer,
 * cia.c uade_wasm_on_player_tick). A grid drawn `speed` ticks per row
 * follows playback with row = ticks / speed. */
uint32_t eagle_player_ticks(void);

/* 1 once the player reported its song end. */
int eagle_song_ended(void);
void eagle_stop(void);

/* What the player and score said (diagnostics). */
const char *eagle_player_name(void);
const char *eagle_format_name(void);
const char *eagle_last_message(void);
/* Every text message score sent since the load, one per line. */
const char *eagle_log(void);
/* Observe every custom-chip register write (reg offset, value, PC); NULL
 * to stop. Takes effect at the next eagle_load(). For traces. */
void eagle_set_custom_tap(void (*tap)(uint32_t reg, uint16_t v, uint32_t ppc));

/* Messages score sent that this runner does not implement (e.g. the fake
 * audio.device of MaxTrax-class players): non-zero means the player needs
 * more than this host gives. */
int eagle_unsupported_messages(void);
#endif
