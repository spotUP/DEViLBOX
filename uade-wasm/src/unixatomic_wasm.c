/* unixatomic_wasm.c — WASM replacement for unixatomic.c
 *
 * Routes read/write/close through the IPC ring buffers for magic FDs,
 * falls through to POSIX for normal FDs.
 */

#include <uade/unixatomic.h>

#include <errno.h>
#include <stdint.h>
#include <unistd.h>
#include <stdio.h>

/* Magic FD values must match shim_ipc.c */
#define UADE_SHIM_CMD_FD   9001
#define UADE_SHIM_RSP_FD   9002

/* Ring buffer accessors from shim_ipc.c */
extern ssize_t uade_shim_write_cmd(const void *buf, size_t count);
extern ssize_t uade_shim_read_rsp(void *buf, size_t count);
extern ssize_t uade_shim_write_rsp(const void *buf, size_t count);
extern ssize_t uade_shim_read_cmd(void *buf, size_t count);
extern int uade_shim_close(int fd);

int uade_atomic_close(int fd)
{
    if (fd == (int)UADE_SHIM_CMD_FD || fd == (int)UADE_SHIM_RSP_FD)
        return uade_shim_close(fd);

    while (1) {
        if (close(fd) < 0) {
            if (errno == EINTR)
                continue;
            return -1;
        }
        break;
    }
    return 0;
}

int uade_atomic_dup2(int oldfd, int newfd)
{
    while (1) {
        if (dup2(oldfd, newfd) < 0) {
            if (errno == EINTR)
                continue;
            return -1;
        }
        break;
    }
    return newfd;
}

/*
 * For the magic FDs, the IPC layer uses them as follows:
 *   Frontend side:
 *     - writes commands to CMD_FD → uade_shim_write_cmd
 *     - reads responses from RSP_FD → uade_shim_read_rsp
 *   Core side:
 *     - reads commands from CMD_FD → uade_shim_read_cmd
 *     - writes responses to RSP_FD → uade_shim_write_rsp
 *
 * But both sides use the same uade_set_peer() FD values.
 * uade_set_peer(ipc, is_peer_pid_0, in_fd, out_fd):
 *   is_peer_pid_0=1 (frontend): reads from RSP_FD, writes to CMD_FD
 *   is_peer_pid_0=0 (core): reads from CMD_FD, writes to RSP_FD
 *
 * The frontend IPC has: in_fd=RSP_FD, out_fd=CMD_FD
 * The core IPC has: in_fd=CMD_FD, out_fd=RSP_FD (set by uadecore_option)
 *
 * But our shim sets: uade_set_peer(ipc, 1, RSP_FD, CMD_FD) for frontend
 * And core does: uade_set_peer(&uadecore_ipc, 0, in_fd, out_fd)
 *   where in_fd and out_fd both equal the same FD from -i and -o args.
 *
 * Actually, looking at uade_arch_spawn shim: it passes "-i", "0", "-o", "1"
 * So the core gets in_fd=0, out_fd=1 (stdin/stdout conceptually).
 * And the frontend gets RSP_FD for reading, CMD_FD for writing.
 *
 * We need to map:
 *   read(RSP_FD, ...) → uade_shim_read_rsp  (frontend reads response)
 *   write(CMD_FD, ...) → uade_shim_write_cmd (frontend writes command)
 *   read(0, ...) → uade_shim_read_cmd (core reads command from stdin)
 *   write(1, ...) → uade_shim_write_rsp (core writes response to stdout)
 *
 * Wait — the core uses FD 0 and 1, not magic FDs. Let me check again.
 */

ssize_t uade_atomic_read(int fd, const void *buf, size_t count)
{
    /* Route magic FDs to ring buffers */
    if (fd == (int)UADE_SHIM_RSP_FD) {
        /* Frontend reading response */
        ssize_t total = 0;
        while ((size_t)total < count) {
            ssize_t ret = uade_shim_read_rsp((char *)buf + total, count - total);
            if (ret < 0) {
                if (errno == EAGAIN) {
                    if (total > 0) return total;
                    /* Spin: run more core cycles (already handled by shim_read_rsp) */
                    continue;
                }
                return -1;
            }
            if (ret == 0) return total;
            total += ret;
        }
        return total;
    }
    if (fd == (int)UADE_SHIM_CMD_FD) {
        /* Core reading command */
        ssize_t total = 0;
        while ((size_t)total < count) {
            ssize_t ret = uade_shim_read_cmd((char *)buf + total, count - total);
            if (ret < 0) {
                if (errno == EAGAIN) {
                    if (total > 0) return total;
                    return -1; /* Don't spin — caller handles */
                }
                return -1;
            }
            if (ret == 0) return total;
            total += ret;
        }
        return total;
    }

    /* Normal POSIX read for other FDs */
    char *b = (char *) buf;
    ssize_t bytes_read = 0;
    ssize_t ret;
    while ((size_t)bytes_read < count) {
        ret = read(fd, &b[bytes_read], count - bytes_read);
        if (ret < 0) {
            if (errno == EINTR) continue;
            return -1;
        } else if (ret == 0) {
            return 0;
        }
        bytes_read += ret;
    }
    return bytes_read;
}

ssize_t uade_atomic_write(int fd, const void *buf, size_t count)
{
    /* Route magic FDs to ring buffers */
    if (fd == (int)UADE_SHIM_CMD_FD) {
        /* Frontend writing command */
        return uade_shim_write_cmd(buf, count);
    }
    if (fd == (int)UADE_SHIM_RSP_FD) {
        /* Core writing response */
        return uade_shim_write_rsp(buf, count);
    }

    /* Normal POSIX write for other FDs */
    char *b = (char *) buf;
    ssize_t bytes_written = 0;
    ssize_t ret;
    while ((size_t)bytes_written < count) {
        ret = write(fd, &b[bytes_written], count - bytes_written);
        if (ret < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        bytes_written += ret;
    }
    return bytes_written;
}
