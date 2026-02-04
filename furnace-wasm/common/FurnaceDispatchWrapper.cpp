/**
 * FurnaceDispatchWrapper.cpp - WASM exports for Furnace chip dispatches
 *
 * Wraps Furnace DivDispatch instances with C-callable functions for
 * Emscripten. Manages dispatch lifecycle, command forwarding, audio
 * rendering, and oscilloscope buffer access.
 */

#include "furnace_preempt.h"
#include "dispatch.h"
#include "instrument.h"
#include "wavetable.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

// Forward declarations for DivEngineStub.cpp functions
extern "C" {
  void engine_set_instrument(int index, DivInstrument* ins);
  void engine_set_wavetable(int index, DivWavetable* wave);
}

// Include platform headers based on build configuration
#ifdef FURNACE_BUILD_GB
#include "platform/gb.h"
#endif

// ============================================================
// Platform type enum (matches TypeScript FurnaceChipType)
// ============================================================
enum FurnacePlatformType {
  PLATFORM_GB = 0x80,
  PLATFORM_NES = 0x83,
  PLATFORM_SMS = 0x03,   // SN76489
  PLATFORM_AY = 0x06,
  PLATFORM_OPN2 = 0x02,  // YM2612 (Genesis)
  PLATFORM_OPM = 0x1b,   // YM2151 (Arcade)
};

// ============================================================
// Instance management
// ============================================================
struct DispatchInstance {
  DivDispatch* dispatch;
  DivEngine engine;           // Each instance gets its own engine stub
  int platformType;
  int numChannels;
  int sampleRate;

  // Audio output buffers (interleaved short -> float conversion)
  short* bufL;
  short* bufR;
  short** bufs;
  int bufSize;

  DispatchInstance():
    dispatch(nullptr),
    platformType(0),
    numChannels(0),
    sampleRate(44100),
    bufL(nullptr),
    bufR(nullptr),
    bufs(nullptr),
    bufSize(0) {}

  ~DispatchInstance() {
    if (dispatch) {
      dispatch->quit();
      delete dispatch;
    }
    delete[] bufL;
    delete[] bufR;
    delete[] bufs;
  }

  void allocBufs(int size) {
    delete[] bufL;
    delete[] bufR;
    delete[] bufs;
    bufSize = size;
    bufL = new short[size];
    bufR = new short[size];
    bufs = new short*[2];
    bufs[0] = bufL;
    bufs[1] = bufR;
  }
};

static std::map<int, DispatchInstance*> g_instances;
static int g_nextHandle = 1;

// ============================================================
// WASM Exports
// ============================================================
extern "C" {

/**
 * Create a dispatch instance for the given platform type.
 * Returns a handle (>0) on success, 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int furnace_dispatch_create(int platformType, int sampleRate) {
  DispatchInstance* inst = new DispatchInstance();
  inst->platformType = platformType;
  inst->sampleRate = sampleRate;
  inst->engine.curHz = 60.0f;
  inst->engine.tickMult = 1;
  inst->engine.song.tuning = 440.0f;

  DivConfig flags;

  switch (platformType) {
#ifdef FURNACE_BUILD_GB
    case PLATFORM_GB:
      inst->dispatch = new DivPlatformGB();
      inst->numChannels = 4;
      break;
#endif
    default:
      printf("[FurnaceDispatch] Unknown platform type: %d\n", platformType);
      delete inst;
      return 0;
  }

  // Initialize the dispatch with our engine stub
  int result = inst->dispatch->init(&inst->engine, inst->numChannels, sampleRate, flags);
  if (result == 0) {
    printf("[FurnaceDispatch] Dispatch init failed for platform %d\n", platformType);
    delete inst;
    return 0;
  }

  // Allocate audio buffers (128 samples is typical AudioWorklet quantum)
  inst->allocBufs(256);

  int handle = g_nextHandle++;
  g_instances[handle] = inst;

  printf("[FurnaceDispatch] Created platform %d, handle=%d, channels=%d, rate=%d\n",
         platformType, handle, inst->numChannels, sampleRate);
  return handle;
}

/**
 * Destroy a dispatch instance.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_destroy(int handle) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    delete it->second;
    g_instances.erase(it);
  }
}

/**
 * Reset a dispatch instance.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_reset(int handle) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    it->second->dispatch->reset();
  }
}

/**
 * Send a dispatch command. Returns the dispatch result.
 */
EMSCRIPTEN_KEEPALIVE
int furnace_dispatch_cmd(int handle, int cmd, int chan, int val1, int val2) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return -1;

  DivCommand c((DivDispatchCmds)cmd, (unsigned char)chan, val1, val2);

  return it->second->dispatch->dispatch(c);
}

/**
 * Advance one engine tick (macros, envelopes, etc.)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_tick(int handle) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;
  it->second->dispatch->tick(true);
}

/**
 * Render audio samples. Outputs are float arrays allocated in WASM memory.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_render(int handle, float* outL, float* outR, int numSamples) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;

  DispatchInstance* inst = it->second;

  // Ensure buffer is large enough
  if (numSamples > inst->bufSize) {
    inst->allocBufs(numSamples);
  }

  // Clear buffers
  memset(inst->bufL, 0, numSamples * sizeof(short));
  memset(inst->bufR, 0, numSamples * sizeof(short));

  // Render via dispatch
  inst->dispatch->acquire(inst->bufs, numSamples);

  // Convert short to float with normalization
  float postAmp = inst->dispatch->getPostAmp();
  for (int i = 0; i < numSamples; i++) {
    outL[i] = (inst->bufL[i] / 32768.0f) * postAmp;
    outR[i] = (inst->bufR[i] / 32768.0f) * postAmp;
  }
}

/**
 * Get the number of channels for a dispatch instance.
 */
