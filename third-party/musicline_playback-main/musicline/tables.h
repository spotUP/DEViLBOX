#pragma once

#include "structs.h"

class MLModule;
class Channel;

extern unsigned char SizerTable256[128 * (256 - 1)];
extern unsigned short SizerOffset256[256 - 1];

extern unsigned char SizerTable128[64 * (128 - 1)];
extern unsigned short SizerOffset128[128 - 1];

extern unsigned char SizerTable64[32 * (64 - 1)];
extern unsigned short SizerOffset64[64 - 1];

extern unsigned char SizerTable32[16 * (32 - 1)];
extern unsigned short SizerOffset32[32 - 1];

extern unsigned char SizerTable16[8 * (16 - 1)];
extern unsigned short SizerOffset16[16 - 1];

extern char Sine[];
extern char DownRamp[];
extern char SawTooth[];
extern char Square[];

extern unsigned short PalPitchTable[];
extern struct Chnl ZeroChannel;
extern unsigned char ZeroBuffer[2048];
extern float ZeroSample[2];
extern float VecSinus[65536];
extern unsigned char PTVibratoTable[];

extern unsigned short resamplist[];
extern unsigned short resonancelist[];
extern unsigned short resfilterlist[];
extern unsigned short filterlist[];

/*****************************************************************************
 * Part Effects Structure                         * Conny Cyr�us - Musicline *
 *****************************************************************************/

// Part Data
// 00  --- 00 00xy 0000 0000 0000 0000
//   .    .  .  . .
//    .    .  .  . Effect Parameter
//     .    .  .  Effect Number
//      .    .  Instrument
//       .    Note
//        .osition

// extern void (*ArpFx_JmpTab[7])(MLModule* data, Channel* chan, unsigned char cmd, unsigned char arg);
extern void (*ArpFx_JmpTab[7])(MLModule* data, Channel* chan, unsigned char cmd, unsigned char arg);
