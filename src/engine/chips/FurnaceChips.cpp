#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <vector>

extern "C" {
// Include Furnace Extern Cores (C)
#include "ym3438.h"
#include "opm.h"
#include "opl3.h"
#include "ympsg.h"
#include "gb.h" 
#include "apu.h"
#include "timing.h"
#include "blip_buf.h" 
#include "sid3.h"     
#include "opll.h"     
#include "mzpokeysnd.h"
#include "qsound.h"
#include "c140_c219.h"
#include "vic20sound.h"
#include "ted-sound.h"
#include "supervision.h"
#include "vera_psg.h"
#include "vera_pcm.h"
#include "sm8521.h"
}

// C++ Headers
#include "ay8910.h"
#include "ymfm_opn.h"
#include "ymfm_opz.h"
#include "ymfm_opl.h"

// ESFMu (has its own extern "C" guards)
#include "esfm.h"

// NES NSFPlay (C++)
#include "nes_apu.h"
#include "nes_dmc.h"
#include "nes_fds.h"
#include "nes_mmc5.h"

// vgsound_emu (C++)
#include "msm6295/msm6295.hpp"
#include "es550x/es5506.hpp"
#include "scc/scc.hpp"
#include "n163/n163.hpp"
#include "vrcvi/vrcvi.hpp"
#include "k005289/k005289.hpp"
#include "k007232/k007232.hpp"
#include "k053260/k053260.hpp"
#include "x1_010/x1_010.hpp"

using namespace vgsound_emu;

// Other C++
#include "pce_psg.h"
#include "Audio.h" // TIA
#include "saa1099.h"
#include "swan_mdfn.h"
#include "SPC_DSP.h"
#include "Mikey.hpp"
#include "segapcm.h"
#include "ymz280b.h"
#include "rf5c68.h"
#include "iremga20.h"
#include "vsu.h"
#include "nds.hpp"
#include "upd1771.h"
#include "T6W28_Apu.h"

// OPL4 Header
#include "ymf278b/ymf278.h"

// Additional chips
#include "namco.h"
#include "oki/okim6258.h"
#include "oki/msm5232.h"
#include "dsid.h"  // Classic SID 6581/8580

// Types
typedef int32_t stream_sample_t;

// Logging Structures
struct RegisterWrite {
    uint32_t timestamp; // In samples
    uint8_t chipType;
    uint32_t port;
    uint8_t data;
};

static std::vector<RegisterWrite> reg_log;
static bool logging_enabled = false;
static uint32_t current_sample_time = 0;
static int g_sample_rate = 48000;  // Output sample rate for cycle calculations

// Interfaces
class msm6295_intf_impl : public vgsound_emu_mem_intf { public: msm6295_intf_impl() : vgsound_emu_mem_intf() {} };
class es550x_intf_impl : public es550x_intf { public: es550x_intf_impl() : es550x_intf() {} s16 read_sample(u8 bank, u32 addr) override { return 0; } };
class ga20_intf_impl : public iremga20_intf {};
class k007232_intf_impl : public k007232_intf { public: k007232_intf_impl() : k007232_intf() {} };
class k053260_intf_impl : public k053260_intf { public: k053260_intf_impl() : k053260_intf() {} };
class x1_010_intf_impl : public vgsound_emu_mem_intf { public: x1_010_intf_impl() : vgsound_emu_mem_intf() {} };

class YMF278MemoryImpl : public MemoryInterface {
public:
    uint8_t operator[](unsigned address) const override { return 0; }
    unsigned getSize() const override { return 0; }
    void write(unsigned address, uint8_t value) override { }
    void clear(uint8_t value) override { }
};

class FurnaceYmFmInterface : public ymfm::ymfm_interface {
public:
    void ymfm_sync_mode_write(uint8_t data) override { }
    void ymfm_sync_check_interrupts() override { }
    void ymfm_set_timer(uint32_t tnum, int32_t duration_in_clocks) override { }
    void ymfm_set_busy_end(uint32_t clocks) override { }
    bool ymfm_is_busy() override { return false; }
    uint8_t ymfm_external_read(ymfm::access_class type, uint32_t address) override { return 0; }
    void ymfm_external_write(ymfm::access_class type, uint32_t address, uint8_t data) override { }
};

static FurnaceYmFmInterface ymfm_intf;
static msm6295_intf_impl oki_intf;
static es550x_intf_impl es_intf;
static ga20_intf_impl ga20_intf;
static k007232_intf_impl k7232_intf;
static k053260_intf_impl k53260_intf;
static x1_010_intf_impl x1_010_intf;
static YMF278MemoryImpl ymf278_mem;

// Wrapper classes
class scc_impl : public scc_core { public: scc_impl() : scc_core("scc") {} u8 scc_r(bool is_sccplus, u8 address) override { return 0; } void scc_w(bool is_sccplus, u8 address, u8 data) override { if (address < 0xA0) wave_w(is_sccplus, address, data); else freq_vol_enable_w(address, data); } };
class vrcvi_impl : public vrcvi_core { struct vrcvi_intf_impl : public vrcvi_intf { void irq_w(bool irq) override {} } m_intf_impl; public: vrcvi_impl() : vrcvi_core(m_intf_impl) {} void write(u16 addr, u8 data) { switch (addr & 0xF000) { case 0x9000: if ((addr & 3) == 3) control_w(data); else pulse_w(0, addr & 3, data); break; case 0xA000: pulse_w(1, addr & 3, data); break; case 0xB000: saw_w(addr & 3, data); break; case 0xF000: timer_w(addr & 3, data); break; } } };
class x1_010_impl : public x1_010_core { public: x1_010_impl() : x1_010_core(x1_010_intf) {} };

// Instances
static ym3438_t opn2_chip;
static opm_t opm_chip;
static opl3_chip opl3_chip_inst;
static ympsg_t psg_chip;
static GB_gameboy_t gb_chip;
static opll_t opll_chip;
static xgm::NES_APU* nes_apu = NULL;
static xgm::NES_DMC* nes_dmc = NULL;
static xgm::NES_FDS* nes_fds = NULL;
static xgm::NES_MMC5* nes_mmc5 = NULL;
static PCE_PSG* pce_chip = NULL;
static scc_impl* scc_chip = NULL;
static n163_core* n163_chip = NULL;
static vrcvi_impl* vrc6_chip = NULL;
static SID3* sid_chip = NULL;
static ay8910_device* ay_chip = NULL;
static ymfm::ym2608* opna_chip = NULL;
static ymfm::ym2610* opnb_chip = NULL;
static ymfm::ym2203* opn_chip = NULL;    // YM2203 (3 FM + 3 PSG)
static ymfm::ym2610b* opnb_b_chip = NULL; // YM2610B (6 FM + 4 ADPCM)
static TIA::Audio* tia_chip = NULL;
static saa1099_device* saa_chip = NULL;
static msm6295_core* oki_chip = NULL;
static es5506_core* es_chip = NULL;
static WSwan* swan_chip = NULL;
static ymfm::ym2414* opz_chip = NULL;
static ymfm::y8950* y8950_chip = NULL;
static SPC_DSP* snes_chip = NULL;
static Lynx::Mikey* lynx_chip = NULL;
static segapcm_device* segapcm_chip = NULL;
static ymz280b_device* ymz_chip = NULL;
static rf5c68_device* rf5_chip = NULL;
static iremga20_device* ga20_chip = NULL;
static VSU* vb_chip = NULL;
static upd1771c_device* upd_chip = NULL;
static k007232_core* k7232_chip = NULL;
static k053260_core* k53260_chip = NULL;
static x1_010_impl* x1_010_chip = NULL;
static YMF278* opl4_chip = NULL;
static MDFN_IEN_NGP::T6W28_Apu* t6w28_chip = NULL;
static PokeyState pokey_chip;

// VIC-20 instance
static sound_vic20_t vic_chip;

// TED instance
static struct plus4_sound_s ted_chip;

// VERA PSG instance
static struct VERA_PSG vera_chip;

// Supervision instance
static struct svision_t svision_chip;

// SM8521 instance
static struct sm8521_t sm8521_chip;

// C140 instance
static struct c140_t c140_chip;

// QSound instance
static struct qsound_chip qsound_chip_inst;

// SNES RAM (64KB for SPC700)
static uint8_t snes_ram[65536];

// Additional chip instances
static struct SID_chip* sid_6581_chip = NULL;  // Classic SID 6581
static struct SID_chip* sid_8580_chip = NULL;  // Classic SID 8580
static namco_device* namco_chip = NULL;        // Namco WSG
static okim6258_device* msm6258_chip = NULL;   // OKI ADPCM
static msm5232_device* msm5232_chip = NULL;    // MSM5232 8-voice
static esfm_chip esfm_chip_inst;               // ESFM (ESS enhanced OPL3)

