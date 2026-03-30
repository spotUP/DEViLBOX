/*
  C bridge for mdaEPiano WASM module.
  Provides extern "C" functions for Emscripten export.
*/

#include "../src/mdaEPiano_standalone.h"

extern "C" {

// Lifecycle
void* epiano_create(float sampleRate) {
  return new mdaEPiano(sampleRate);
}

void epiano_destroy(void* handle) {
  delete static_cast<mdaEPiano*>(handle);
}

// Audio
void epiano_process(void* handle, float* outL, float* outR, int frames) {
  static_cast<mdaEPiano*>(handle)->process(outL, outR, frames);
}

// MIDI
void epiano_note_on(void* handle, int note, int velocity) {
  static_cast<mdaEPiano*>(handle)->noteOn(note, velocity);
}

void epiano_note_off(void* handle, int note) {
  static_cast<mdaEPiano*>(handle)->noteOn(note, 0);
}

void epiano_sustain(void* handle, int value) {
  static_cast<mdaEPiano*>(handle)->setSustain(value);
}

void epiano_all_notes_off(void* handle) {
  static_cast<mdaEPiano*>(handle)->allNotesOff();
}

// Parameters (12 total, all 0.0-1.0)
void epiano_set_param(void* handle, int index, float value) {
  static_cast<mdaEPiano*>(handle)->setParameter(index, value);
}

float epiano_get_param(void* handle, int index) {
  return static_cast<mdaEPiano*>(handle)->getParameter(index);
}

// Presets
void epiano_set_program(void* handle, int program) {
  static_cast<mdaEPiano*>(handle)->setProgram(program);
}

int epiano_get_num_programs(void* handle) {
  return static_cast<mdaEPiano*>(handle)->getNumPrograms();
}

// Info
int epiano_get_num_params(void* handle) {
  return static_cast<mdaEPiano*>(handle)->getNumParams();
}

int epiano_get_active_voices(void* handle) {
  return static_cast<mdaEPiano*>(handle)->getActiveVoices();
}

} // extern "C"
