/*
 * eagle_runner.c - UADE's sound core on musashi-host (see eagle_runner.h)
 *
 * The boot block, layout and message handling follow
 * third-party/uade-3.05/src/uade.c (uadecore_reset, uadecore_get_amiga_message,
 * calc_reloc_size) so a player sees exactly the machine it sees in UADE.
 */
#include "eagle_runner.h"
#include "amiga_host.h"

#include "m68k.h"

#include <stdlib.h>
#include <string.h>
#include <strings.h>

/* score's boot block (src/uade.c) */
#define SCORE_MODULE_ADDR      0x100
#define SCORE_MODULE_LEN       0x104
#define SCORE_PLAYER_ADDR      0x108
#define SCORE_RELOC_ADDR       0x10C
#define SCORE_USER_STACK       0x110
#define SCORE_SUPER_STACK      0x114
#define SCORE_FORCE            0x118
#define SCORE_SET_SUBSONG      0x11C
#define SCORE_SUBSONG          0x120
#define SCORE_NTSC             0x124
#define SCORE_MODULE_NAME_ADDR 0x128
#define SCORE_HAVE_SONGEND     0x12C
#define SCORE_POSTPAUSE        0x180
#define SCORE_PREPAUSE         0x184
#define SCORE_DELIMON          0x188
#define SCORE_EXEC_DEBUG       0x18C
#define SCORE_MODULECHANGE     0x198
#define SCORE_OUTPUT_MSG       0x200   /* score -> host (UADECORE_INPUT_MSG in score.s) */
#define SCORE_MIN_SUBSONG      0x204
#define SCORE_MAX_SUBSONG      0x208
#define SCORE_CUR_SUBSONG      0x20C
#define SCORE_INPUT_MSG        0x300   /* host -> score */
#define MODULE_NAME_ADDR       0x400
#define SCORE_ADDR             0x1000
#define USER_STACK_ADDR        0x10000
#define SUPER_STACK_ADDR       0x18000
#define PLAYER_ADDR            0x20000

/* amigamsg ids (score.s / src/include/amigamsg.h) */
enum {
  MSG_SETSUBSONG = 1, MSG_SONG_END, MSG_PLAYERNAME, MSG_MODULENAME, MSG_SUBSINFO,
  MSG_CHECKERROR, MSG_SCORECRASH, MSG_SCOREDEAD, MSG_GENERALMSG, MSG_NTSC,
  MSG_FORMATNAME, MSG_LOADFILE, MSG_READ, MSG_FILESIZE, MSG_TIME_CRITICAL,
  MSG_GET_INFO, MSG_START_OUTPUT, MSG_RESERVED_0, MSG_STATE_DETECTION_INIT,
  MSG_STATE_DETECTION_STEP, MSG_TEST_LOGGING, MSG_DEBUG_U32_STRING,
  MSG_DEBUG_U32_I32_STRING, MSG_AUDIO_DEV_OPEN, MSG_AUDIO_DEV_BEGINIO,
  MSG_AUDIO_DEV_ABORTIO,
};

typedef struct { char *name; uint8_t *data; size_t len; } EagleFile;
#define MAX_FILES 16
static EagleFile g_files[MAX_FILES];
static int g_nfiles;

static int g_loaded, g_startOutput, g_songEnd, g_checkError, g_dead, g_unsupported;
static int g_subMin, g_subMax, g_subCur;
static char g_playerName[128], g_formatName[128], g_lastMsg[256], g_options[256];
static size_t g_optionsLen;
static char g_log[4096];       /* score's text messages since load, '\n'-separated */
static size_t g_logLen;

static void log_line(const char *t) {
  const size_t n = strlen(t);
  if (g_logLen + n + 2 > sizeof g_log) return;
  memcpy(g_log + g_logLen, t, n);
  g_logLen += n;
  g_log[g_logLen++] = '\n';
  g_log[g_logLen] = 0;
}
static int g_sampleRate = 48000;
static int g_songEndDetect = 1;

/* ---- files -------------------------------------------------------------- */
int eagle_add_file(const char *name, const uint8_t *data, size_t len) {
  if (!name || g_nfiles >= MAX_FILES) return -1;
  EagleFile *f = &g_files[g_nfiles];
  f->name = strdup(name);
  f->data = (uint8_t *)malloc(len ? len : 1);
  if (!f->name || !f->data) { free(f->name); free(f->data); return -1; }
  if (len) memcpy(f->data, data, len);
  f->len = len;
  g_nfiles++;
  return 0;
}

void eagle_clear_files(void) {
  for (int i = 0; i < g_nfiles; i++) { free(g_files[i].name); free(g_files[i].data); }
  g_nfiles = 0;
}

