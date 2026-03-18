/**
 * FurnaceDispatchWrapper.cpp - WASM exports for Furnace chip dispatches
 *
 * Full 1:1 Furnace platform support. Wraps DivDispatch instances with
 * C-callable functions for Emscripten.
 */

#include "furnace_preempt.h"
#include "dispatch.h"
#include "instrument.h"
#include "wavetable.h"
#include "blip_buf.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

// Sample format encoders (all compiled into WASM)
extern "C" long brrEncode(short* buf, unsigned char* out, long len, long loopStart, unsigned char emphasis, unsigned char noFilter);
extern "C" void yma_encode(short* buffer, unsigned char* outbuffer, long len);
extern "C" void ymb_encode(short* buffer, unsigned char* outbuffer, long len);
extern "C" void ymz_encode(short* buffer, unsigned char* outbuffer, long len);
extern "C" void oki_encode(short* buffer, unsigned char* outbuffer, long len);
extern "C" void oki6258_encode(short* buffer, unsigned char* outbuffer, long len);
extern "C" void bs_encode(short* buffer, unsigned char* outbuffer, long len);

// Forward declarations for DivEngineStub.cpp functions
extern "C" {
  void engine_set_instrument(int index, DivInstrument* ins);
  void engine_set_wavetable(int index, DivWavetable* wave);
  void engine_set_sample(int index, DivSample* sample);
}

// ============================================================
// Include ALL platform headers
// ============================================================
#include "platform/gb.h"
#include "platform/nes.h"
#include "platform/pce.h"
#include "platform/sms.h"
#include "platform/snes.h"
#include "platform/swan.h"
#include "platform/lynx.h"
#include "platform/vb.h"
#include "platform/nds.h"
#include "platform/pokemini.h"

#include "platform/fds.h"
#include "platform/mmc5.h"
#include "platform/n163.h"
#include "platform/vrc6.h"

#include "platform/c64.h"
#include "platform/pet.h"
#include "platform/vic20.h"
#include "platform/ted.h"

#include "platform/tia.h"
#include "platform/pokey.h"

#include "platform/ay.h"
#include "platform/ay8930.h"
#include "platform/saa.h"
#include "platform/t6w28.h"

#include "platform/genesis.h"
#include "platform/genesisext.h"
#include "platform/arcade.h"
#include "platform/tx81z.h"
#include "platform/ym2203.h"
#include "platform/ym2203ext.h"
#include "platform/ym2608.h"
#include "platform/ym2608ext.h"
#include "platform/ym2610.h"
#include "platform/ym2610ext.h"
#include "platform/ym2610b.h"
#include "platform/ym2610bext.h"
#include "platform/opl.h"
#include "platform/opll.h"
#include "platform/esfm.h"

#include "platform/amiga.h"
#include "platform/segapcm.h"
#include "platform/multipcm.h"
#include "platform/qsound.h"
#include "platform/rf5c68.h"
#include "platform/pcmdac.h"
#include "platform/es5506.h"
#include "platform/k007232.h"
#include "platform/k053260.h"
#include "platform/ga20.h"
#include "platform/c140.h"
#include "platform/ymz280b.h"
#include "platform/msm6258.h"
#include "platform/msm6295.h"

#include "platform/scc.h"
#include "platform/namcowsg.h"
#include "platform/bubsyswsg.h"
#include "platform/x1_010.h"
#include "platform/vera.h"
#include "platform/su.h"

#include "platform/pcspkr.h"
#include "platform/pong.h"
#include "platform/pv1000.h"
#include "platform/msm5232.h"
#include "platform/sm8521.h"
#include "platform/dave.h"
#include "platform/bifurcator.h"
#include "platform/powernoise.h"

// Additional platforms for full coverage
#include "platform/zxbeeper.h"
#include "platform/zxbeeperquadtone.h"
#include "platform/dummy.h"
#include "platform/gbadma.h"
#include "platform/gbaminmod.h"
#include "platform/sid2.h"
#include "platform/sid3.h"
#include "platform/supervision.h"
#include "platform/scvtone.h"

// ============================================================
// DivSystem enum (from Furnace sysDef.h)
// ============================================================
enum DivSystemLocal {
  DIV_SYSTEM_NULL=0,
  DIV_SYSTEM_YMU759,
  DIV_SYSTEM_GENESIS,
  DIV_SYSTEM_GENESIS_EXT,
  DIV_SYSTEM_SMS,
  DIV_SYSTEM_SMS_OPLL,
  DIV_SYSTEM_GB,
  DIV_SYSTEM_PCE,
  DIV_SYSTEM_NES,
  DIV_SYSTEM_NES_VRC7,
  DIV_SYSTEM_NES_FDS,
  DIV_SYSTEM_C64_6581,
  DIV_SYSTEM_C64_8580,
  DIV_SYSTEM_ARCADE,
  DIV_SYSTEM_MSX2,
  DIV_SYSTEM_YM2610_CRAP,
  DIV_SYSTEM_YM2610_CRAP_EXT,
  DIV_SYSTEM_AY8910,
  DIV_SYSTEM_AMIGA,
  DIV_SYSTEM_YM2151,
  DIV_SYSTEM_YM2612,
  DIV_SYSTEM_TIA,
  DIV_SYSTEM_SAA1099,
  DIV_SYSTEM_AY8930,
  DIV_SYSTEM_VIC20,
  DIV_SYSTEM_PET,
  DIV_SYSTEM_SNES,
  DIV_SYSTEM_VRC6,
  DIV_SYSTEM_OPLL,
  DIV_SYSTEM_FDS,
  DIV_SYSTEM_MMC5,
  DIV_SYSTEM_N163,
  DIV_SYSTEM_YM2203,
  DIV_SYSTEM_YM2203_EXT,
  DIV_SYSTEM_YM2608,
  DIV_SYSTEM_YM2608_EXT,
  DIV_SYSTEM_OPL,
  DIV_SYSTEM_OPL2,
  DIV_SYSTEM_OPL3,
  DIV_SYSTEM_MULTIPCM,
  DIV_SYSTEM_PCSPKR,
  DIV_SYSTEM_POKEY,
  DIV_SYSTEM_RF5C68,
  DIV_SYSTEM_SWAN,
  DIV_SYSTEM_OPZ,
  DIV_SYSTEM_POKEMINI,
  DIV_SYSTEM_SEGAPCM,
  DIV_SYSTEM_VBOY,
  DIV_SYSTEM_VRC7,
  DIV_SYSTEM_YM2610B,
  DIV_SYSTEM_SFX_BEEPER,
  DIV_SYSTEM_SFX_BEEPER_QUADTONE,
  DIV_SYSTEM_YM2612_EXT,
  DIV_SYSTEM_SCC,
  DIV_SYSTEM_OPL_DRUMS,
  DIV_SYSTEM_OPL2_DRUMS,
  DIV_SYSTEM_OPL3_DRUMS,
  DIV_SYSTEM_YM2610_FULL,
  DIV_SYSTEM_YM2610_FULL_EXT,
  DIV_SYSTEM_OPLL_DRUMS,
  DIV_SYSTEM_LYNX,
  DIV_SYSTEM_QSOUND,
  DIV_SYSTEM_VERA,
  DIV_SYSTEM_YM2610B_EXT,
  DIV_SYSTEM_SEGAPCM_COMPAT,
  DIV_SYSTEM_X1_010,
  DIV_SYSTEM_BUBSYS_WSG,
  DIV_SYSTEM_OPL4,
  DIV_SYSTEM_OPL4_DRUMS,
  DIV_SYSTEM_ES5506,
  DIV_SYSTEM_Y8950,
  DIV_SYSTEM_Y8950_DRUMS,
  DIV_SYSTEM_SCC_PLUS,
  DIV_SYSTEM_SOUND_UNIT,
  DIV_SYSTEM_MSM6295,
  DIV_SYSTEM_MSM6258,
  DIV_SYSTEM_YMZ280B,
  DIV_SYSTEM_NAMCO,
  DIV_SYSTEM_NAMCO_15XX,
  DIV_SYSTEM_NAMCO_CUS30,
  DIV_SYSTEM_YM2612_DUALPCM,
  DIV_SYSTEM_YM2612_DUALPCM_EXT,
  DIV_SYSTEM_MSM5232,
  DIV_SYSTEM_T6W28,
  DIV_SYSTEM_K007232,
  DIV_SYSTEM_GA20,
  DIV_SYSTEM_PCM_DAC,
  DIV_SYSTEM_PONG,
  DIV_SYSTEM_DUMMY,
  DIV_SYSTEM_YM2612_CSM,
  DIV_SYSTEM_YM2610_CSM,
  DIV_SYSTEM_YM2610B_CSM,
  DIV_SYSTEM_YM2203_CSM,
  DIV_SYSTEM_YM2608_CSM,
  DIV_SYSTEM_SM8521,
  DIV_SYSTEM_PV1000,
  DIV_SYSTEM_K053260,
  DIV_SYSTEM_TED,
  DIV_SYSTEM_C140,
  DIV_SYSTEM_C219,
  DIV_SYSTEM_ESFM,
  DIV_SYSTEM_POWERNOISE,
  DIV_SYSTEM_DAVE,
  DIV_SYSTEM_NDS,
  DIV_SYSTEM_GBA_DMA,
  DIV_SYSTEM_GBA_MINMOD,
  DIV_SYSTEM_5E01,
  DIV_SYSTEM_BIFURCATOR,
  DIV_SYSTEM_SID2,
  DIV_SYSTEM_SUPERVISION,
  DIV_SYSTEM_UPD1771C,
  DIV_SYSTEM_SID3,
  DIV_SYSTEM_C64_PCM,
  DIV_SYSTEM_MAX
};

// ============================================================
// Macro Interpreter (ported from Furnace macroInt.h/cpp)
// ============================================================
#define MAX_CHANNELS 32

// ============================================================
// Instance management
// ============================================================
struct DispatchInstance {
  DivDispatch* dispatch;
  DivEngine engine;
  int platformType;
  int numChannels;
  int sampleRate;

  short* bufL;
  short* bufR;
  short** bufs;
  int bufSize;

  // Blip buffer resampling (matches Furnace's DivDispatchContainer)
  blip_t* bb[2];       // Blip buffers for L/R
  short* bbIn[2];      // Input buffers for non-direct acquire path
  int bbInSize;
  int bbTemp[2];        // Delta tracking: current sample
  int bbPrevSample[2];  // Delta tracking: previous sample
  short* bbReadOut[2];  // Output buffers for blip_read_samples
  int bbReadOutSize;
  bool useDirect;       // hasAcquireDirect() result
  int chipOuts;         // dispatch->getOutputCount()
  bool bbInitialized;
  int renderCount;

  DispatchInstance():
    dispatch(nullptr),
    platformType(0),
    numChannels(0),
    sampleRate(44100),
    bufL(nullptr),
    bufR(nullptr),
    bufs(nullptr),
    bufSize(0),
    bbInSize(0),
    bbReadOutSize(0),
    useDirect(false),
    chipOuts(1),
    bbInitialized(false),
    renderCount(0) {
    for (int i = 0; i < 2; i++) {
      bb[i] = nullptr;
      bbIn[i] = nullptr;
      bbReadOut[i] = nullptr;
      bbTemp[i] = 0;
      bbPrevSample[i] = 0;
    }
  }

