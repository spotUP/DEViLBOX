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

#ifndef MDA_DX10_STANDALONE_H
#define MDA_DX10_STANDALONE_H

#include <stdint.h>
#include <string.h>

#define NPARAMS  16
#define NPROGS   32
#define NOUTS    2
#define NVOICES  8
#define SILENCE  0.0003f

class mdaDX10Program
{
  friend class mdaDX10;
private:
  float param[NPARAMS];
  char  name[24];
};

struct VOICE
{
  float env;   // carrier envelope
  float dmod;  // modulator oscillator
  float mod0;
  float mod1;
  float menv;  // modulator envelope
  float mlev;  // modulator target level
  float mdec;  // modulator envelope decay
  float car;   // carrier oscillator
  float dcar;
  float cenv;  // smoothed env
  float catt;  // smoothing
  float cdec;  // carrier envelope decay
  int32_t note;  // remember what note triggered this
};

class mdaDX10
{
public:
  mdaDX10(float sampleRate);
  ~mdaDX10();

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
                 float p12, float p13, float p14, float p15);

  mdaDX10Program* programs;
  int32_t curProgram;
  float Fs;

  VOICE voice[NVOICES];
  #define SUSTAIN 128
  int32_t sustain, activevoices, K;

  float tune, rati, ratf, ratio;
  float catt, cdec, crel;
  float depth, dept2, mdec, mrel;
  float lfo0, lfo1, dlfo, modwhl, MW, pbend, velsens, volume, vibrato;
  float rich, modmix;
};

#endif
