/*
 * eagle_cli.c - native command-line driver for the eagleplayer runner
 *
 *   musashi-host/tools/build_eagle_cli.sh
 *   eagle_cli <player> <module> <moduleName> <seconds> [out.f32] [--sub N]
 *             [--noend] [--advance] [--trace REG[,REG..]] [--from SEC] [--dump SEC ram.bin]
 *
 * Renders at 48 kHz (interleaved float stereo to out.f32) and, with --trace,
 * prints every write to the given custom registers (hex offsets from $DFF000,
 * e.g. 0a8 = AUD0VOL, 096 = DMACON) with time and PC. Same code as the wasm
 * (musashi-host + UADE's score), so a divergence found here is the engine's.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "eagle_runner.h"
#include "amiga_host.h"

static uint32_t g_trace[32];
static int g_ntrace;
static double g_from;

static void tap(uint32_t reg, uint16_t v, uint32_t ppc) {
  for (int i = 0; i < g_ntrace; i++) {
    if (g_trace[i] != reg) continue;
    const double t = ah_colour_clocks() / AH_PAULA_HZ;
    if (t >= g_from) printf("%10.5f  %03X = %04X  pc %06X\n", t, reg, v, ppc);
  }
}

static uint8_t *slurp(const char *p, size_t *n) {
  FILE *f = fopen(p, "rb");
  if (!f) { perror(p); exit(1); }
  fseek(f, 0, SEEK_END); *n = (size_t)ftell(f); fseek(f, 0, SEEK_SET);
  uint8_t *b = malloc(*n ? *n : 1);
  if (fread(b, 1, *n, f) != *n) { perror(p); exit(1); }
  fclose(f);
  return b;
}

int main(int argc, char **argv) {
  if (argc < 5) { fprintf(stderr, "usage: eagle_cli player module name seconds [out.f32] [--sub N] [--noend] [--advance] [--trace REG,..] [--from SEC]\n"); return 2; }
  const char *out = NULL;
  int sub = -1, noend = 0, advance = 0;
  double dumpAt = -1; const char *dumpFile = NULL;
  for (int i = 5; i < argc; i++) {
    if (!strcmp(argv[i], "--sub") && i + 1 < argc) sub = atoi(argv[++i]);
    else if (!strcmp(argv[i], "--noend")) noend = 1;
    else if (!strcmp(argv[i], "--advance")) advance = 1;   /* next subsong at song end, as UADE's frontend */
    else if (!strcmp(argv[i], "--from") && i + 1 < argc) g_from = atof(argv[++i]);
    else if (!strcmp(argv[i], "--dump") && i + 2 < argc) { dumpAt = atof(argv[++i]); dumpFile = argv[++i]; }
    else if (!strcmp(argv[i], "--trace") && i + 1 < argc) {
      for (char *t = strtok(argv[++i], ","); t && g_ntrace < 32; t = strtok(NULL, ",")) g_trace[g_ntrace++] = (uint32_t)strtoul(t, NULL, 16);
    } else out = argv[i];
  }
  size_t sl, pl, ml;
  extern const unsigned char g_uade_score[]; extern const size_t g_uade_score_len;
  uint8_t *player = slurp(argv[1], &pl), *module = slurp(argv[2], &ml);
  if (g_ntrace) eagle_set_custom_tap(tap);
  if (noend) eagle_set_song_end_detection(0);
  (void)sl;
  const int r = eagle_load(g_uade_score, g_uade_score_len, player, pl, module, ml, argv[3], sub, NULL, 48000);
  fprintf(stderr, "load %d player \"%s\" subsongs %d..%d cur %d\n%s", r, eagle_player_name(),
          eagle_subsong_min(), eagle_subsong_max(), eagle_subsong_current(), eagle_log());
  if (r) return 1;
  const int frames = (int)(atof(argv[4]) * 48000);
  float *buf = malloc((size_t)frames * 2 * sizeof(float));
  if (dumpFile) {
    /* chip RAM after `dumpAt` seconds of output */
    const int at = (int)(dumpAt * 48000) < frames ? (int)(dumpAt * 48000) : frames;
    eagle_render(buf, NULL, at, 0);
    FILE *f = fopen(dumpFile, "wb"); fwrite(ah_ram, 1, AH_RAM_SIZE, f); fclose(f);
    eagle_render(buf + (size_t)at * 2, NULL, frames - at, 0);
  } else if (advance) {
    for (int at = 0; at < frames; at += 480) {
      const int n = frames - at < 480 ? frames - at : 480;
      eagle_render(buf + (size_t)at * 2, NULL, n, 0);
      if (eagle_song_ended() && eagle_subsong_current() < eagle_subsong_max()) {
        fprintf(stderr, "song end at %.2f s -> subsong %d\n", (at + n) / 48000.0, eagle_subsong_current() + 1);
        eagle_set_subsong(eagle_subsong_current() + 1);
      }
    }
  } else {
    eagle_render(buf, NULL, frames, 0);
  }
  double s = 0; for (int i = 0; i < frames * 2; i++) s += buf[i] * buf[i];
  fprintf(stderr, "cia irqs A.ta %u A.tb %u B.ta %u B.tb %u\n", ah_cia_timer_irqs(0, 0), ah_cia_timer_irqs(0, 1), ah_cia_timer_irqs(1, 0), ah_cia_timer_irqs(1, 1));
  fprintf(stderr, "rms %.4f ended %d\n", frames ? __builtin_sqrt(s / (frames * 2)) : 0.0, eagle_song_ended());
  if (out) { FILE *f = fopen(out, "wb"); fwrite(buf, sizeof(float), (size_t)frames * 2, f); fclose(f); }
  return 0;
}