  ~DispatchInstance() {
    if (dispatch) {
      dispatch->quit();
      delete dispatch;
    }
    delete[] bufL;
    delete[] bufR;
    delete[] bufs;
    for (int i = 0; i < 2; i++) {
      if (bb[i]) blip_delete(bb[i]);
      delete[] bbIn[i];
      delete[] bbReadOut[i];
    }
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

  void initBlipBuffers() {
    useDirect = dispatch->hasAcquireDirect();
    chipOuts = dispatch->getOutputCount();
    if (chipOuts > 2) chipOuts = 2; // Cap at stereo

    int chipRate = dispatch->rate;
    if (chipRate <= 0) chipRate = sampleRate; // Fallback

    printf("[FurnaceDispatch] Blip init: platform=%d, chipRate=%d, sampleRate=%d, direct=%d, outs=%d\n",
           platformType, chipRate, sampleRate, useDirect ? 1 : 0, chipOuts);

    for (int i = 0; i < chipOuts; i++) {
      bb[i] = blip_new(32768);
      if (bb[i]) {
        blip_set_rates(bb[i], (double)chipRate, (double)sampleRate);
        blip_set_dc(bb[i], 1); // Enable DC high-pass filter (matches Furnace default audioHiPass=1)
      }
    }

    // Allocate bbIn for non-direct path
    if (!useDirect) {
      bbInSize = 8192;
      for (int i = 0; i < chipOuts; i++) {
        bbIn[i] = new short[bbInSize];
        memset(bbIn[i], 0, bbInSize * sizeof(short));
      }
    }

    // Allocate read-out buffers
    bbReadOutSize = 1024;
    for (int i = 0; i < chipOuts; i++) {
      bbReadOut[i] = new short[bbReadOutSize];
    }

    bbInitialized = true;
  }

  void ensureBbIn(int size) {
    if (size <= bbInSize) return;
    bbInSize = size;
    for (int i = 0; i < chipOuts; i++) {
      delete[] bbIn[i];
      bbIn[i] = new short[bbInSize];
    }
  }

  void ensureBbReadOut(int size) {
    if (size <= bbReadOutSize) return;
    bbReadOutSize = size;
    for (int i = 0; i < chipOuts; i++) {
      delete[] bbReadOut[i];
      bbReadOut[i] = new short[bbReadOutSize];
    }
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

  // Create dispatch based on platform type (matching DivSystem enum)
  switch (platformType) {
    // === Console Platforms ===
    case DIV_SYSTEM_GB:
      inst->dispatch = new DivPlatformGB();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_NES:
      inst->dispatch = new DivPlatformNES();
      inst->numChannels = 5;
      break;
    case DIV_SYSTEM_PCE:
      inst->dispatch = new DivPlatformPCE();
      inst->numChannels = 6;
      break;
    case DIV_SYSTEM_SMS:
      inst->dispatch = new DivPlatformSMS();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_SNES:
      inst->dispatch = new DivPlatformSNES();
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_SWAN:
      inst->dispatch = new DivPlatformSwan();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_LYNX:
      inst->dispatch = new DivPlatformLynx();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_VBOY:
      inst->dispatch = new DivPlatformVB();
      inst->numChannels = 6;
      break;
    case DIV_SYSTEM_NDS:
      inst->dispatch = new DivPlatformNDS();
      inst->numChannels = 16;
      break;
    case DIV_SYSTEM_POKEMINI:
      inst->dispatch = new DivPlatformPokeMini();
      inst->numChannels = 1;
      break;

    // === NES Expansion ===
    case DIV_SYSTEM_FDS:
      inst->dispatch = new DivPlatformFDS();
      ((DivPlatformFDS*)inst->dispatch)->setNSFPlay(true); // Match Furnace render default (fdsCoreRender=1)
      inst->numChannels = 1;
      break;
    case DIV_SYSTEM_MMC5:
      inst->dispatch = new DivPlatformMMC5();
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_N163:
      inst->dispatch = new DivPlatformN163();
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_VRC6:
      inst->dispatch = new DivPlatformVRC6();
      inst->numChannels = 3;
      break;

    // === Commodore ===
    case DIV_SYSTEM_C64_6581:
      inst->dispatch = new DivPlatformC64();
      ((DivPlatformC64*)inst->dispatch)->setCore(1); // Use reSIDfp (more accurate, better noise)
      ((DivPlatformC64*)inst->dispatch)->setChipModel(true); // 6581 model
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_C64_8580:
      inst->dispatch = new DivPlatformC64();
      ((DivPlatformC64*)inst->dispatch)->setCore(1); // Use reSIDfp (more accurate, better noise)
      ((DivPlatformC64*)inst->dispatch)->setChipModel(false); // 8580 model
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_PET:
      inst->dispatch = new DivPlatformPET();
      inst->numChannels = 1;
      break;
    case DIV_SYSTEM_VIC20:
      inst->dispatch = new DivPlatformVIC20();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_TED:
      inst->dispatch = new DivPlatformTED();
      inst->numChannels = 2;
      break;

    // === Atari ===
    case DIV_SYSTEM_TIA:
      inst->dispatch = new DivPlatformTIA();
      inst->numChannels = 2;
      break;
    case DIV_SYSTEM_POKEY:
      inst->dispatch = new DivPlatformPOKEY();
      inst->numChannels = 4;
      break;

    // === PSG Chips ===
    case DIV_SYSTEM_AY8910:
      inst->dispatch = new DivPlatformAY8910();
      ((DivPlatformAY8910*)inst->dispatch)->setCore(0); // Use SSG core (0=SSG, 1=atomic)
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_AY8930:
      inst->dispatch = new DivPlatformAY8930();
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_SAA1099:
      inst->dispatch = new DivPlatformSAA1099();
      inst->numChannels = 6;
      break;
    case DIV_SYSTEM_T6W28:
      inst->dispatch = new DivPlatformT6W28();
      inst->numChannels = 4;
      break;

    // === FM Chips (Yamaha) ===
    case DIV_SYSTEM_YM2612:
    case DIV_SYSTEM_GENESIS:
      inst->dispatch = new DivPlatformGenesis();
      ((DivPlatformGenesis*)inst->dispatch)->setSoftPCM(false);
      inst->numChannels = 10;
      break;
    case DIV_SYSTEM_YM2612_EXT:
    case DIV_SYSTEM_GENESIS_EXT:
      inst->dispatch = new DivPlatformGenesisExt();
      ((DivPlatformGenesisExt*)inst->dispatch)->setSoftPCM(false);
      inst->numChannels = 13;
      break;
    case DIV_SYSTEM_YM2151:
    case DIV_SYSTEM_ARCADE:
      inst->dispatch = new DivPlatformArcade();
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_OPZ:
      inst->dispatch = new DivPlatformTX81Z();
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_YM2203:
      inst->dispatch = new DivPlatformYM2203();
      inst->numChannels = 6;
      break;
    case DIV_SYSTEM_YM2203_EXT:
      inst->dispatch = new DivPlatformYM2203Ext();
      inst->numChannels = 9;
      break;
    case DIV_SYSTEM_YM2608:
      inst->dispatch = new DivPlatformYM2608();
      inst->numChannels = 16;
      break;
    case DIV_SYSTEM_YM2608_EXT:
      inst->dispatch = new DivPlatformYM2608Ext();
      inst->numChannels = 19;
      break;
    case DIV_SYSTEM_YM2610_FULL:
      inst->dispatch = new DivPlatformYM2610();
      inst->numChannels = 14;
      break;
    case DIV_SYSTEM_YM2610B:
      inst->dispatch = new DivPlatformYM2610B();
      inst->numChannels = 16;
      break;
    case DIV_SYSTEM_OPL:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(1, false);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 9;
      break;
    case DIV_SYSTEM_OPL2:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(2, false);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 9;
      break;
    case DIV_SYSTEM_OPL3:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(3, false);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 18;
      break;
    case DIV_SYSTEM_OPLL:
      inst->dispatch = new DivPlatformOPLL();
      ((DivPlatformOPLL*)inst->dispatch)->setCore(0); // Use Nuked-OPLL (most accurate)
      inst->numChannels = 9;
      break;
    case DIV_SYSTEM_ESFM:
      inst->dispatch = new DivPlatformESFM();
      inst->numChannels = 18;
      break;

    // === Sample-based Chips ===
    case DIV_SYSTEM_AMIGA:
      inst->dispatch = new DivPlatformAmiga();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_SEGAPCM:
    case DIV_SYSTEM_SEGAPCM_COMPAT:
      inst->dispatch = new DivPlatformSegaPCM();
      inst->numChannels = 16;
      break;
    case DIV_SYSTEM_MULTIPCM:
      inst->dispatch = new DivPlatformMultiPCM();
      inst->numChannels = 28;
      break;
    case DIV_SYSTEM_QSOUND:
      inst->dispatch = new DivPlatformQSound();
      inst->numChannels = 19;
      break;
    case DIV_SYSTEM_RF5C68:
      inst->dispatch = new DivPlatformRF5C68();
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_PCM_DAC:
      inst->dispatch = new DivPlatformPCMDAC();
      inst->numChannels = 1;
      break;
    case DIV_SYSTEM_ES5506:
      inst->dispatch = new DivPlatformES5506();
      inst->numChannels = 32;
      break;
    case DIV_SYSTEM_K007232:
      inst->dispatch = new DivPlatformK007232();
      inst->numChannels = 2;
      break;
    case DIV_SYSTEM_K053260:
      inst->dispatch = new DivPlatformK053260();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_GA20:
      inst->dispatch = new DivPlatformGA20();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_C140:
      inst->dispatch = new DivPlatformC140();
      ((DivPlatformC140*)inst->dispatch)->set219(false);
      inst->numChannels = 24;
      break;
    case DIV_SYSTEM_C219:
      inst->dispatch = new DivPlatformC140();
      ((DivPlatformC140*)inst->dispatch)->set219(true);
      inst->numChannels = 16;
      break;
    case DIV_SYSTEM_YMZ280B:
      inst->dispatch = new DivPlatformYMZ280B();
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_MSM6258:
      inst->dispatch = new DivPlatformMSM6258();
      inst->numChannels = 1;
      break;
    case DIV_SYSTEM_MSM6295:
      inst->dispatch = new DivPlatformMSM6295();
      inst->numChannels = 4;
      break;

    // === Wavetable Chips ===
    case DIV_SYSTEM_SCC:
      inst->dispatch = new DivPlatformSCC();
      ((DivPlatformSCC*)inst->dispatch)->setChipModel(false);
      inst->numChannels = 5;
      break;
    case DIV_SYSTEM_SCC_PLUS:
      inst->dispatch = new DivPlatformSCC();
      ((DivPlatformSCC*)inst->dispatch)->setChipModel(true);
      inst->numChannels = 5;
      break;
    case DIV_SYSTEM_NAMCO:
      inst->dispatch = new DivPlatformNamcoWSG();
      ((DivPlatformNamcoWSG*)inst->dispatch)->setDeviceType(1); // Pac-Man: 3 channels
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_NAMCO_15XX:
      inst->dispatch = new DivPlatformNamcoWSG();
      ((DivPlatformNamcoWSG*)inst->dispatch)->setDeviceType(15); // 15XX: 8 channels
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_NAMCO_CUS30:
      inst->dispatch = new DivPlatformNamcoWSG();
      ((DivPlatformNamcoWSG*)inst->dispatch)->setDeviceType(30); // CUS30: 8 channels
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_BUBSYS_WSG:
      inst->dispatch = new DivPlatformBubSysWSG();
      inst->numChannels = 2;
      break;
    case DIV_SYSTEM_X1_010:
      inst->dispatch = new DivPlatformX1_010();
      inst->numChannels = 16;
      break;
    case DIV_SYSTEM_VERA:
      inst->dispatch = new DivPlatformVERA();
      inst->numChannels = 17;
      break;
    case DIV_SYSTEM_SOUND_UNIT:
      inst->dispatch = new DivPlatformSoundUnit();
      inst->numChannels = 8;
      break;

    // === Other Chips ===
    case DIV_SYSTEM_PCSPKR:
      inst->dispatch = new DivPlatformPCSpeaker();
      inst->numChannels = 1;
      break;
    case DIV_SYSTEM_PONG:
      inst->dispatch = new DivPlatformPong();
      inst->numChannels = 1;
      break;
    case DIV_SYSTEM_PV1000:
      inst->dispatch = new DivPlatformPV1000();
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_MSM5232:
      inst->dispatch = new DivPlatformMSM5232();
      inst->numChannels = 8;
      break;
    case DIV_SYSTEM_SM8521:
      inst->dispatch = new DivPlatformSM8521();
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_DAVE:
      inst->dispatch = new DivPlatformDave();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_BIFURCATOR:
      inst->dispatch = new DivPlatformBifurcator();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_POWERNOISE:
      inst->dispatch = new DivPlatformPowerNoise();
      inst->numChannels = 4;
      break;

    // === ZX Spectrum Beeper ===
    case DIV_SYSTEM_SFX_BEEPER:
      inst->dispatch = new DivPlatformZXBeeper();
      inst->numChannels = 6;
      break;
    case DIV_SYSTEM_SFX_BEEPER_QUADTONE:
      inst->dispatch = new DivPlatformZXBeeperQuadTone();
      inst->numChannels = 5;
      break;

    // === FM Extended/CSM Variants ===
    case DIV_SYSTEM_YM2610_FULL_EXT:
      inst->dispatch = new DivPlatformYM2610Ext();
      inst->numChannels = 17;
      break;
    case DIV_SYSTEM_YM2610B_EXT:
      inst->dispatch = new DivPlatformYM2610BExt();
      inst->numChannels = 19;
      break;
    case DIV_SYSTEM_YM2612_DUALPCM:
      inst->dispatch = new DivPlatformGenesis();
      ((DivPlatformGenesis*)inst->dispatch)->setSoftPCM(true);
      inst->numChannels = 10;
      break;
    case DIV_SYSTEM_YM2612_DUALPCM_EXT:
      inst->dispatch = new DivPlatformGenesisExt();
      ((DivPlatformGenesisExt*)inst->dispatch)->setSoftPCM(true);
      inst->numChannels = 13;
      break;
    case DIV_SYSTEM_YM2612_CSM:
      inst->dispatch = new DivPlatformGenesisExt();
      ((DivPlatformGenesisExt*)inst->dispatch)->setSoftPCM(false);
      inst->numChannels = 10;
      break;
    case DIV_SYSTEM_YM2203_CSM:
      inst->dispatch = new DivPlatformYM2203Ext();
      inst->numChannels = 6;
      break;
    case DIV_SYSTEM_YM2608_CSM:
      inst->dispatch = new DivPlatformYM2608Ext();
      inst->numChannels = 16;
      break;
    case DIV_SYSTEM_YM2610_CSM:
      inst->dispatch = new DivPlatformYM2610Ext();
      inst->numChannels = 14;
      break;
    case DIV_SYSTEM_YM2610B_CSM:
      inst->dispatch = new DivPlatformYM2610BExt();
      inst->numChannels = 16;
      break;

    // === OPL Drums Variants ===
    case DIV_SYSTEM_OPL_DRUMS:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(1, true);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 11; // 6 FM + 5 drums
      break;
    case DIV_SYSTEM_OPL2_DRUMS:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(2, true);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 11;
      break;
    case DIV_SYSTEM_OPL3_DRUMS:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(3, true);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 20; // 15 FM + 5 drums
      break;
    case DIV_SYSTEM_OPLL_DRUMS:
      inst->dispatch = new DivPlatformOPLL();
      ((DivPlatformOPLL*)inst->dispatch)->setProperDrums(true);
      ((DivPlatformOPLL*)inst->dispatch)->setCore(0);
      inst->numChannels = 11; // 6 FM + 5 drums
      break;
    case DIV_SYSTEM_OPL4:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(4, false);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 42; // 18 FM + 24 PCM
      break;
    case DIV_SYSTEM_OPL4_DRUMS:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(4, true);
      ((DivPlatformOPL*)inst->dispatch)->setCore(0);
      inst->numChannels = 44;
      break;
    case DIV_SYSTEM_Y8950:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(8950, false);
      ((DivPlatformOPL*)inst->dispatch)->setCore(1);
      inst->numChannels = 10; // 9 FM + 1 ADPCM
      break;
    case DIV_SYSTEM_Y8950_DRUMS:
      inst->dispatch = new DivPlatformOPL();
      ((DivPlatformOPL*)inst->dispatch)->setOPLType(8950, true);
      ((DivPlatformOPL*)inst->dispatch)->setCore(1);
      inst->numChannels = 12; // 6 FM + 5 drums + 1 ADPCM
      break;

    // === VRC7 (Konami OPLL variant) ===
    case DIV_SYSTEM_VRC7:
      inst->dispatch = new DivPlatformOPLL();
      ((DivPlatformOPLL*)inst->dispatch)->setVRC7(true);
      ((DivPlatformOPLL*)inst->dispatch)->setCore(0);
      inst->numChannels = 6;
      break;

    // === GBA ===
    case DIV_SYSTEM_GBA_DMA:
      inst->dispatch = new DivPlatformGBADMA();
      inst->numChannels = 2;
      break;
    case DIV_SYSTEM_GBA_MINMOD:
      inst->dispatch = new DivPlatformGBAMinMod();
      inst->numChannels = 16;
      break;

    // === 5E01 (Enhanced NES) ===
    case DIV_SYSTEM_5E01:
      inst->dispatch = new DivPlatformNES();
      inst->numChannels = 5;
      // 5E01 uses NES with enhanced mode
      break;

    // === SID Variants ===
    case DIV_SYSTEM_SID2:
      inst->dispatch = new DivPlatformSID2();
      inst->numChannels = 3;
      break;
    case DIV_SYSTEM_SID3:
      inst->dispatch = new DivPlatformSID3();
      inst->numChannels = 4;
      break;
    case DIV_SYSTEM_C64_PCM:
      inst->dispatch = new DivPlatformC64();
      ((DivPlatformC64*)inst->dispatch)->setCore(1);
      ((DivPlatformC64*)inst->dispatch)->setChipModel(true); // 6581 for PCM mode
      ((DivPlatformC64*)inst->dispatch)->setSoftPCM(true);
      inst->numChannels = 3;
      break;

    // === Watara Supervision ===
    case DIV_SYSTEM_SUPERVISION:
      inst->dispatch = new DivPlatformSupervision();
      inst->numChannels = 4;
      break;

    // === SCV Tone / UPD1771C (Epoch Super Cassette Vision) ===
    case DIV_SYSTEM_UPD1771C:
      inst->dispatch = new DivPlatformSCV();
      inst->numChannels = 4;
      break;

    // === Dummy System (for testing) ===
    case DIV_SYSTEM_DUMMY:
      inst->dispatch = new DivPlatformDummy();
      inst->numChannels = 1;
      break;

    default:
      printf("[FurnaceDispatch] Unknown platform type: %d\n", platformType);
      delete inst;
      return 0;
  }

  // Set core quality BEFORE init (matches Furnace's dispatchContainer.cpp)
  // These platforms use coreQuality in setFlags() which is called by init().
  // Without this, coreQuality=0 causes divide-by-zero in rate calculation.
  switch (platformType) {
    case DIV_SYSTEM_GB:
      ((DivPlatformGB*)inst->dispatch)->setCoreQuality(3); // quality 3 → coreQuality=16
      break;
    case DIV_SYSTEM_C64_6581:
    case DIV_SYSTEM_C64_8580:
    case DIV_SYSTEM_C64_PCM:
      ((DivPlatformC64*)inst->dispatch)->setCoreQuality(3); // quality 3 → coreQuality=4
      break;
    case DIV_SYSTEM_SAA1099:
      ((DivPlatformSAA1099*)inst->dispatch)->setCoreQuality(3); // quality 3 → coreQuality=32
      break;
    case DIV_SYSTEM_POWERNOISE:
      ((DivPlatformPowerNoise*)inst->dispatch)->setCoreQuality(3); // quality 3 → coreQuality=32
      break;
    default:
      break;
  }

  // Initialize the dispatch
  int result = inst->dispatch->init(&inst->engine, inst->numChannels, sampleRate, flags);
  if (result == 0) {
    printf("[FurnaceDispatch] Dispatch init failed for platform %d\n", platformType);
    delete inst;
    return 0;
  }

  inst->allocBufs(256);

  // Initialize blip_buffer resampling (matches Furnace's DivDispatchContainer)
  inst->initBlipBuffers();

  int handle = g_nextHandle++;
  g_instances[handle] = inst;

  printf("[FurnaceDispatch] Created platform %d, handle=%d, channels=%d, chipRate=%d, sampleRate=%d, direct=%d\n",
         platformType, handle, inst->numChannels, inst->dispatch->rate, sampleRate,
         inst->useDirect ? 1 : 0);
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
    DispatchInstance* inst = it->second;
    int oldRate = inst->dispatch->rate;
    inst->dispatch->reset();

    // If reset changed the chip clock (e.g., after setFlags), update blip buffer rates
    int newRate = inst->dispatch->rate;
    if (newRate != oldRate && newRate > 0 && inst->bbInitialized) {
      printf("[FurnaceDispatch] reset: chip rate changed %d → %d, updating blip buffers\n",
             oldRate, newRate);
      for (int i = 0; i < inst->chipOuts; i++) {
        if (inst->bb[i]) {
          blip_set_rates(inst->bb[i], (double)newRate, (double)inst->sampleRate);
        }
      }
    }

    // Also clear blip buffers + delta tracking (matches Furnace DivDispatchContainer::clear())
    for (int i = 0; i < 2; i++) {
      if (inst->bb[i]) blip_clear(inst->bb[i]);
      inst->bbTemp[i] = 0;
      inst->bbPrevSample[i] = 0;
    }
  }
}

/**
 * Command log for audit/debugging.
 * Each entry: { tick, cmd, chan, val1, val2, retVal }
 */
struct CmdLogEntry {
  int tick;
  int cmd;
  int chan;
  int val1;
  int val2;
  int retVal;
};

static std::vector<CmdLogEntry> g_cmdLog;
static bool g_cmdLogEnabled = false;
static int g_cmdLogTick = 0;

EMSCRIPTEN_KEEPALIVE
void furnace_cmd_log_enable(int enable) {
  g_cmdLogEnabled = (enable != 0);
  if (enable) {
    g_cmdLog.clear();
    g_cmdLogTick = 0;
  }
}

EMSCRIPTEN_KEEPALIVE
void furnace_cmd_log_tick() {
  g_cmdLogTick++;
}

EMSCRIPTEN_KEEPALIVE
int furnace_cmd_log_count() {
  return (int)g_cmdLog.size();
}

// Returns pointer to flat int array: [tick, cmd, chan, val1, val2, retVal, ...]
// Caller must free the returned pointer.
EMSCRIPTEN_KEEPALIVE
int* furnace_cmd_log_get() {
  int count = (int)g_cmdLog.size();
  int* buf = (int*)malloc(count * 6 * sizeof(int));
  for (int i = 0; i < count; i++) {
    buf[i * 6 + 0] = g_cmdLog[i].tick;
    buf[i * 6 + 1] = g_cmdLog[i].cmd;
    buf[i * 6 + 2] = g_cmdLog[i].chan;
    buf[i * 6 + 3] = g_cmdLog[i].val1;
    buf[i * 6 + 4] = g_cmdLog[i].val2;
    buf[i * 6 + 5] = g_cmdLog[i].retVal;
  }
  return buf;
}

/**
 * Send a command to the dispatch.
 */
EMSCRIPTEN_KEEPALIVE
int furnace_dispatch_cmd(int handle, int cmd, int chan, int val1, int val2) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) {
    printf("[furnace_dispatch_cmd] ERROR: handle %d not found\n", handle);
    return -1;
  }

  DispatchInstance* inst = it->second;

  // Bounds-check channel against this chip's channel count.
  // Prevents crashes when a multi-chip song's channels fall back to the wrong chip.
  if (chan < 0 || chan >= inst->numChannels) {
    return -1;
  }

  DivCommand dc((DivDispatchCmds)cmd, (unsigned char)chan, val1, val2);
  int ret = inst->dispatch->dispatch(dc);

  if (g_cmdLogEnabled && g_cmdLog.size() < 100000) {
    g_cmdLog.push_back({g_cmdLogTick, cmd, chan, val1, val2, ret});
  }

  return ret;
}

