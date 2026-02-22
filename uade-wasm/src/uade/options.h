/* options.h — WASM shim: UADE compile-time options for WASM build */
#ifndef _UADE_OPTIONS_H_
#define _UADE_OPTIONS_H_

/* User mode: data files are at a fixed MEMFS path, not system-wide */
#define UADE_CONFIG_USER_MODE (1)

/* Base directory for UADE data (eagleplayers, etc.) in virtual FS */
#define UADE_CONFIG_BASE_DIR "/uade"

/* uadecore binary path (not used in WASM — runs in-process) */
#define UADE_CONFIG_UADE_CORE "/uade/uadecore"

/* Version string */
#define UADE_VERSION "3.05-wasm"

#endif /* _UADE_OPTIONS_H_ */
