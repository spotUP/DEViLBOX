/* SC68 config.h for Emscripten WASM build */
#ifndef CONFIG_H
#define CONFIG_H

#define HAVE_STDLIB_H 1
#define HAVE_STRING_H 1
#define HAVE_STDINT_H 1
#define HAVE_ASSERT_H 1

/* libc features available in Emscripten */
#define HAVE_STRTOUL 1
#define HAVE_BASENAME 1
#define HAVE_GETENV 1

/* No file I/O in WASM */
/* #undef HAVE_UNISTD_H */
/* #undef HAVE_USLEEP */
/* #undef HAVE_SLEEP */
/* #undef HAVE_FSYNC */
/* #undef HAVE_LIBGEN_H */

/* No zlib in WASM build */
/* #undef HAVE_ZLIB_H */

/* No audio output in WASM build */
/* #undef HAVE_AO_FILE_EXTENSION */

/* No curl in WASM build */
/* #undef HAVE_LIBCURL */

/* No registry in WASM build */
/* #undef HAVE_REGISTRY68_H */

/* SC68 version info */
#define PACKAGE_STRING "sc68 3.0.0-wasm"
#define PACKAGE_VERSION "3.0.0-wasm"

/* file68 internal config */
#define FILE68_API
#define EMU68_API
#define IO68_API
#define SC68_API

/* Disable debug by default */
/* #undef DEBUG */
/* #undef _DEBUG */

#endif /* CONFIG_H */