static const char *base_name(const char *p) {
  const char *b = p;
  for (const char *s = p; *s; s++) if (*s == '/' || *s == ':') b = s + 1;
  return b;
}

/* The module itself is a file too: players whose modules are executables
 * (Core Design, Dave Lowe) LoadSeg() it by name, which UADE's file lookup
 * answers from the module's own path. */
static EagleFile g_moduleFile;

static const EagleFile *find_file(const char *path) {
  const char *want = base_name(path);
  for (int i = 0; i < g_nfiles; i++)
    if (strcasecmp(base_name(g_files[i].name), want) == 0) return &g_files[i];
  if (g_moduleFile.name && strcasecmp(base_name(g_moduleFile.name), want) == 0) return &g_moduleFile;
  return NULL;
}

/* ---- score <-> host ------------------------------------------------------- */
static int valid_string(uint32_t a) {
  for (; a < AH_RAM_SIZE; a++) if (ah_ram[a] == 0) return 1;
  return 0;
}

static void copy_string(char *dst, size_t cap, uint32_t a) {
  size_t i = 0;
  while (i + 1 < cap && a + i < AH_RAM_SIZE && ah_ram[a + i]) { dst[i] = (char)ah_ram[a + i]; i++; }
  dst[i] = 0;
}

static uint32_t safe_copy(uint32_t dst, const uint8_t *src, size_t len) {
  if (dst >= AH_RAM_SIZE || len > AH_RAM_SIZE - dst) return 0;
  memcpy(ah_ram + dst, src, len);
  return (uint32_t)len;
}

/* uade.c uadecore_get_amiga_message() */
static void score_message(void) {
  const uint32_t msg = ah_rd32(SCORE_OUTPUT_MSG);
  switch (msg) {
    case MSG_SONG_END: g_songEnd = 1; break;
    case MSG_SUBSINFO:
      g_subMin = (int)ah_rd32(SCORE_MIN_SUBSONG);
      g_subMax = (int)ah_rd32(SCORE_MAX_SUBSONG);
      g_subCur = (int)ah_rd32(SCORE_CUR_SUBSONG);
      if (g_subMax < g_subMin) g_subMax = g_subMin;   /* as uade.c: TFMX BC Kid Despair */
      if (g_subCur > g_subMax) g_subMax = g_subCur;   /* Bubble Bobble custom */
      break;
    case MSG_PLAYERNAME: copy_string(g_playerName, sizeof g_playerName, 0x204); break;
    case MSG_MODULENAME: break;
    case MSG_FORMATNAME: copy_string(g_formatName, sizeof g_formatName, 0x204); break;
    case MSG_GENERALMSG: copy_string(g_lastMsg, sizeof g_lastMsg, 0x204); log_line(g_lastMsg); break;
    case MSG_DEBUG_U32_STRING: case MSG_DEBUG_U32_I32_STRING: case MSG_TEST_LOGGING:
    case MSG_TIME_CRITICAL: case MSG_RESERVED_0:
      break;
    case MSG_CHECKERROR: g_checkError = 1; log_line("check failed"); break;
    case MSG_SCORECRASH: g_dead = 1; log_line("score crashed"); break;
    case MSG_SCOREDEAD: g_dead = 1; log_line("score died"); break;
    case MSG_LOADFILE: {
      /* name at *0x204 -> address *0x208, length to 0x20C */
      const uint32_t src = ah_rd32(0x204);
      if (src >= AH_RAM_SIZE || !valid_string(src)) break;
      char name[256]; copy_string(name, sizeof name, src);
      const EagleFile *f = find_file(name);
      if (!f) { log_line("load: file not found:"); log_line(name); break; }
      ah_wr32(0x20C, safe_copy(ah_rd32(0x208), f->data, f->len));
      break;
    }
    case MSG_READ: {
      /* name *0x204, dst *0x208, offset *0x20C, length *0x210 -> read to 0x214 */
      const uint32_t src = ah_rd32(0x204);
      if (src >= AH_RAM_SIZE || !valid_string(src)) break;
      char name[256]; copy_string(name, sizeof name, src);
      const EagleFile *f = find_file(name);
      uint32_t got = 0;
      if (f) {
        const uint32_t off = ah_rd32(0x20C), len = ah_rd32(0x210);
        if (off < f->len) {
          size_t n = len;
          if ((size_t)off + n > f->len) n = f->len - off;
          got = safe_copy(ah_rd32(0x208), f->data + off, n);
        }
      }
      ah_wr32(0x214, got);
      break;
    }
    case MSG_FILESIZE: {
      const uint32_t src = ah_rd32(0x204);
      if (src >= AH_RAM_SIZE || !valid_string(src)) break;
      char name[256]; copy_string(name, sizeof name, src);
      const EagleFile *f = find_file(name);
      ah_wr32(0x208, f ? (uint32_t)f->len : 0);
      ah_wr32(0x20C, f ? 0xFFFFFFFFu : 0);
      break;
    }
    case MSG_GET_INFO: {
      /* query *0x204, dst *0x208, maxlen *0x20C -> result length to 0x20C */
      const uint32_t src = ah_rd32(0x204), dst = ah_rd32(0x208);
      const int32_t len = (int32_t)ah_rd32(0x20C);
      if (src >= AH_RAM_SIZE || !valid_string(src) || len <= 0 || dst >= AH_RAM_SIZE ||
          (uint32_t)len > AH_RAM_SIZE - dst) break;
      char q[64]; copy_string(q, sizeof q, src);
      int32_t ret = -1;
      if (strcasecmp(q, "eagleoptions") == 0) {
        ret = 0;
        if (g_optionsLen > 0 && (int32_t)g_optionsLen <= len) {
          memcpy(ah_ram + dst, g_options, g_optionsLen);
          ret = (int32_t)g_optionsLen;
        }
      }
      ah_wr32(0x20C, (uint32_t)ret);
      break;
    }
    case MSG_START_OUTPUT: g_startOutput = 1; break;
    default: g_unsupported++; log_line("unsupported message"); break;   /* audio.device, state detection */
  }
}

