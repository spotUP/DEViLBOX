/*
 * nuade_wasm.c - the C exports the Nuade worklet and the node tests call.
 *
 * One playing song per instance, plus the next song an edit swaps in (nw_next_*). The pristine upstream tree is third-party/nuade; this file is only ours.
 * Plan: thoughts/shared/plans/2026-10-13-nuade-engine.md (D3).
 *
 * Voice mask: bit N set = voice N audible (same sense as the EaglePlayer mask). A muted voice is taken out of the
 * stereo mix here; its voice buffer is still filled, so isolation and the per-voice scopes keep their signal.
 *
 * Edit slot: nw_caps() is a bitmask. At the pinned upstream only NW_CAP_STATE_READ can be set. nw_cell_write and
 * nw_instrument_write return -ENOSYS until upstream publishes a write API; they then forward to it and set the bit.
 */
#include <emscripten/emscripten.h>
#include <errno.h>
#include <malloc.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include "nuade/nuade.h"

#define NW_MAX_VOICES 64
#define NW_SNAPSHOT_MAX_VOICES 32
#define NW_FILES_MAX 256

#define NW_CAP_STATE_READ 1
#define NW_CAP_CELL_WRITE 2
#define NW_CAP_INSTRUMENT_WRITE 4
#define NW_CAP_MODULE_WRITE 8

static uint32_t s_rate = 48000;
static NuadeSong* s_song = NULL;
static NuadeSong* s_next = NULL; /* the song an edit swaps in, see nw_next_open */
static char s_error[160] = "";
static uint32_t s_flags = 0;
static uint32_t s_mask = 0xFFFFFFFFu;
static float s_separation = 1.0f;
static int s_repeat = -1; /* nw_set_repeat value, -1 = never set (nuade default) */
static uint32_t s_subsong_count = 0, s_default_subsong = 0, s_voice_count = 0;

/* ---- companion files in memory (the NuadeIo the player reads samples / instruments through) ---- */
typedef struct {
  char name[256];
  uint8_t *data;
  size_t len;
} NwFile;
static NwFile s_files[NW_FILES_MAX];
static int s_file_count = 0;

static const char *base_name(const char *url) {
  const char *b = url;
  for (const char *p = url; *p; p++)
    if (*p == '/' || *p == '\\') b = p + 1;
  return b;
}
static NwFile *find_file(const char *url) {
  const char *b = base_name(url);
  for (int i = 0; i < s_file_count; i++)
    if (strcasecmp(s_files[i].name, b) == 0) return &s_files[i];
  return NULL;
}
static bool io_exists(struct NuadeIoPrivate *self, const char *url) {
  (void)self;
  return find_file(url) != NULL;
}
static NuadeIoReadResult io_read(struct NuadeIoPrivate *self, const char *url) {
  (void)self;
  NuadeIoReadResult r = {0, 0};
  NwFile *f = find_file(url);
  if (!f) return r;
  uint8_t *copy = (uint8_t *)malloc(f->len ? f->len : 1);
  if (!copy) return r;
  memcpy(copy, f->data, f->len);
  r.data = copy;
  r.size = f->len;
  return r;
}
static void io_free(struct NuadeIoPrivate *self, void *memory) {
  (void)self;
  free(memory);
}
static bool io_list(struct NuadeIoPrivate *self, const char *url, NuadeIoDirVisitor visit, void *ctx) {
  (void)self;
  (void)url;
  for (int i = 0; i < s_file_count; i++) visit(s_files[i].name, false, ctx);
  return true;
}
static const NuadeIo s_io = {NUADE_IO_API_VERSION, NULL, io_exists, io_read, io_free, io_list};

EMSCRIPTEN_KEEPALIVE void nw_init(int sampleRate) {
  if (sampleRate > 0) s_rate = (uint32_t)sampleRate;
}

EMSCRIPTEN_KEEPALIVE int nw_add_file(const char *name, const uint8_t *data, int len) {
  if (!name || len < 0 || s_file_count >= NW_FILES_MAX) return -1;
  NwFile *f = find_file(name);
  if (f) {
    free(f->data);
  } else {
    f = &s_files[s_file_count++];
  }
  strncpy(f->name, base_name(name), sizeof f->name - 1);
  f->name[sizeof f->name - 1] = 0;
  f->data = (uint8_t *)malloc(len ? (size_t)len : 1);
  if (!f->data) return -1;
  memcpy(f->data, data, (size_t)len);
  f->len = (size_t)len;
  return 0;
}

