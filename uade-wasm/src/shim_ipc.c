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
#include <dirent.h>
#include <libgen.h>
#include <limits.h>
#include <sys/stat.h>
#include <emscripten.h>

/* Forward: unixsupport.h macros (we don't include it to avoid pulling in uadeipc again) */
#include <uade/unixsupport.h>

/* Magic FD values that identify our virtual IPC pipes.
 * Must be positive ints (uade_set_peer asserts in_fd >= 0) and unlikely
 * to collide with real Emscripten MEMFS file descriptors. */
#define UADE_SHIM_CMD_FD   9001   /* frontend → core: commands  */
#define UADE_SHIM_RSP_FD   9002   /* core → frontend: responses */

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
/* Forward declaration: uadecore load-time reset */
extern void uadecore_wasm_reset_for_load(void);

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
 *
 * IMPORTANT: Only buffers data — does NOT trigger core processing here.
 * uade_send_string() writes messages in TWO separate uade_atomic_write()
 * calls (header, then data). If we processed after each write, the core
 * would try to read an incomplete message and fail.
 *
 * Core processing is triggered lazily when the frontend reads a response
 * (uade_shim_read_rsp), which is the natural point where the frontend
 * needs data back from the core.
 */
ssize_t uade_shim_write_cmd(const void *buf, size_t count) {
    if (ring_available_space(&s_cmd_buf) < count) {
        fprintf(stderr, "[uade-shim] cmd buffer full\n");
        errno = EAGAIN;
        return -1;
    }
    ring_write(&s_cmd_buf, (const uint8_t*)buf, count);
    return (ssize_t)count;
}

/*
 * Called when libuade reads a response from uadecore.
 * If no response data is available, runs core processing cycles until
 * data appears or a maximum iteration count is reached.
 */