// NOTE: The wrapper's custom macro engine (processChannelMacros, initChannelMacros,
// releaseChannelMacros) was removed. Platforms handle macros natively via macroInit()
// on NOTE_ON and std.next() in tick(). The wrapper's engine conflicted with platform
// macro processing. See: thoughts/shared/research/2026-03-07_furnace-dual-macro-engine-bug.md

/**
 * Advance one tick. Platforms handle macros natively via macroInit()/std.next().
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_tick(int handle) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;
  it->second->dispatch->tick(true);
}

/**
 * Render audio to float buffers using blip_buffer resampling.
 * Matches Furnace's DivDispatchContainer acquire/fillBuf flow.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_render(int handle, float* outL, float* outR, int numSamples) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;

  DispatchInstance* inst = it->second;

  // Fallback if blip_buffer not initialized
  if (!inst->bbInitialized || !inst->bb[0]) {
    // Legacy path: direct acquire (for safety)
    if (inst->bufSize < numSamples) inst->allocBufs(numSamples);
    memset(inst->bufL, 0, numSamples * sizeof(short));
    memset(inst->bufR, 0, numSamples * sizeof(short));
    inst->dispatch->acquire(inst->bufs, (size_t)numSamples);
    for (int i = 0; i < numSamples; i++) {
      outL[i] = (float)inst->bufL[i] / 32768.0f;
      outR[i] = (float)inst->bufR[i] / 32768.0f;
    }
    return;
  }

  // Step 1: Calculate how many chip clock cycles we need for numSamples output
  int chipSamples = blip_clocks_needed(inst->bb[0], numSamples);
  if (chipSamples <= 0) chipSamples = numSamples;

  // Step 2: Generate chip-rate samples via acquire or acquireDirect
  if (inst->useDirect) {
    // acquireDirect: dispatch writes directly to blip_buffer via blip_add_delta
    inst->dispatch->acquireDirect(inst->bb, (size_t)chipSamples);
  } else {
    // acquire: dispatch writes to short** buffers, we convert to blip deltas
    inst->ensureBbIn(chipSamples);
    for (int i = 0; i < inst->chipOuts; i++) {
      memset(inst->bbIn[i], 0, chipSamples * sizeof(short));
    }

    // Map bbIn to short** for acquire call
    short* bbInMapped[16]; // DIV_MAX_OUTPUTS
    for (int i = 0; i < 16; i++) {
      bbInMapped[i] = (i < inst->chipOuts) ? inst->bbIn[i] : nullptr;
    }

    inst->dispatch->acquire(bbInMapped, (size_t)chipSamples);

    // Delta conversion: convert raw samples to blip_buffer deltas
    for (int i = 0; i < inst->chipOuts; i++) {
      if (!inst->bbIn[i] || !inst->bb[i]) continue;
      for (int j = 0; j < chipSamples; j++) {
        if (inst->bbIn[i][j] == inst->bbTemp[i]) continue;
        inst->bbTemp[i] = inst->bbIn[i][j];
        blip_add_delta(inst->bb[i], j, inst->bbTemp[i] - inst->bbPrevSample[i]);
        inst->bbPrevSample[i] = inst->bbTemp[i];
      }
    }
  }

  // Step 3: End frame and read resampled output
  inst->ensureBbReadOut(numSamples);

  for (int i = 0; i < inst->chipOuts; i++) {
    if (!inst->bb[i]) continue;
    blip_end_frame(inst->bb[i], chipSamples);
    blip_read_samples(inst->bb[i], inst->bbReadOut[i], numSamples, 0);
  }

  // Step 4: Convert to float and handle mono→stereo
  for (int i = 0; i < numSamples; i++) {
    outL[i] = (inst->chipOuts >= 1 && inst->bbReadOut[0])
              ? (float)inst->bbReadOut[0][i] / 32768.0f : 0.0f;
    outR[i] = (inst->chipOuts >= 2 && inst->bbReadOut[1])
              ? (float)inst->bbReadOut[1][i] / 32768.0f : outL[i]; // Mono: duplicate L
  }

  inst->renderCount++;
}

/**
 * Get number of channels.
 */
EMSCRIPTEN_KEEPALIVE
int furnace_dispatch_get_num_channels(int handle) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    return it->second->numChannels;
  }
  return 0;
}

/**
 * Get oscilloscope needle position for a channel.
 */
EMSCRIPTEN_KEEPALIVE
int furnace_dispatch_get_osc_needle(int handle, int chan) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    DivDispatchOscBuffer* buf = it->second->dispatch->getOscBuffer(chan);
    return buf != nullptr ? buf->needle : 0;
  }
  return 0;
}

