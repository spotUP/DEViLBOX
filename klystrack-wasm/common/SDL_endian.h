/* SDL_endian stub — WASM is always little-endian */
#ifndef SDL_ENDIAN_STUB_H
#define SDL_ENDIAN_STUB_H

#define SDL_LIL_ENDIAN 1234
#define SDL_BIG_ENDIAN 4321
#define SDL_BYTEORDER SDL_LIL_ENDIAN

#define SDL_SwapLE16(x) (x)
#define SDL_SwapLE32(x) (x)
#define SDL_SwapLE64(x) (x)

#endif
