// Verbatim copy of DivEngine::noteToSplitNote (third-party/furnace-master/src/engine/engine.cpp:2322-2353).
// engine.cpp is not linked into this module; text.cpp (saveText) needs this function.
#include "engine.h"

void DivEngine::noteToSplitNote(short note, short& outNote, short& outOctave) {
  switch (note) {
    case DIV_NOTE_OFF:
      outNote=100;
      outOctave=0;
      break;
    case DIV_NOTE_REL:
      outNote=101;
      outOctave=0;
      break;
    case DIV_MACRO_REL:
      outNote=102;
      outOctave=0;
      break;
    case DIV_NOTE_NULL_PAT:
      // "BUG" note!
      outNote=0;
      outOctave=1;
      break;
    case -1:
      outNote=0;
      outOctave=0;
      break;
    default:
      outNote=note%12;
      outOctave=(unsigned char)(note-60)/12;
      if (outNote==0) {
        outNote=12;
        outOctave--;
      }
      break;
  }
}
