/* file68_features.h for Emscripten WASM build */
#ifndef FILE68_FEATURES_H
#define FILE68_FEATURES_H

/* ICE depacker support (via unice68) */
#define FILE68_UNICE68 1

/* No zlib in WASM build */
/* #undef FILE68_Z */

/* No curl in WASM build */
/* #undef FILE68_CURL */

/* No audio output in WASM build */
/* #undef FILE68_AO */

#ifndef FILE68_SPR_MIN
enum { FILE68_SPR_MIN = 8000 };
#endif

#ifndef FILE68_SPR_MAX
enum { FILE68_SPR_MAX = 96000 };
#endif

#ifndef FILE68_SPR_DEF
enum { FILE68_SPR_DEF = 48000 };
#endif

#endif
