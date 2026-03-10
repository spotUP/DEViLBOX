/**
 * Minimal sounddef.cpp for WASM build
 * Stripped of file I/O - only sdInit() needed
 */

#include "types.h"
#include <string.h>
#include <stdio.h>
#include "sounddef.h"

// Global state
unsigned char *soundmem = nullptr;
long          *patchoffsets = nullptr;
unsigned char *editmem = nullptr;
char          patchnames[128][32];
char          globals[v2ngparms];
int           v2version = 0;
int           *v2vsizes = nullptr;
int           *v2gsizes = nullptr;
int           *v2topics2 = nullptr;
int           *v2gtopics2 = nullptr;
int           v2curpatch = 0;

void sdInit()
{
    // Allocate sound memory
    soundmem = new unsigned char[smsize + v2soundsize];
    patchoffsets = (long*)soundmem;
    unsigned char *sptr = soundmem + 128 * sizeof(long);

    // Initialize all 128 patches + edit buffer
    for (int i = 0; i < 129; i++)
    {
        if (i < 128)
        {
            patchoffsets[i] = (long)(sptr - soundmem);
            snprintf(patchnames[i], 32, "Init Patch #%03d", i);
        }
        else
        {
            editmem = sptr;
        }
        memcpy(sptr, v2initsnd, v2soundsize);
        sptr += v2soundsize;
    }

    // Initialize globals
    for (int i = 0; i < v2ngparms; i++)
    {
        globals[i] = v2initglobs[i];
    }

    // Calculate version info
    v2version = 0;
    for (int i = 0; i < v2nparms; i++)
    {
        if (v2parms[i].version > v2version)
            v2version = v2parms[i].version;
    }
    for (int i = 0; i < v2ngparms; i++)
    {
        if (v2gparms[i].version > v2version)
            v2version = v2gparms[i].version;
    }

    // Allocate version size arrays
    v2vsizes = new int[v2version + 1];
    v2gsizes = new int[v2version + 1];
    memset(v2vsizes, 0, (v2version + 1) * sizeof(int));
    memset(v2gsizes, 0, (v2version + 1) * sizeof(int));

    for (int i = 0; i < v2nparms; i++)
    {
        v2vsizes[v2parms[i].version]++;
    }
    for (int i = 0; i < v2ngparms; i++)
    {
        v2gsizes[v2gparms[i].version]++;
    }

    for (int i = 1; i <= v2version; i++)
    {
        v2vsizes[i] += v2vsizes[i - 1];
        v2gsizes[i] += v2gsizes[i - 1];
    }

    // Build topic offset arrays
    v2topics2 = new int[v2ntopics];
    int off = 0;
    for (int i = 0; i < v2ntopics; i++)
    {
        v2topics2[i] = off;
        off += v2topics[i].no;
    }

    v2gtopics2 = new int[v2ngtopics];
    off = 0;
    for (int i = 0; i < v2ngtopics; i++)
    {
        v2gtopics2[i] = off;
        off += v2gtopics[i].no;
    }
}

void sdClose()
{
    delete[] soundmem;
    soundmem = nullptr;
    patchoffsets = nullptr;
    editmem = nullptr;

    delete[] v2vsizes;
    v2vsizes = nullptr;

    delete[] v2gsizes;
    v2gsizes = nullptr;

    delete[] v2topics2;
    v2topics2 = nullptr;

    delete[] v2gtopics2;
    v2gtopics2 = nullptr;
}
