/*
 * shim_ipc.c — In-memory IPC replacement for UADE's fork()/socketpair() pattern.
 *
 * UADE's normal architecture:
 *   libuade (frontend) ←→ socketpair() ←→ uadecore (68k emulator, child process)
 *
 * In WASM, fork() and exec() are not available. This shim merges both sides
 * into a single process by:
 *   1. Replacing uade_arch_spawn() with an in-process initialization of uadecore.
 *   2. Replacing the socketpair read/write calls with in-memory ring buffers.
 *   3. When the frontend "writes" a command, we immediately process it in uadecore
 *      (synchronous call-and-return instead of IPC).
 *
 * Build: Exclude frontends/common/unixsupport.c, include this file instead.
 *        Override read()/write() for our magic FD values.
 */

#include <uade/uadeipc.h>
#include <uade/unixatomic.h>

#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <errno.h>
#include <emscripten.h>

/* Magic FD values that identify our virtual IPC pipes */
#define UADE_SHIM_CMD_FD   0xBADFD001   /* frontend → core: commands  */
#define UADE_SHIM_RSP_FD   0xBADFD002   /* core → frontend: responses */

/* Ring buffer size (must be power of 2) */
#define SHIM_BUFSIZE (1 << 18)   /* 256 KiB */
#define SHIM_BUFMASK (SHIM_BUFSIZE - 1)

typedef struct {
    uint8_t  data[SHIM_BUFSIZE];
    uint32_t head;   /* write position */
    uint32_t tail;   /* read position  */
} RingBuf;

static RingBuf s_cmd_buf;   /* frontend → core */
static RingBuf s_rsp_buf;   /* core → frontend */

static int s_shim_ready = 0;

/* Forward declaration: uadecore's command handler (called synchronously) */
extern void uadecore_handle_one_message(void);
/* Forward declaration: uadecore initialization */
extern int uadecore_wasm_init(int argc, char **argv);

/* ── Ring buffer helpers ────────────────────────────────────────────────── */

static size_t ring_available_data(const RingBuf *rb) {
    return (rb->head - rb->tail) & SHIM_BUFMASK;
}

static size_t ring_available_space(const RingBuf *rb) {
    return SHIM_BUFSIZE - 1 - ring_available_data(rb);
}

static void ring_write(RingBuf *rb, const uint8_t *src, size_t n) {
    for (size_t i = 0; i < n; i++) {
        rb->data[rb->head & SHIM_BUFMASK] = src[i];
        rb->head++;
    }
}

static void ring_read(RingBuf *rb, uint8_t *dst, size_t n) {
    for (size_t i = 0; i < n; i++) {
        dst[i] = rb->data[rb->tail & SHIM_BUFMASK];
        rb->tail++;
    }
}

/* ── Public shim read/write — called by libuade IPC layer ──────────────── */

/*
 * Called when libuade sends a command to uadecore.
 * We buffer the command and immediately trigger uadecore to process it.
 */
ssize_t uade_shim_write_cmd(const void *buf, size_t count) {
    if (ring_available_space(&s_cmd_buf) < count) {
        fprintf(stderr, "[uade-shim] cmd buffer full\n");
        errno = EAGAIN;
        return -1;
    }
    ring_write(&s_cmd_buf, (const uint8_t*)buf, count);
    /* Process the command synchronously so the response is immediately available */
    uadecore_handle_one_message();
    return (ssize_t)count;
}

/*
 * Called when libuade reads a response from uadecore.
 * Returns available data from the response buffer.
 */
ssize_t uade_shim_read_rsp(void *buf, size_t count) {
    size_t avail = ring_available_data(&s_rsp_buf);
    if (avail == 0) {
        /* No data yet — run more emulator cycles */
        uadecore_handle_one_message();
        avail = ring_available_data(&s_rsp_buf);
        if (avail == 0) {
            errno = EAGAIN;
            return -1;
        }
    }
    size_t n = avail < count ? avail : count;
    ring_read(&s_rsp_buf, (uint8_t*)buf, n);
    return (ssize_t)n;
}

/*
 * Called by uadecore when it has a response to send back to libuade.
 */
ssize_t uade_shim_write_rsp(const void *buf, size_t count) {
    if (ring_available_space(&s_rsp_buf) < count) {
        fprintf(stderr, "[uade-shim] rsp buffer full\n");
        errno = EAGAIN;
        return -1;
    }
    ring_write(&s_rsp_buf, (const uint8_t*)buf, count);
    return (ssize_t)count;
}

/*
 * Called by uadecore when reading commands from libuade.
 */
ssize_t uade_shim_read_cmd(void *buf, size_t count) {
    size_t avail = ring_available_data(&s_cmd_buf);
    if (avail == 0) {
        errno = EAGAIN;
        return -1;
    }
    size_t n = avail < count ? avail : count;
    ring_read(&s_cmd_buf, (uint8_t*)buf, n);
    return (ssize_t)n;
}

/* ── Emscripten overrides for the magic FD values ──────────────────────── */

/*
 * These override the standard read()/write() system calls for our magic FDs.
 * Emscripten's musl libc calls these for file I/O.
 *
 * NOTE: We patch the IPC layer directly instead of hooking syscalls.
 * See uadeipc.c — it calls uade_send_message/uade_receive_message which
 * ultimately call read()/write(). We intercept at a higher level via
 * patching unixsupport.c and providing uade_set_peer() shim.
 */

/* ── uade_arch_spawn replacement ────────────────────────────────────────── */

/*
 * Called by libuade when it wants to spawn uadecore as a subprocess.
 * In WASM, we initialize uadecore inline instead.
 */
int uade_arch_spawn(struct uade_ipc *ipc, pid_t *uadepid, const char *uadename,
                    const int *keep_fds) {
    (void)uadename;
    (void)keep_fds;

    /* Initialize ring buffers */
    memset(&s_cmd_buf, 0, sizeof(s_cmd_buf));
    memset(&s_rsp_buf, 0, sizeof(s_rsp_buf));

    /* Set up IPC with our magic FD values */
    /* libuade will write to CMD_FD and read from RSP_FD */
    uade_set_peer(ipc, 1, UADE_SHIM_RSP_FD, UADE_SHIM_CMD_FD);

    *uadepid = 1;  /* Fake PID — uadecore runs in-process */

    /* Initialize uadecore synchronously */
    {
        char *argv[] = { "uadecore", "-i", "0", "-o", "1", NULL };
        int argc = 5;
        if (uadecore_wasm_init(argc, argv) != 0) {
            fprintf(stderr, "[uade-shim] uadecore init failed\n");
            return -1;
        }
    }

    s_shim_ready = 1;
    return 0;
}

/* ── Stub: uade_atomic_close for our magic FDs ──────────────────────────── */

int uade_shim_close(int fd) {
    if (fd == UADE_SHIM_CMD_FD || fd == UADE_SHIM_RSP_FD) {
        return 0;  /* Nothing to close for virtual FDs */
    }
    return close(fd);
}
