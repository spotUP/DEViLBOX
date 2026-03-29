// Aeolus global.h — Modified for WASM (always little-endian, no OS deps)
// Original: Copyright (C) 2003-2022 Fons Adriaensen <fons@linuxaudio.org>
// License: GPL v3+

#ifndef __GLOBAL_H
#define __GLOBAL_H

#include <stdint.h>

// WASM is always little-endian
#define __BYTE_ORDER    1234
#define __LITTLE_ENDIAN 1234
#define __BIG_ENDIAN    4321

#define WR2(p,v) { (p)[0] = v; (p)[1] = v >> 8; }
#define WR4(p,v) { (p)[0] = v; (p)[1] = v >> 8;  (p)[2] = v >> 16;  (p)[3] = v >> 24; }
#define RD2(p) ((p)[0] + ((p)[1] << 8));
#define RD4(p) ((p)[0] + ((p)[1] << 8) + ((p)[2] << 16) + ((p)[3] << 24));

#include "lfqueue.h"

enum
{
    NASECT = 4,
    NDIVIS = 8,
    NKEYBD = 8,
    NGROUP = 8,
    NRANKS = 32,
    NNOTES = 61,
    NBANK  = 32,
    NPRES  = 32
};

#define MIDICTL_SWELL 7
#define SWELL_MIN 0.0f
#define SWELL_MAX 1.0f
#define SWELL_DEF 1.0f

#define MIDICTL_TFREQ 12
#define TFREQ_MIN 2.0f
#define TFREQ_MAX 8.0f
#define TFREQ_DEF 4.0f

#define MIDICTL_TMODD 13
#define TMODD_MIN 0.0f
#define TMODD_MAX 0.6f
#define TMODD_DEF 0.3f

#define MIDICTL_BANK   32
#define MIDICTL_HOLD   64
#define MIDICTL_IFELM  98
#define MIDICTL_ASOFF 120
#define MIDICTL_ANOFF 123

#define KMAP_ALL  0x0FFF
#define KMAP_SET  0x8000

class Fparm
{
public:
    float  _val;
    float  _min;
    float  _max;
};

#endif
