/*
 * uade_exit_override.c — Intercept exit() calls for WASM.
 *
 * In native UADE, uadecore runs as a child process. When it encounters
 * an error or finishes processing, it calls exit(). This is fine for
 * a subprocess but fatal in WASM where everything runs in one process.
 *
 * This override replaces exit() with a longjmp back to entry.c's
 * setjmp guard, allowing the calling code to handle the "exit" as
 * a return value instead of process termination.
 */

#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>

/* Jump buffer and state — used by entry.c to catch exit() */
jmp_buf uade_exit_jmpbuf;
volatile int uade_exit_status = 0;
volatile int uade_exit_guard = 0;

/*
 * Override exit(). Emscripten will link this over its default
 * implementation. When uade_exit_guard is set, we longjmp back
 * to the setjmp in entry.c instead of terminating.
 */
void exit(int status) {
    uade_exit_status = status;
    if (uade_exit_guard) {
        fprintf(stderr, "[uade-wasm] exit(%d) intercepted via longjmp\n", status);
        longjmp(uade_exit_jmpbuf, 1);
    }
    /* Not guarded — this shouldn't happen during normal operation.
     * Use __builtin_trap to make it visible rather than silently dying. */
    fprintf(stderr, "[uade-wasm] FATAL: unguarded exit(%d)\n", status);
    __builtin_trap();
}
