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

#ifndef MDA_EPIANO_STANDALONE_H
#define MDA_EPIANO_STANDALONE_H

#include <stdint.h>
#include <string.h>

#define NPARAMS 12
#define NPROGS   5
#define NOUTS    2
#define NVOICES 32
#define SUSTAIN 128
#define SILENCE 0.0001f
#define WAVELEN 422414

class mdaEPianoProgram
{
  friend class mdaEPiano;
private:
  float param[NPARAMS];
  char  name[24];
};

struct VOICE
{
  int32_t  delta;
  int32_t  frac;
  int32_t  pos;
  int32_t  end;
  int32_t  loop;

  float env;
  float dec;

  float f0;
  float f1;
  float ff;

  float outl;
  float outr;
  int32_t  note;
};

struct KGRP
{
  int32_t  root;
  int32_t  high;
  int32_t  pos;
  int32_t  end;
  int32_t  loop;
};

class mdaEPiano
{
public:
  mdaEPiano(float sampleRate);
  ~mdaEPiano();

  void process(float* outL, float* outR, int32_t sampleFrames);
  void noteOn(int32_t note, int32_t velocity);
  void setParameter(int32_t index, float value);
  float getParameter(int32_t index);
  void setProgram(int32_t program);
  int32_t getProgram() { return curProgram; }
  int32_t getNumPrograms() { return NPROGS; }
  int32_t getNumParams() { return NPARAMS; }
  void setSampleRate(float rate);
  void setSustain(int32_t value);
  void allNotesOff();
  int32_t getActiveVoices() { return activevoices; }

private:
  void update();
  void fillpatch(int32_t p, const char *name, float p0, float p1, float p2, float p3, float p4,
                 float p5, float p6, float p7, float p8, float p9, float p10, float p11);

  mdaEPianoProgram* programs;
  int32_t curProgram;
  float Fs, iFs;

  KGRP  kgrp[34];
  VOICE voice[NVOICES];
  int32_t  activevoices, poly;
  short *waves;
  float width;
  int32_t  size, sustain;
  float lfo0, lfo1, dlfo, lmod, rmod;
  float treb, tfrq, tl, tr;
  float tune, fine, random, stretch, overdrive;
  float muff, muffvel, sizevel, velsens, volume, modwhl;
};

#endif
