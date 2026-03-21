// decode_uade_regs.c — Decode UADE --write-audio binary to text register log
// Usage: decode_uade_regs <uade_regs.bin> [max_events]
//
// Output format matches our test_lockstep.c output for easy diffing.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

// UADE event types (from write_audio_ext.h)
enum { PET_NONE=0, PET_VOL=1, PET_PER=2, PET_DAT=3, PET_LEN=4,
       PET_LCH=5, PET_LCL=6, PET_LOOP=7, PET_OUTPUT=8, PET_START_BUFFER=9 };

static const char *event_names[] = {
    "NONE","VOL","PER","DAT","LEN","LCH","LCL","LOOP","OUTPUT","START_BUF"
};

static uint16_t be16(const uint8_t *p) { return (p[0]<<8)|p[1]; }
static int32_t  be32(const uint8_t *p) { return (int32_t)((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3]); }

int main(int argc, char *argv[]) {
    if (argc < 2) { fprintf(stderr, "Usage: %s <uade_regs.bin> [max_events]\n", argv[0]); return 1; }
    int max_events = argc > 2 ? atoi(argv[2]) : 100000;

    FILE *f = fopen(argv[1], "rb");
    if (!f) { fprintf(stderr, "Cannot open %s\n", argv[1]); return 1; }
    fseek(f, 0, SEEK_END); long fsize = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *data = malloc(fsize); fread(data, 1, fsize, f); fclose(f);

    // Skip header: struct uade_write_audio_header = 16 bytes (magic[16])
    int pos = 0;
    if (fsize >= 16 && memcmp(data, "uade_osc_0", 10) == 0) {
        pos = 16;
    }

    // The header may have additional bytes before frames start.
    // Frames are 12 bytes each (4 tdelta + 8 data).
    // Actually, looking at the struct: sizeof(uade_write_audio_frame) = 12
    // tdelta=4 bytes, data=8 bytes. Total = 12.
    // But the struct has __attribute__((packed)) and union is max(8,4)=8.
    // Actually: int32_t tdelta (4) + union { int16_t[4]=8, struct{1+1+2}=4 } = 4 + 8 = 12

    // Track current time and channel state
    uint32_t abs_time = 0;
    uint16_t ch_per[4] = {0};
    uint16_t ch_vol[4] = {0};
    uint32_t ch_lc[4] = {0};  // sample address (LC high + low)
    uint16_t ch_len[4] = {0};
    int tick_count = 0;
    int event_count = 0;

    // CIA timer rate: 709379 / 7104 ≈ 99.86 Hz → ~7104 CPU cycles per tick
    // UADE uses CPU cycle-based timing
    uint32_t cycles_per_tick = 7104; // Steve Turner timer

    printf("# UADE register log decoded from %s\n", argv[1]);
    printf("# Format: time event ch value\n\n");

    while (pos + 12 <= fsize && event_count < max_events) {
        uint8_t *frame = data + pos;
        int32_t tdelta_raw = be32(frame);
        uint8_t cc = (tdelta_raw >> 24) & 0xFF;
        uint32_t tdelta = tdelta_raw & 0x00FFFFFF;

        if (cc & 0x80) {
            // Paula event (MSB set)
            int8_t channel = frame[4];
            int8_t event_type = frame[5];
            uint16_t value = be16(frame + 6);
            // Bytes 8-11 are unused padding in the union

            abs_time += tdelta;
            int tick = abs_time / cycles_per_tick;

            if (event_type >= 0 && event_type < 10) {
                // Update tracked state
                switch (event_type) {
                    case PET_VOL: ch_vol[channel & 3] = value; break;
                    case PET_PER: ch_per[channel & 3] = value; break;
                    case PET_LEN: ch_len[channel & 3] = value; break;
                    case PET_LCH: ch_lc[channel & 3] = (ch_lc[channel & 3] & 0xFFFF) | ((uint32_t)value << 16); break;
                    case PET_LCL: ch_lc[channel & 3] = (ch_lc[channel & 3] & 0xFFFF0000) | value; break;
                }

                printf("T%04d %7s ch%d val=%5d  (abs_cyc=%u)\n",
                    tick, event_names[event_type], channel & 3, value, abs_time);
            }
            event_count++;
        } else if (cc == 0x00) {
            // Audio output sample — skip (we only care about events)
            abs_time += tdelta;
        } else {
            // Unknown frame type
            abs_time += tdelta;
        }

        pos += 12;
    }

    // Print final state
    printf("\n# Final channel state:\n");
    for (int c = 0; c < 4; c++) {
        printf("# ch%d: per=%5d vol=%3d len=%5d lc=0x%08X\n",
            c, ch_per[c], ch_vol[c], ch_len[c], ch_lc[c]);
    }

    free(data);
    return 0;
}
