/**
 * DivEngineStub.cpp - Implementation of stubbed DivEngine methods
 *
 * Provides instrument/wavetable/sample storage that the WASM wrapper
 * populates via exported functions. Dispatches call parent->getIns(),
 * parent->getWave(), parent->getSample() to access this data.
 */

#include "furnace_preempt.h"
#include "instrument.h"
#include "wavetable.h"
// DivSample is defined in furnace_preempt.h

// Storage for instruments, wavetables, and samples
static std::vector<DivInstrument*> g_instruments;
static std::vector<DivWavetable*> g_wavetables;
static std::vector<DivSample*> g_samples;

// Default fallback instrument
static DivInstrument g_defaultIns;

DivInstrument* DivEngine::getIns(int index, int fallbackType) {
  if (index >= 0 && index < (int)g_instruments.size() && g_instruments[index]) {
    return g_instruments[index];
  }
  return &g_defaultIns;
}

DivWavetable* DivEngine::getWave(int index) {
  if (index >= 0 && index < (int)g_wavetables.size() && g_wavetables[index]) {
    return g_wavetables[index];
  }
  // Return a default wavetable
  static DivWavetable defaultWave;
  return &defaultWave;
}

DivSample* DivEngine::getSample(int index) {
  if (index >= 0 && index < (int)g_samples.size() && g_samples[index]) {
    return g_samples[index];
  }
  static DivSample defaultSample;
  return &defaultSample;
}

// Functions called by the WASM wrapper to populate storage
extern "C" {

void engine_set_instrument(int index, DivInstrument* ins) {
  if (index < 0) return;
  if (index >= (int)g_instruments.size()) {
    g_instruments.resize(index + 1, nullptr);
  }
  delete g_instruments[index];
  g_instruments[index] = ins;
}

void engine_set_wavetable(int index, DivWavetable* wave) {
  if (index < 0) return;
  if (index >= (int)g_wavetables.size()) {
    g_wavetables.resize(index + 1, nullptr);
  }
  delete g_wavetables[index];
  g_wavetables[index] = wave;
}

void engine_set_sample(int index, DivSample* sample) {
  if (index < 0) return;
  if (index >= (int)g_samples.size()) {
    g_samples.resize(index + 1, nullptr);
  }
  delete g_samples[index];
  g_samples[index] = sample;
}

void engine_clear_all() {
  for (auto* ins : g_instruments) delete ins;
  for (auto* wave : g_wavetables) delete wave;
  for (auto* sample : g_samples) delete sample;
  g_instruments.clear();
  g_wavetables.clear();
  g_samples.clear();
}

} // extern "C"