/**
 * Get oscilloscope data for a channel.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_get_osc_data(int handle, int chan, short* outBuf, int maxSamples) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;

  DivDispatchOscBuffer* buf = it->second->dispatch->getOscBuffer(chan);
  if (!buf) return;

  int needle = buf->needle;
  int start = (needle - maxSamples + 65536) % 65536;

  for (int i = 0; i < maxSamples; i++) {
    outBuf[i] = buf->data[(start + i) % 65536];
  }
}

/**
 * Mute/unmute a channel.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_mute(int handle, int chan, int mute) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    it->second->dispatch->muteChannel(chan, mute != 0);
  }
}

/**
 * Set tick rate.
 * NOTE: Do NOT call setFlags() here — it recreates the sound device for
 * platforms like RF5C68, wiping all register state (m_enable, pan, volume).
 * curHz is an engine-level timing parameter, not a platform flag.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_tick_rate(int handle, float hz) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    it->second->engine.curHz = hz;
  }
}

/**
 * Set tuning.
 * NOTE: Do NOT call setFlags() here — same reason as setTickRate.
 * song.tuning is used on-the-fly by calcFreq(), not by platform flags.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_tuning(int handle, float tuning) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    it->second->engine.song.tuning = tuning;
  }
}

/**
 * Set chip flags from a key=value string.
 * Parses the string into DivConfig and calls dispatch->setFlags().
 * This sets clock selection, chip model, and other per-chip parameters.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_flags(int handle, const char* flagsStr, int len) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end() || !it->second->dispatch) return;

  DivConfig flags;
  if (flagsStr && len > 0) {
    // Make a null-terminated copy
    std::string str(flagsStr, len);
    flags.loadFromMemory(str.c_str());
  }

  DispatchInstance* inst = it->second;
  int oldRate = inst->dispatch->rate;
  inst->dispatch->setFlags(flags);

  // If setFlags changed the chip clock (e.g., NTSC→PAL), update blip buffer rates
  int newRate = inst->dispatch->rate;
  if (newRate != oldRate && newRate > 0 && inst->bbInitialized) {
    printf("[FurnaceDispatch] setFlags: chip rate changed %d → %d, updating blip buffers\n",
           oldRate, newRate);
    for (int i = 0; i < inst->chipOuts; i++) {
      if (inst->bb[i]) {
        blip_set_rates(inst->bb[i], (double)newRate, (double)inst->sampleRate);
      }
    }
  }
}

/**
 * Set compatibility flags from binary data.
 * Format: Each byte corresponds to a flag (0=false, 1=true)
 * Order matches DivCompatFlags struct order
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_compat_flags(int handle, unsigned char* data, int dataLen) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end() || dataLen < 50) return;

  DivCompatFlags& f = it->second->engine.song.compatFlags;
  int i = 0;

  // Read flags in struct order
  f.limitSlides = data[i++];
  f.linearPitch = data[i++];
  f.pitchSlideSpeed = data[i++];
  f.loopModality = data[i++];
  f.delayBehavior = data[i++];
  f.jumpTreatment = data[i++];
  f.properNoiseLayout = data[i++];
  f.waveDutyIsVol = data[i++];
  f.resetMacroOnPorta = data[i++];
  f.legacyVolumeSlides = data[i++];
  f.compatibleArpeggio = data[i++];
  f.noteOffResetsSlides = data[i++];
  f.targetResetsSlides = data[i++];
  f.arpNonPorta = data[i++];
  f.algMacroBehavior = data[i++];
  f.brokenShortcutSlides = data[i++];
  f.ignoreDuplicateSlides = data[i++];
  f.stopPortaOnNoteOff = data[i++];
  f.continuousVibrato = data[i++];
  f.brokenDACMode = data[i++];
  f.oneTickCut = data[i++];
  f.newInsTriggersInPorta = data[i++];
  f.arp0Reset = data[i++];
  f.brokenSpeedSel = data[i++];
  f.noSlidesOnFirstTick = data[i++];
  f.rowResetsArpPos = data[i++];
  f.ignoreJumpAtEnd = data[i++];
  f.buggyPortaAfterSlide = data[i++];
  f.gbInsAffectsEnvelope = data[i++];
  f.sharedExtStat = data[i++];
  f.ignoreDACModeOutsideIntendedChannel = data[i++];
  f.e1e2AlsoTakePriority = data[i++];
  f.newSegaPCM = data[i++];
  f.fbPortaPause = data[i++];
  f.snDutyReset = data[i++];
  f.pitchMacroIsLinear = data[i++];
  f.oldOctaveBoundary = data[i++];
  f.noOPN2Vol = data[i++];
  f.newVolumeScaling = data[i++];
  f.volMacroLinger = data[i++];
  f.brokenOutVol = data[i++];
  f.brokenOutVol2 = data[i++];
  f.e1e2StopOnSameNote = data[i++];
  f.brokenPortaArp = data[i++];
  f.snNoLowPeriods = data[i++];
  f.disableSampleMacro = data[i++];
  f.oldArpStrategy = data[i++];
  f.brokenPortaLegato = data[i++];
  f.brokenFMOff = data[i++];
  f.preNoteNoEffect = data[i++];
  f.oldDPCM = data[i++];
  f.resetArpPhaseOnNewNote = data[i++];
  f.ceilVolumeScaling = data[i++];
  f.oldAlwaysSetVolume = data[i++];
  f.oldSampleOffset = data[i++];
  f.oldCenterRate = data[i++];
  f.noVolSlideReset = data[i++];
}

/**
 * Set a single compatibility flag.
 * @param flagIndex Index in the flags struct (0-55)
 * @param value Flag value (0 or 1, or multi-value for pitch/loop modes)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_compat_flag(int handle, int flagIndex, int value) {
  auto it = g_instances.find(handle);
  if (it == g_instances.end()) return;

  DivCompatFlags& f = it->second->engine.song.compatFlags;

  switch (flagIndex) {
    case 0: f.limitSlides = value; break;
    case 1: f.linearPitch = value; break;
    case 2: f.pitchSlideSpeed = value; break;
    case 3: f.loopModality = value; break;
    case 4: f.delayBehavior = value; break;
    case 5: f.jumpTreatment = value; break;
    case 6: f.properNoiseLayout = value; break;
    case 7: f.waveDutyIsVol = value; break;
    case 8: f.resetMacroOnPorta = value; break;
    case 9: f.legacyVolumeSlides = value; break;
    case 10: f.compatibleArpeggio = value; break;
    case 11: f.noteOffResetsSlides = value; break;
    case 12: f.targetResetsSlides = value; break;
    case 13: f.arpNonPorta = value; break;
    case 14: f.algMacroBehavior = value; break;
    case 15: f.brokenShortcutSlides = value; break;
    case 16: f.ignoreDuplicateSlides = value; break;
    case 17: f.stopPortaOnNoteOff = value; break;
    case 18: f.continuousVibrato = value; break;
    case 19: f.brokenDACMode = value; break;
    case 20: f.oneTickCut = value; break;
    case 21: f.newInsTriggersInPorta = value; break;
    case 22: f.arp0Reset = value; break;
    case 23: f.brokenSpeedSel = value; break;
    case 24: f.noSlidesOnFirstTick = value; break;
    case 25: f.rowResetsArpPos = value; break;
    case 26: f.ignoreJumpAtEnd = value; break;
    case 27: f.buggyPortaAfterSlide = value; break;
    case 28: f.gbInsAffectsEnvelope = value; break;
    case 29: f.sharedExtStat = value; break;
    case 30: f.ignoreDACModeOutsideIntendedChannel = value; break;
    case 31: f.e1e2AlsoTakePriority = value; break;
    case 32: f.newSegaPCM = value; break;
    case 33: f.fbPortaPause = value; break;
    case 34: f.snDutyReset = value; break;
    case 35: f.pitchMacroIsLinear = value; break;
    case 36: f.oldOctaveBoundary = value; break;
    case 37: f.noOPN2Vol = value; break;
    case 38: f.newVolumeScaling = value; break;
    case 39: f.volMacroLinger = value; break;
    case 40: f.brokenOutVol = value; break;
    case 41: f.brokenOutVol2 = value; break;
    case 42: f.e1e2StopOnSameNote = value; break;
    case 43: f.brokenPortaArp = value; break;
    case 44: f.snNoLowPeriods = value; break;
    case 45: f.disableSampleMacro = value; break;
    case 46: f.oldArpStrategy = value; break;
    case 47: f.brokenPortaLegato = value; break;
    case 48: f.brokenFMOff = value; break;
    case 49: f.preNoteNoEffect = value; break;
    case 50: f.oldDPCM = value; break;
    case 51: f.resetArpPhaseOnNewNote = value; break;
    case 52: f.ceilVolumeScaling = value; break;
    case 53: f.oldAlwaysSetVolume = value; break;
    case 54: f.oldSampleOffset = value; break;
    case 55: f.oldCenterRate = value; break;
    case 56: f.noVolSlideReset = value; break;
  }
}

/**
 * Reset compatibility flags to defaults (new-style behavior).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_reset_compat_flags(int handle) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    it->second->engine.song.compatFlags.setDefaults();
  }
}

/**
 * Set Game Boy instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_gb_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 8) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_GB;
  ins->gb.envVol = data[0];
  ins->gb.envDir = data[1];
  ins->gb.envLen = data[2];
  ins->gb.soundLen = data[3];
  ins->gb.softEnv = data[4];
  ins->gb.alwaysInit = data[5];
  ins->gb.doubleWave = data[6];
  int hwSeqLen = data[7];

  if (dataLen >= 8 + hwSeqLen * 2) {
    for (int i = 0; i < hwSeqLen && i < 256; i++) {
      ins->gb.hwSeq[i].cmd = data[8 + i * 2];
      ins->gb.hwSeq[i].data = data[9 + i * 2];
    }
    ins->gb.hwSeqLen = hwSeqLen;
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set wavetable.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_wavetable(int handle, int waveIndex, unsigned char* data, int dataLen) {
  if (dataLen < 8) return;

  DivWavetable* wave = new DivWavetable();
  wave->len = *(int*)(data);
  wave->max = *(int*)(data + 4);

  // DivWavetable has a fixed array data[256], not a pointer
  if (wave->len > 0 && wave->len <= 256 && dataLen >= 8 + wave->len * 4) {
    for (int i = 0; i < wave->len; i++) {
      wave->data[i] = *(int*)(data + 8 + i * 4);
    }
  }

  engine_set_wavetable(waveIndex, wave);

  // Sync to dispatch instance's song (some dispatches check song.waveLen)
  auto wit = g_instances.find(handle);
  if (wit != g_instances.end()) {
    auto& songWaves = wit->second->engine.song.wave;
    if (waveIndex >= (int)songWaves.size()) {
      songWaves.resize(waveIndex + 1, nullptr);
    }
    songWaves[waveIndex] = wave; // Borrowed reference (g_wavetables owns it)
    wit->second->engine.song.waveLen = (int)songWaves.size();
    // Notify dispatch so wavetable platforms (PCE, Namco, etc.) update channel shapes
    if (wit->second->dispatch) {
      wit->second->dispatch->notifyWaveChange(waveIndex);
    }
  }
}

/**
 * Force instrument change on channel.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_force_ins(int handle, int chan) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    it->second->dispatch->forceIns();
  }
}

/**
 * Direct register write (poke).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_poke(int handle, int addr, int val) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end()) {
    std::vector<DivRegWrite> writes;
    writes.push_back(DivRegWrite(addr, val));
    it->second->dispatch->poke(writes);
  }
}

// ============================================================
// COMPREHENSIVE INSTRUMENT SETTERS
// Full 1:1 Furnace instrument support
// ============================================================

/**
 * Set FM instrument (OPN/OPM/OPL family).
 * Binary format:
 *   [0] type (1 byte)
 *   [1] alg (1 byte)
 *   [2] fb (1 byte)
 *   [3] fms (1 byte)
 *   [4] ams (1 byte)
 *   [5] fms2 (1 byte)
 *   [6] ams2 (1 byte)
 *   [7] ops (1 byte) - number of operators (2 or 4)
 *   [8] opllPreset (1 byte)
 *   [9-12] kickFreq (2 bytes), snareHatFreq (2 bytes) - for OPLL drums
 *   [13-14] tomTopFreq (2 bytes)
 *   [15] fixedDrums (1 byte)
 *   [16+] operators (24 bytes each × ops):
 *     [0] enabled, [1] am, [2] ar, [3] dr, [4] mult, [5] rr,
 *     [6] sl, [7] tl, [8] dt2, [9] rs, [10] dt (signed), [11] d2r,
 *     [12] ssgEnv, [13] dam, [14] dvb, [15] egt, [16] ksl, [17] sus,
 *     [18] vib, [19] ws, [20] ksr, [21] kvs, [22-23] reserved
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_fm_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 16) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)data[0];
  ins->fm.alg = data[1];
  ins->fm.fb = data[2];
  ins->fm.fms = data[3];
  ins->fm.ams = data[4];
  ins->fm.fms2 = data[5];
  ins->fm.ams2 = data[6];
  ins->fm.ops = data[7];
  ins->fm.opllPreset = data[8];
  ins->fm.kickFreq = *(unsigned short*)(data + 9);
  ins->fm.snareHatFreq = *(unsigned short*)(data + 11);
  ins->fm.tomTopFreq = *(unsigned short*)(data + 13);
  ins->fm.fixedDrums = data[15] != 0;

  int opSize = 24;
  int opCount = ins->fm.ops;
  if (opCount > 4) opCount = 4;

  for (int i = 0; i < opCount && dataLen >= 16 + (i + 1) * opSize; i++) {
    unsigned char* op = data + 16 + i * opSize;
    ins->fm.op[i].enable = op[0] != 0;
    ins->fm.op[i].am = op[1];
    ins->fm.op[i].ar = op[2];
    ins->fm.op[i].dr = op[3];
    ins->fm.op[i].mult = op[4];
    ins->fm.op[i].rr = op[5];
    ins->fm.op[i].sl = op[6];
    ins->fm.op[i].tl = op[7];
    ins->fm.op[i].dt2 = op[8];
    ins->fm.op[i].rs = op[9];
    ins->fm.op[i].dt = (signed char)op[10];
    ins->fm.op[i].d2r = op[11];
    ins->fm.op[i].ssgEnv = op[12];
    ins->fm.op[i].dam = op[13];
    ins->fm.op[i].dvb = op[14];
    ins->fm.op[i].egt = op[15];
    ins->fm.op[i].ksl = op[16];
    ins->fm.op[i].sus = op[17];
    ins->fm.op[i].vib = op[18];
    ins->fm.op[i].ws = op[19];
    ins->fm.op[i].ksr = op[20];
    ins->fm.op[i].kvs = op[21];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set C64/SID instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_C64
 *   [1] waveform flags: bit0=tri, bit1=saw, bit2=pulse, bit3=noise
 *   [2] a (attack)
 *   [3] d (decay)
 *   [4] s (sustain)
 *   [5] r (release)
 *   [6-7] duty (2 bytes)
 *   [8] ringMod channel
 *   [9] oscSync channel
 *   [10] flags: bit0=toFilter, bit1=initFilter, bit2=dutyIsAbs, bit3=filterIsAbs, bit4=noTest, bit5=resetDuty
 *   [11] res (resonance)
 *   [12-13] cut (cutoff, 2 bytes)
 *   [14] filter flags: bit0=hp, bit1=lp, bit2=bp, bit3=ch3off
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_c64_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 15) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_C64;
  ins->c64.triOn = (data[1] & 1) != 0;
  ins->c64.sawOn = (data[1] & 2) != 0;
  ins->c64.pulseOn = (data[1] & 4) != 0;
  ins->c64.noiseOn = (data[1] & 8) != 0;
  ins->c64.a = data[2];
  ins->c64.d = data[3];
  ins->c64.s = data[4];
  ins->c64.r = data[5];
  ins->c64.duty = *(unsigned short*)(data + 6);
  ins->c64.ringMod = data[8];
  ins->c64.oscSync = data[9];
  ins->c64.toFilter = (data[10] & 1) != 0;
  ins->c64.initFilter = (data[10] & 2) != 0;
  ins->c64.dutyIsAbs = (data[10] & 4) != 0;
  ins->c64.filterIsAbs = (data[10] & 8) != 0;
  ins->c64.noTest = (data[10] & 16) != 0;
  ins->c64.resetDuty = (data[10] & 32) != 0;
  ins->c64.res = data[11];
  ins->c64.cut = *(unsigned short*)(data + 12);
  ins->c64.hp = (data[14] & 1) != 0;
  ins->c64.lp = (data[14] & 2) != 0;
  ins->c64.bp = (data[14] & 4) != 0;
  ins->c64.ch3off = (data[14] & 8) != 0;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set NES instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_NES
 *   [1-...] amiga sample config (see Amiga format)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_nes_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_NES;

  // NES uses Amiga sample map structure
  if (dataLen >= 6) {
    ins->amiga.initSample = *(short*)(data + 1);
    ins->amiga.useNoteMap = (data[3] & 1) != 0;
    ins->amiga.useSample = (data[3] & 2) != 0;
    ins->amiga.useWave = (data[3] & 4) != 0;
    ins->amiga.waveLen = data[4];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set SNES instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_SNES
 *   [1] useEnv
 *   [2] sus (sustain mode 0-3)
 *   [3] gainMode
 *   [4] gain
 *   [5] a, [6] d, [7] s, [8] r, [9] d2
 *   [10-...] amiga sample config
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_snes_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 10) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SNES;
  ins->snes.useEnv = data[1] != 0;
  ins->snes.sus = data[2];
  ins->snes.gainMode = (DivInstrumentSNES::GainMode)data[3];
  ins->snes.gain = data[4];
  ins->snes.a = data[5];
  ins->snes.d = data[6];
  ins->snes.s = data[7];
  ins->snes.r = data[8];
  ins->snes.d2 = data[9];

  // Amiga sample config follows
  if (dataLen >= 15) {
    ins->amiga.initSample = *(short*)(data + 10);
    ins->amiga.useNoteMap = (data[12] & 1) != 0;
    ins->amiga.useSample = (data[12] & 2) != 0;
    ins->amiga.useWave = (data[12] & 4) != 0;
    ins->amiga.waveLen = data[13];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set N163 instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_N163
 *   [1-4] wave (int)
 *   [5-8] wavePos (int)
 *   [9-12] waveLen (int)
 *   [13] waveMode
 *   [14] perChanPos
 *   [15-46] wavePosCh[8] (4 bytes each)
 *   [47-78] waveLenCh[8] (4 bytes each)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_n163_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 15) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_N163;
  ins->n163.wave = *(int*)(data + 1);
  ins->n163.wavePos = *(int*)(data + 5);
  ins->n163.waveLen = *(int*)(data + 9);
  ins->n163.waveMode = data[13];
  ins->n163.perChanPos = data[14] != 0;

  if (dataLen >= 79) {
    for (int i = 0; i < 8; i++) {
      ins->n163.wavePosCh[i] = *(int*)(data + 15 + i * 4);
      ins->n163.waveLenCh[i] = *(int*)(data + 47 + i * 4);
    }
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set FDS instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_FDS
 *   [1-4] modSpeed (int)
 *   [5-8] modDepth (int)
 *   [9] initModTableWithFirstWave
 *   [10-41] modTable[32] (signed chars)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_fds_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 42) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_FDS;
  ins->fds.modSpeed = *(int*)(data + 1);
  ins->fds.modDepth = *(int*)(data + 5);
  ins->fds.initModTableWithFirstWave = data[9] != 0;

  for (int i = 0; i < 32; i++) {
    ins->fds.modTable[i] = (signed char)data[10 + i];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set Amiga/sample-based instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_AMIGA or similar PCM type
 *   [1-2] initSample (short)
 *   [3] flags: bit0=useNoteMap, bit1=useSample, bit2=useWave
 *   [4] waveLen
 *   [5-...] noteMap (if useNoteMap): 120 entries of (freq:4, map:2, dpcmFreq:1, dpcmDelta:1) = 8 bytes each
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_amiga_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 5) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)data[0];
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useNoteMap = (data[3] & 1) != 0;
  ins->amiga.useSample = (data[3] & 2) != 0;
  ins->amiga.useWave = (data[3] & 4) != 0;
  ins->amiga.waveLen = data[4];

  // Parse note map if present
  if (ins->amiga.useNoteMap && dataLen >= 5 + 120 * 8) {
    for (int i = 0; i < 120; i++) {
      unsigned char* entry = data + 5 + i * 8;
      ins->amiga.noteMap[i].freq = *(int*)entry;
      ins->amiga.noteMap[i].map = *(short*)(entry + 4);
      ins->amiga.noteMap[i].dpcmFreq = (signed char)entry[6];
      ins->amiga.noteMap[i].dpcmDelta = (signed char)entry[7];
    }
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set MultiPCM instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_MULTIPCM
 *   [1] ar, [2] d1r, [3] dl, [4] d2r, [5] rr, [6] rc
 *   [7] lfo, [8] vib, [9] am
 *   [10] flags: bit0=damp, bit1=pseudoReverb, bit2=lfoReset, bit3=levelDirect
 *   [11-...] amiga sample config
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_multipcm_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 11) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_MULTIPCM;
  ins->multipcm.ar = data[1];
  ins->multipcm.d1r = data[2];
  ins->multipcm.dl = data[3];
  ins->multipcm.d2r = data[4];
  ins->multipcm.rr = data[5];
  ins->multipcm.rc = data[6];
  ins->multipcm.lfo = data[7];
  ins->multipcm.vib = data[8];
  ins->multipcm.am = data[9];
  ins->multipcm.damp = (data[10] & 1) != 0;
  ins->multipcm.pseudoReverb = (data[10] & 2) != 0;
  ins->multipcm.lfoReset = (data[10] & 4) != 0;
  ins->multipcm.levelDirect = (data[10] & 8) != 0;

  // Amiga sample config follows
  if (dataLen >= 16) {
    ins->amiga.initSample = *(short*)(data + 11);
    ins->amiga.useNoteMap = (data[13] & 1) != 0;
    ins->amiga.useSample = (data[13] & 2) != 0;
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set ES5506 instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_ES5506
 *   [1] filter mode
 *   [2-3] k1 (2 bytes)
 *   [4-5] k2 (2 bytes)
 *   [6-7] ecount (2 bytes)
 *   [8] lVRamp (signed)
 *   [9] rVRamp (signed)
 *   [10] k1Ramp (signed)
 *   [11] k2Ramp (signed)
 *   [12] flags: bit0=k1Slow, bit1=k2Slow
 *   [13-...] amiga sample config
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_es5506_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 13) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_ES5506;
  ins->es5506.filter.mode = (DivInstrumentES5506::Filter::FilterMode)data[1];
  ins->es5506.filter.k1 = *(unsigned short*)(data + 2);
  ins->es5506.filter.k2 = *(unsigned short*)(data + 4);
  ins->es5506.envelope.ecount = *(unsigned short*)(data + 6);
  ins->es5506.envelope.lVRamp = (signed char)data[8];
  ins->es5506.envelope.rVRamp = (signed char)data[9];
  ins->es5506.envelope.k1Ramp = (signed char)data[10];
  ins->es5506.envelope.k2Ramp = (signed char)data[11];
  ins->es5506.envelope.k1Slow = (data[12] & 1) != 0;
  ins->es5506.envelope.k2Slow = (data[12] & 2) != 0;

  // Amiga sample config follows
  if (dataLen >= 18) {
    ins->amiga.initSample = *(short*)(data + 13);
    ins->amiga.useNoteMap = (data[15] & 1) != 0;
    ins->amiga.useSample = (data[15] & 2) != 0;
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set ESFM instrument.
 * Binary format:
 *   [0] type (1 byte) = DIV_INS_ESFM
 *   [1] noise (for OP4)
 *   [2+] FM data (same as FM instrument format)
 *   After FM: ESFM operator extensions (8 bytes per op):
 *     [0] delay, [1] outLvl, [2] modIn, [3] left, [4] right, [5] fixed
 *     [6] ct (signed), [7] dt (signed)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_esfm_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 2) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_ESFM;
  ins->esfm.noise = data[1];

  // Parse FM part (starting at offset 2)
  if (dataLen >= 18) {
    ins->fm.alg = data[2];
    ins->fm.fb = data[3];
    ins->fm.fms = data[4];
    ins->fm.ams = data[5];
    ins->fm.ops = 4; // ESFM always 4-op

    int opSize = 24;
    for (int i = 0; i < 4 && dataLen >= 18 + (i + 1) * opSize; i++) {
      unsigned char* op = data + 18 + i * opSize;
      ins->fm.op[i].enable = op[0] != 0;
      ins->fm.op[i].am = op[1];
      ins->fm.op[i].ar = op[2];
      ins->fm.op[i].dr = op[3];
      ins->fm.op[i].mult = op[4];
      ins->fm.op[i].rr = op[5];
      ins->fm.op[i].sl = op[6];
      ins->fm.op[i].tl = op[7];
      ins->fm.op[i].dt2 = op[8];
      ins->fm.op[i].rs = op[9];
      ins->fm.op[i].dt = (signed char)op[10];
      ins->fm.op[i].d2r = op[11];
      ins->fm.op[i].ssgEnv = op[12];
      ins->fm.op[i].dam = op[13];
      ins->fm.op[i].dvb = op[14];
      ins->fm.op[i].egt = op[15];
      ins->fm.op[i].ksl = op[16];
      ins->fm.op[i].sus = op[17];
      ins->fm.op[i].vib = op[18];
      ins->fm.op[i].ws = op[19];
      ins->fm.op[i].ksr = op[20];
      ins->fm.op[i].kvs = op[21];
    }

    // ESFM extensions after FM operators
    int esfmOffset = 18 + 4 * opSize;
    if (dataLen >= esfmOffset + 4 * 8) {
      for (int i = 0; i < 4; i++) {
        unsigned char* ext = data + esfmOffset + i * 8;
        ins->esfm.op[i].delay = ext[0];
        ins->esfm.op[i].outLvl = ext[1];
        ins->esfm.op[i].modIn = ext[2];
        ins->esfm.op[i].left = ext[3];
        ins->esfm.op[i].right = ext[4];
        ins->esfm.op[i].fixed = ext[5];
        ins->esfm.op[i].ct = (signed char)ext[6];
        ins->esfm.op[i].dt = (signed char)ext[7];
      }
    }
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set Wave Synth configuration.
 * Binary format:
 *   [0-3] wave1 (int)
 *   [4-7] wave2 (int)
 *   [8] rateDivider
 *   [9] effect
 *   [10] flags: bit0=oneShot, bit1=enabled, bit2=global
 *   [11] speed
 *   [12-15] param1-param4
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_wavesynth(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 16) return;

  // Get or create instrument
  DivInstrument* ins = new DivInstrument();
  ins->ws.wave1 = *(int*)(data);
  ins->ws.wave2 = *(int*)(data + 4);
  ins->ws.rateDivider = data[8];
  ins->ws.effect = data[9];
  ins->ws.oneShot = (data[10] & 1) != 0;
  ins->ws.enabled = (data[10] & 2) != 0;
  ins->ws.global = (data[10] & 4) != 0;
  ins->ws.speed = data[11];
  ins->ws.param1 = data[12];
  ins->ws.param2 = data[13];
  ins->ws.param3 = data[14];
  ins->ws.param4 = data[15];

  engine_set_instrument(insIndex, ins);
}

// ============================================================
// ADDITIONAL INSTRUMENT SETTERS
// ============================================================

/**
 * Set OPL/OPLL instrument (2-op FM).
 * Binary format:
 *   [0] type (DIV_INS_OPL, DIV_INS_OPLL, DIV_INS_OPL_DRUMS)
 *   [1] alg, [2] fb, [3] fms, [4] ams
 *   [5] opllPreset (for OPLL)
 *   [6-29] operator data (12 bytes × 2 operators)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_opl_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 6) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)data[0];
  ins->fm.alg = data[1];
  ins->fm.fb = data[2];
  ins->fm.fms = data[3];
  ins->fm.ams = data[4];
  ins->fm.opllPreset = data[5];
  ins->fm.ops = 2; // OPL is 2-op

  // Parse operators (2 ops for OPL)
  int opSize = 12;
  for (int i = 0; i < 2 && dataLen >= 6 + (i + 1) * opSize; i++) {
    unsigned char* op = data + 6 + i * opSize;
    ins->fm.op[i].am = op[0];
    ins->fm.op[i].ar = op[1];
    ins->fm.op[i].dr = op[2];
    ins->fm.op[i].mult = op[3];
    ins->fm.op[i].rr = op[4];
    ins->fm.op[i].sl = op[5];
    ins->fm.op[i].tl = op[6];
    ins->fm.op[i].ksl = op[7];
    ins->fm.op[i].vib = op[8];
    ins->fm.op[i].ws = op[9];
    ins->fm.op[i].ksr = op[10];
    ins->fm.op[i].sus = op[11];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set OPM instrument (8-op FM - Yamaha OPM).
 * Uses same format as FM instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_opm_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 18) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_OPM;
  ins->fm.alg = data[0];
  ins->fm.fb = data[1];
  ins->fm.fms = data[2];
  ins->fm.ams = data[3];
  ins->fm.fms2 = data[4];
  ins->fm.ams2 = data[5];
  ins->fm.ops = 4;

  // Parse operators
  int opSize = 24;
  for (int i = 0; i < 4 && dataLen >= 18 + (i + 1) * opSize; i++) {
    unsigned char* op = data + 18 + i * opSize;
    ins->fm.op[i].enable = op[0] != 0;
    ins->fm.op[i].am = op[1];
    ins->fm.op[i].ar = op[2];
    ins->fm.op[i].dr = op[3];
    ins->fm.op[i].mult = op[4];
    ins->fm.op[i].rr = op[5];
    ins->fm.op[i].sl = op[6];
    ins->fm.op[i].tl = op[7];
    ins->fm.op[i].dt2 = op[8];
    ins->fm.op[i].rs = op[9];
    ins->fm.op[i].dt = (signed char)op[10];
    ins->fm.op[i].d2r = op[11];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set OPZ instrument (Yamaha OPZ/TX81Z).
 * Uses same format as OPM but with OPZ-specific fields.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_opz_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 18) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_OPZ;
  ins->fm.alg = data[0];
  ins->fm.fb = data[1];
  ins->fm.fms = data[2];
  ins->fm.ams = data[3];
  ins->fm.fms2 = data[4];
  ins->fm.ams2 = data[5];
  ins->fm.ops = 4;

  // Parse operators with OPZ extensions
  int opSize = 24;
  for (int i = 0; i < 4 && dataLen >= 18 + (i + 1) * opSize; i++) {
    unsigned char* op = data + 18 + i * opSize;
    ins->fm.op[i].enable = op[0] != 0;
    ins->fm.op[i].am = op[1];
    ins->fm.op[i].ar = op[2];
    ins->fm.op[i].dr = op[3];
    ins->fm.op[i].mult = op[4];  // CRS for OPZ
    ins->fm.op[i].rr = op[5];
    ins->fm.op[i].sl = op[6];
    ins->fm.op[i].tl = op[7];
    ins->fm.op[i].dt2 = op[8];
    ins->fm.op[i].rs = op[9];
    ins->fm.op[i].dt = (signed char)op[10];
    ins->fm.op[i].d2r = op[11];
    ins->fm.op[i].ws = op[12];   // waveform
    ins->fm.op[i].dvb = op[13];  // fine mult
    ins->fm.op[i].dam = op[14];  // reverb
    ins->fm.op[i].ksl = op[15];  // EG shift
    ins->fm.op[i].egt = op[16];  // fixed freq
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set standard/PSG instrument (AY, POKEY, TIA, VIC, PET, etc.)
 * These mostly use macros only - the instrument type determines behavior.
 * Binary format:
 *   [0] type (DIV_INS_AY, DIV_INS_AY8930, DIV_INS_TIA, DIV_INS_POKEY, etc.)
 *   [1-2] initSample (for types that support samples)
 *   [3] flags: bit0=useSample, bit1=useWave, bit2=useNoteMap
 *   [4] waveLen
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_std_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)data[0];

  if (dataLen >= 5) {
    ins->amiga.initSample = *(short*)(data + 1);
    ins->amiga.useSample = (data[3] & 1) != 0;
    ins->amiga.useWave = (data[3] & 2) != 0;
    ins->amiga.useNoteMap = (data[3] & 4) != 0;
    ins->amiga.waveLen = data[4];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set PCE (PC Engine) instrument.
 * Binary format:
 *   [0] type = DIV_INS_PCE
 *   [1] flags: bit0=useSample, bit1=useWave
 *   [2] waveLen (0-31)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_pce_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_PCE;

  if (dataLen >= 3) {
    ins->amiga.useSample = (data[1] & 1) != 0;
    ins->amiga.useWave = (data[1] & 2) != 0;
    ins->amiga.waveLen = data[2];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set SCC instrument.
 * Binary format:
 *   [0] type = DIV_INS_SCC
 *   [1] waveLen
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_scc_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SCC;
  if (dataLen >= 2) {
    ins->amiga.waveLen = data[1];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set NAMCO WSG instrument.
 * Binary format:
 *   [0] type = DIV_INS_NAMCO
 *   [1] waveLen (typically 32)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_namco_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_NAMCO;
  if (dataLen >= 2) {
    ins->amiga.waveLen = data[1];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set Sound Unit instrument.
 * Binary format:
 *   [0] type = DIV_INS_SU
 *   [1] flags: bit0=switchRoles
 *   [2] hwSeqLen
 *   [3+] hwSeq data (8 bytes per command)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_su_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 3) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SU;
  ins->su.switchRoles = (data[1] & 1) != 0;
  ins->su.hwSeqLen = data[2];

  // Parse hardware sequence
  int seqLen = data[2];
  if (dataLen >= 3 + seqLen * 8) {
    for (int i = 0; i < seqLen && i < 256; i++) {
      unsigned char* cmd = data + 3 + i * 8;
      ins->su.hwSeq[i].cmd = cmd[0];
      ins->su.hwSeq[i].bound = cmd[1];
      ins->su.hwSeq[i].val = cmd[2];
      ins->su.hwSeq[i].speed = *(unsigned short*)(cmd + 3);
    }
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set X1-010 instrument.
 * Binary format:
 *   [0] type = DIV_INS_X1_010
 *   [1-4] bankSlot (int)
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_x1_010_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 5) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_X1_010;
  ins->x1_010.bankSlot = *(int*)(data + 1);

  engine_set_instrument(insIndex, ins);
}

/**
 * Set QSound instrument (sample-based).
 * Binary format:
 *   [0] type = DIV_INS_QSOUND
 *   [1-2] initSample
 *   [3] flags: bit0=useSample, bit1=useNoteMap
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_qsound_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_QSOUND;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = (data[3] & 1) != 0;
  ins->amiga.useNoteMap = (data[3] & 2) != 0;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set SegaPCM instrument.
 * Binary format:
 *   [0] type = DIV_INS_SEGAPCM
 *   [1-2] initSample
 *   [3] flags
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_segapcm_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SEGAPCM;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = (data[3] & 1) != 0;
  ins->amiga.useNoteMap = (data[3] & 2) != 0;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set RF5C68 instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_rf5c68_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_RF5C68;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = (data[3] & 1) != 0;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set MSM6295 instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_msm6295_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_MSM6295;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set MSM6258 instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_msm6258_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_MSM6258;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set K007232 instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_k007232_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_K007232;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set K053260 instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_k053260_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_K053260;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set GA20 instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_ga20_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_GA20;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set C140/C219 instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_c140_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)data[0]; // DIV_INS_C140 or DIV_INS_C219
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set PowerNoise instrument.
 * Binary format:
 *   [0] type = DIV_INS_POWERNOISE or DIV_INS_POWERNOISE_SLOPE
 *   [1] octave
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_powernoise_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 2) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)data[0];
  ins->powernoise.octave = data[1];

  engine_set_instrument(insIndex, ins);
}

/**
 * Set SID2 instrument.
 * Binary format:
 *   [0] type = DIV_INS_SID2
 *   [1] volume
 *   [2] mixMode
 *   [3] noiseMode
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_sid2_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SID2;
  ins->sid2.volume = data[1];
  ins->sid2.mixMode = data[2];
  ins->sid2.noiseMode = data[3];

  engine_set_instrument(insIndex, ins);
}

/**
 * Set SID3 instrument (extended C64).
 * Binary format similar to C64 but with SID3 extensions.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_sid3_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 20) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SID3;

  // Basic waveform flags
  ins->sid3.triOn = (data[1] & 1) != 0;
  ins->sid3.sawOn = (data[1] & 2) != 0;
  ins->sid3.pulseOn = (data[1] & 4) != 0;
  ins->sid3.noiseOn = (data[1] & 8) != 0;

  // ADSR
  ins->sid3.a = data[2];
  ins->sid3.d = data[3];
  ins->sid3.s = data[4];
  ins->sid3.r = data[5];
  ins->sid3.sr = data[6];

  // Duty
  ins->sid3.duty = *(unsigned short*)(data + 7);

  // Modulation
  ins->sid3.ringMod = data[9];
  ins->sid3.oscSync = data[10];
  ins->sid3.phase_mod = (data[11] & 1) != 0;

  // Filter (using correct field name 'filt')
  if (dataLen >= 16) {
    ins->sid3.filt[0].enabled = (data[12] & 1) != 0;
    ins->sid3.filt[0].cutoff = *(unsigned short*)(data + 13);
    ins->sid3.filt[0].resonance = data[15];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set VERA instrument (Commander X16).
 * Binary format:
 *   [0] type = DIV_INS_VERA
 *   [1] waveLen
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_vera_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 2) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_VERA;
  ins->amiga.waveLen = data[1];

  engine_set_instrument(insIndex, ins);
}

/**
 * Set WonderSwan instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_swan_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 2) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SWAN;
  ins->amiga.waveLen = data[1];

  engine_set_instrument(insIndex, ins);
}

/**
 * Set Lynx/Mikey instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_mikey_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_MIKEY;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set VirtualBoy instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_vboy_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 2) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_VBOY;
  ins->amiga.waveLen = data[1];

  engine_set_instrument(insIndex, ins);
}

/**
 * Set ZX Beeper instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_beeper_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_BEEPER;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set NDS instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_nds_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_NDS;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set GBA DMA instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_gba_dma_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_GBA_DMA;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set GBA MinMod instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_gba_minmod_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 4) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_GBA_MINMOD;
  ins->amiga.initSample = *(short*)(data + 1);
  ins->amiga.useSample = true;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set Bifurcator instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_bifurcator_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_BIFURCATOR;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set Dave instrument.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_dave_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_DAVE;

  engine_set_instrument(insIndex, ins);
}

// ============================================================
// REMAINING INSTRUMENT TYPES (ALL 67 COVERED)
// ============================================================

/**
 * Set AY-3-8910 instrument (DIV_INS_AY = 6).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_ay_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_AY;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set AY8930 instrument (DIV_INS_AY8930 = 7).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_ay8930_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_AY8930;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set TIA instrument (DIV_INS_TIA = 8).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_tia_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_TIA;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set SAA1099 instrument (DIV_INS_SAA1099 = 9).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_saa1099_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SAA1099;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set VIC-20 instrument (DIV_INS_VIC = 10).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_vic_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_VIC;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set PET instrument (DIV_INS_PET = 11).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_pet_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_PET;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set VRC6 instrument (DIV_INS_VRC6 = 12).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_vrc6_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_VRC6;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set OPLL instrument (DIV_INS_OPLL = 13).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_opll_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_OPLL;

  // OPLL uses FM data structure with opllPreset
  if (dataLen >= 8) {
    ins->fm.alg = data[0];
    ins->fm.fb = data[1];
    ins->fm.fms = data[2];
    ins->fm.ams = data[3];
    ins->fm.ops = data[4];
    ins->fm.opllPreset = data[5];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set POKEY instrument (DIV_INS_POKEY = 20).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_pokey_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_POKEY;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set VRC6 Saw instrument (DIV_INS_VRC6_SAW = 26).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_vrc6_saw_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_VRC6_SAW;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set OPL Drums instrument (DIV_INS_OPL_DRUMS = 32).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_opl_drums_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_OPL_DRUMS;

  // OPL drums use FM data structure
  if (dataLen >= 8) {
    ins->fm.alg = data[0];
    ins->fm.fb = data[1];
    ins->fm.fms = data[2];
    ins->fm.ams = data[3];
    ins->fm.ops = data[4];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set ADPCM-A instrument (DIV_INS_ADPCMA = 37).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_adpcma_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_ADPCMA;

  // ADPCM-A has sample reference
  if (dataLen >= 4) {
    ins->amiga.initSample = data[0] | (data[1] << 8);
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set ADPCM-B instrument (DIV_INS_ADPCMB = 38).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_adpcmb_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_ADPCMB;

  // ADPCM-B has sample reference
  if (dataLen >= 4) {
    ins->amiga.initSample = data[0] | (data[1] << 8);
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set YMZ280B instrument (DIV_INS_YMZ280B = 41).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_ymz280b_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_YMZ280B;

  // YMZ280B has sample reference
  if (dataLen >= 4) {
    ins->amiga.initSample = data[0] | (data[1] << 8);
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set MSM5232 instrument (DIV_INS_MSM5232 = 43).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_msm5232_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_MSM5232;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set T6W28 instrument (DIV_INS_T6W28 = 44).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_t6w28_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_T6W28;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set PokeMini instrument (DIV_INS_POKEMINI = 47).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_pokemini_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_POKEMINI;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set SM8521 instrument (DIV_INS_SM8521 = 48).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_sm8521_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SM8521;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set PV-1000 instrument (DIV_INS_PV1000 = 49).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_pv1000_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_PV1000;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set TED instrument (DIV_INS_TED = 52).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_ted_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_TED;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set C219 instrument (DIV_INS_C219 = 54).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_c219_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_C219;

  // C219 has sample reference like C140
  if (dataLen >= 4) {
    ins->amiga.initSample = data[0] | (data[1] << 8);
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set PowerNoise Slope instrument (DIV_INS_POWERNOISE_SLOPE = 57).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_powernoise_slope_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_POWERNOISE_SLOPE;

  // PowerNoise slope has octave control
  if (dataLen >= 2) {
    ins->powernoise.octave = data[0];
  }

  engine_set_instrument(insIndex, ins);
}

/**
 * Set Supervision instrument (DIV_INS_SUPERVISION = 64).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_supervision_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_SUPERVISION;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set UPD1771C instrument (DIV_INS_UPD1771C = 65).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_upd1771c_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  ins->type = DIV_INS_UPD1771C;

  engine_set_instrument(insIndex, ins);
}

/**
 * Set 5E01 instrument (DIV_INS_5E01 - NES variant).
 * Note: This is a custom 5E01 (NES APU clone variant).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_5e01_instrument(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 1) return;

  DivInstrument* ins = new DivInstrument();
  // DIV_INS_5E01 doesn't exist in enum, this is handled by DIV_INS_NES
  ins->type = DIV_INS_NES;

  engine_set_instrument(insIndex, ins);
}

// ============================================================
// INSTRUMENT UPLOAD
// ============================================================

/**
 * Set a complete instrument with all data including macros.
 * This is the preferred method for full instrument upload.
 *
 * Binary format (variable length):
 *   Header (32 bytes):
 *     [0-1] magic: 0xF0 0xB1 ("Furnace Binary Instrument")
 *     [2] version
 *     [3] type (DivInstrumentType)
 *     [4-7] totalSize (uint32)
 *     [8-11] fmOffset (uint32) - offset to FM data, 0 if none
 *     [12-15] stdOffset (uint32) - offset to STD/macro data
 *     [16-19] chipOffset (uint32) - offset to chip-specific data
 *     [20-23] sampleOffset (uint32) - offset to sample/amiga data
 *     [24-27] reserved
 *     [28-31] nameLen (uint32)
 *   [32-...] name (nameLen bytes, UTF-8)
 *   [...] FM data (if fmOffset > 0)
 *   [...] STD/macro data
 *   [...] Chip-specific data
 *   [...] Sample/amiga data
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_instrument_full(int handle, int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 32) return;

  // Check magic
  if (data[0] != 0xF0 || data[1] != 0xB1) {
    printf("[FurnaceDispatch] Invalid instrument magic\n");
    return;
  }

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)data[3];

  unsigned int fmOffset = *(unsigned int*)(data + 8);
  unsigned int stdOffset = *(unsigned int*)(data + 12);
  unsigned int chipOffset = *(unsigned int*)(data + 16);
  unsigned int sampleOffset = *(unsigned int*)(data + 20);
  unsigned int nameLen = *(unsigned int*)(data + 28);

  // Read name
  if (nameLen > 0 && dataLen >= 32 + nameLen) {
    ins->name = String((char*)(data + 32), nameLen);
  }

  // Parse FM data if present
  if (fmOffset > 0 && fmOffset < (unsigned int)dataLen) {
    unsigned char* fm = data + fmOffset;
    ins->fm.alg = fm[0];
    ins->fm.fb = fm[1];
    ins->fm.fms = fm[2];
    ins->fm.ams = fm[3];
    ins->fm.fms2 = fm[4];
    ins->fm.ams2 = fm[5];
    ins->fm.ops = fm[6];
    ins->fm.opllPreset = fm[7];
    ins->fm.block = fm[8] & 0x0F;

    // Parse operators (starting at fm+9)
    int opSize = 24;
    for (int i = 0; i < 4 && fmOffset + 9 + (i + 1) * opSize <= (unsigned int)dataLen; i++) {
      unsigned char* op = fm + 9 + i * opSize;
      ins->fm.op[i].enable = op[0] != 0;
      ins->fm.op[i].am = op[1];
      ins->fm.op[i].ar = op[2];
      ins->fm.op[i].dr = op[3];
      ins->fm.op[i].mult = op[4];
      ins->fm.op[i].rr = op[5];
      ins->fm.op[i].sl = op[6];
      ins->fm.op[i].tl = op[7];
      ins->fm.op[i].dt2 = op[8];
      ins->fm.op[i].rs = op[9];
      ins->fm.op[i].dt = (signed char)op[10];
      ins->fm.op[i].d2r = op[11];
      ins->fm.op[i].ssgEnv = op[12];
      ins->fm.op[i].dam = op[13];
      ins->fm.op[i].dvb = op[14];
      ins->fm.op[i].egt = op[15];
      ins->fm.op[i].ksl = op[16];
      ins->fm.op[i].sus = op[17];
      ins->fm.op[i].vib = op[18];
      ins->fm.op[i].ws = op[19];
      ins->fm.op[i].ksr = op[20];
      ins->fm.op[i].kvs = op[21];
    }
  }

  // Parse STD (macro) data if present
  if (stdOffset > 0 && stdOffset < (unsigned int)dataLen) {
    unsigned char* std = data + stdOffset;
    // Macro format: for each macro type (22 standard + 4ops×18)
    // [0] len, [1] delay, [2] speed, [3] loop, [4] rel, [5] mode, [6] open
    // [7-...] values (len × 4 bytes)

    // Parse all 22 standard macros matching DIV_MACRO_* enum (instrument.h:106-128)
    // C64 uses ex4-ex8 for special/attack/decay/sustain/release
    int offset = 0;
    DivInstrumentMacro* macros[] = {
      &ins->std.volMacro, &ins->std.arpMacro, &ins->std.dutyMacro,
      &ins->std.waveMacro, &ins->std.pitchMacro, &ins->std.ex1Macro,
      &ins->std.ex2Macro, &ins->std.ex3Macro, &ins->std.algMacro,
      &ins->std.fbMacro, &ins->std.fmsMacro, &ins->std.amsMacro,
      &ins->std.panLMacro, &ins->std.panRMacro, &ins->std.phaseResetMacro,
      &ins->std.ex4Macro, &ins->std.ex5Macro, &ins->std.ex6Macro,
      &ins->std.ex7Macro, &ins->std.ex8Macro, &ins->std.ex9Macro,
      &ins->std.ex10Macro
    };

    for (int m = 0; m < 22 && stdOffset + offset + 7 < (unsigned int)dataLen; m++) {
      unsigned char* mc = std + offset;
      int len = mc[0];
      macros[m]->len = len;
      macros[m]->delay = mc[1];
      macros[m]->speed = mc[2];
      macros[m]->loop = mc[3];
      macros[m]->rel = mc[4];
      macros[m]->mode = mc[5];
      macros[m]->open = mc[6];

      offset += 7;
      for (int v = 0; v < len && v < 256 && stdOffset + offset + 4 <= (unsigned int)dataLen; v++) {
        macros[m]->val[v] = *(int*)(std + offset);
        offset += 4;
      }
    }

    // Parse operator macros if sentinel 0xA0 is present
    // 4 operators × 20 params each = 80 macros, same binary format as standard macros
    // Operator macro order: AM(0), AR(1), DR(2), MULT(3), RR(4), SL(5), TL(6),
    //   DT2(7), RS(8), DT(9), D2R(10), SSG(11), DAM(12), DVB(13), EGT(14),
    //   KSL(15), SUS(16), VIB(17), WS(18), KSR(19)
    if (stdOffset + offset < (unsigned int)dataLen && std[offset] == 0xA0) {
      offset++; // Skip sentinel byte

    DivInstrumentMacro* opMacroList[4][20] = {};
    for (int op = 0; op < 4; op++) {
      opMacroList[op][0]  = &ins->std.opMacros[op].amMacro;
      opMacroList[op][1]  = &ins->std.opMacros[op].arMacro;
      opMacroList[op][2]  = &ins->std.opMacros[op].drMacro;
      opMacroList[op][3]  = &ins->std.opMacros[op].multMacro;
      opMacroList[op][4]  = &ins->std.opMacros[op].rrMacro;
      opMacroList[op][5]  = &ins->std.opMacros[op].slMacro;
      opMacroList[op][6]  = &ins->std.opMacros[op].tlMacro;
      opMacroList[op][7]  = &ins->std.opMacros[op].dt2Macro;
      opMacroList[op][8]  = &ins->std.opMacros[op].rsMacro;
      opMacroList[op][9]  = &ins->std.opMacros[op].dtMacro;
      opMacroList[op][10] = &ins->std.opMacros[op].d2rMacro;
      opMacroList[op][11] = &ins->std.opMacros[op].ssgMacro;
      opMacroList[op][12] = &ins->std.opMacros[op].damMacro;
      opMacroList[op][13] = &ins->std.opMacros[op].dvbMacro;
      opMacroList[op][14] = &ins->std.opMacros[op].egtMacro;
      opMacroList[op][15] = &ins->std.opMacros[op].kslMacro;
      opMacroList[op][16] = &ins->std.opMacros[op].susMacro;
      opMacroList[op][17] = &ins->std.opMacros[op].vibMacro;
      opMacroList[op][18] = &ins->std.opMacros[op].wsMacro;
      opMacroList[op][19] = &ins->std.opMacros[op].ksrMacro;
    }

    for (int op = 0; op < 4; op++) {
      for (int p = 0; p < 20 && stdOffset + offset + 7 < (unsigned int)dataLen; p++) {
        unsigned char* mc = std + offset;
        int len = mc[0];
        opMacroList[op][p]->len = len;
        opMacroList[op][p]->delay = mc[1];
        opMacroList[op][p]->speed = mc[2];
        opMacroList[op][p]->loop = mc[3];
        opMacroList[op][p]->rel = mc[4];
        opMacroList[op][p]->mode = mc[5];
        opMacroList[op][p]->open = mc[6];

        offset += 7;
        for (int v = 0; v < len && v < 256 && stdOffset + offset + 4 <= (unsigned int)dataLen; v++) {
          opMacroList[op][p]->val[v] = *(int*)(std + offset);
          offset += 4;
        }
      }
    }
    } // end sentinel 0xA0 check
  }

  // Parse chip-specific data
  if (chipOffset > 0 && chipOffset < (unsigned int)dataLen) {
    unsigned char* chip = data + chipOffset;
    switch (ins->type) {
      case DIV_INS_GB:
        ins->gb.envVol = chip[0];
        ins->gb.envDir = chip[1];
        ins->gb.envLen = chip[2];
        ins->gb.soundLen = chip[3];
        ins->gb.softEnv = chip[4] != 0;
        ins->gb.alwaysInit = chip[5] != 0;
        ins->gb.doubleWave = chip[6] != 0;
        ins->gb.hwSeqLen = chip[7];
        for (int i = 0; i < ins->gb.hwSeqLen && i < 256 && chipOffset + 8 + i * 3 + 2 < (unsigned int)dataLen; i++) {
          ins->gb.hwSeq[i].cmd = chip[8 + i * 3];
          ins->gb.hwSeq[i].data = *(unsigned short*)(chip + 9 + i * 3);
        }
        break;

      case DIV_INS_C64:
        ins->c64.triOn = (chip[0] & 1) != 0;
        ins->c64.sawOn = (chip[0] & 2) != 0;
        ins->c64.pulseOn = (chip[0] & 4) != 0;
        ins->c64.noiseOn = (chip[0] & 8) != 0;
        ins->c64.a = chip[1];
        ins->c64.d = chip[2];
        ins->c64.s = chip[3];
        ins->c64.r = chip[4];
        ins->c64.duty = *(unsigned short*)(chip + 5);
        ins->c64.ringMod = chip[7];
        ins->c64.oscSync = chip[8];
        ins->c64.toFilter = (chip[9] & 1) != 0;
        ins->c64.initFilter = (chip[9] & 2) != 0;
        ins->c64.dutyIsAbs = (chip[9] & 4) != 0;
        ins->c64.filterIsAbs = (chip[9] & 8) != 0;
        ins->c64.noTest = (chip[9] & 16) != 0;
        ins->c64.resetDuty = (chip[9] & 32) != 0;
        ins->c64.res = chip[10];
        ins->c64.cut = *(unsigned short*)(chip + 11);
        ins->c64.hp = (chip[13] & 1) != 0;
        ins->c64.lp = (chip[13] & 2) != 0;
        ins->c64.bp = (chip[13] & 4) != 0;
        ins->c64.ch3off = (chip[13] & 8) != 0;
        printf("[FurnaceDispatch] C64 ins %d parsed: wave=%d%d%d%d ADSR=%d/%d/%d/%d duty=%d\n",
               insIndex,
               ins->c64.triOn ? 1 : 0, ins->c64.sawOn ? 1 : 0,
               ins->c64.pulseOn ? 1 : 0, ins->c64.noiseOn ? 1 : 0,
               ins->c64.a, ins->c64.d, ins->c64.s, ins->c64.r, ins->c64.duty);
        break;

      case DIV_INS_N163:
        ins->n163.wave = *(int*)(chip);
        ins->n163.wavePos = *(int*)(chip + 4);
        ins->n163.waveLen = *(int*)(chip + 8);
        ins->n163.waveMode = chip[12];
        ins->n163.perChanPos = chip[13] != 0;
        break;

      case DIV_INS_FDS:
        ins->fds.modSpeed = *(int*)(chip);
        ins->fds.modDepth = *(int*)(chip + 4);
        ins->fds.initModTableWithFirstWave = chip[8] != 0;
        for (int i = 0; i < 32; i++) {
          ins->fds.modTable[i] = (signed char)chip[9 + i];
        }
        break;

      case DIV_INS_SNES:
        ins->snes.useEnv = chip[0] != 0;
        ins->snes.sus = chip[1];
        ins->snes.gainMode = (DivInstrumentSNES::GainMode)chip[2];
        ins->snes.gain = chip[3];
        ins->snes.a = chip[4];
        ins->snes.d = chip[5];
        ins->snes.s = chip[6];
        ins->snes.r = chip[7];
        ins->snes.d2 = chip[8];
        break;

      case DIV_INS_ES5506:
        if (chipOffset + 13 <= (unsigned int)dataLen) {
          ins->es5506.filter.mode = (DivInstrumentES5506::Filter::FilterMode)chip[0];
          ins->es5506.filter.k1 = *(unsigned short*)(chip + 1);
          ins->es5506.filter.k2 = *(unsigned short*)(chip + 3);
          ins->es5506.envelope.ecount = *(unsigned short*)(chip + 5);
          ins->es5506.envelope.lVRamp = (signed char)chip[7];
          ins->es5506.envelope.rVRamp = (signed char)chip[8];
          ins->es5506.envelope.k1Ramp = (signed char)chip[9];
          ins->es5506.envelope.k2Ramp = (signed char)chip[10];
          ins->es5506.envelope.k1Slow = chip[11] != 0;
          ins->es5506.envelope.k2Slow = chip[12] != 0;
        }
        break;

      case DIV_INS_MULTIPCM:
        if (chipOffset + 10 <= (unsigned int)dataLen) {
          ins->multipcm.ar = chip[0];
          ins->multipcm.d1r = chip[1];
          ins->multipcm.dl = chip[2];
          ins->multipcm.d2r = chip[3];
          ins->multipcm.rr = chip[4];
          ins->multipcm.rc = chip[5];
          ins->multipcm.lfo = chip[6];
          ins->multipcm.vib = chip[7];
          ins->multipcm.am = chip[8];
          ins->multipcm.damp = (chip[9] & 1) != 0;
          ins->multipcm.pseudoReverb = (chip[9] & 2) != 0;
          ins->multipcm.lfoReset = (chip[9] & 4) != 0;
          ins->multipcm.levelDirect = (chip[9] & 8) != 0;
        }
        break;

      case DIV_INS_SU: {
        ins->su.switchRoles = chip[0] != 0;
        int suSeqLen = chip[1];
        ins->su.hwSeqLen = suSeqLen;
        for (int i = 0; i < suSeqLen && i < 256 && chipOffset + 2 + i * 5 + 4 < (unsigned int)dataLen; i++) {
          unsigned char* entry = chip + 2 + i * 5;
          ins->su.hwSeq[i].cmd = entry[0];
          ins->su.hwSeq[i].bound = entry[1];
          ins->su.hwSeq[i].val = entry[2];
          ins->su.hwSeq[i].speed = *(unsigned short*)(entry + 3);
        }
        break;
      }

      case DIV_INS_ESFM: {
        ins->esfm.noise = chip[0] & 3;
        for (int i = 0; i < 4 && chipOffset + 1 + (i + 1) * 4 <= (unsigned int)dataLen; i++) {
          unsigned char* opData = chip + 1 + i * 4;
          ins->esfm.op[i].delay = (opData[0] >> 5) & 7;
          ins->esfm.op[i].outLvl = (opData[0] >> 2) & 7;
          ins->esfm.op[i].right = (opData[0] >> 1) & 1;
          ins->esfm.op[i].left = opData[0] & 1;
          ins->esfm.op[i].modIn = opData[1] & 7;
          ins->esfm.op[i].fixed = (opData[1] >> 3) & 1;
          ins->esfm.op[i].ct = (signed char)opData[2];
          ins->esfm.op[i].dt = (signed char)opData[3];
        }
        break;
      }

      case DIV_INS_POWERNOISE:
      case DIV_INS_POWERNOISE_SLOPE:
        ins->powernoise.octave = chip[0];
        break;

      case DIV_INS_SID2: {
        unsigned char s2byte = chip[0];
        ins->sid2.volume = s2byte & 0x0F;
        ins->sid2.mixMode = (s2byte >> 4) & 0x03;
        ins->sid2.noiseMode = (s2byte >> 6) & 0x03;
        break;
      }

      default:
        break;
    }
  }

  // Parse sample/amiga data
  if (sampleOffset > 0 && sampleOffset < (unsigned int)dataLen) {
    unsigned char* samp = data + sampleOffset;
    ins->amiga.initSample = *(short*)(samp);
    ins->amiga.useNoteMap = (samp[2] & 1) != 0;
    ins->amiga.useSample = (samp[2] & 2) != 0;
    ins->amiga.useWave = (samp[2] & 4) != 0;
    ins->amiga.waveLen = samp[3];

    // Note map follows if useNoteMap
    if (ins->amiga.useNoteMap && sampleOffset + 4 + 120 * 8 <= (unsigned int)dataLen) {
      for (int i = 0; i < 120; i++) {
        unsigned char* entry = samp + 4 + i * 8;
        ins->amiga.noteMap[i].freq = *(int*)entry;
        ins->amiga.noteMap[i].map = *(short*)(entry + 4);
        ins->amiga.noteMap[i].dpcmFreq = (signed char)entry[6];
        ins->amiga.noteMap[i].dpcmDelta = (signed char)entry[7];
      }
    }
  }

  engine_set_instrument(insIndex, ins);
  printf("[FurnaceDispatch] Loaded full instrument %d: %s (type %d)\n",
         insIndex, ins->name.c_str(), ins->type);
}

// ============================================================
// SAMPLE SUPPORT
// ============================================================

/**
 * Set a sample.
 * Binary format:
 *   Header (32 bytes):
 *     [0-3] length (samples)
 *     [4-7] loopStart
 *     [8-11] loopEnd
 *     [12] depth (sample bit depth enum)
 *     [13] loopMode (0=none, 1=forward, 2=pingpong, 3=backward)
 *     [14] brrEmphasis
 *     [15] dither
 *     [16-19] centerRate
 *     [20-21] brrLoopPoint (for BRR samples)
 *     [22] loop (1=loopable, 0=not loopable)
 *     [23-31] reserved
 *   [32-...] sample data in native format
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_set_sample(int handle, int sampleIndex, unsigned char* data, int dataLen) {
  if (dataLen < 32) return;

  DivSample* sample = new DivSample();
  sample->samples = *(unsigned int*)(data);
  sample->loopStart = *(int*)(data + 4);
  sample->loopEnd = *(int*)(data + 8);
  sample->depth = (DivSampleDepth)data[12];
  sample->loopMode = (DivSampleLoopMode)data[13];
  sample->brrEmphasis = data[14] != 0;
  sample->dither = data[15] != 0;
  sample->centerRate = *(unsigned int*)(data + 16);
  sample->loop = data[22] != 0;

  // Allocate and copy sample data based on depth (all 16 formats)
  int dataSize = dataLen - 32;
  if (dataSize > 0 && sample->samples > 0) {
    unsigned int bytesNeeded;
    switch (sample->depth) {
      case DIV_SAMPLE_DEPTH_1BIT:
        // 1 bit per sample, packed 8 samples per byte
        bytesNeeded = (sample->samples + 7) / 8;
        sample->data1 = new unsigned char[bytesNeeded];
        memcpy(sample->data1, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->length1 = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_1BIT_DPCM:
        // NES DPCM: 1 bit delta, 8 samples per byte
        bytesNeeded = (sample->samples + 7) / 8;
        sample->dataDPCM = new unsigned char[bytesNeeded];
        memcpy(sample->dataDPCM, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthDPCM = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_YMZ_ADPCM:
        // YMZ280B ADPCM: 4 bits per sample
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataZ = new unsigned char[bytesNeeded];
        memcpy(sample->dataZ, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthZ = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_QSOUND_ADPCM:
        // QSound ADPCM: 4 bits per sample
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataQSoundA = new unsigned char[bytesNeeded];
        memcpy(sample->dataQSoundA, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthQSoundA = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_ADPCM_A:
        // YM2610 ADPCM-A: 4 bits per sample
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataA = new unsigned char[bytesNeeded];
        memcpy(sample->dataA, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthA = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_ADPCM_B:
        // YM2610 ADPCM-B: 4 bits per sample
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataB = new unsigned char[bytesNeeded];
        memcpy(sample->dataB, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthB = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_ADPCM_K:
        // K053260/K007232 ADPCM: 4 bits per sample
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataK = new unsigned char[bytesNeeded];
        memcpy(sample->dataK, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthK = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_8BIT:
        // Signed 8-bit PCM
        sample->data8 = new signed char[sample->samples];
        memcpy(sample->data8, data + 32, std::min((unsigned int)dataSize, sample->samples));
        sample->length8 = sample->samples;
        break;

      case DIV_SAMPLE_DEPTH_BRR:
        // SNES BRR: 9 bytes per 16-sample block — dataSize IS the BRR byte count.
        // TS sends s.data.length (BRR byte count) as sampleCount, not PCM frame count,
        // so we must not use sample->samples for the byte calculation.
        sample->dataBRR = new unsigned char[dataSize];
        memcpy(sample->dataBRR, data + 32, dataSize);
        sample->lengthBRR = dataSize;
        break;

      case DIV_SAMPLE_DEPTH_VOX:
        // Dialogic ADPCM (VOX): 4 bits per sample
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataVOX = new unsigned char[bytesNeeded];
        memcpy(sample->dataVOX, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthVOX = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_MULAW:
        // µ-law: 8 bits per sample
        sample->dataMuLaw = new unsigned char[sample->samples];
        memcpy(sample->dataMuLaw, data + 32, std::min((unsigned int)dataSize, sample->samples));
        sample->lengthMuLaw = sample->samples;
        break;

      case DIV_SAMPLE_DEPTH_C219:
        // Namco C219: 4 bits per sample with special encoding
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataC219 = new unsigned char[bytesNeeded];
        memcpy(sample->dataC219, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthC219 = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_IMA_ADPCM:
        // IMA ADPCM: 4 bits per sample
        bytesNeeded = (sample->samples + 1) / 2;
        sample->dataIMA = new unsigned char[bytesNeeded];
        memcpy(sample->dataIMA, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->lengthIMA = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_12BIT:
        // 12-bit samples stored as 16-bit (upper 12 bits)
        bytesNeeded = sample->samples * 2;
        sample->data12 = new unsigned char[bytesNeeded];
        memcpy(sample->data12, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->length12 = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_4BIT:
        // Generic 4-bit: 2 samples per byte
        bytesNeeded = (sample->samples + 1) / 2;
        sample->data4 = new unsigned char[bytesNeeded];
        memcpy(sample->data4, data + 32, std::min((unsigned int)dataSize, bytesNeeded));
        sample->length4 = bytesNeeded;
        break;

      case DIV_SAMPLE_DEPTH_16BIT:
        // Signed 16-bit PCM (default/most common)
        sample->data16 = new short[sample->samples];
        memcpy(sample->data16, data + 32, std::min((unsigned int)dataSize, sample->samples * 2));
        sample->length16 = sample->samples * 2;
        break;

      default:
        // Unknown format - store as 16-bit
        printf("[FurnaceDispatch] Warning: Unknown sample depth %d, storing as 16-bit\n", sample->depth);
        sample->data16 = new short[sample->samples];
        memcpy(sample->data16, data + 32, std::min((unsigned int)dataSize, sample->samples * 2));
        sample->length16 = sample->samples * 2;
        break;
    }
  }

  engine_set_sample(sampleIndex, sample);

  // Sync to ALL dispatch instances (multi-chip songs need samples on every chip)
  for (auto& [h, inst] : g_instances) {
    auto& songSamples = inst->engine.song.sample;
    if (sampleIndex >= (int)songSamples.size()) {
      songSamples.resize(sampleIndex + 1, nullptr);
    }
    songSamples[sampleIndex] = sample; // Borrowed reference (g_samples owns it)
    inst->engine.song.sampleLen = (int)songSamples.size();

    // Ensure at least one instrument exists in song.ins for chips that need it
    auto& songIns = inst->engine.song.ins;
    if (songIns.empty()) {
      DivInstrument* defaultIns = new DivInstrument();
      defaultIns->amiga.initSample = 0;
      defaultIns->amiga.useNoteMap = false;
      songIns.push_back(defaultIns);
      inst->engine.song.insLen = 1;
    }
  }

  // Mark sample as renderable (required for RF5C68 and other chips to include it in renderSamples())
  // Enable sample rendering for ALL chip slots (multi-chip songs have sysID > 0)
  for (int s = 0; s < DIV_MAX_SAMPLE_TYPE; s++) {
    for (int c = 0; c < DIV_MAX_CHIPS; c++) {
      sample->renderOn[s][c] = true;
    }
  }

  printf("[FurnaceDispatch] Loaded sample %d: %u samples, depth %d\n",
         sampleIndex, sample->samples, sample->depth);
}

/**
 * Copy sample data into the chip's internal sample memory.
 * Must be called after all samples are uploaded via furnace_dispatch_set_sample.
 * Many sample-based chips (Amiga, SEGAPCM, QSound, etc.) require this step
 * to populate their internal sampleMem before they can play audio.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_render_samples(int handle) {
  auto it = g_instances.find(handle);
  if (it != g_instances.end() && it->second->dispatch) {
    int sLen = it->second->engine.song.sampleLen;
    printf("[FurnaceDispatch] renderSamples PRE: handle=%d, sampleLen=%d\n", handle, sLen);
    // Call render() on all PCM samples so chip-native formats (dataBRR for SNES,
    // dataADPCMA/B for YM2610, etc.) are computed before renderSamples() reads them.
    // Without this, SNES/SPC700 plays with empty sampleMem because dataBRR is NULL.
    for (int i = 0; i < sLen; i++) {
      DivSample* smp = it->second->engine.song.sample[i];
      if (smp) {
        // DivSample::render() is unavailable in WASM (sample.cpp not compiled).
        // Inline format conversions for all chip-needed formats:
        if (smp->depth == DIV_SAMPLE_DEPTH_16BIT && smp->data16 && smp->samples > 0) {
          unsigned int n = smp->samples;
          // 8-bit PCM (Amiga, PCE PCM, generic)
          if (!smp->data8) {
            smp->length8 = n;
            smp->data8 = new signed char[(n + 4095) & (~0xfff)];
            for (unsigned int j = 0; j < n; j++) smp->data8[j] = smp->data16[j] >> 8;
          }
          // BRR (SNES)
          if (!smp->dataBRR) {
            int brrBufLen = (((n + 15) / 16) + 1) * 9;
            smp->dataBRR = new unsigned char[brrBufLen];
            memset(smp->dataBRR, 0, brrBufLen);
            smp->lengthBRR = brrEncode(smp->data16, smp->dataBRR, n,
              smp->loop ? smp->loopStart : 0, smp->brrEmphasis ? 1 : 0, 0);
          }
          // ADPCM-A (YM2610)
          if (!smp->dataA) {
            smp->lengthA = (n + 1) / 2;
            smp->dataA = new unsigned char[smp->lengthA];
            yma_encode(smp->data16, smp->dataA, n);
          }
          // ADPCM-B (YM2608/YM2610)
          if (!smp->dataB) {
            smp->lengthB = (n + 1) / 2;
            smp->dataB = new unsigned char[smp->lengthB];
            ymb_encode(smp->data16, smp->dataB, n);
          }
          // YMZ280B ADPCM
          if (!smp->dataZ) {
            smp->lengthZ = (n + 1) / 2;
            smp->dataZ = new unsigned char[(smp->lengthZ + 3) & ~3];
            memset(smp->dataZ, 0, (smp->lengthZ + 3) & ~3);
            ymz_encode(smp->data16, smp->dataZ, n);
          }
          // QSound ADPCM
          if (!smp->dataQSoundA) {
            smp->lengthQSoundA = (n + 1) / 2;
            smp->dataQSoundA = new unsigned char[smp->lengthQSoundA];
            bs_encode(smp->data16, smp->dataQSoundA, n);
          }
          // MSM6295 VOX ADPCM
          if (!smp->dataVOX) {
            smp->lengthVOX = (n + 1) / 2;
            smp->dataVOX = new unsigned char[smp->lengthVOX];
            oki_encode(smp->data16, smp->dataVOX, n);
          }
          // µ-law (C140 alternate mode)
          if (!smp->dataMuLaw) {
            smp->lengthMuLaw = n;
            smp->dataMuLaw = new unsigned char[n];
            for (unsigned int j = 0; j < n; j++) {
              // Standard µ-law encoding from 16-bit PCM
              int s = smp->data16[j];
              int sign = (s >> 8) & 0x80;
              if (sign) s = -s;
              if (s > 32635) s = 32635;
              s += 0x84;
              int exponent = 7;
              for (int expMask = 0x4000; (s & expMask) == 0 && exponent > 0; exponent--, expMask >>= 1) {}
              int mantissa = (s >> (exponent + 3)) & 0x0F;
              smp->dataMuLaw[j] = ~(sign | (exponent << 4) | mantissa);
            }
          }
          // C219 signed-magnitude 8-bit
          if (!smp->dataC219) {
            smp->lengthC219 = n;
            smp->dataC219 = new unsigned char[n];
            for (unsigned int j = 0; j < n; j++) {
              int s = smp->data16[j] >> 8; // reduce to 8-bit
              if (s < 0) {
                smp->dataC219[j] = 0x80 | ((-s) & 0x7F);
              } else {
                smp->dataC219[j] = s & 0x7F;
              }
            }
          }
        }
      }
    }
    it->second->dispatch->renderSamples(0);
    printf("[FurnaceDispatch] renderSamples POST: handle=%d done\n", handle);
  }
}

/**
 * Load instrument from raw INS2 feature-block data.
 * Accepts the binary data from a Furnace .fur file's INS2 block.
 * Format: "INS2" + blockLen(4) + version(2) + type(1) + reserved(1) + features...
 * Each feature: code(2) + len(2) + data... "EN" marks end.
 *
 * This avoids the need for SafeReader and the full instrument.cpp dependency.
 */
