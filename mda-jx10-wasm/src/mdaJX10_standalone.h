/*
  Copyright 2008-2011 David Robillard <http://drobilla.net>
  Copyright 1999-2000 Paul Kellett (Maxim Digital Audio)

  This is free software: you can redistribute it and/or modify it
  under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License,
  or (at your option) any later version.

  This software is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this software. If not, see <http://www.gnu.org/licenses/>.

  Standalone version: LV2/VST framework dependencies removed for WASM use.
*/

#ifndef MDA_JX10_STANDALONE_H
#define MDA_JX10_STANDALONE_H

#include <stdint.h>
#include <string.h>

#define NPARAMS  24
#define NPROGS   64
#define NOUTS    2
#define NVOICES  8
#define SILENCE  0.001f
#define PI       3.1415926535897932f
#define TWOPI    6.2831853071795864f
#define ANALOG   0.002f

class mdaJX10Program
{
  friend class mdaJX10;
public:
  mdaJX10Program();
private:
  float param[NPARAMS];
  char  name[24];
};

struct VOICE
{
  float  period;
  float  p;
  float  pmax;
  float  dp;
  float  sin0;
  float  sin1;
  float  sinx;
  float  dc;

  float  detune;
  float  p2;
  float  pmax2;
  float  dp2;
  float  sin02;
  float  sin12;
  float  sinx2;
  float  dc2;

  float  fc;
  float  ff;
  float  f0;
  float  f1;
  float  f2;

  float  saw;
  float  env;
  float  envd;
  float  envl;
  float  fenv;
  float  fenvd;
  float  fenvl;

  float  lev;
  float  lev2;
  float  target;
  int32_t note;
};

class mdaJX10
{
public:
  mdaJX10(float sampleRate);
  ~mdaJX10();

  void process(float* outL, float* outR, int32_t sampleFrames);
  void noteOn(int32_t note, int32_t velocity);
  void setParameter(int32_t index, float value);
  float getParameter(int32_t index);
  void setProgram(int32_t program);
  int32_t getProgram() { return curProgram; }
  int32_t getNumPrograms() { return NPROGS; }
  int32_t getNumParams() { return NPARAMS; }
  void setSampleRate(float rate);
  void allNotesOff();
  int32_t getActiveVoices() { return activevoices; }

private:
  void update();
  void fillpatch(int32_t p, const char *name,
                 float p0,  float p1,  float p2,  float p3,  float p4,  float p5,
                 float p6,  float p7,  float p8,  float p9,  float p10, float p11,
                 float p12, float p13, float p14, float p15, float p16, float p17,
                 float p18, float p19, float p20, float p21, float p22, float p23);

  mdaJX10Program* programs;
  int32_t curProgram;
  float Fs;

  #define KMAX 32
  #define SUSTAIN -1

  int32_t sustain, activevoices;
  VOICE voice[NVOICES];

  float semi, cent;
  float tune, detune;
  float filtf, fzip, filtq, filtlfo, filtenv, filtvel, filtwhl;
  float oscmix, noisemix;
  float att, dec, sus, rel, fatt, fdec, fsus, frel;
  float lfo, dlfo, modwhl, press, pbend, ipbend, rezwhl;
  float velsens, volume, voltrim;
  float vibrato, pwmdep, lfoHz, glide, glidedisp;
  int32_t K, lastnote, veloff, mode;
  unsigned int noise;
};

#endif
