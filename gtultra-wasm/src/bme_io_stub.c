/*
 * bme_io_stub.c — Minimal BME I/O implementation for WASM
 *
 * Provides io_open/io_read8/io_lseek/io_close using standard fopen().
 * Used by greloc.c's insertfile() to load player.s assembly files
 * from Emscripten's MEMFS (embedded via --embed-file).
 */

#include <stdio.h>
#include <string.h>
#include "bme.h"

#define MAX_IO_HANDLES 16

static FILE *io_handles[MAX_IO_HANDLES] = {0};

/* Not used in WASM — linked datafile support is handled by embedding files */
void io_setfilemode(int usedf) { (void)usedf; }
int io_openlinkeddatafile(unsigned char *ptr) { (void)ptr; return 0; }

int io_open(char *name)
{
    if (!name) return -1;

    int idx;
    for (idx = 0; idx < MAX_IO_HANDLES; idx++) {
        if (!io_handles[idx]) break;
    }
    if (idx == MAX_IO_HANDLES) return -1;

    FILE *f = fopen(name, "rb");
    if (!f) return -1;

    io_handles[idx] = f;
    return idx;
}

void io_close(int handle)
{
    if (handle >= 0 && handle < MAX_IO_HANDLES && io_handles[handle]) {
        fclose(io_handles[handle]);
        io_handles[handle] = NULL;
    }
}

int io_lseek(int handle, int offset, int whence)
{
    if (handle < 0 || handle >= MAX_IO_HANDLES || !io_handles[handle]) return -1;
    fseek(io_handles[handle], offset, whence);
    return (int)ftell(io_handles[handle]);
}

unsigned char io_read8(int handle)
{
    if (handle < 0 || handle >= MAX_IO_HANDLES || !io_handles[handle]) return 0;
    unsigned char byte = 0;
    fread(&byte, 1, 1, io_handles[handle]);
    return byte;
}