EMSCRIPTEN_KEEPALIVE
void furnace_dispatch_load_ins2(int insIndex, unsigned char* data, int dataLen) {
  if (dataLen < 8) return;

  // Check magic "INS2"
  if (data[0] != 'I' || data[1] != 'N' || data[2] != 'S' || data[3] != '2') {
    printf("[FurnaceDispatch] load_ins2: invalid magic\n");
    return;
  }

  int blockLen = *(int*)(data + 4);
  short version = *(short*)(data + 8);
  unsigned char insType = data[10];
  // data[11] is reserved

  DivInstrument* ins = new DivInstrument();
  ins->type = (DivInstrumentType)insType;

  int pos = 12; // Start of feature blocks

  while (pos + 2 <= dataLen) {
    unsigned char fc0 = data[pos];
    unsigned char fc1 = data[pos + 1];
    pos += 2;

    // End marker
    if (fc0 == 'E' && fc1 == 'N') break;

    // Read feature length
    if (pos + 2 > dataLen) break;
    unsigned short featLen = *(unsigned short*)(data + pos);
    pos += 2;

    int featEnd = pos + featLen;
    if (featEnd > dataLen) break;

    // ── NA: Name ──
    if (fc0 == 'N' && fc1 == 'A') {
      unsigned short nameLen = *(unsigned short*)(data + pos);
      pos += 2;
      if (nameLen > 0 && pos + nameLen <= featEnd) {
        ins->name = String((char*)(data + pos), nameLen);
      }
      pos = featEnd;
    }
    // ── FM: FM operator data ──
    else if (fc0 == 'F' && fc1 == 'M') {
      // Upstream readFeatureFM: heavily bit-packed format
      int p = pos;

      if (p + 4 > featEnd) { pos = featEnd; continue; }

      // Byte 0: opCount (low nibble) + operator enable flags (high nibble)
      unsigned char opCountByte = data[p++];
      ins->fm.op[0].enable = (opCountByte & 16) ? 1 : 0;
      ins->fm.op[1].enable = (opCountByte & 32) ? 1 : 0;
      ins->fm.op[2].enable = (opCountByte & 64) ? 1 : 0;
      ins->fm.op[3].enable = (opCountByte & 128) ? 1 : 0;
      int opCount = opCountByte & 15;

      // Byte 1: alg(bits 6-4) + fb(bits 2-0)
      unsigned char next = data[p++];
      ins->fm.alg = (next >> 4) & 7;
      ins->fm.fb = next & 7;

      // Byte 2: fms2(bits 7-5) + ams(bits 4-3) + fms(bits 2-0)
      next = data[p++];
      ins->fm.fms2 = (next >> 5) & 7;
      ins->fm.ams = (next >> 3) & 3;
      ins->fm.fms = next & 7;

      // Byte 3: ams2(bits 7-6) + ops(bit 5: 4 if set, 2 if clear) + opllPreset(bits 4-0)
      next = data[p++];
      ins->fm.ams2 = (next >> 6) & 3;
      ins->fm.ops = (next & 32) ? 4 : 2;
      ins->fm.opllPreset = next & 31;

      // Byte 4 (version >= 224): block(bits 3-0)
      if (version >= 224 && p < featEnd) {
        next = data[p++];
        ins->fm.block = next & 15;
      }

      // Read operators: 8 bytes each, bit-packed
      for (int i = 0; i < opCount && i < 4; i++) {
        if (p + 8 > featEnd) break;
        DivInstrumentFM::Operator& op = ins->fm.op[i];

        next = data[p++]; // ksr(7) + dt(6-4) + mult(3-0)
        op.ksr = (next & 128) ? 1 : 0;
        op.dt = (next >> 4) & 7;
        op.mult = next & 15;

        next = data[p++]; // sus(7) + tl(6-0)
        op.sus = (next & 128) ? 1 : 0;
        op.tl = next & 127;

        next = data[p++]; // rs(7-6) + vib(5) + ar(4-0)
        op.rs = (next >> 6) & 3;
        op.vib = (next & 32) ? 1 : 0;
        op.ar = next & 31;

        next = data[p++]; // am(7) + ksl(6-5) + dr(4-0)
        op.am = (next & 128) ? 1 : 0;
        op.ksl = (next >> 5) & 3;
        op.dr = next & 31;

        next = data[p++]; // egt(7) + kvs(6-5) + d2r(4-0)
        op.egt = (next & 128) ? 1 : 0;
        op.kvs = (next >> 5) & 3;
        op.d2r = next & 31;

        next = data[p++]; // sl(7-4) + rr(3-0)
        op.sl = (next >> 4) & 15;
        op.rr = next & 15;

        next = data[p++]; // dvb(7-4) + ssgEnv(3-0)
        op.dvb = (next >> 4) & 15;
        op.ssgEnv = next & 15;

        next = data[p++]; // dam(7-5) + dt2(4-3) + ws(2-0)
        op.dam = (next >> 5) & 7;
        op.dt2 = (next >> 3) & 3;
        op.ws = next & 7;
      }

      pos = featEnd;
    }
    // ── MA: Macros ──
    else if (fc0 == 'M' && fc1 == 'A') {
      unsigned short macroHeaderLen = *(unsigned short*)(data + pos);
      pos += 2;

      if (macroHeaderLen == 0) {
        pos = featEnd;
        continue;
      }

      while (pos < featEnd) {
        int macroHeaderEnd = pos + macroHeaderLen;
        if (macroHeaderEnd > featEnd) break;

        unsigned char macroCode = data[pos];
        if (macroCode == 255) break; // end of macro list

        DivInstrumentMacro* target = NULL;
        switch (macroCode) {
          case 0: target = &ins->std.volMacro; break;
          case 1: target = &ins->std.arpMacro; break;
          case 2: target = &ins->std.dutyMacro; break;
          case 3: target = &ins->std.waveMacro; break;
          case 4: target = &ins->std.pitchMacro; break;
          case 5: target = &ins->std.ex1Macro; break;
          case 6: target = &ins->std.ex2Macro; break;
          case 7: target = &ins->std.ex3Macro; break;
          case 8: target = &ins->std.algMacro; break;
          case 9: target = &ins->std.fbMacro; break;
          case 10: target = &ins->std.fmsMacro; break;
          case 11: target = &ins->std.amsMacro; break;
          case 12: target = &ins->std.panLMacro; break;
          case 13: target = &ins->std.panRMacro; break;
          case 14: target = &ins->std.phaseResetMacro; break;
          case 15: target = &ins->std.ex4Macro; break;
          case 16: target = &ins->std.ex5Macro; break;
          case 17: target = &ins->std.ex6Macro; break;
          case 18: target = &ins->std.ex7Macro; break;
          case 19: target = &ins->std.ex8Macro; break;
          case 20: target = &ins->std.ex9Macro; break;
          case 21: target = &ins->std.ex10Macro; break;
          default: break;
        }

        if (target) {
          target->macroType = (DivMacroType)macroCode;
          target->len = data[pos + 1];
          target->loop = data[pos + 2];
          target->rel = data[pos + 3];
          target->mode = data[pos + 4];
          unsigned char wordSizeByte = data[pos + 5];
          target->open = wordSizeByte & 15;
          int wordSize = wordSizeByte >> 6;
          target->delay = data[pos + 6];
          target->speed = data[pos + 7];
        }

        pos = macroHeaderEnd;

        // Read macro values
        if (target && target->len > 0 && target->len <= 256) {
          int wordSize = (data[macroHeaderEnd - macroHeaderLen + 5] >> 6) & 3;
          switch (wordSize) {
            case 0: // unsigned byte
              for (int i = 0; i < target->len && pos < featEnd; i++) {
                target->val[i] = (unsigned char)data[pos++];
              }
              break;
            case 1: // signed byte
              for (int i = 0; i < target->len && pos < featEnd; i++) {
                target->val[i] = (signed char)data[pos++];
              }
              break;
            case 2: // short
              for (int i = 0; i < target->len && pos + 2 <= featEnd; i++) {
                target->val[i] = *(short*)(data + pos);
                pos += 2;
              }
              break;
            default: // int
              for (int i = 0; i < target->len && pos + 4 <= featEnd; i++) {
                target->val[i] = *(int*)(data + pos);
                pos += 4;
              }
              break;
          }
        }
      }

      // Version < 193: AY/AY8930 wave macro values need +1 adjustment
      if (version < 193) {
        if (ins->type == (DivInstrumentType)6 || ins->type == (DivInstrumentType)7) { // DIV_INS_AY=6, DIV_INS_AY8930=7
          for (int j = 0; j < ins->std.waveMacro.len; j++) {
            ins->std.waveMacro.val[j]++;
          }
        }
      }

      pos = featEnd;
    }
    // ── GB: Game Boy ──
    else if (fc0 == 'G' && fc1 == 'B') {
      if (featLen >= 4) {
        unsigned char next = data[pos];
        ins->gb.envLen = (next >> 5) & 7;
        ins->gb.envDir = (next & 16) ? 1 : 0;
        ins->gb.envVol = next & 15;
        ins->gb.soundLen = data[pos + 1];
        unsigned char flags = data[pos + 2];
        if (version >= 196) ins->gb.doubleWave = flags & 4;
        ins->gb.alwaysInit = flags & 2;
        ins->gb.softEnv = flags & 1;
        ins->gb.hwSeqLen = data[pos + 3];
        for (int i = 0; i < ins->gb.hwSeqLen && i < 256; i++) {
          int seqOff = pos + 4 + i * 3;
          if (seqOff + 3 > featEnd) break;
          ins->gb.hwSeq[i].cmd = data[seqOff];
          ins->gb.hwSeq[i].data = *(short*)(data + seqOff + 1);
        }
      }
      pos = featEnd;
    }
    // ── 64: C64 SID ──
    else if (fc0 == '6' && fc1 == '4') {
      // Upstream readFeature64: bit-packed format
      int p = pos;
      if (p + 8 > featEnd) { pos = featEnd; continue; }

      // Byte 0: dutyIsAbs(7) + initFilter(6) + volIsCutoff(5) + toFilter(4) +
      //         noiseOn(3) + pulseOn(2) + sawOn(1) + triOn(0)
      unsigned char next = data[p++];
      ins->c64.dutyIsAbs = (next & 128) ? 1 : 0;
      ins->c64.initFilter = (next & 64) ? 1 : 0;
      // volIsCutoff = next & 32; // used by song, stored elsewhere
      ins->c64.toFilter = (next & 16) ? 1 : 0;
      ins->c64.noiseOn = (next & 8) ? 1 : 0;
      ins->c64.pulseOn = (next & 4) ? 1 : 0;
      ins->c64.sawOn = (next & 2) ? 1 : 0;
      ins->c64.triOn = next & 1;

      // Byte 1: oscSync(7) + ringMod(6) + noTest(5) + filterIsAbs(4) +
      //         ch3off(3) + bp(2) + hp(1) + lp(0)
      next = data[p++];
      ins->c64.oscSync = (next & 128) ? 1 : 0;
      ins->c64.ringMod = (next & 64) ? 1 : 0;
      ins->c64.noTest = (next & 32) ? 1 : 0;
      ins->c64.filterIsAbs = (next & 16) ? 1 : 0;
      ins->c64.ch3off = (next & 8) ? 1 : 0;
      ins->c64.bp = (next & 4) ? 1 : 0;
      ins->c64.hp = (next & 2) ? 1 : 0;
      ins->c64.lp = next & 1;

      // Byte 2: A(7-4) + D(3-0) — nibble-packed
      next = data[p++];
      ins->c64.a = (next >> 4) & 15;
      ins->c64.d = next & 15;

      // Byte 3: S(7-4) + R(3-0) — nibble-packed
      next = data[p++];
      ins->c64.s = (next >> 4) & 15;
      ins->c64.r = next & 15;

      // Bytes 4-5: duty (16-bit LE, masked to 12 bits)
      ins->c64.duty = (*(unsigned short*)(data + p)) & 4095;
      p += 2;

      // Bytes 6-7: cut(11-0) + res(15-12)
      unsigned short cr = *(unsigned short*)(data + p);
      p += 2;
      ins->c64.cut = cr & 4095;
      ins->c64.res = cr >> 12;

      // Version >= 199: extended resonance byte
      if (version >= 199 && p < featEnd) {
        next = data[p++];
        ins->c64.res |= (next & 15) << 4;
        if (version >= 222) {
          ins->c64.resetDuty = (next & 0x10) ? 1 : 0;
        }
      }

      pos = featEnd;
    }
    // ── SM: Sample mapping ──
    else if (fc0 == 'S' && fc1 == 'M') {
      // Upstream readFeatureSM:
      // short initSample, byte flags(useWave=bit2, useSample=bit1, useNoteMap=bit0), byte waveLen
      if (featLen >= 4) {
        ins->amiga.initSample = *(short*)(data + pos);
        unsigned char flags = data[pos + 2];
        ins->amiga.useWave = (flags & 4) ? 1 : 0;
        ins->amiga.useSample = (flags & 2) ? 1 : 0;
        ins->amiga.useNoteMap = flags & 1;
        ins->amiga.waveLen = data[pos + 3];  // separate byte, not bit-packed

        if (ins->amiga.useNoteMap && featLen >= 4 + 120 * 4) {
          for (int note = 0; note < 120; note++) {
            int off = pos + 4 + note * 4;
            ins->amiga.noteMap[note].freq = *(short*)(data + off);
            ins->amiga.noteMap[note].map = *(short*)(data + off + 2);
          }
          // Version < 152: reset freq to sequential note indices
          if (version < 152) {
            for (int note = 0; note < 120; note++) {
              ins->amiga.noteMap[note].freq = note;
            }
          }
        }
      }
      pos = featEnd;
    }
    // ── Ox: Operator macros ──
    else if (fc0 == 'O' && (fc1 >= '1' && fc1 <= '4')) {
      int opIdx = fc1 - '1';
      unsigned short opMacroHeaderLen = *(unsigned short*)(data + pos);
      pos += 2;

      if (opMacroHeaderLen == 0) {
        pos = featEnd;
        continue;
      }

      while (pos < featEnd) {
        int macroHeaderEnd = pos + opMacroHeaderLen;
        if (macroHeaderEnd > featEnd) break;

        unsigned char macroCode = data[pos];
        if (macroCode == 255) break;

        DivInstrumentMacro* target = NULL;
        switch (macroCode) {
          case 0: target = &ins->std.opMacros[opIdx].amMacro; break;
          case 1: target = &ins->std.opMacros[opIdx].arMacro; break;
          case 2: target = &ins->std.opMacros[opIdx].drMacro; break;
          case 3: target = &ins->std.opMacros[opIdx].multMacro; break;
          case 4: target = &ins->std.opMacros[opIdx].rrMacro; break;
          case 5: target = &ins->std.opMacros[opIdx].slMacro; break;
          case 6: target = &ins->std.opMacros[opIdx].tlMacro; break;
          case 7: target = &ins->std.opMacros[opIdx].dt2Macro; break;
          case 8: target = &ins->std.opMacros[opIdx].rsMacro; break;
          case 9: target = &ins->std.opMacros[opIdx].dtMacro; break;
          case 10: target = &ins->std.opMacros[opIdx].d2rMacro; break;
          case 11: target = &ins->std.opMacros[opIdx].ssgMacro; break;
          case 12: target = &ins->std.opMacros[opIdx].damMacro; break;
          case 13: target = &ins->std.opMacros[opIdx].dvbMacro; break;
          case 14: target = &ins->std.opMacros[opIdx].egtMacro; break;
          case 15: target = &ins->std.opMacros[opIdx].kslMacro; break;
          case 16: target = &ins->std.opMacros[opIdx].susMacro; break;
          case 17: target = &ins->std.opMacros[opIdx].vibMacro; break;
          case 18: target = &ins->std.opMacros[opIdx].wsMacro; break;
          case 19: target = &ins->std.opMacros[opIdx].ksrMacro; break;
          default: break;
        }

        if (target) {
          target->len = data[pos + 1];
          target->loop = data[pos + 2];
          target->rel = data[pos + 3];
          target->mode = data[pos + 4];
          unsigned char wordSizeByte = data[pos + 5];
          target->open = wordSizeByte & 15;
          target->delay = data[pos + 6];
          target->speed = data[pos + 7];
        }

        pos = macroHeaderEnd;

        if (target && target->len > 0 && target->len <= 256) {
          int wordSize = (data[macroHeaderEnd - opMacroHeaderLen + 5] >> 6) & 3;
          switch (wordSize) {
            case 0:
              for (int i = 0; i < target->len && pos < featEnd; i++)
                target->val[i] = (unsigned char)data[pos++];
              break;
            case 1:
              for (int i = 0; i < target->len && pos < featEnd; i++)
                target->val[i] = (signed char)data[pos++];
              break;
            case 2:
              for (int i = 0; i < target->len && pos + 2 <= featEnd; i++) {
                target->val[i] = *(short*)(data + pos); pos += 2;
              }
              break;
            default:
              for (int i = 0; i < target->len && pos + 4 <= featEnd; i++) {
                target->val[i] = *(int*)(data + pos); pos += 4;
              }
              break;
          }
        }

        // <167 TL macro compat
        if (target && macroCode == 6 && version < 167) {
          if (target->open & 6) {
            for (int j = 0; j < 2; j++) {
              target->val[j] ^= 0x7f;
            }
          } else {
            for (int j = 0; j < target->len; j++) {
              target->val[j] ^= 0x7f;
            }
          }
        }
      }
      pos = featEnd;
    }
    // ── WS: WaveSynth ──
    else if (fc0 == 'W' && fc1 == 'S') {
      // WS feature: wave1(4) wave2(4) rateDivider(1) effect(1) enabled(1) global(1) speed(1) param1(1) param2(1) param3(1) param4(1)
      if (featLen >= 11) {
        ins->ws.wave1 = *(int*)(data + pos);
        ins->ws.wave2 = *(int*)(data + pos + 4);
        ins->ws.rateDivider = data[pos + 8];
        ins->ws.effect = data[pos + 9];
        ins->ws.enabled = data[pos + 10];
        ins->ws.global = data[pos + 11];
        ins->ws.speed = data[pos + 12];
        ins->ws.param1 = data[pos + 13];
        ins->ws.param2 = data[pos + 14];
        if (featLen >= 17) {
          ins->ws.param3 = data[pos + 15];
          ins->ws.param4 = data[pos + 16];
        }
      }
      pos = featEnd;
    }
    // ── SN: SNES ──
    else if (fc0 == 'S' && fc1 == 'N') {
      // Upstream readFeatureSN: bit-packed format
      if (featLen >= 4) {
        int p = pos;
        // Byte 0: d(6-4) + a(3-0)
        unsigned char next = data[p++];
        ins->snes.d = (next >> 4) & 7;
        ins->snes.a = next & 15;

        // Byte 1: s(7-5) + r(4-0)
        next = data[p++];
        ins->snes.s = (next >> 5) & 7;
        ins->snes.r = next & 31;

        // Byte 2: useEnv(4) + sus(3) + gainMode(2-0)
        next = data[p++];
        ins->snes.useEnv = (next & 16) ? 1 : 0;
        ins->snes.sus = (next & 8) ? 1 : 0;
        ins->snes.gainMode = (DivInstrumentSNES::GainMode)(next & 7);
        if (ins->snes.gainMode == 1 || ins->snes.gainMode == 2 || ins->snes.gainMode == 3) {
          ins->snes.gainMode = DivInstrumentSNES::GAIN_MODE_DIRECT;
        }

        // Byte 3: gain
        ins->snes.gain = data[p++];

        // Version >= 131: sus(6-5) + d2(4-0)
        if (version >= 131 && p < featEnd) {
          next = data[p++];
          ins->snes.sus = (next >> 5) & 3;
          ins->snes.d2 = next & 31;
        }
      }
      pos = featEnd;
    }
    // ── N1: N163 ──
    else if (fc0 == 'N' && fc1 == '1') {
      if (featLen >= 8) {
        ins->n163.wave = *(int*)(data + pos);
        ins->n163.wavePos = data[pos + 4];
        ins->n163.waveLen = data[pos + 5];
        ins->n163.waveMode = data[pos + 6];
        ins->n163.perChanPos = data[pos + 7] & 1;
      }
      pos = featEnd;
    }
    // ── FD: FDS ──
    else if (fc0 == 'F' && fc1 == 'D') {
      // Upstream readFeatureFD:
      // int modSpeed (4), int modDepth (4), byte initModTableWithFirstWave (1), 32 bytes modTable
      if (featLen >= 9) {
        ins->fds.modSpeed = *(int*)(data + pos);
        ins->fds.modDepth = *(int*)(data + pos + 4);  // 4 bytes, not 1
        ins->fds.initModTableWithFirstWave = data[pos + 8];
        // Mod table follows at pos+9
        if (featLen >= 41) {
          for (int i = 0; i < 32; i++) {
            ins->fds.modTable[i] = (signed char)data[pos + 9 + i];
          }
        }
      }
      pos = featEnd;
    }
    // ── LD: OPL drums ──
    else if (fc0 == 'L' && fc1 == 'D') {
      if (featLen >= 4) {
        ins->fm.fixedDrums = data[pos] & 1;
        ins->fm.kickFreq = *(unsigned short*)(data + pos + 1);
        ins->fm.snareHatFreq = *(unsigned short*)(data + pos + 3);
        ins->fm.tomTopFreq = *(unsigned short*)(data + pos + 5);
      }
      pos = featEnd;
    }
    // ── EF: ESFM ──
    else if (fc0 == 'E' && fc1 == 'F') {
      // Read ESFM operator data
      for (int i = 0; i < 4 && pos + 7 <= featEnd; i++) {
        ins->esfm.op[i].delay = data[pos];
        ins->esfm.op[i].outLvl = data[pos + 1];
        ins->esfm.op[i].modIn = data[pos + 2];
        unsigned char flags = data[pos + 3];
        ins->esfm.op[i].left = flags & 1;
        ins->esfm.op[i].right = (flags >> 1) & 1;
        ins->esfm.op[i].fixed = (flags >> 2) & 1;
        ins->esfm.op[i].ct = data[pos + 4];
        ins->esfm.op[i].dt = data[pos + 5];
        pos += 6;
      }
      pos = featEnd;
    }
    // ── NE: NES DPCM mapping ──
    else if (fc0 == 'N' && fc1 == 'E') {
      // Upstream readFeatureNE: useNoteMap flag, then 120 × (dpcmFreq, dpcmDelta)
      if (featLen >= 1) {
        unsigned char neUseNoteMap = data[pos];
        // NE sets useNoteMap independently (may override SM's value)
        ins->amiga.useNoteMap = neUseNoteMap;
        if (neUseNoteMap && featLen >= 1 + 120 * 2) {
          for (int note = 0; note < 120; note++) {
            int off = pos + 1 + note * 2;
            ins->amiga.noteMap[note].dpcmFreq = (signed char)data[off];
            ins->amiga.noteMap[note].dpcmDelta = (signed char)data[off + 1];
          }
        }
      }
      pos = featEnd;
    }
    // ── SU: Sound Unit ──
    else if (fc0 == 'S' && fc1 == 'U') {
      // Upstream readFeatureSU: switchRoles (1 byte) + hwSeqLen (1 byte) + hwSeq entries (5 bytes each)
      // Reference: instrument.cpp:3149-3161 (version >= 185 for hwSeq)
      if (featLen >= 1) {
        ins->su.switchRoles = data[pos] != 0;
      }
      if (featLen >= 2) {
        int suSeqLen = data[pos + 1];
        ins->su.hwSeqLen = suSeqLen;
        int entryBase = pos + 2;
        for (int i = 0; i < suSeqLen && i < 256 && entryBase + i * 5 + 4 < featEnd; i++) {
          unsigned char* entry = data + entryBase + i * 5;
          ins->su.hwSeq[i].cmd = entry[0];
          ins->su.hwSeq[i].bound = entry[1];
          ins->su.hwSeq[i].val = entry[2];
          ins->su.hwSeq[i].speed = *(unsigned short*)(entry + 3);
        }
      }
      pos = featEnd;
    }
    // ── Unknown feature: skip ──
    else {
      pos = featEnd;
    }
  }

  // Register instrument in global table
  engine_set_instrument(insIndex, ins);
  printf("[FurnaceDispatch] Loaded INS2 instrument %d: \"%s\" type=%d\n",
         insIndex, ins->name.c_str(), ins->type);
}

/**
 * Initialize (called once at startup).
 */
EMSCRIPTEN_KEEPALIVE
void furnace_init() {
  printf("[FurnaceDispatch] Initialized (1:1 Furnace support)\n");
}

} // extern "C"