EMSCRIPTEN_KEEPALIVE
int furnace_dispatch_get_num_channels(int handle) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return 0;
  return it->second->numChannels;
}

/**
 * Get the current write position (needle) of a channel's oscilloscope buffer.
 * Returns the 16-bit buffer position (needle >> 16).
 */
EMSCRIPTEN_KEEPALIVE
int furnace_dispatch_get_osc_needle(int handle, int chan) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return 0;

  DivDispatchOscBuffer* osc = it->second->dispatch->getOscBuffer(chan);
  if (!osc) return 0;
  return osc->needle >> 16;
}

/**
 * Read oscilloscope data from a channel's ring buffer.
 * Copies numSamples samples starting at startPos into outBuf.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_get_osc_data(int handle, int chan,
    int16_t* outBuf, int startPos, int numSamples) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;

  DivDispatchOscBuffer* osc = it->second->dispatch->getOscBuffer(chan);
  if (!osc) {
    memset(outBuf, 0, numSamples * sizeof(int16_t));
    return;
  }

  for (int i = 0; i < numSamples; i++) {
    unsigned short pos = (startPos + i) & 0xFFFF;
    outBuf[i] = osc->data[pos];
  }
}

/**
 * Mute/unmute a channel.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_mute(int handle, int chan, int mute) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;
  it->second->dispatch->muteChannel(chan, mute != 0);
}

/**
 * Set compatibility flags on the engine.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_compat_flag(int handle, int flagId, int value) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;

  DivCompatFlags& flags = it->second->engine.song.compatFlags;
  switch (flagId) {
    case 0: flags.linearPitch = (unsigned char)value; break;
    case 1: flags.waveDutyIsVol = (bool)value; break;
    case 2: flags.resetMacroOnPorta = (bool)value; break;
    case 3: flags.brokenOutVol = (bool)value; break;
    case 4: flags.gbInsAffectsEnvelope = (bool)value; break;
    case 5: flags.brokenPortaArp = (bool)value; break;
    case 6: flags.oldArpStrategy = (bool)value; break;
    case 7: flags.volMacroLinger = (bool)value; break;
    case 8: flags.ceilVolumeScaling = (bool)value; break;
    case 9: flags.newVolumeScaling = (bool)value; break;
    default: break;
  }
}

/**
 * Set the tick rate (Hz) for the engine.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_tick_rate(int handle, float hz) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;
  it->second->engine.curHz = hz;
}

/**
 * Set tuning frequency (default 440.0).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_tuning(int handle, float tuning) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;
  it->second->engine.song.tuning = tuning;
}

/**
 * Set a Game Boy instrument on the engine for dispatch use.
 * Simple binary format:
 *   [1] envVol, [1] envDir, [1] envLen, [1] soundLen,
 *   [1] softEnv, [1] alwaysInit, [1] doubleWave,
 *   [1] hwSeqLen, then hwSeqLen * {[1] cmd, [2] data}
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_gb_instrument(int handle, int insIndex,
    const uint8_t* data, int dataLen) {
  if (dataLen < 8) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_GB;
  ins->gb.envVol = data[0];
  ins->gb.envDir = data[1];
  ins->gb.envLen = data[2];
  ins->gb.soundLen = data[3];
  ins->gb.softEnv = data[4] != 0;
  ins->gb.alwaysInit = data[5] != 0;
  ins->gb.doubleWave = data[6] != 0;
  ins->gb.hwSeqLen = data[7];

  int offset = 8;
  for (int i = 0; i < ins->gb.hwSeqLen && offset + 3 <= dataLen; i++) {
    ins->gb.hwSeq[i].cmd = data[offset];
    ins->gb.hwSeq[i].data = data[offset + 1] | (data[offset + 2] << 8);
    offset += 3;
  }

  // Store in global instrument list
  engine_set_instrument(insIndex, ins);
}

/**
 * Set a wavetable on the engine.
 * Format: [4] len (int32), [4] max (int32), then len * [4] data values (int32)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_wavetable(int handle, int waveIndex,
    const uint8_t* data, int dataLen) {
  if (dataLen < 8) return;

  int len, max;
  memcpy(&len, data, sizeof(int32_t));
  memcpy(&max, data + 4, sizeof(int32_t));

  DivWavetable* wave = new DivWavetable();
  wave->len = len;
  wave->max = max;
  if (len > 256) len = 256;

  int offset = 8;
  for (int i = 0; i < len && offset + 4 <= dataLen; i++) {
    int32_t val;
    memcpy(&val, data + offset, sizeof(int32_t));
    wave->data[i] = val;
    offset += 4;
  }

  engine_set_wavetable(waveIndex, wave);
}

/**
 * Force-update instruments on all channels (e.g. after changing instrument data).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_force_ins(int handle) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;
  it->second->dispatch->forceIns();
}

/**
 * Write directly to a chip register (for debugging/testing).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_poke(int handle, int addr, int val) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;
  it->second->dispatch->poke((unsigned int)addr, (unsigned short)val);
}

/**
 * Global initialization. Called once when the WASM module loads.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_init(int sampleRate) {
  printf("[FurnaceDispatch] Module initialized, sampleRate=%d\n", sampleRate);
}

} // extern "C"
