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

// Callback for when an instrument is set (for macro syncing)
typedef void (*InstrumentSetCallback)(int index, DivInstrument* ins);
static InstrumentSetCallback g_instrumentSetCallback = nullptr;

void engine_register_instrument_callback(InstrumentSetCallback cb) {
  g_instrumentSetCallback = cb;
}

// Default fallback instrument
static DivInstrument g_defaultIns;

DivInstrument* DivEngine::getIns(int index, int fallbackType) {
  if (index >= 0 && index < (int)g_instruments.size() && g_instruments[index]) {
    DivInstrument* ins = g_instruments[index];
    // Debug: log C64 instrument fetches
    if (fallbackType == 3 || ins->type == DIV_INS_C64) {
      printf("[DivEngine::getIns] index=%d type=%d c64.wave=%d%d%d%d ADSR=%d/%d/%d/%d duty=%d\n",
             index, ins->type,
             ins->c64.triOn ? 1 : 0, ins->c64.sawOn ? 1 : 0,
             ins->c64.pulseOn ? 1 : 0, ins->c64.noiseOn ? 1 : 0,
             ins->c64.a, ins->c64.d, ins->c64.s, ins->c64.r, ins->c64.duty);
    }
    return ins;
  }
  printf("[DivEngine::getIns] FALLBACK: index=%d not found (size=%d), returning default\n",
         index, (int)g_instruments.size());
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

void engine_register_instrument_set_callback(void (*cb)(int, DivInstrument*)) {
  g_instrumentSetCallback = cb;
}

void engine_set_instrument(int index, DivInstrument* ins) {
  if (index < 0) return;
  if (index >= (int)g_instruments.size()) {
    g_instruments.resize(index + 1, nullptr);
  }
  delete g_instruments[index];
  g_instruments[index] = ins;
  
  // Notify callback (used for macro syncing)
  if (g_instrumentSetCallback) {
    g_instrumentSetCallback(index, ins);
  }
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
