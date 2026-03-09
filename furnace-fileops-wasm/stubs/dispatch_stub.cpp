/**
 * dispatch_stub.cpp — Stub implementations for DivDispatch and DivEffect
 *
 * The file ops module never instantiates dispatches or effects.
 * These stubs satisfy the linker for virtual destructors and vtable entries.
 */

#include "dispatch.h"
#include "effect.h"
#include "filePlayer.h"

// DivDispatch stubs
DivDispatch::~DivDispatch() {}
DivDispatchOscBuffer* DivDispatch::getOscBuffer(int chan) { return NULL; }

// DivEffect stubs
void DivEffect::acquire(float** in, float** out, size_t len) {}
void DivEffect::reset() {}
int DivEffect::getInputCount() { return 0; }
int DivEffect::getOutputCount() { return 0; }
DivEffect::~DivEffect() {}

// DivFilePlayer stubs
DivFilePlayer::DivFilePlayer():
  sincTable(NULL), discardBuf(NULL), blocks(NULL), priorityBlock(NULL),
  numBlocks(0), sf(NULL), playPos(0), lastWantBlock(-1), wantBlock(-1),
  outRate(44100), rateAccum(0), volume(1.0f), playing(false), fileError(false),
  quitThread(false), threadHasQuit(false), isActive(false),
  pendingPos(-1), pendingPosOffset(0), pendingPlayOffset(0), pendingStopOffset(0),
  cacheThread(NULL) {
  memset(&si, 0, sizeof(si));
}
DivFilePlayer::~DivFilePlayer() {}
