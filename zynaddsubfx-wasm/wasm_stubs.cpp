/* Stubs for functions not available in Emscripten single-threaded mode */
#include <cstdlib>
#include <cstdio>
#include <semaphore.h>

// sem_getvalue is not available in Emscripten without threads
extern "C" int sem_getvalue(sem_t *sem, int *sval) {
    (void)sem;
    if (sval) *sval = 0;
    return 0;
}

// NIO middleware pointer — not used in WASM bridge mode
namespace zyn { class MiddleWare; }
zyn::MiddleWare *middleware = nullptr;
