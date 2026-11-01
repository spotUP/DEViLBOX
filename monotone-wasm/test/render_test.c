// Native harness: mono per-tick dump. Usage: render_test file.MON [ticks]
#include "../src/monotone.h"
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char** argv) {
    if (argc < 2) return 2;
    FILE* f = fopen(argv[1], "rb"); if (!f) return 2;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t* d = malloc(n); fread(d, 1, n, f); fclose(f);
    int ticks = argc > 2 ? atoi(argv[2]) : 40;
    MtModule* m = mt_create(d, n, 48000);
    if (!m) { fprintf(stderr, "parse failed\n"); return 1; }
    printf("title=\"%s\" tracks=%d patterns=%d\n", mt_get_title(m), mt_track_count(m), mt_get_pattern_count(m));
    printf("tick order row track divisor freq_hz\n");
    for (int t = 1; t <= ticks; t++) {
        mt_tick(m);
        printf("%4d %3d %3d %3d %6d %9.2f\n", t, mt_get_position(m), mt_get_row(m),
               mt_get_sounding_track(m), mt_get_divisor(m), mt_get_frequency(m));
    }
    uint8_t* o = malloc(n + 16); size_t w = mt_export(m, o, n + 16);
    int same = w == (size_t)n; for (long i = 0; same && i < n; i++) same = o[i] == d[i];
    printf("export byte-exact: %s\n", same ? "yes" : "NO");
    mt_destroy(m);
    return 0;
}
