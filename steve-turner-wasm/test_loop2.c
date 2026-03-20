#include <stdio.h>
#include <stdlib.h>
#include "src/steveturner/steveturner.h"
#include "src/steveturner/paula_soft.h"
int main(int argc, char *argv[]) {
    FILE *f = fopen(argv[1], "rb");
    fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *data = malloc(len); fread(data, 1, len, f); fclose(f);
    st_init(); st_load(data, (int)len);
    paula_set_output_rate(44100.0f);
    st_set_subsong(1);
    float buf[256*2];
    for (int tick = 0; tick < 6000; tick++) {
        int spt = 44100/100; // 100Hz
        int rem = spt;
        while (rem > 0) { int c = rem>128?128:rem; paula_render(buf,c); rem-=c; }
        st_tick();
        if (tick % 500 == 0)
            printf("Tick %4d: finished=%d\n", tick, st_is_finished());
    }
    printf("Final: finished=%d\n", st_is_finished());
    st_stop(); free(data);
}
