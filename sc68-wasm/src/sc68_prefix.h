/* Force-included prefix header for SC68 WASM build */
#ifndef SC68_PREFIX_H
#define SC68_PREFIX_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* Ensure type68.h gets the stdint types */
#ifndef HAVE_STDINT_H
#define HAVE_STDINT_H 1
#endif

#include "emu68/type68.h"

/* TRACE68 macro - no-op for WASM build */
#ifndef TRACE68
#define TRACE68(cat, ...) do {} while(0)
#endif

#endif