EMSCRIPTEN_KEEPALIVE void nw_clear_files(void) {
  for (int i = 0; i < s_file_count; i++) free(s_files[i].data);
  s_file_count = 0;
}

EMSCRIPTEN_KEEPALIVE void nw_close(void) {
  if (s_next) nuade_close(s_next);
  s_next = NULL;
  if (s_song) nuade_close(s_song);
  s_song = NULL;
  s_voice_count = s_subsong_count = s_default_subsong = 0;
}

EMSCRIPTEN_KEEPALIVE const char *nw_last_error(void) { return s_error; }

/* Opens `data` into `*slot` (which must be empty). 0 ok, -1 bad arguments, -2 open failed (nw_last_error). */
static int open_into(NuadeSong **slot, const uint8_t *data, int len, const char *name, const char *playerId) {
  s_error[0] = 0;
  if (!data || len <= 0) {
    strcpy(s_error, "empty module");
    return -1;
  }
  const NuadePlayer *forced = NULL;
  if (playerId && playerId[0]) {
    forced = nuade_player_find(playerId);
    if (!forced) {
      snprintf(s_error, sizeof s_error, "unknown player %s", playerId);
      return -2;
    }
  }
  /* The song is also a file of its own: players derive companion names from it. */
  const char *path = (name && name[0]) ? name : "song";
  nw_add_file(path, data, len);
  NuadeOpenParams p;
  memset(&p, 0, sizeof p);
  p.path = path;
  p.data = data;
  p.size = (size_t)len;
  p.io = &s_io;
  p.player = forced;
  NuadeSongResult r = nuade_open_ex(&p);
  if (!r.song) {
    snprintf(s_error, sizeof s_error, "%s", r.error.message[0] ? r.error.message : "nuade open failed");
    return -2;
  }
  *slot = r.song;
  nuade_set_stereo_separation(r.song, s_separation);
  return 0;
}

static void adopt_info(void) {
  const NuadeSongInfo *info = nuade_info(s_song);
  s_voice_count = info->voice_count > NW_MAX_VOICES ? NW_MAX_VOICES : info->voice_count;
  s_subsong_count = info->subsong_count;
  s_default_subsong = info->default_subsong;
}

/* 0 ok, -1 bad arguments, -2 open failed (nw_last_error). `playerId` forces one player ("" or NULL probes all). */
EMSCRIPTEN_KEEPALIVE int nw_open(const uint8_t *data, int len, const char *name, const char *playerId) {
  nw_close();
  s_repeat = -1; /* a new song starts on nuade's default repeat count */
  const int r = open_into(&s_song, data, len, name, playerId);
  if (r == 0) adopt_info();
  return r;
}

/* ---- the next song: an edited module caught up to the playing one's position while that one keeps playing ----
 * nuade has no copy of a player's state, so the only way to a position is to render forward to it (nuade_seek, about
 * 1 ms per second of song). A host that must not block its audio thread opens the edited module here, advances it a
 * bounded number of frames per render call (nw_next_advance) until it stands at the playing song's position, then
 * hands over (nw_next_commit): the next nw_render continues from the same frame on the new module. The playing song
 * and every nw_* call on it are untouched until the commit. The next song shares the file table and the settings. */
EMSCRIPTEN_KEEPALIVE void nw_next_close(void) {
  if (s_next) nuade_close(s_next);
  s_next = NULL;
}

/* Opens the next song and starts `subsong` on it. 0 ok, -1 bad arguments, -2 open failed, -3 start failed. */
EMSCRIPTEN_KEEPALIVE int nw_next_open(const uint8_t *data, int len, const char *name, const char *playerId, int subsong) {
  nw_next_close();
  const int r = open_into(&s_next, data, len, name, playerId);
  if (r != 0) return r;
  if (s_repeat >= 0) nuade_set_repeat_count(s_next, (uint32_t)s_repeat); /* as the playing song */
  if (!nuade_start(s_next, (uint32_t)subsong, s_rate)) {
    snprintf(s_error, sizeof s_error, "start failed for subsong %d", subsong);
    nw_next_close();
    return -3;
  }
  return 0;
}