static void (*g_customTap)(uint32_t reg, uint16_t v, uint32_t ppc);

void eagle_set_custom_tap(void (*tap)(uint32_t reg, uint16_t v, uint32_t ppc)) { g_customTap = tap; }

static int trap_hook(int n) {
  if (n == 5) score_message();   /* then the exception runs: score's handler is an RTE */
  return 0;
}

/* uade.c calc_reloc_size(): the summed hunk sizes of an AmigaOS executable. */
static uint32_t reloc_size(const uint8_t *p, size_t len) {
  const size_t words = len / 4;
  size_t i = 0;
#define W(k) (((uint32_t)p[(k) * 4] << 24) | ((uint32_t)p[(k) * 4 + 1] << 16) | ((uint32_t)p[(k) * 4 + 2] << 8) | p[(k) * 4 + 3])
  if (words < 3 || W(0) != 0x3F3u || W(1) != 0) return 0;
  const uint32_t nhunks = W(2) & 0xFFFFu;
  if (!nhunks) return 0;
  i = 5;
  uint32_t offset = 0;
  for (uint32_t h = 0; h < nhunks; h++, i++) {
    if (i >= words) return 0;
    offset += 4 * (W(i) & 0x00FFFFFFu);
  }
#undef W
  if ((int32_t)offset <= 0 || offset >= AH_RAM_SIZE) return 0;
  return offset;
}

