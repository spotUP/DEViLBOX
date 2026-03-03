/* USBSIDInterface.h — Stub for WASM build (USBSID-Pico replaced with ASID callback) */
#ifndef USBSIDINTERFACE_H
#define USBSIDINTERFACE_H

#include <stdbool.h>
#include "../../../bme.h"

typedef void* USBSIDitf;

static inline USBSIDitf create_USBSID(void) { return NULL; }
static inline int init_USBSID(USBSIDitf dev, bool a, bool b) {
    (void)dev; (void)a; (void)b; return 0;
}
static inline void close_USBSID(USBSIDitf dev) { (void)dev; }
static inline void write_USBSID(USBSIDitf dev, Uint8 reg, Uint8 data) {
    (void)dev; (void)reg; (void)data;
}
static inline void writeringcycled_USBSID(USBSIDitf dev, Uint8 reg, Uint8 data, int cycles) {
    (void)dev; (void)reg; (void)data; (void)cycles;
}
static inline void setclockrate_USBSID(USBSIDitf dev, int rate, bool flag) {
    (void)dev; (void)rate; (void)flag;
}
static inline void pause_USBSID(USBSIDitf dev) { (void)dev; }
static inline void reset_USBSID(USBSIDitf dev) { (void)dev; }

#endif
