#pragma once

#include "defines.h"
#include "enums.h"
#include "fx.h"
#include "structs.h"
#include "tables.h"

/******************************************************************************
 *
 * get Big Endian value and convert into number
 *
 */

unsigned char __inline GetBEByte(unsigned char* p) {
    return ((unsigned char)(p[0]));
}

unsigned char __inline GetBEByte(char* p) {
    return ((unsigned char)(p[0]));
}

unsigned short __inline GetBEWord(unsigned char* p) {
    return ((unsigned short)((p[0] << 8) + p[1]));
}

unsigned short __inline GetBEWord(char* p) {
    return ((unsigned short)((p[0] << 8) + p[1]));
}

unsigned long __inline GetBELong(unsigned char* p) {
    return ((unsigned long)((((((p[0] << 8) + p[1]) << 8) + p[2]) << 8) + p[3]));
}

unsigned long __inline GetBELong(char* p) {
    return ((unsigned long)((((((p[0] << 8) + p[1]) << 8) + p[2]) << 8) + p[3]));
}

/******************************************************************************
 *
 * get Little Endian value and convert into number
 *
 */

unsigned char __inline GetLEByte(unsigned char* p) {
    return ((unsigned char)(p[0]));
}

unsigned char __inline GetLEByte(char* p) {
    return ((unsigned char)(p[0]));
}

unsigned short __inline GetLEWord(unsigned char* p) {
    return ((unsigned short)((p[1] << 8) + p[0]));
}

unsigned short __inline GetLEWord(char* p) {
    return ((unsigned short)((p[1] << 8) + p[0]));
}

unsigned long __inline GetLELong(unsigned char* p) {
    return ((unsigned long)((((((p[3] << 8) + p[2]) << 8) + p[1]) << 8) + p[0]));
}

unsigned long __inline GetLELong(char* p) {
    return ((unsigned long)((((((p[3] << 8) + p[2]) << 8) + p[1]) << 8) + p[0]));
}

/******************************************************************************
 *
 * Set Big Endian value and convert into number
 *
 */

void __inline SetBEByte(unsigned char* p, unsigned char v) {
    p[0] = (char)v;
}

void __inline SetBEByte(char* p, unsigned char v) {
    p[0] = (char)v;
}

void __inline SetBEWord(unsigned char* p, unsigned short v) {
    p[1] = (char)v;
    v >>= 8;
    p[0] = (char)v;
}

void __inline SetBELong(unsigned char* p, unsigned long v) {
    p[3] = (char)v;
    v >>= 8;
    p[2] = (char)v;
    v >>= 8;
    p[1] = (char)v;
    v >>= 8;
    p[0] = (char)v;
}

/******************************************************************************
 *
 * Set Little Endian value
 *
 */

void __inline SetLEByte(unsigned char* p, unsigned char v) {
    p[0] = (char)v;
}

void __inline SetLEByte(char* p, unsigned char v) {
    p[0] = (char)v;
}

void __inline SetLEWord(unsigned char* p, unsigned short v) {
    p[0] = (char)v;
    v >>= 8;
    p[1] = (char)v;
}

void __inline SetLELong(unsigned char* p, unsigned long v) {
    p[0] = (char)v;
    v >>= 8;
    p[1] = (char)v;
    v >>= 8;
    p[2] = (char)v;
    v >>= 8;
    p[3] = (char)v;
}
