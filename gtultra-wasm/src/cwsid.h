/* cwsid.h — Stub for WASM build (CatWeasel hardware SID) */
#ifndef CWSID_H
#define CWSID_H

#include "bme.h"

#define CWSID_IOCTL_PAL  0
#define CWSID_IOCTL_NTSC 1

static inline int HardSID_Read(int device, int cycles, Uint8 reg) {
    (void)device; (void)cycles; (void)reg; return 0;
}
static inline void HardSID_Write(int device, int cycles, Uint8 reg, Uint8 data) {
    (void)device; (void)cycles; (void)reg; (void)data;
}
static inline void WriteToHardSID(int device, Uint8 reg, Uint8 data) {
    (void)device; (void)reg; (void)data;
}
static inline int HardSID_Lock(int device) { (void)device; return 1; }

#endif