/* Restart the next song on `subsong` (the playing song changed subsong or rewound). 1 ok. */
EMSCRIPTEN_KEEPALIVE int nw_next_start(int subsong) {
  return s_next && nuade_start(s_next, (uint32_t)subsong, s_rate) ? 1 : 0;
}

/* Render the next song forward toward `target` without output, at most `maxFrames` frames (a target behind it
 * restarts it first). Returns its position afterwards, -1 without a next song. */
EMSCRIPTEN_KEEPALIVE double nw_next_advance(double target, int maxFrames) {
  if (!s_next) return -1.0;
  uint64_t to = (uint64_t)target;
  const uint64_t at = nuade_position(s_next);
  if (to > at && maxFrames > 0 && to - at > (uint64_t)maxFrames) to = at + (uint64_t)maxFrames;
  nuade_seek(s_next, to);
  return (double)nuade_position(s_next);
}

EMSCRIPTEN_KEEPALIVE double nw_next_position(void) { return s_next ? (double)nuade_position(s_next) : -1.0; }

/* The next song becomes the playing one (the playing one is closed). 1 ok, 0 without a next song. */
EMSCRIPTEN_KEEPALIVE int nw_next_commit(void) {
  if (!s_next) return 0;
  if (s_song) nuade_close(s_song);
  s_song = s_next;
  s_next = NULL;
  adopt_info();
  return 1;
}