ssize_t uade_shim_read_rsp(void *buf, size_t count) {
    int max_iters = 10000;  /* Safety limit to prevent infinite loops */

    while (ring_available_data(&s_rsp_buf) == 0 && max_iters-- > 0) {
        /* No response yet — run a core processing cycle.
         * The core reads commands from s_cmd_buf, processes them
         * (68k emulation, message handling), and writes responses
         * to s_rsp_buf. */
        uadecore_handle_one_message();
    }

    size_t avail = ring_available_data(&s_rsp_buf);
    if (avail == 0) {
        errno = EAGAIN;
        return -1;
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

/* ── Reset for new song load ───────────────────────────────────────────── */

/*
 * Called before each uade_play() to ensure a clean IPC state.
 * Clears both ring buffers (removing any stale messages from previous
 * play/stop cycles or failed loads) and resets core state.
 *
 * After this call:
 *   - CMD buffer: empty (ready for SCORE+player+module+TOKEN)
 *   - RSP buffer: empty (ready for CAN_PLAY+TOKEN response)
 *   - Core phase: 2 (uadecore_reset — ready to process new song)
 *   - Yield flag: 0
 *
 * The caller (entry.c) also resets the frontend and core IPC states.
 */
void uade_shim_reset_for_load(void) {
    /* Clear ring buffers — remove ALL stale data */
    s_cmd_buf.head = 0;
    s_cmd_buf.tail = 0;
    s_rsp_buf.head = 0;
    s_rsp_buf.tail = 0;

    /* Reset core state machine and yield flag */
    uadecore_wasm_reset_for_load();
}

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

/* ── unixsupport.c replacements (filesystem functions work on MEMFS) ────── */

int uade_filesize(size_t *size, const char *pathname)
{
    struct stat st;
    if (stat(pathname, &st))
        return -1;
    if (size)
        *size = st.st_size;
    return 0;
}

char *uade_dirname(char *dst, char *src, size_t maxlen)
{
    char *srctemp = strdup(src);
    if (srctemp == NULL)
        return NULL;
    strlcpy(dst, dirname(srctemp), maxlen);
    free(srctemp);
    return dst;
}

static int uade_amiga_scandir(char *real, char *dir_name, char *fake, int ml)
{
    DIR *dir;
    struct dirent *direntry;
    if (!(dir = opendir(dir_name))) {
        uade_warning("Can't open dir (%s) (amiga scandir)\n", dir_name);
        return 0;
    }
    while ((direntry = readdir(dir))) {
        if (!strcmp(fake, direntry->d_name)) {
            if (((int) strlcpy(real, direntry->d_name, ml)) >= ml) {
                closedir(dir);
                return 0;
            }
            break;
        }
    }
    if (direntry) {
        closedir(dir);
        return 1;
    }
    rewinddir(dir);
    while ((direntry = readdir(dir))) {
        if (!strcasecmp(fake, direntry->d_name)) {
            if (((int) strlcpy(real, direntry->d_name, ml)) >= ml) {
                closedir(dir);
                return 0;
            }
            break;
        }
    }
    closedir(dir);
    return direntry != NULL;
}

int uade_find_amiga_file(char *realname, size_t maxlen, const char *aname,
                         const char *playerdir)
{
    char *separator;
    char *ptr;
    char copy[PATH_MAX];
    char dir_name[PATH_MAX];
    char fake[PATH_MAX];
    char real[PATH_MAX];
    int len;
    DIR *dir;
    FILE *file;
    size_t strip_offset;

    if (strlcpy(copy, aname, sizeof(copy)) >= sizeof(copy)) {
        uade_warning("error: amiga tried to open a very long filename.\n");
        return -1;
    }
    ptr = copy;
    if ((separator = strchr(ptr, (int) ':'))) {
        len = (int) (separator - ptr);
        memcpy(dir_name, ptr, len);
        dir_name[len] = 0;
        if (!strcasecmp(dir_name, "ENV")) {
            snprintf(dir_name, sizeof(dir_name), "%s/ENV/", playerdir);
        } else if (!strcasecmp(dir_name, "S")) {
            snprintf(dir_name, sizeof(dir_name), "%s/S/", playerdir);
        } else {
            uade_warning("open_amiga_file: unknown amiga volume (%s)\n", aname);
            return -1;
        }
        if (!(dir = opendir(dir_name))) {
            uade_warning("Can't open dir (%s) (volume parsing)\n", dir_name);
            return -1;
        }
        closedir(dir);
        ptr = separator + 1;
    } else {
        if (*ptr == '/') {
            strlcpy(dir_name, "/", sizeof(dir_name));
            ptr++;
        } else {
            strlcpy(dir_name, "./", sizeof(dir_name));
        }
    }

    while ((separator = strchr(ptr, (int) '/'))) {
        len = (int) (separator - ptr);
        if (!len) {
            ptr++;
            continue;
        }
        memcpy(fake, ptr, len);
        fake[len] = 0;
        if (uade_amiga_scandir(real, dir_name, fake, sizeof(real))) {
            if (strlcat(dir_name, real, sizeof(dir_name)) >= sizeof(dir_name))
                return -1;
            if (strlcat(dir_name, "/", sizeof(dir_name)) >= sizeof(dir_name))
                return -1;
        } else {
            return -1;
        }
        ptr = separator + 1;
    }

    if (!(dir = opendir(dir_name)))
        return -1;
    closedir(dir);

    if (uade_amiga_scandir(real, dir_name, ptr, sizeof(real))) {
        if (strlcat(dir_name, real, sizeof(dir_name)) >= sizeof(dir_name))
            return -1;
    } else {
        return -1;
    }

    file = fopen(dir_name, "rb");
    if (file == NULL)
        return -1;
    fclose(file);

    strip_offset = (strncmp(dir_name, "./", 2) == 0) ? 2 : 0;
    strlcpy(realname, dir_name + strip_offset, maxlen);
    return 0;
}

void uade_arch_kill_and_wait_uadecore(struct uade_ipc *ipc, pid_t *uadepid)
{
    /* In WASM: no child process to kill — just reset state */
    if (*uadepid == 0)
        return;
    uade_atomic_close(ipc->in_fd);
    uade_atomic_close(ipc->out_fd);
    *uadepid = 0;
    s_shim_ready = 0;
}