// Simple chip states for custom implementations
static struct {
    uint32_t freq;      // PC Speaker frequency
    bool enabled;
    float phase;
} pcspkr_state;

static struct {
    float phase[2];     // Pong has 2 oscillators
    uint16_t freq[2];
    uint8_t vol[2];
} pong_state;

static struct {
    uint8_t regs[8];    // PV-1000 has 3 tone channels
    float phase[3];
} pv1000_state;

static struct {
    uint8_t regs[4];    // Pokemon Mini has 3 sound channels
    float phase[3];
} pokemini_state;

// PET (Commodore PET 6522 shift register)
static struct {
    uint8_t regs[16];   // 6522 VIA registers
    uint8_t sreg;       // Shift register (wave pattern)
    uint8_t wave;       // Wave pattern to load
    int32_t cnt;        // Period counter
    int16_t out;        // Current output
    bool enable;        // Sound enabled
} pet_state;

// NDS Sound Interface
class nds_intf_impl : public nds_sound_emu::nds_sound_intf {
public:
    uint8_t* mem;
    uint32_t mem_size;
    nds_intf_impl() : mem(nullptr), mem_size(0) {}
    uint8_t read_byte(uint32_t addr) override {
        if (mem && addr < mem_size) return mem[addr];
        return 0;
    }
};
static nds_intf_impl nds_intf;
static nds_sound_emu::nds_sound_t* nds_chip = nullptr;
static uint8_t nds_sample_mem[4*1024*1024];  // 4MB for NDS samples

// GBA DMA (2-channel sample playback)
static struct {
    struct {
        int32_t pos;        // Position (16.16 fixed point)
        int32_t freq;       // Frequency (16.16 increment)
        uint8_t vol;        // Volume (0-15)
        uint8_t pan;        // Pan (bit 0=R, bit 1=L)
        bool active;
        int8_t* data;       // Sample pointer
        int32_t length;     // Length
        int32_t loopStart;
        int32_t loopEnd;
        bool loop;
    } chan[2];
} gba_dma_state;
static int8_t gba_sample_mem[2*1024*1024];  // 2MB for GBA samples

// MultiPCM (28-channel sample playback)
static struct {
    struct {
        uint32_t pos;       // Position (16.16 fixed point)
        uint16_t freq;      // F-number
        uint8_t octave;     // Octave
        uint8_t pan;        // Pan (4-bit L, 4-bit R)
        uint8_t tl;         // Total level
        uint16_t sample;    // Sample number
        bool keyOn;
    } slot[28];
    uint8_t selSlot;        // Selected slot
} multipcm_state;
static int8_t multipcm_sample_mem[4*1024*1024];  // 4MB for MultiPCM samples

// Amiga Paula state
struct PaulaChannel {
    uint32_t pos;       // Sample position (16.16 fixed point)
    uint32_t period;    // Period (divider)
    uint8_t volume;     // Volume (0-64)
    int8_t* data;       // Sample data pointer
    uint32_t length;    // Sample length in bytes
    uint32_t loopStart; // Loop start
    uint32_t loopLen;   // Loop length (0 = no loop)
    bool enabled;
};
static PaulaChannel paula_chan[4];
static int8_t paula_sample_mem[524288];  // 512KB sample memory

// Bubble System (K005289) Custom implementation
static k005289_core* bubble_timer = NULL;
static uint8_t bubble_waves[2][32];
static uint8_t bubble_vol[2];

// Blip Buffers
static blip_buffer_t* blip_scc = NULL;
static blip_buffer_t* blip_n163 = NULL;
static blip_buffer_t* blip_vrc6 = NULL;
static blip_buffer_t* blip_pce_l = NULL;
static blip_buffer_t* blip_pce_r = NULL;
static blip_buffer_t* blip_t6w28_l = NULL;
static blip_buffer_t* blip_t6w28_r = NULL;

enum ChipType {
    CHIP_OPN2=0, CHIP_OPM=1, CHIP_OPL3=2, CHIP_PSG=3, CHIP_NES=4, CHIP_GB=5, CHIP_PCE=6, CHIP_SCC=7, CHIP_N163=8, CHIP_VRC6=9, CHIP_SID=10,
    CHIP_OPLL=11, CHIP_AY=12, CHIP_OPNA=13, CHIP_OPNB=14, CHIP_TIA=15, CHIP_FDS=16, CHIP_MMC5=17, CHIP_SAA=18, CHIP_SWAN=19, CHIP_OKI=20, CHIP_ES5506=21,
    CHIP_OPZ=22, CHIP_Y8950=23, CHIP_SNES=24, CHIP_LYNX=25, CHIP_OPL4=26, CHIP_SEGAPCM=27, CHIP_YMZ280B=28, CHIP_RF5C68=29, CHIP_GA20=30, CHIP_C140=31,
    CHIP_QSOUND=32, CHIP_VIC=33, CHIP_TED=34, CHIP_SUPERVISION=35, CHIP_VERA=36, CHIP_SM8521=37, CHIP_BUBBLE=38, CHIP_K007232=39, CHIP_K053260=40,
    CHIP_X1_010=41, CHIP_UPD1771=42, CHIP_T6W28=43, CHIP_VB=44,
    // Additional chips (47+)
    CHIP_OPN=47, CHIP_OPNB_B=48,
    CHIP_SID_6581=45, CHIP_SID_8580=46,
    CHIP_ESFM=49, CHIP_AY8930=50,
    CHIP_NDS=51, CHIP_GBA_DMA=52, CHIP_GBA_MINMOD=53, CHIP_POKEMINI=54,
    CHIP_NAMCO=55, CHIP_PET=56, CHIP_POKEY=57,
    CHIP_MSM6258=58, CHIP_MSM5232=59, CHIP_MULTIPCM=60,
    CHIP_AMIGA=61, CHIP_PCSPKR=62, CHIP_PONG=63, CHIP_PV1000=64
};