EMSCRIPTEN_KEEPALIVE int nw_start(int subsong) {
  if (!s_song) return 0;
  return nuade_start(s_song, (uint32_t)subsong, s_rate) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int nw_voice_count(void) { return (int)s_voice_count; }
EMSCRIPTEN_KEEPALIVE int nw_subsong_count(void) { return (int)s_subsong_count; }
EMSCRIPTEN_KEEPALIVE int nw_default_subsong(void) { return (int)s_default_subsong; }
EMSCRIPTEN_KEEPALIVE int nw_last_flags(void) { return (int)s_flags; }
EMSCRIPTEN_KEEPALIVE double nw_position(void) { return s_song ? (double)nuade_position(s_song) : 0.0; }
EMSCRIPTEN_KEEPALIVE int nw_seek(double frame) { return s_song && nuade_seek(s_song, (uint64_t)frame) ? 1 : 0; }

EMSCRIPTEN_KEEPALIVE void nw_set_repeat(int n) {
  s_repeat = n < 0 ? 0 : n;
  if (s_song) nuade_set_repeat_count(s_song, (uint32_t)s_repeat);
}
EMSCRIPTEN_KEEPALIVE int nw_set_separation(float x) {
  if (x < 0.0f || x > 1.0f) return 0;
  s_separation = x;
  return s_song ? (nuade_set_stereo_separation(s_song, x) ? 1 : 0) : 1;
}
EMSCRIPTEN_KEEPALIVE void nw_set_mute_mask(int mask) { s_mask = (uint32_t)mask; }

/* The pan each voice has in the stereo mix right now (-1 left .. 1 right, separation applied). A tick player's mixer
 * pans each voice with the pan its snapshot reports; a self-rendering player has no per-voice pan to read, so the
 * Amiga's L R R L is assumed. */
static void current_pans(float *out, uint32_t count) {
  NuadeVoiceView views[NW_SNAPSHOT_MAX_VOICES];
  memset(views, 0, sizeof views);
  const NuadePlayer *pl = nuade_player(s_song);
  const bool ticked = pl && pl->tick != NULL;
  NuadeSnapshotResult snap;
  memset(&snap, 0, sizeof snap);
  if (ticked) snap = nuade_snapshot(s_song, nuade_position(s_song), views, NW_SNAPSHOT_MAX_VOICES);
  for (uint32_t v = 0; v < count; v++) {
    float pan = (v == 0 || v == 3) ? -1.0f : 1.0f;
    if (ticked && snap.valid && v < NW_SNAPSHOT_MAX_VOICES) pan = views[v].pan;
    if (pan < -1.0f) pan = -1.0f;
    if (pan > 1.0f) pan = 1.0f;
    out[v] = pan * s_separation;
  }
}

EMSCRIPTEN_KEEPALIVE int nw_pans(float *out, int cap) {
  if (!s_song || !out || cap <= 0) return 0;
  uint32_t n = s_voice_count < (uint32_t)cap ? s_voice_count : (uint32_t)cap;
  current_pans(out, n);
  return (int)n;
}

/* Take the muted voices' contribution out of the stereo mix. */
static void remove_muted(float *stereo, float *const *voices, uint32_t frames) {
  float pans[NW_MAX_VOICES];
  current_pans(pans, s_voice_count);
  for (uint32_t v = 0; v < s_voice_count; v++) {
    if (v < 32 && (s_mask >> v) & 1u) continue;
    const float gl = 0.5f * (1.0f - pans[v]), gr = 0.5f * (1.0f + pans[v]);
    const float *src = voices[v];
    for (uint32_t i = 0; i < frames; i++) {
      stereo[i * 2] -= src[i] * gl;
      stereo[i * 2 + 1] -= src[i] * gr;
    }
  }
}

static float *s_scratch = NULL;
static uint32_t s_scratch_frames = 0;

/* Renders `frames` stereo frames into `stereo` (interleaved). `voices` is NULL or voice_count planar mono buffers
 * `stride` floats apart. Returns frames written; nw_last_flags() has the NuadeRenderFlags (1 looped, 2 ended). */
EMSCRIPTEN_KEEPALIVE int nw_render(float *stereo, float *voices, int frames, int stride) {
  if (!s_song || !stereo || frames <= 0) return 0;
  const uint32_t n = (uint32_t)frames;
  const uint32_t full = s_voice_count >= 32 ? 0xFFFFFFFFu : ((1u << s_voice_count) - 1u);
  const bool muting = (s_mask & full) != full;
  float *ptrs[NW_MAX_VOICES];
  float *base = voices;
  uint32_t st = (uint32_t)(stride < frames ? frames : stride);
  if (!base && muting) {
    if (s_scratch_frames < n) {
      free(s_scratch);
      s_scratch = (float *)malloc((size_t)NW_MAX_VOICES * n * sizeof(float));
      s_scratch_frames = s_scratch ? n : 0;
      if (!s_scratch) return 0;
    }
    base = s_scratch;
    st = n;
  }
  if (base)
    for (uint32_t v = 0; v < s_voice_count; v++) ptrs[v] = base + (size_t)v * st;
  NuadeRenderResult r = nuade_render(s_song, stereo, base ? ptrs : NULL, n);
  s_flags = r.flags;
  if (muting && base && r.frames) remove_muted(stereo, ptrs, r.frames);
  return (int)r.frames;
}

/* 10 int32 header [valid, order, pattern, row, tick, speed, tempo, voices, mode, rows], then per voice 5 words:
 * note, instrument, volume (float bits), pan (float bits), active. Returns valid (0/1). */
EMSCRIPTEN_KEEPALIVE int nw_snapshot(double frame, int32_t *out) {
  if (!s_song || !out) return 0;
  NuadeVoiceView views[NW_SNAPSHOT_MAX_VOICES];
  memset(views, 0, sizeof views);
  NuadeSnapshotResult r = nuade_snapshot(s_song, (uint64_t)frame, views, NW_SNAPSHOT_MAX_VOICES);
  memset(out, 0, 10 * sizeof(int32_t));
  if (!r.valid) return 0;
  uint32_t nv = r.snapshot.voice_count > NW_SNAPSHOT_MAX_VOICES ? NW_SNAPSHOT_MAX_VOICES : r.snapshot.voice_count;
  const NuadePosition *p = &r.snapshot.position;
  out[0] = 1;
  out[1] = (int32_t)p->order;
  out[2] = (int32_t)p->pattern;
  out[3] = (int32_t)p->row;
  out[4] = (int32_t)p->tick;
  out[5] = (int32_t)p->speed;
  out[6] = (int32_t)p->tempo;
  out[7] = (int32_t)nv;
  out[8] = (int32_t)p->mode;
  out[9] = (int32_t)p->rows;
  for (uint32_t v = 0; v < nv; v++) {
    int32_t *w = out + 10 + v * 5;
    w[0] = views[v].info.note;
    w[1] = views[v].info.instrument;
    memcpy(&w[2], &views[v].volume, 4);
    memcpy(&w[3], &views[v].pan, 4);
    w[4] = views[v].active ? 1 : 0;
  }
  return 1;
}

EMSCRIPTEN_KEEPALIVE int nw_vu(float *out, int cap) {
  if (!s_song || !out || cap <= 0) return 0;
  return (int)nuade_vu(s_song, out, (uint32_t)cap);
}

EMSCRIPTEN_KEEPALIVE const char *nw_meta(const char *key) {
  const char *v = s_song ? nuade_meta(s_song, key) : NULL;
  return v ? v : "";
}
EMSCRIPTEN_KEEPALIVE int nw_instrument_count(void) { return s_song ? (int)nuade_instrument_count(s_song) : 0; }
EMSCRIPTEN_KEEPALIVE const char *nw_instrument_name(int n) {
  uint32_t idx = 0;
  const char *s = s_song ? nuade_instrument_name(s_song, (uint32_t)n, &idx) : NULL;
  return s ? s : "";
}
EMSCRIPTEN_KEEPALIVE int nw_instrument_index(int n) {
  uint32_t idx = 0;
  if (s_song && nuade_instrument_name(s_song, (uint32_t)n, &idx)) return (int)idx;
  return -1;
}

EMSCRIPTEN_KEEPALIVE const char *nw_player_id(void) {
  const NuadePlayer *p = s_song ? nuade_player(s_song) : NULL;
  return p ? p->id : "";
}
EMSCRIPTEN_KEEPALIVE const char *nw_player_name(void) {
  const NuadePlayer *p = s_song ? nuade_player(s_song) : NULL;
  return p ? p->name : "";
}
EMSCRIPTEN_KEEPALIVE int nw_player_count(void) { return (int)nuade_player_count(); }
EMSCRIPTEN_KEEPALIVE const char *nw_player_id_at(int i) {
  const NuadePlayer *p = nuade_player_get((uint32_t)i);
  return p ? p->id : "";
}

/* The id of the first compiled-in player whose probe says Supported for these bytes, "" if none. */
EMSCRIPTEN_KEEPALIVE const char *nw_probe(const uint8_t *data, int len, const char *name) {
  if (!data || len <= 0) return "";
  for (uint32_t i = 0; i < nuade_player_count(); i++) {
    const NuadePlayer *p = nuade_player_get(i);
    if (p && p->probe && p->probe(data, (size_t)len, name) == NuadeProbe_Supported) return p->id;
  }
  return "";
}

/* One named player's probe: 0 supported, 1 unsupported, 2 unsure, -1 no such player. */
EMSCRIPTEN_KEEPALIVE int nw_probe_with(const char *playerId, const uint8_t *data, int len, const char *name) {
  const NuadePlayer *p = playerId ? nuade_player_find(playerId) : NULL;
  if (!p || !p->probe || !data || len <= 0) return -1;
  return (int)p->probe(data, (size_t)len, name);
}

/* ---- edit slot ---- */
static void *state_ptr(void) { return s_song ? nuade_player_data(s_song) : NULL; }

EMSCRIPTEN_KEEPALIVE int nw_caps(void) {
  /* The typed <id>_from_nuade state exists in every player at the pin. No write API is published yet. */
  return state_ptr() ? NW_CAP_STATE_READ : 0;
}
/* Bytes the player's state allocation holds (all players calloc one struct), 0 if none. */
EMSCRIPTEN_KEEPALIVE int nw_state_size(void) {
  void *p = state_ptr();
  return p ? (int)malloc_usable_size(p) : 0;
}
/* Copies len bytes at offset of the player's state struct into out. Bounded by the allocation. -1 out of range. */
EMSCRIPTEN_KEEPALIVE int nw_state_read(int offset, int len, uint8_t *out) {
  void *p = state_ptr();
  if (!p || !out || offset < 0 || len < 0) return -1;
  if ((size_t)offset + (size_t)len > malloc_usable_size(p)) return -1;
  memcpy(out, (const uint8_t *)p + offset, (size_t)len);
  return len;
}
EMSCRIPTEN_KEEPALIVE int nw_cell_write(int pattern, int row, int channel, const int32_t *cellValues, int count) {
  (void)pattern; (void)row; (void)channel; (void)cellValues; (void)count;
  return -ENOSYS;
}
EMSCRIPTEN_KEEPALIVE int nw_instrument_write(int instrument, int param, int value) {
  (void)instrument; (void)param; (void)value;
  return -ENOSYS;
}
