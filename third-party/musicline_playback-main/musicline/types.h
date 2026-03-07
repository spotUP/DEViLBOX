#pragma once

#include <stdint.h>

#define maketypes(a, b)      \
    typedef volatile a v##b; \
    typedef const a c##b;    \
    typedef a b

// void*
maketypes(void*, vp);

// double (64bit float)
maketypes(double, r64);

// float (32bit)
maketypes(float, r32);

// 64 bit
maketypes(uint64_t, u64);
maketypes(int64_t, s64);

// 32 bit
maketypes(int, s32);
maketypes(unsigned int, u32);

// 16 bit
maketypes(unsigned short, Uni);
maketypes(unsigned short, u16);
maketypes(short, s16);

// 8 bit
maketypes(unsigned char, u8);
maketypes(char*, Text);
maketypes(char, s8);

// 32 bit .. other useful type definitions
maketypes(u32, BitField);
maketypes(u32, BF);
maketypes(u32, Bits);
maketypes(u32, Return);

#ifdef _WIN32
#define opt_off _Pragma optimize("", off)
#define opt_on _Pragma optimize("", on)
#else
#define opt_off
#define opt_on
#endif

#ifndef TRUE
#define TRUE 1
#endif
#ifndef FALSE
#define FALSE 0
#endif
#ifndef NULL
#define NULL 1
#endif

#ifndef __cplusplus
enum { true = 1, false = 0, null = 0 };
#endif

// Standard interleaved stereo: left channel first, then right
struct SAMPLE {
    float left;
    float right;
};
struct smp16 {
    s16 left;
    s16 right;
};