extern "C" {

EMSCRIPTEN_KEEPALIVE
void furnace_init_chips(int sample_rate) {
    g_sample_rate = sample_rate > 0 ? sample_rate : 48000;  // Save for cycle calculations

    EM_ASM({ console.log('[FurnaceWASM] Init chips at sample rate:', $0); }, g_sample_rate);

    EM_ASM({ console.log('[FurnaceWASM] Init: OPN2, OPM, OPL3, PSG, GB...'); });
    OPN2_Reset(&opn2_chip);
    // Set YM2612 mode (Genesis/Mega Drive sound) - CRITICAL for proper output!
    // ym3438_mode_ym2612 = 0x01 enables the YM2612 DAC ladder effect (louder output)
    OPN2_SetChipType(&opn2_chip, 0x01);
    OPM_Reset(&opm_chip);
    OPL3_Reset(&opl3_chip_inst, g_sample_rate);
    // Stereo mask: 0x000F = all 4 channels to output
    // Previous values 0x0001/0x0008 only routed ch0→L and ch3→R, leaving ch1/ch2 silent!
    // PSG Init - Reference: Furnace sms.cpp line 539
    // Parameters: chip, real_sn, noise_tap1, noise_tap2, noise_size
    // Using non-real-SN (clone) settings for broader compatibility
    YMPSG_Init(&psg_chip, 0, 12, 15, 32767);
    GB_apu_init(&gb_chip);

    EM_ASM({ console.log('[FurnaceWASM] Init: NES APU/DMC/FDS/MMC5...'); });
    // NES APU Init - Reference: Furnace nes.cpp lines 917-927
    // NES NTSC CPU clock is COLOR_NTSC/2 = 1789772.7272... Hz
    const double NES_CLOCK = 1789772.7272;
    if (nes_apu) delete nes_apu;
    nes_apu = new xgm::NES_APU();
    nes_apu->SetOption(0, 0);
    nes_apu->SetClock(NES_CLOCK);
    nes_apu->SetRate(g_sample_rate);
    nes_apu->Reset();

    if (nes_dmc) delete nes_dmc;
    nes_dmc = new xgm::NES_DMC();
    nes_dmc->SetOption(0, 0);
    nes_dmc->SetClock(NES_CLOCK);
    nes_dmc->SetRate(g_sample_rate);
    nes_dmc->SetAPU(nes_apu);  // Link DMC to APU for frame sequencing
    nes_dmc->SetPal(false);     // NTSC mode
    nes_dmc->Reset();
    if (nes_fds) delete nes_fds; nes_fds = new xgm::NES_FDS();
    if (nes_mmc5) delete nes_mmc5; nes_mmc5 = new xgm::NES_MMC5();

    EM_ASM({ console.log('[FurnaceWASM] Init: PCE, SCC, N163, VRC6...'); });
    // PCE PSG needs two blip buffers (L/R) assigned to its internal bb[] array
    if (!blip_pce_l) blip_pce_l = blip_new(4096);
    if (!blip_pce_r) blip_pce_r = blip_new(4096);
    blip_set_rates(blip_pce_l, 3579545 * 2, g_sample_rate);
    blip_set_rates(blip_pce_r, 3579545 * 2, g_sample_rate);
    if (pce_chip) delete pce_chip;
    pce_chip = new PCE_PSG(0);
    pce_chip->bb[0] = blip_pce_l;
    pce_chip->bb[1] = blip_pce_r;
    if (scc_chip) delete scc_chip; scc_chip = new scc_impl(); if (!blip_scc) blip_scc = blip_new(4096); blip_set_rates(blip_scc, 3579545, g_sample_rate);
    if (n163_chip) delete n163_chip; n163_chip = new n163_core(); if (!blip_n163) blip_n163 = blip_new(4096); blip_set_rates(blip_n163, 1789773, g_sample_rate);
    if (vrc6_chip) delete vrc6_chip; vrc6_chip = new vrcvi_impl(); if (!blip_vrc6) blip_vrc6 = blip_new(4096); blip_set_rates(blip_vrc6, 1789773, g_sample_rate);

    EM_ASM({ console.log('[FurnaceWASM] Init: SID3, OPLL...'); });
    if (sid_chip) sid3_free(sid_chip); sid_chip = sid3_create(); sid3_set_clock_rate(sid_chip, 985248); sid3_reset(sid_chip);
    OPLL_Reset(&opll_chip, opll_type_ym2413);
    EM_ASM({ console.log('[FurnaceWASM] Init: AY, OPNA, OPNB, OPN, OPNB-B...'); });
    if (ay_chip) delete ay_chip; ay_chip = new ay8910_device(1789773); ay_chip->device_start(); ay_chip->device_reset();
    if (opna_chip) delete opna_chip; opna_chip = new ymfm::ym2608(ymfm_intf); opna_chip->reset();
    if (opnb_chip) delete opnb_chip; opnb_chip = new ymfm::ym2610(ymfm_intf); opnb_chip->reset();
    if (opn_chip) delete opn_chip; opn_chip = new ymfm::ym2203(ymfm_intf); opn_chip->reset();
    if (opnb_b_chip) delete opnb_b_chip; opnb_b_chip = new ymfm::ym2610b(ymfm_intf); opnb_b_chip->reset();

    EM_ASM({ console.log('[FurnaceWASM] Init: TIA, SAA, OKI, ES5506, SWAN...'); });
    if (tia_chip) delete tia_chip; tia_chip = new TIA::Audio(); tia_chip->reset(false);
    if (saa_chip) delete saa_chip; saa_chip = new saa1099_device(); saa_chip->device_start();
    if (oki_chip) delete oki_chip; oki_chip = new msm6295_core(oki_intf); oki_chip->reset();
    if (es_chip) delete es_chip; es_chip = new es5506_core(es_intf); es_chip->reset();
    if (swan_chip) delete swan_chip; swan_chip = new WSwan(); swan_chip->SoundReset();

    EM_ASM({ console.log('[FurnaceWASM] Init: OPZ, Y8950, SNES, Lynx...'); });
    if (opz_chip) delete opz_chip; opz_chip = new ymfm::ym2414(ymfm_intf); opz_chip->reset();
    if (y8950_chip) delete y8950_chip; y8950_chip = new ymfm::y8950(ymfm_intf); y8950_chip->reset();
    if (snes_chip) delete snes_chip; snes_chip = new SPC_DSP(); snes_chip->init(NULL); snes_chip->reset();
    if (lynx_chip) delete lynx_chip; lynx_chip = new Lynx::Mikey(4000000);

    EM_ASM({ console.log('[FurnaceWASM] Init: SegaPCM, YMZ, RF5C68, GA20...'); });
    if (segapcm_chip) delete segapcm_chip; segapcm_chip = new segapcm_device(); segapcm_chip->device_start();
    if (ymz_chip) delete ymz_chip; ymz_chip = new ymz280b_device(); ymz_chip->device_start(NULL);
    if (rf5_chip) delete rf5_chip; rf5_chip = new rf5c68_device(); rf5_chip->device_start(NULL);
    if (ga20_chip) delete ga20_chip; ga20_chip = new iremga20_device(ga20_intf);

    EM_ASM({ console.log('[FurnaceWASM] Init: VSU, UPD, K007232, K053260, X1_010...'); });
    if (vb_chip) delete vb_chip; vb_chip = new VSU();
    if (upd_chip) delete upd_chip; upd_chip = new upd1771c_device();
    if (k7232_chip) delete k7232_chip; k7232_chip = new k007232_core(k7232_intf); k7232_chip->reset();
    if (k53260_chip) delete k53260_chip; k53260_chip = new k053260_core(k53260_intf); k53260_chip->reset();
    if (x1_010_chip) delete x1_010_chip; x1_010_chip = new x1_010_impl(); x1_010_chip->reset();

    EM_ASM({ console.log('[FurnaceWASM] Init: OPL4, T6W28, POKEY...'); });
    if (opl4_chip) delete opl4_chip; opl4_chip = new YMF278(ymf278_mem); opl4_chip->reset();
    if (t6w28_chip) delete t6w28_chip; t6w28_chip = new MDFN_IEN_NGP::T6W28_Apu();
    MZPOKEYSND_Init(&pokey_chip); ResetPokeyState(&pokey_chip);

    // Paula Init
    for (int i = 0; i < 4; i++) {
        paula_chan[i].pos = 0;
        paula_chan[i].period = 428; // Default period (~8363 Hz at PAL rate)
        paula_chan[i].volume = 64;
        paula_chan[i].data = paula_sample_mem;
        paula_chan[i].length = 0;
        paula_chan[i].loopStart = 0;
        paula_chan[i].loopLen = 0;
        paula_chan[i].enabled = false;
    }

    // Additional chip init
    EM_ASM({ console.log('[FurnaceWASM] Init: SID 6581/8580...'); });
    if (!sid_6581_chip) sid_6581_chip = (struct SID_chip*)malloc(sizeof(struct SID_chip));
    dSID_init(sid_6581_chip, 985248, g_sample_rate, 0, 0); // model 0 = 6581
    if (!sid_8580_chip) sid_8580_chip = (struct SID_chip*)malloc(sizeof(struct SID_chip));
    dSID_init(sid_8580_chip, 985248, g_sample_rate, 1, 0); // model 1 = 8580

    EM_ASM({ console.log('[FurnaceWASM] Init: Namco...'); });
    if (namco_chip) delete namco_chip; namco_chip = new namco_device(3072000);
    namco_chip->set_voices(3);  // Must set voices before device_start to avoid divide by zero
    namco_chip->device_start(NULL);
    EM_ASM({ console.log('[FurnaceWASM] Init: MSM6258...'); });
    if (msm6258_chip) delete msm6258_chip; msm6258_chip = new okim6258_device(4000000); msm6258_chip->device_start(); msm6258_chip->device_reset();
    EM_ASM({ console.log('[FurnaceWASM] Init: MSM5232...'); });
    if (msm5232_chip) delete msm5232_chip; msm5232_chip = new msm5232_device(2000000); msm5232_chip->device_start(); msm5232_chip->device_reset();
    EM_ASM({ console.log('[FurnaceWASM] Init: Namco/MSM done.'); });

    // Simple chip state init
    EM_ASM({ console.log('[FurnaceWASM] Init: Simple chips (pcspkr, pong, pv1000, pokemini)...'); });
    pcspkr_state.freq = 440; pcspkr_state.enabled = false; pcspkr_state.phase = 0;
    memset(&pong_state, 0, sizeof(pong_state));
    memset(&pv1000_state, 0, sizeof(pv1000_state));
    memset(&pokemini_state, 0, sizeof(pokemini_state));

    // Bubble System Init
    EM_ASM({ console.log('[FurnaceWASM] Init: Bubble System (k005289)...'); });
    if (bubble_timer) delete bubble_timer; bubble_timer = new k005289_core(); bubble_timer->reset();
    memset(bubble_waves, 0, sizeof(bubble_waves));
    memset(bubble_vol, 0, sizeof(bubble_vol));

    // PET Init (6522 shift register)
    EM_ASM({ console.log('[FurnaceWASM] Init: PET (6522)...'); });
    memset(&pet_state, 0, sizeof(pet_state));
    pet_state.wave = 0xFF;  // Default square wave
    pet_state.sreg = 0xFF;

    // NDS Init
    EM_ASM({ console.log('[FurnaceWASM] Init: NDS sound emu...'); });
    nds_intf.mem = nds_sample_mem;
    nds_intf.mem_size = sizeof(nds_sample_mem);
    if (nds_chip) delete nds_chip;
    nds_chip = new nds_sound_emu::nds_sound_t(nds_intf);
    nds_chip->reset();

    // GBA DMA Init
    EM_ASM({ console.log('[FurnaceWASM] Init: GBA DMA...'); });
    memset(&gba_dma_state, 0, sizeof(gba_dma_state));
    for (int i = 0; i < 2; i++) {
        gba_dma_state.chan[i].data = gba_sample_mem;
        gba_dma_state.chan[i].vol = 15;
        gba_dma_state.chan[i].pan = 3;  // Center
    }

    // MultiPCM Init
    EM_ASM({ console.log('[FurnaceWASM] Init: MultiPCM...'); });
    memset(&multipcm_state, 0, sizeof(multipcm_state));

    // VIC-20 Init (1MHz clock, ~31400 cycles/sec)
    EM_ASM({ console.log('[FurnaceWASM] Init: VIC-20, TED, VERA, Supervision...'); });
    vic_sound_machine_init(&vic_chip, g_sample_rate, 1000000, false);

    // TED Init (1.79MHz for NTSC)
    ted_sound_machine_init(&ted_chip, g_sample_rate, 1789773);
    ted_sound_reset(&ted_chip);

    // VERA PSG Init
    psg_reset(&vera_chip);

    // Supervision Init
    supervision_sound_reset(&svision_chip);
    supervision_sound_set_clock(&svision_chip, 4000000);

    EM_ASM({ console.log('[FurnaceWASM] Init: SM8521, C140, QSound...'); });
    // SM8521 Init
    sm8521_reset(&sm8521_chip);

    // C140 Init
    c140_init(&c140_chip);
    c140_reset(&c140_chip);

    // QSound Init (4MHz clock)
    qsound_start(&qsound_chip_inst, 4000000);
    qsound_reset(&qsound_chip_inst);

    EM_ASM({ console.log('[FurnaceWASM] Init: SNES DSP, ESFM...'); });
    // SNES Init (SPC DSP with 64KB RAM)
    memset(snes_ram, 0, sizeof(snes_ram));
    if (snes_chip) { delete snes_chip; }
    snes_chip = new SPC_DSP();
    snes_chip->init(snes_ram);
    snes_chip->reset();

    // ESFM Init (ESS enhanced OPL3)
    ESFM_init(&esfm_chip_inst, 1);  // fast mode enabled
    // Note: ESFM will be set to OPL3 compat mode (0x105=0x01) by TypeScript mapOPL3

    // Logging Init
    reg_log.clear();
    logging_enabled = false;
    current_sample_time = 0;

    EM_ASM({ console.log('[FurnaceWASM] ✓ All chips initialized successfully!'); });
}

EMSCRIPTEN_KEEPALIVE
void furnace_set_logging(bool enabled) {
    logging_enabled = enabled;
    if (enabled) {
        reg_log.clear();
        current_sample_time = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
uint32_t furnace_get_log_size() {
    return reg_log.size();
}

EMSCRIPTEN_KEEPALIVE
void* furnace_get_log_data() {
    return reg_log.data();
}

EMSCRIPTEN_KEEPALIVE
void furnace_set_wavetable(int type, int index, uint8_t* data, int length) {
    if (type == CHIP_BUBBLE && index < 2) {
        memcpy(bubble_waves[index], data, length < 32 ? length : 32);
    }
}

EMSCRIPTEN_KEEPALIVE
int furnace_upload_sample(int chip_type, uint32_t offset, const uint8_t* data, uint32_t length) {
    // Stub: sample uploads not implemented in minimal version
    return -1;
}

EMSCRIPTEN_KEEPALIVE
void furnace_chip_write(int type, uint32_t port, uint8_t data) {
    if (logging_enabled) {
        reg_log.push_back({current_sample_time, (uint8_t)type, port, data});
    }

    switch (type) {
        case CHIP_OPN2: {
            // Nuked-OPN2 uses port-based writes: port 0/2 = address, port 1/3 = data
            // Bank 0 (channels 1-3): ports 0,1  Bank 1 (channels 4-6): ports 2,3
            int bank = (port >> 8) & 1;
            OPN2_Write(&opn2_chip, bank * 2, port & 0xFF);     // Address
            OPN2_Write(&opn2_chip, bank * 2 + 1, data);        // Data
            break;
        }
        case CHIP_OPM: {
            // Nuked-OPM uses shared write_data field for address and data.
            // Must clock between address and data (matching Furnace arcade.cpp pattern:
            // one write per group of 4 clocks, address in one group, data in next)
            OPM_Write(&opm_chip, 0, port & 0xFF);              // Address
            // Run one full group of 4 clocks to process address latch
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            OPM_Write(&opm_chip, 1, data);                     // Data
            // Run another group to process data latch
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
            break;
        }
        case CHIP_OPL3: OPL3_WriteReg(&opl3_chip_inst, (uint16_t)port, data); break;
        case CHIP_PSG:  YMPSG_Write(&psg_chip, data); break;
        case CHIP_NES:  if (nes_apu && nes_dmc) { if (port < 0x4010) nes_apu->Write(port, data); else nes_dmc->Write(port, data); } break;
        case CHIP_GB:   GB_apu_write(&gb_chip, port, data); break;
        case CHIP_PCE:  if (pce_chip) pce_chip->SetRegister(port, data); break;
        case CHIP_SCC:  if (scc_chip) scc_chip->scc_w(false, port, data); break; 
        case CHIP_N163: if (n163_chip) { if (port == 0xE000) n163_chip->addr_w(data); else if (port == 0xF800) n163_chip->data_w(data); } break;
        case CHIP_VRC6: if (vrc6_chip) vrc6_chip->write(port, data); break;
        case CHIP_SID:  if (sid_chip) sid3_write(sid_chip, port, data); break;
        case CHIP_OPLL: {
            // Nuked-OPLL uses shared write_data field (same issue as OPM).
            // Must clock between address and data writes.
            int32_t opll_dummy[2];
            OPLL_Write(&opll_chip, 0, port & 0xFF);            // Address
            OPLL_Clock(&opll_chip, opll_dummy);                 // DoIO latches write_a
            OPLL_Clock(&opll_chip, opll_dummy);                 // DoRegWrite latches address
            OPLL_Write(&opll_chip, 1, data);                   // Data (now safe)
            break;
        }
        case CHIP_AY:   if (ay_chip) { ay_chip->address_w(port); ay_chip->data_w(data); } break;
        case CHIP_OPNA: if (opna_chip) {
            // ymfm uses offset-based writes: 0/2 = address, 1/3 = data
            int bank = (port >> 8) & 1;
            opna_chip->write(bank * 2, port & 0xFF);
            opna_chip->write(bank * 2 + 1, data);
        } break;
        case CHIP_OPNB: if (opnb_chip) {
            // ymfm uses offset-based writes: 0/2 = address, 1/3 = data
            int bank = (port >> 8) & 1;
            opnb_chip->write(bank * 2, port & 0xFF);
            opnb_chip->write(bank * 2 + 1, data);
        } break;
        case CHIP_OPN: if (opn_chip) { opn_chip->write(0, port & 0xFF); opn_chip->write(1, data); } break;
        case CHIP_OPNB_B: if (opnb_b_chip) { int bank = (port >> 8) & 1; opnb_b_chip->write(0 + bank * 2, port & 0xFF); opnb_b_chip->write(1 + bank * 2, data); } break;
        case CHIP_TIA:  if (tia_chip) tia_chip->write(port, data); break;
        case CHIP_FDS:  if (nes_fds) nes_fds->Write(port, data); break;
        case CHIP_MMC5: if (nes_mmc5) nes_mmc5->Write(port, data); break;
        case CHIP_SAA:  if (saa_chip) saa_chip->write(port, data); break;
        case CHIP_SWAN: if (swan_chip) swan_chip->SoundWrite(port, data); break;
        case CHIP_OKI:  if (oki_chip) oki_chip->command_w(data); break;
        case CHIP_ES5506: if (es_chip) es_chip->write(port, data); break;
        case CHIP_OPZ: if (opz_chip) {
            // ymfm uses offset-based writes: 0 = address, 1 = data
            opz_chip->write(0, port & 0xFF);
            opz_chip->write(1, data);
        } break;
        case CHIP_Y8950: if (y8950_chip) {
            // ymfm uses offset-based writes: 0 = address, 1 = data
            y8950_chip->write(0, port & 0xFF);
            y8950_chip->write(1, data);
        } break;
        case CHIP_SEGAPCM: if (segapcm_chip) segapcm_chip->write(port, data); break;
        case CHIP_YMZ280B: if (ymz_chip) ymz_chip->write(port, data); break;
        case CHIP_RF5C68: if (rf5_chip) rf5_chip->rf5c68_w(port, data); break;
        case CHIP_GA20: if (ga20_chip) ga20_chip->write(port, data); break;
        case CHIP_UPD1771: if (upd_chip) upd_chip->write(data); break;
        case CHIP_K007232: if (k7232_chip) k7232_chip->write(port, data); break;
        case CHIP_K053260: if (k53260_chip) k53260_chip->write(port, data); break;
        case CHIP_X1_010: if (x1_010_chip) x1_010_chip->ram_w(port, data); break;
        // OPL4 FM synthesis is identical to OPL3 FM. The YMF278B contains an OPL3
        // core plus a separate wavetable (PCM) section. The YMF278 class only handles
        // the PCM section; FM registers go nowhere via writeReg(). Route FM writes
        // to the shared OPL3 chip so the FM part actually produces audio.
        case CHIP_OPL4: OPL3_WriteReg(&opl3_chip_inst, (uint16_t)port, data); break;
        case CHIP_T6W28: 
            if (port == 0) t6w28_chip->write_data_left(0, data);
            else t6w28_chip->write_data_right(0, data);
            break;
        case CHIP_BUBBLE:
            if (port < 2) {
                bubble_timer->load(port, (data << 8) | data);
                bubble_timer->update(port);
            } else if (port < 4) {
                bubble_vol[port-2] = data & 0x1F;
            }
            break;
        case CHIP_POKEY: Update_pokey_sound_mz(&pokey_chip, port, data, 4); break;
        case CHIP_AMIGA: {
            // Register layout per channel (0x10 bytes per channel):
            // 0x00: Volume (0-64)
            // 0x02-0x03: Period (big-endian 16-bit)
            // 0x04-0x07: Sample start offset (32-bit)
            // 0x08-0x0B: Sample length (32-bit)
            // 0x0C: Control (bit 0 = enable)
            int ch = (port >> 4) & 3;
            int reg = port & 0x0F;
            switch (reg) {
                case 0x00: paula_chan[ch].volume = data > 64 ? 64 : data; break;
                case 0x02: paula_chan[ch].period = (paula_chan[ch].period & 0x00FF) | (data << 8); break;
                case 0x03: paula_chan[ch].period = (paula_chan[ch].period & 0xFF00) | data; break;
                case 0x04: paula_chan[ch].data = paula_sample_mem + (data * 0x10000); break; // High byte of address
                case 0x08: paula_chan[ch].length = data * 0x10000; break; // Length high byte
                case 0x09: paula_chan[ch].length = (paula_chan[ch].length & 0xFF0000) | (data << 8); break;
                case 0x0C:
                    paula_chan[ch].enabled = (data & 1);
                    if (data & 1) paula_chan[ch].pos = 0;
                    break;
            }
            break;
        }
        // Additional chips
        case CHIP_SID_6581: if (sid_6581_chip) dSID_write(sid_6581_chip, port, data); break;
        case CHIP_SID_8580: if (sid_8580_chip) dSID_write(sid_8580_chip, port, data); break;
        case CHIP_NAMCO: if (namco_chip) namco_chip->pacman_sound_w(port, data); break;
        case CHIP_MSM6258: if (msm6258_chip) { if (port == 0) msm6258_chip->ctrl_w(data); else msm6258_chip->data_w(data); } break;
        case CHIP_MSM5232: if (msm5232_chip) msm5232_chip->write(port, data); break;
        case CHIP_ESFM: ESFM_write_reg(&esfm_chip_inst, (uint16_t)port, data); break;
        case CHIP_AY8930: if (ay_chip) { ay_chip->address_w(port); ay_chip->data_w(data); } break; // Enhanced AY uses same interface
        case CHIP_PCSPKR:
            if (port == 0) pcspkr_state.freq = data | ((pcspkr_state.freq & 0xFF00));
            else if (port == 1) pcspkr_state.freq = (data << 8) | (pcspkr_state.freq & 0xFF);
            else if (port == 2) pcspkr_state.enabled = data & 1;
            break;
        case CHIP_PONG:
            if (port < 2) pong_state.freq[port] = data | ((pong_state.freq[port] & 0xFF00));
            else if (port < 4) pong_state.freq[port-2] = (data << 8) | (pong_state.freq[port-2] & 0xFF);
            else if (port < 6) pong_state.vol[port-4] = data;
            break;
        case CHIP_PV1000:
            if (port < 8) pv1000_state.regs[port] = data;
            break;
        case CHIP_POKEMINI:
            if (port < 4) pokemini_state.regs[port] = data;
            break;
        case CHIP_PET: {
            // PET 6522 VIA registers:
            // 0x08: T2L (timer low byte)
            // 0x09: T2H (timer high byte) - 0 means hw shift register mode
            // 0x0A: SR (shift register - wave pattern)
            // 0x0B: ACR (aux control - bit 4 enables output)
            if (port < 16) pet_state.regs[port] = data;
            if (port == 0x0A) {
                pet_state.wave = data;
                pet_state.sreg = data;
            }
            if (port == 0x0B) {
                pet_state.enable = (data & 0x10) != 0;
            }
            break;
        }
        case CHIP_NDS:
            if (nds_chip) {
                // NDS register writes: port is address, data is value
                // Addresses 0x400-0x50F are sound registers
                nds_chip->write8(port, data);
            }
            break;
        case CHIP_GBA_DMA: {
            // Register layout per channel (0x10 bytes each):
            // 0x00: Volume (0-15)
            // 0x01: Pan (bit 0=R, bit 1=L)
            // 0x02-0x05: Sample offset (32-bit)
            // 0x06-0x09: Sample length (32-bit)
            // 0x0A-0x0D: Frequency (32-bit fixed point)
            // 0x0E: Control (bit 0=enable, bit 1=loop)
            int ch = (port >> 4) & 1;
            int reg = port & 0x0F;
            switch (reg) {
                case 0x00: gba_dma_state.chan[ch].vol = data & 0x0F; break;
                case 0x01: gba_dma_state.chan[ch].pan = data & 3; break;
                case 0x02: gba_dma_state.chan[ch].data = gba_sample_mem + (data << 16); break;
                case 0x06: gba_dma_state.chan[ch].length = data << 16; break;
                case 0x07: gba_dma_state.chan[ch].length = (gba_dma_state.chan[ch].length & 0xFF0000) | (data << 8); break;
                case 0x0A: gba_dma_state.chan[ch].freq = data << 16; break;
                case 0x0B: gba_dma_state.chan[ch].freq = (gba_dma_state.chan[ch].freq & 0xFF0000) | (data << 8); break;
                case 0x0E:
                    gba_dma_state.chan[ch].active = data & 1;
                    gba_dma_state.chan[ch].loop = data & 2;
                    if (data & 1) gba_dma_state.chan[ch].pos = 0;
                    break;
            }
            break;
        }
        case CHIP_GBA_MINMOD: /* GBA MinMod - uses same as GBA_DMA */ break;
        case CHIP_SNES:
            if (snes_chip) snes_chip->write(port, data);
            break;
        case CHIP_VIC:
            vic_sound_machine_store(&vic_chip, port, data);
            break;
        case CHIP_TED:
            ted_sound_machine_store(&ted_chip, port, data);
            break;
        case CHIP_VERA:
            psg_writereg(&vera_chip, port, data);
            break;
        case CHIP_SUPERVISION:
            supervision_memorymap_registers_write(&svision_chip, port, data);
            break;
        case CHIP_SM8521:
            sm8521_write(&sm8521_chip, port, data);
            break;
        case CHIP_C140:
            c140_write(&c140_chip, port, data);
            break;
        case CHIP_QSOUND:
            qsound_w(&qsound_chip_inst, port, data);
            break;
        case CHIP_MULTIPCM: {
            // MultiPCM register layout:
            // Write slot select to port 1, then write data to port 0-7
            // Registers per slot: Pan, SampleL, SampleH+FreqL, FreqH+Oct, KeyOn, TL, LFO, AM
            if (port == 0x100) {
                multipcm_state.selSlot = data & 0x1F;
            } else if (multipcm_state.selSlot < 28) {
                int slot = multipcm_state.selSlot;
                switch (port & 7) {
                    case 0: multipcm_state.slot[slot].pan = data; break;
                    case 1: multipcm_state.slot[slot].sample = (multipcm_state.slot[slot].sample & 0x100) | data; break;
                    case 2:
                        multipcm_state.slot[slot].sample = (multipcm_state.slot[slot].sample & 0xFF) | ((data & 1) << 8);
                        multipcm_state.slot[slot].freq = (multipcm_state.slot[slot].freq & 0xFF00) | ((data >> 1) << 1);
                        break;
                    case 3:
                        multipcm_state.slot[slot].freq = (multipcm_state.slot[slot].freq & 0x00FE) | (data << 8);
                        multipcm_state.slot[slot].octave = (data >> 4) & 0x0F;
                        break;
                    case 4:
                        multipcm_state.slot[slot].keyOn = (data & 0x80) != 0;
                        if (data & 0x80) multipcm_state.slot[slot].pos = 0;
                        break;
                    case 5: multipcm_state.slot[slot].tl = data; break;
                }
            }
            break;
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void furnace_chip_render(int type, float* buffer_l, float* buffer_r, int length) {
    ymfm::ym2608::output_data output_2608;
    ymfm::ym2610::output_data output_2610;
    ymfm::ym2203::output_data output_2203;
    ymfm::ym2610b::output_data output_2610b;
    ymfm::ym2414::output_data output_2414;
    ymfm::y8950::output_data output_8950;
    
    for (int i = 0; i < length; i++) {
        int16_t out16[2] = {0, 0};
        int32_t out32[2] = {0, 0};
        uint8_t d1, d2, d3;
        int32_t opll_buf[2];
        
        switch (type) {
            case CHIP_OPN2: {
                // OPN2 clocking: Each OPN2_Clock advances 1 slot (24 slots per sample)
                // Native sample rate: 7.67MHz / 144 = ~53.3kHz
                // Output sample rate: g_sample_rate (typically 48kHz)
                //
                // For proper timing, we accumulate over ~24 clocks (1 native sample)
                // and output at our target rate. For 48kHz output from 53kHz native,
                // we generate slightly more than 1 native sample per output sample.
                //
                // Simple approach: clock 24 times per output sample (1:1 with native)
                // This gives ~53kHz effective rate, close enough to 48kHz
                int32_t sum_l = 0, sum_r = 0;
                const int clocks_per_sample = 24;  // 24 clocks = 1 native sample
                for (int c = 0; c < clocks_per_sample; c++) {
                    OPN2_Clock(&opn2_chip, out16);
                    sum_l += out16[0];
                    sum_r += out16[1];
                }
                // Furnace genesis.cpp uses: 6 clocks, <<5 (×32) gain
                // We clock 24 (4× more), so effective gain = ×32/4 = ×8
                // Aggressive gain for single-channel audibility
                int32_t ol = sum_l;
                int32_t or_ = sum_r;
                ol = (ol > 512) ? 512 : (ol < -512) ? -512 : ol;
                or_ = (or_ > 512) ? 512 : (or_ < -512) ? -512 : or_;
                buffer_l[i] = (float)ol / 512.0f;
                buffer_r[i] = (float)or_ / 512.0f;
                break;
            }
            case CHIP_OPM: {
                // OPM: 8 groups of 4 clocks per output sample (matching Furnace arcade.cpp)
                for (int g = 0; g < 8; g++) {
                    OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
                    OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
                    OPM_Clock(&opm_chip, NULL, NULL, NULL, NULL);
                    OPM_Clock(&opm_chip, out32, &d1, &d2, &d3);
                }
                int32_t ol = out32[0];
                int32_t or_ = out32[1];
                if (ol < -32768) ol = -32768;
                if (ol > 32767) ol = 32767;
                if (or_ < -32768) or_ = -32768;
                if (or_ > 32767) or_ = 32767;
                buffer_l[i] = (float)ol / 32768.0f;
                buffer_r[i] = (float)or_ / 32768.0f;
                break;
            }
            case CHIP_OPL3: {
                // OPL3 GenerateResampled outputs 4 int16s: [L1, R1, L2, R2]
                // (two stereo pairs for 4-operator mode)
                int16_t opl3_buf[4] = {0, 0, 0, 0};
                OPL3_GenerateResampled(&opl3_chip_inst, opl3_buf);
                // Sum both pairs and apply gain (Furnace uses ×2-4 per channel)
                int32_t opl3_l = ((int32_t)opl3_buf[0] + opl3_buf[2]) * 64;
                int32_t opl3_r = ((int32_t)opl3_buf[1] + opl3_buf[3]) * 64;
                if (opl3_l > 32767) opl3_l = 32767;
                if (opl3_l < -32768) opl3_l = -32768;
                if (opl3_r > 32767) opl3_r = 32767;
                if (opl3_r < -32768) opl3_r = -32768;
                buffer_l[i] = (float)opl3_l / 32768.0f;
                buffer_r[i] = (float)opl3_r / 32768.0f;
                break;
            }
            case CHIP_PSG:  YMPSG_Clock(&psg_chip); YMPSG_GetOutput(&psg_chip, &out32[0], &out32[1]); buffer_l[i] = (float)out32[0] / 32768.0f; buffer_r[i] = (float)out32[1] / 32768.0f; break;
            case CHIP_NES:  if (nes_apu) { nes_apu->Tick(1); nes_dmc->Tick(1); nes_apu->Render(out32); buffer_l[i] = (float)out32[0] / 32768.0f; buffer_r[i] = (float)out32[0] / 32768.0f; } break;
            case CHIP_GB: { int gb_cycles = g_sample_rate > 0 ? (4194304 / g_sample_rate) : 87; GB_advance_cycles(&gb_chip, gb_cycles); buffer_l[i] = (float)gb_chip.apu_output.final_sample.left / 32768.0f; buffer_r[i] = (float)gb_chip.apu_output.final_sample.right / 32768.0f; break; }
            case CHIP_PCE: {
                // PCE PSG - batch processing for blip_buf
                // On first sample of each render call, process entire batch
                static int16_t pce_buf_l[256];
                static int16_t pce_buf_r[256];
                static size_t pce_buf_idx = 0;
                static size_t pce_buf_avail = 0;

                if (pce_chip && pce_chip->bb[0] && pce_chip->bb[1]) {
                    // First sample triggers batch processing
                    if (i == 0) {
                        int sr = g_sample_rate > 0 ? g_sample_rate : 48000;
                        int32_t cycles = (int32_t)((7159090ULL * length) / sr);
                        pce_chip->Update(cycles);
                        blip_end_frame(pce_chip->bb[0], cycles);
                        blip_end_frame(pce_chip->bb[1], cycles);
                        pce_buf_avail = blip_samples_avail(pce_chip->bb[0]);
                        if (pce_buf_avail > 256) pce_buf_avail = 256;
                        if (pce_buf_avail > 0) {
                            blip_read_samples(pce_chip->bb[0], pce_buf_l, (int)pce_buf_avail, 0);
                            blip_read_samples(pce_chip->bb[1], pce_buf_r, (int)pce_buf_avail, 0);
                        }
                        pce_buf_idx = 0;
                    }

                    if (pce_buf_idx < pce_buf_avail) {
                        buffer_l[i] = (float)pce_buf_l[pce_buf_idx] / 32768.0f;
                        buffer_r[i] = (float)pce_buf_r[pce_buf_idx] / 32768.0f;
                        pce_buf_idx++;
                    } else {
                        buffer_l[i] = 0;
                        buffer_r[i] = 0;
                    }
                }
                break;
            }
            case CHIP_SID:  if (sid_chip) { sid3_clock(sid_chip); buffer_l[i] = (float)sid_chip->output_l / 32768.0f; buffer_r[i] = (float)sid_chip->output_r / 32768.0f; } break;
            case CHIP_OPLL: {
                // OPLL: 9 clocks per output sample (matching Furnace opll.cpp)
                // Each clock produces one channel's output, sum all 9
                int32_t os = 0;
                for (int c = 0; c < 9; c++) {
                    OPLL_Clock(&opll_chip, opll_buf);
                    os += (opll_buf[0] + opll_buf[1]);
                }
                // OPLL raw output is low — apply gain (reduced since write timing fix improved output)
                os *= 30;
                if (os < -32768) os = -32768;
                if (os > 32767) os = 32767;
                buffer_l[i] = (float)os / 32768.0f;
                buffer_r[i] = (float)os / 32768.0f;
                break;
            }
            case CHIP_TIA:  if (tia_chip) { tia_chip->tick(1); buffer_l[i] = (float)tia_chip->myCurrentSample[0] / 32768.0f; buffer_r[i] = (float)tia_chip->myCurrentSample[1] / 32768.0f; } break;
            case CHIP_OPNA: if (opna_chip) { opna_chip->generate(&output_2608); buffer_l[i] = (float)(output_2608.data[0] * 8) / 32768.0f; buffer_r[i] = (float)(output_2608.data[1] * 8) / 32768.0f; } break;
            case CHIP_OPNB: if (opnb_chip) { opnb_chip->generate(&output_2610); buffer_l[i] = (float)(output_2610.data[0] * 8) / 32768.0f; buffer_r[i] = (float)(output_2610.data[1] * 8) / 32768.0f; } break;
            case CHIP_OPN: if (opn_chip) { opn_chip->generate(&output_2203); buffer_l[i] = (float)(output_2203.data[0] * 16) / 32768.0f; buffer_r[i] = (float)(output_2203.data[0] * 16) / 32768.0f; } break;
            case CHIP_OPNB_B: if (opnb_b_chip) { opnb_b_chip->generate(&output_2610b); buffer_l[i] = (float)(output_2610b.data[0] * 8) / 32768.0f; buffer_r[i] = (float)(output_2610b.data[1] * 8) / 32768.0f; } break;
            case CHIP_AY:   if (ay_chip) { short ay_o[3]; ay_chip->sound_stream_update(ay_o, 1); float m = (ay_o[0]+ay_o[1]+ay_o[2])/(3.0f*32768.0f); buffer_l[i] = m; buffer_r[i] = m; } break;
            case CHIP_SWAN: if (swan_chip) { int16_t s_o[2]; swan_chip->SoundUpdate(); swan_chip->SoundFlush(s_o, 1); buffer_l[i] = (float)s_o[0]/32768.0f; buffer_r[i] = (float)s_o[1]/32768.0f; } break;
            case CHIP_OPZ: if (opz_chip) { opz_chip->generate(&output_2414); buffer_l[i] = (float)(output_2414.data[0] * 8) / 32768.0f; buffer_r[i] = (float)(output_2414.data[1] * 8) / 32768.0f; } break;
            case CHIP_Y8950: if (y8950_chip) { y8950_chip->generate(&output_8950); buffer_l[i] = (float)(output_8950.data[0] * 8) / 32768.0f; buffer_r[i] = buffer_l[i]; } break;
            case CHIP_K007232: if (k7232_chip) { k7232_chip->tick(1); buffer_l[i] = (float)k7232_chip->output(0)/32768.0f; buffer_r[i] = (float)k7232_chip->output(1)/32768.0f; } break;
            case CHIP_K053260: if (k53260_chip) { k53260_chip->tick(1); buffer_l[i] = (float)k53260_chip->output(0)/32768.0f; buffer_r[i] = (float)k53260_chip->output(1)/32768.0f; } break;
            case CHIP_X1_010: if (x1_010_chip) { x1_010_chip->tick(); buffer_l[i] = (float)x1_010_chip->output(0)/32768.0f; buffer_r[i] = (float)x1_010_chip->output(1)/32768.0f; } break;
            // OPL4 FM is routed to the shared OPL3 chip (see write handler above).
            // Render from OPL3 so the FM output is actually heard.
            case CHIP_OPL4: {
                int16_t opl4_buf[4] = {0, 0, 0, 0};
                OPL3_GenerateResampled(&opl3_chip_inst, opl4_buf);
                int32_t opl4_l = ((int32_t)opl4_buf[0] + opl4_buf[2]) * 64;
                int32_t opl4_r = ((int32_t)opl4_buf[1] + opl4_buf[3]) * 64;
                if (opl4_l > 32767) opl4_l = 32767; if (opl4_l < -32768) opl4_l = -32768;
                if (opl4_r > 32767) opl4_r = 32767; if (opl4_r < -32768) opl4_r = -32768;
                buffer_l[i] = (float)opl4_l / 32768.0f;
                buffer_r[i] = (float)opl4_r / 32768.0f;
                break;
            }
            case CHIP_BUBBLE:
                if (bubble_timer) {
                    bubble_timer->tick(1);
                    float mix = 0;
                    for (int ch=0; ch<2; ch++) {
                        uint8_t addr = bubble_timer->addr(ch);
                        int8_t sample = (int8_t)bubble_waves[ch][addr & 31] - 128;
                        mix += ((float)sample / 128.0f) * ((float)bubble_vol[ch] / 31.0f);
                    }
                    buffer_l[i] = mix * 0.5f;
                    buffer_r[i] = mix * 0.5f;
                }
                break;
            case CHIP_POKEY: {
                int16_t pokey_buf;
                mzpokeysnd_process_16(&pokey_chip, &pokey_buf, 1);
                buffer_l[i] = (float)pokey_buf / 32768.0f;
                buffer_r[i] = (float)pokey_buf / 32768.0f;
                break;
            }
            case CHIP_AMIGA: {
                // Paula outputs to L/R with channels 0,3 left and 1,2 right
                float left = 0, right = 0;
                for (int ch = 0; ch < 4; ch++) {
                    if (!paula_chan[ch].enabled || paula_chan[ch].length == 0) continue;
                    // Get sample (8-bit signed)
                    uint32_t idx = paula_chan[ch].pos >> 16;
                    if (idx >= paula_chan[ch].length) {
                        if (paula_chan[ch].loopLen > 0) {
                            paula_chan[ch].pos = paula_chan[ch].loopStart << 16;
                            idx = paula_chan[ch].loopStart;
                        } else {
                            paula_chan[ch].enabled = false;
                            continue;
                        }
                    }
                    int8_t sample = paula_chan[ch].data[idx];
                    float out = (sample / 128.0f) * (paula_chan[ch].volume / 64.0f);
                    // Channels 0,3 to left, 1,2 to right
                    if (ch == 0 || ch == 3) left += out;
                    else right += out;
                    // Advance position (3546895 Hz PAL clock / period / sample rate)
                    int sr = g_sample_rate > 0 ? g_sample_rate : 48000;
                    paula_chan[ch].pos += (3546895 / sr) * 65536 / (paula_chan[ch].period > 0 ? paula_chan[ch].period : 1);
                }
                buffer_l[i] = left * 0.5f;
                buffer_r[i] = right * 0.5f;
                break;
            }
            // Additional chip renders
            case CHIP_SID_6581: if (sid_6581_chip) {
                double out = dSID_render(sid_6581_chip);
                buffer_l[i] = (float)(out / 32768.0);
                buffer_r[i] = (float)(out / 32768.0);
            } break;
            case CHIP_SID_8580: if (sid_8580_chip) {
                double out = dSID_render(sid_8580_chip);
                buffer_l[i] = (float)(out / 32768.0);
                buffer_r[i] = (float)(out / 32768.0);
            } break;
            case CHIP_NAMCO: if (namco_chip) {
                short out[2];
                short* outPtrs[2] = {&out[0], &out[1]};
                namco_chip->sound_stream_update(outPtrs, 1);
                buffer_l[i] = (float)out[0] / 32768.0f;
                buffer_r[i] = (float)out[1] / 32768.0f;
            } break;
            case CHIP_MSM6258: if (msm6258_chip) {
                short out;
                msm6258_chip->sound_stream_update(&out, 1);
                buffer_l[i] = (float)out / 32768.0f;
                buffer_r[i] = (float)out / 32768.0f;
            } break;
            case CHIP_MSM5232: if (msm5232_chip) {
                short out;
                msm5232_chip->sound_stream_update(&out);
                buffer_l[i] = (float)out / 32768.0f;
                buffer_r[i] = (float)out / 32768.0f;
            } break;
            case CHIP_ESFM: {
                // ESFM uses its own ESFMu emulator — apply ×8 gain
                int16_t esfm_buf[2];
                ESFM_generate(&esfm_chip_inst, esfm_buf);
                buffer_l[i] = (float)(esfm_buf[0] * 8) / 32768.0f;
                buffer_r[i] = (float)(esfm_buf[1] * 8) / 32768.0f;
                break;
            }
            case CHIP_AY8930: // Enhanced AY uses same render as AY
                if (ay_chip) {
                    short ay_o[3];
                    ay_chip->sound_stream_update(ay_o, 1);
                    float m = (ay_o[0]+ay_o[1]+ay_o[2])/(3.0f*32768.0f);
                    buffer_l[i] = m;
                    buffer_r[i] = m;
                }
                break;
            case CHIP_PCSPKR: {
                // Simple square wave PC speaker
                if (pcspkr_state.enabled && pcspkr_state.freq > 0) {
                    pcspkr_state.phase += (float)pcspkr_state.freq / 48000.0f;
                    if (pcspkr_state.phase >= 1.0f) pcspkr_state.phase -= 1.0f;
                    buffer_l[i] = buffer_r[i] = (pcspkr_state.phase < 0.5f) ? 0.3f : -0.3f;
                } else {
                    buffer_l[i] = buffer_r[i] = 0;
                }
                break;
            }
            case CHIP_PONG: {
                // Simple 2-oscillator pong sound
                float out = 0;
                for (int ch = 0; ch < 2; ch++) {
                    if (pong_state.freq[ch] > 0) {
                        pong_state.phase[ch] += (float)pong_state.freq[ch] / 48000.0f;
                        if (pong_state.phase[ch] >= 1.0f) pong_state.phase[ch] -= 1.0f;
                        out += ((pong_state.phase[ch] < 0.5f) ? 0.2f : -0.2f) * (pong_state.vol[ch] / 15.0f);
                    }
                }
                buffer_l[i] = buffer_r[i] = out;
                break;
            }
            case CHIP_PV1000: {
                // Simple 3-channel square wave
                float out = 0;
                for (int ch = 0; ch < 3; ch++) {
                    uint16_t freq = pv1000_state.regs[ch * 2] | (pv1000_state.regs[ch * 2 + 1] << 8);
                    if (freq > 0) {
                        pv1000_state.phase[ch] += (float)freq / 48000.0f;
                        if (pv1000_state.phase[ch] >= 1.0f) pv1000_state.phase[ch] -= 1.0f;
                        out += (pv1000_state.phase[ch] < 0.5f) ? 0.15f : -0.15f;
                    }
                }
                buffer_l[i] = buffer_r[i] = out;
                break;
            }
            case CHIP_POKEMINI: {
                // Simple square wave for Pokemon Mini
                uint16_t freq = pokemini_state.regs[0] | (pokemini_state.regs[1] << 8);
                if (freq > 0) {
                    pokemini_state.phase[0] += (float)freq / 48000.0f;
                    if (pokemini_state.phase[0] >= 1.0f) pokemini_state.phase[0] -= 1.0f;
                    buffer_l[i] = buffer_r[i] = (pokemini_state.phase[0] < 0.5f) ? 0.2f : -0.2f;
                } else {
                    buffer_l[i] = buffer_r[i] = 0;
                }
                break;
            }
            case CHIP_PET: {
                // PET 6522 shift register emulation
                // Based on Furnace pet.cpp acquire()
                if (pet_state.enable) {
                    int reload = pet_state.regs[0x08] * 2 + 4;
                    if (pet_state.regs[0x09] != 0) {
                        reload += pet_state.regs[0x09] * 512;
                    }
                    // Shift register cycling
                    if (4 > pet_state.cnt) {
                        pet_state.out = (pet_state.sreg & 1) ? 16000 : -16000;
                        pet_state.sreg = (pet_state.sreg >> 1) | ((pet_state.sreg & 1) << 7);
                        pet_state.cnt += reload - 4;
                    } else {
                        pet_state.cnt -= 4;
                    }
                    buffer_l[i] = buffer_r[i] = pet_state.out / 32768.0f;
                } else {
                    buffer_l[i] = buffer_r[i] = 0;
                }
                break;
            }
            case CHIP_NDS:
                if (nds_chip) {
                    // Tick NDS sound and get output
                    nds_chip->tick(1);
                    // Get stereo output (16 channels summed)
                    int32_t left = 0, right = 0;
                    for (int ch = 0; ch < 16; ch++) {
                        left += nds_chip->chan_lout(ch);
                        right += nds_chip->chan_rout(ch);
                    }
                    buffer_l[i] = (float)(left >> 8) / 32768.0f;
                    buffer_r[i] = (float)(right >> 8) / 32768.0f;
                } else {
                    buffer_l[i] = buffer_r[i] = 0;
                }
                break;
            case CHIP_GBA_DMA: {
                // GBA DMA 2-channel sample playback
                float left = 0, right = 0;
                for (int ch = 0; ch < 2; ch++) {
                    if (!gba_dma_state.chan[ch].active || gba_dma_state.chan[ch].length == 0) continue;
                    // Get sample (8-bit signed)
                    int32_t idx = gba_dma_state.chan[ch].pos >> 16;
                    if (idx >= gba_dma_state.chan[ch].length) {
                        if (gba_dma_state.chan[ch].loop) {
                            gba_dma_state.chan[ch].pos = 0;
                            idx = 0;
                        } else {
                            gba_dma_state.chan[ch].active = false;
                            continue;
                        }
                    }
                    int8_t sample = gba_dma_state.chan[ch].data[idx];
                    float out = (sample / 128.0f) * (gba_dma_state.chan[ch].vol / 15.0f);
                    if (gba_dma_state.chan[ch].pan & 2) left += out;
                    if (gba_dma_state.chan[ch].pan & 1) right += out;
                    // Advance position
                    gba_dma_state.chan[ch].pos += gba_dma_state.chan[ch].freq >> 8;
                }
                buffer_l[i] = left * 0.5f;
                buffer_r[i] = right * 0.5f;
                break;
            }
            case CHIP_GBA_MINMOD:
                // GBA MinMod uses same output as GBA_DMA for now
                buffer_l[i] = buffer_r[i] = 0;
                break;
            case CHIP_MULTIPCM: {
                // MultiPCM 28-channel sample playback
                float left = 0, right = 0;
                for (int slot = 0; slot < 28; slot++) {
                    if (!multipcm_state.slot[slot].keyOn) continue;
                    // Simple sample playback
                    uint32_t idx = multipcm_state.slot[slot].pos >> 16;
                    // Get sample from ROM (8-bit signed)
                    int8_t sample = multipcm_sample_mem[
                        (multipcm_state.slot[slot].sample * 0x10000 + idx) & 0x3FFFFF];
                    // Apply total level attenuation
                    float vol = 1.0f - (multipcm_state.slot[slot].tl / 127.0f);
                    float out = (sample / 128.0f) * vol;
                    // Apply pan (4-bit L, 4-bit R in pan byte)
                    float panL = (multipcm_state.slot[slot].pan >> 4) / 15.0f;
                    float panR = (multipcm_state.slot[slot].pan & 0x0F) / 15.0f;
                    left += out * panL;
                    right += out * panR;
                    // Advance position based on frequency and octave
                    int32_t inc = multipcm_state.slot[slot].freq;
                    int oct = (int8_t)(multipcm_state.slot[slot].octave << 4) >> 4; // Sign extend
                    if (oct >= 0) inc <<= oct;
                    else inc >>= -oct;
                    multipcm_state.slot[slot].pos += inc >> 2;
                }
                buffer_l[i] = left / 14.0f;  // Normalize for 28 channels
                buffer_r[i] = right / 14.0f;
                break;
            }
            case CHIP_VIC: {
                // VIC-20 - use calculate_samples API
                int16_t buf[2];
                vic_sound_machine_calculate_samples(&vic_chip, buf, 1, 1, 0, 256);
                buffer_l[i] = buffer_r[i] = buf[0] / 32768.0f;
                break;
            }
            case CHIP_TED: {
                // TED (Plus/4) - use calculate_samples API
                int16_t buf[2];
                ted_sound_machine_calculate_samples(&ted_chip, buf, 1, 1);
                buffer_l[i] = buffer_r[i] = buf[0] / 32768.0f;
                break;
            }
            case CHIP_VERA: {
                // VERA PSG - render stereo
                int16_t bufL, bufR;
                psg_render(&vera_chip, &bufL, &bufR, 1);
                buffer_l[i] = bufL / 32768.0f;
                buffer_r[i] = bufR / 32768.0f;
                break;
            }
            case CHIP_SUPERVISION: {
                // Supervision - stream update (uint8 interleaved stereo)
                uint8_t stream[4];  // 2 bytes stereo at 8-bit
                supervision_sound_stream_update(&svision_chip, stream, 2);
                // Convert from unsigned 8-bit to float
                buffer_l[i] = (stream[0] - 128) / 128.0f;
                buffer_r[i] = (stream[1] - 128) / 128.0f;
                break;
            }
            case CHIP_SM8521: {
                // SM8521 - tick and read output
                sm8521_sound_tick(&sm8521_chip, 1);
                buffer_l[i] = buffer_r[i] = sm8521_chip.out / 32768.0f;
                break;
            }
            case CHIP_C140: {
                // C140 - tick and read outputs
                c140_tick(&c140_chip, 1);
                buffer_l[i] = c140_chip.lout / 32768.0f;
                buffer_r[i] = c140_chip.rout / 32768.0f;
                break;
            }
            case CHIP_QSOUND: {
                // QSound - stream update
                int16_t* outputs[2];
                int16_t left, right;
                outputs[0] = &left;
                outputs[1] = &right;
                qsound_stream_update(&qsound_chip_inst, outputs, 1);
                buffer_l[i] = left / 32768.0f;
                buffer_r[i] = right / 32768.0f;
                break;
            }
            case CHIP_SNES: {
                // SNES SPC700 DSP - run and read stereo output
                if (snes_chip) {
                    short stereo_buf[2];
                    snes_chip->set_output(stereo_buf, 1);
                    snes_chip->run(32);  // ~32 clocks per sample at 32kHz
                    buffer_l[i] = stereo_buf[0] / 32768.0f;
                    buffer_r[i] = stereo_buf[1] / 32768.0f;
                } else {
                    buffer_l[i] = buffer_r[i] = 0;
                }
                break;
            }
            default: buffer_l[i] = 0; buffer_r[i] = 0; break;
        }
        current_sample_time++;
    }
}

} // extern "C"