int eagle_load(const uint8_t *score, size_t scoreLen,
               const uint8_t *player, size_t playerLen,
               const uint8_t *module, size_t moduleLen, const char *moduleName,
               int subsong, const char *options, int sampleRate) {
  g_loaded = g_startOutput = g_songEnd = g_checkError = g_dead = g_unsupported = 0;
  g_subMin = g_subMax = g_subCur = 0;
  g_playerName[0] = g_formatName[0] = g_lastMsg[0] = g_log[0] = 0;
  g_logLen = 0;
  if (!score || !scoreLen || !player || !playerLen || sampleRate <= 0) return -1;
  g_sampleRate = sampleRate;
  g_optionsLen = 0;
  if (options && *options) {
    /* NUL-separated, as uade.c add_ep_option() packs them */
    size_t n = strlen(options);
    if (n + 1 < sizeof g_options) {
      memcpy(g_options, options, n + 1);
      for (size_t i = 0; i < n; i++) if (g_options[i] == ' ') g_options[i] = 0;
      g_optionsLen = n + 1;
    }
  }

  const AhHooks hooks = { NULL, NULL, trap_hook, g_customTap };
  ah_reset(sampleRate);
  ah_set_hooks(&hooks);
  ah_set_voice_mask(0xF);

  /* uadecore_reset(): player at PLAYER_ADDR, relocated above it, module above that */
  ah_wr32(SCORE_EXEC_DEBUG, 0);
  ah_wr32(SCORE_MODULECHANGE, 0);
  ah_wr32(SCORE_HAVE_SONGEND, (uint32_t)g_songEndDetect);
  if (!safe_copy(PLAYER_ADDR, player, playerLen)) return -1;
  ah_wr32(SCORE_PLAYER_ADDR, PLAYER_ADDR);
  const uint32_t rel = reloc_size(player, playerLen);
  if (!rel) return -2;
  const uint32_t relocAddr = ((PLAYER_ADDR + (uint32_t)playerLen) & 0x7FFFF000u) + 0x4000u;
  const uint32_t modAddr = ((relocAddr + rel) & 0x7FFFF000u) + 0x2000u;
  ah_wr32(SCORE_RELOC_ADDR, relocAddr);
  ah_wr32(SCORE_MODULE_ADDR, modAddr);
  ah_wr32(SCORE_MODULE_LEN, 0);
  ah_wr32(SCORE_MODULE_NAME_ADDR, 0);
  const char *name = moduleName && *moduleName ? moduleName : "module";
  if (module && moduleLen) {
    if (!safe_copy(modAddr, module, moduleLen)) return -1;
    ah_wr32(SCORE_MODULE_LEN, (uint32_t)moduleLen);
  }
  const size_t nl = strlen(name);
  if (nl >= 1024) return -1;
  free(g_moduleFile.name);
  free(g_moduleFile.data);
  memset(&g_moduleFile, 0, sizeof g_moduleFile);
  if (module && moduleLen) {
    g_moduleFile.name = strdup(name);
    g_moduleFile.data = (uint8_t *)malloc(moduleLen);
    if (!g_moduleFile.name || !g_moduleFile.data) return -1;
    memcpy(g_moduleFile.data, module, moduleLen);
    g_moduleFile.len = moduleLen;
  }
  memcpy(ah_ram + MODULE_NAME_ADDR, name, nl + 1);
  ah_wr32(SCORE_MODULE_NAME_ADDR, MODULE_NAME_ADDR);

  if (!safe_copy(SCORE_ADDR, score, scoreLen) || SCORE_ADDR + scoreLen + 0x1000 > USER_STACK_ADDR) return -1;
  ah_wr32(SCORE_FORCE, 0);
  ah_wr32(SCORE_SET_SUBSONG, subsong >= 0 ? 1 : 0);
  ah_wr32(SCORE_SUBSONG, subsong >= 0 ? (uint32_t)subsong : 0);
  ah_wr32(SCORE_NTSC, 0);
  ah_wr32(SCORE_PREPAUSE, 0);
  ah_wr32(SCORE_POSTPAUSE, 0);
  ah_wr32(SCORE_USER_STACK, USER_STACK_ADDR);
  ah_wr32(SCORE_SUPER_STACK, SUPER_STACK_ADDR);
  ah_wr32(SCORE_INPUT_MSG, 0);

  m68k_set_reg(M68K_REG_SR, 0x2700);
  m68k_set_reg(M68K_REG_SP, SCORE_ADDR);
  m68k_set_reg(M68K_REG_PC, SCORE_ADDR);

  /* Run until the player starts its sound; UADE outputs nothing before. */
  float l, r;
  const int budget = sampleRate * 30;
  for (int n = 0; n < budget && !g_startOutput; n++) {
    ah_step(&l, &r, NULL);
    if (g_checkError) return -3;
    if (g_dead) return -4;
  }
  if (!g_startOutput) return -5;
  g_loaded = 1;
  return 0;
}

int eagle_render(float *out, float *voices, int frames, int stride) {
  if (!g_loaded) {
    memset(out, 0, (size_t)frames * 2 * sizeof(float));
    if (voices) for (int v = 0; v < 4; v++) memset(voices + (size_t)v * stride, 0, (size_t)frames * sizeof(float));
    return frames;
  }
  float vs[4];
  for (int i = 0; i < frames; i++) {
    ah_step(&out[2 * i], &out[2 * i + 1], voices ? vs : NULL);
    if (voices) for (int v = 0; v < 4; v++) voices[v * stride + i] = vs[v];
  }
  return frames;
}

void eagle_set_voice_mask(uint32_t mask) { ah_set_voice_mask(mask); }

void eagle_set_subsong(int subsong) {
  if (!g_loaded) return;
  ah_wr32(SCORE_SUBSONG, (uint32_t)subsong);
  ah_wr32(SCORE_INPUT_MSG, MSG_SETSUBSONG);
  g_songEnd = 0;
  g_subCur = subsong;
}

void eagle_set_song_end_detection(int on) {
  g_songEndDetect = on ? 1 : 0;
  if (g_loaded) ah_wr32(SCORE_HAVE_SONGEND, (uint32_t)g_songEndDetect);
}

int eagle_subsong_min(void) { return g_subMin; }
int eagle_subsong_max(void) { return g_subMax; }
int eagle_subsong_current(void) { return g_subCur; }
int eagle_song_ended(void) { return g_songEnd; }
void eagle_stop(void) { g_loaded = 0; }
const char *eagle_player_name(void) { return g_playerName; }
const char *eagle_format_name(void) { return g_formatName; }
const char *eagle_last_message(void) { return g_lastMsg; }
const char *eagle_log(void) { return g_log; }
int eagle_unsupported_messages(void) { return g_unsupported; }
