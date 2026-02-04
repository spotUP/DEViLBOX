/**
 * InstrumentStub.cpp - Minimal DivInstrument implementations for WASM
 *
 * Provides destructor, copy constructor, and assignment operator that
 * the linker requires. We don't need the full 3900-line instrument.cpp
 * since we never serialize/deserialize instruments in WASM.
 */

#include "furnace_preempt.h"
#include "instrument.h"

DivInstrument::~DivInstrument() {
  // In WASM we don't use undo/redo history, so nothing to clean up
  // beyond what member destructors handle automatically
}

DivInstrument::DivInstrument(const DivInstrument& ins) {
  *(DivInstrumentPOD*)this = ins;
  name = ins.name;
}

DivInstrument& DivInstrument::operator=(const DivInstrument& ins) {
  *(DivInstrumentPOD*)this = ins;
  name = ins.name;
  return *this;
}
