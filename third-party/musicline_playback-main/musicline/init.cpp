#include "defines.h"
#include "tables.h"
#include <math.h>

void InitRoutine(void) {
    int i;

    // calc size/offset tables
    //
    SizerTab(&SizerTable256[0], &SizerOffset256[0], 256);
    SizerTab(&SizerTable128[0], &SizerOffset128[0], 128);
    SizerTab(&SizerTable64[0], &SizerOffset64[0], 64);
    SizerTab(&SizerTable32[0], &SizerOffset32[0], 32);
    SizerTab(&SizerTable16[0], &SizerOffset16[0], 16);

    // init fx jump table
    //
    for (i = 0; i < 256; i++) {
        ZeroChannel.Data[i].Fx = 0x0010;
    }

    for (i = 0; i < 2048; i++) {
        ZeroBuffer[i] = 0;
    }
    for (i = 0; i < 65536; i++)
        VecSinus[i] = (float)sin(i * 3.1415 / 180 * 360 / 65536);
}

void SizerTab(unsigned char* sizetab, unsigned short* offstab, unsigned short size) {
    int i, j, k;

    k = 0;

    for (i = 1; i < size; i++) {
        for (j = 1; j <= i; j++) {
            *sizetab++ = ((j * size) / i) - 1;
        }

        *offstab++ = k;

        k += i;
    }
}
