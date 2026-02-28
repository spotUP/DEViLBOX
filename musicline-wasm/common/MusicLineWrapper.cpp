// MusicLineWrapper.cpp — stub (populated in Task 2)
// Wraps MlineBackend C++ API with C-linkage exports for Emscripten.
#include "mline_backend.h"

extern "C" {
    void ml_init(int sampleRate) {}
}
