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

// Bubble System (K005289) Custom implementation
static k005289_core* bubble_timer = NULL;
static uint8_t bubble_waves[2][32];
static uint8_t bubble_vol[2];

// Blip Buffers
static blip_buffer_t* blip_scc = NULL;
static blip_buffer_t* blip_n163 = NULL;
static blip_buffer_t* blip_vrc6 = NULL;
static blip_buffer_t* blip_pce = NULL;
static blip_buffer_t* blip_t6w28_l = NULL;
static blip_buffer_t* blip_t6w28_r = NULL;

enum ChipType {
    CHIP_OPN2=0, CHIP_OPM=1, CHIP_OPL3=2, CHIP_PSG=3, CHIP_NES=4, CHIP_GB=5, CHIP_PCE=6, CHIP_SCC=7, CHIP_N163=8, CHIP_VRC6=9, CHIP_SID=10,
    CHIP_OPLL=11, CHIP_AY=12, CHIP_OPNA=13, CHIP_OPNB=14, CHIP_TIA=15, CHIP_FDS=16, CHIP_MMC5=17, CHIP_SAA=18, CHIP_SWAN=19, CHIP_OKI=20, CHIP_ES5506=21,
    CHIP_OPZ=22, CHIP_Y8950=23, CHIP_SNES=24, CHIP_LYNX=25, CHIP_OPL4=26, CHIP_SEGAPCM=27, CHIP_YMZ280B=28, CHIP_RF5C68=29, CHIP_GA20=30, CHIP_C140=31,
    CHIP_QSOUND=32, CHIP_VIC=33, CHIP_TED=34, CHIP_SUPERVISION=35, CHIP_VERA=36, CHIP_SM8521=37, CHIP_BUBBLE=38, CHIP_K007232=39, CHIP_K053260=40,
    CHIP_X1_010=41, CHIP_UPD1771=42, CHIP_T6W28=43, CHIP_VB=44
};

extern "C" {

EMSCRIPTEN_KEEPALIVE
void furnace_init_chips(int sample_rate) {
    OPN2_Reset(&opn2_chip); OPM_Reset(&opm_chip); OPL3_Reset(&opl3_chip_inst, sample_rate); YMPSG_Init(&psg_chip, 1, 0x0001, 0x0008, 16); GB_apu_init(&gb_chip);
    
    if (nes_apu) delete nes_apu; nes_apu = new xgm::NES_APU(); nes_apu->SetOption(0, 0);
    if (nes_dmc) delete nes_dmc; nes_dmc = new xgm::NES_DMC(); nes_dmc->SetOption(0, 0);
    if (nes_fds) delete nes_fds; nes_fds = new xgm::NES_FDS();
    if (nes_mmc5) delete nes_mmc5; nes_mmc5 = new xgm::NES_MMC5();
    if (pce_chip) delete pce_chip; pce_chip = new PCE_PSG(0); if (!blip_pce) blip_pce = blip_new(4096); blip_set_rates(blip_pce, 3579545 * 2, sample_rate);
    if (scc_chip) delete scc_chip; scc_chip = new scc_impl(); if (!blip_scc) blip_scc = blip_new(4096); blip_set_rates(blip_scc, 3579545, sample_rate);
    if (n163_chip) delete n163_chip; n163_chip = new n163_core(); if (!blip_n163) blip_n163 = blip_new(4096); blip_set_rates(blip_n163, 1789773, sample_rate);
    if (vrc6_chip) delete vrc6_chip; vrc6_chip = new vrcvi_impl(); if (!blip_vrc6) blip_vrc6 = blip_new(4096); blip_set_rates(blip_vrc6, 1789773, sample_rate);
    if (sid_chip) sid3_free(sid_chip); sid_chip = sid3_create(); sid3_set_clock_rate(sid_chip, 985248); sid3_reset(sid_chip);
    OPLL_Reset(&opll_chip, opll_type_ym2413);
    if (ay_chip) delete ay_chip; ay_chip = new ay8910_device(1789773); ay_chip->device_start(); ay_chip->device_reset();
    if (opna_chip) delete opna_chip; opna_chip = new ymfm::ym2608(ymfm_intf); opna_chip->reset();
    if (opnb_chip) delete opnb_chip; opnb_chip = new ymfm::ym2610(ymfm_intf); opnb_chip->reset();
    if (tia_chip) delete tia_chip; tia_chip = new TIA::Audio(); tia_chip->reset(false);
    if (saa_chip) delete saa_chip; saa_chip = new saa1099_device(); saa_chip->device_start();
    if (oki_chip) delete oki_chip; oki_chip = new msm6295_core(oki_intf); oki_chip->reset();
    if (es_chip) delete es_chip; es_chip = new es5506_core(es_intf); es_chip->reset();
    if (swan_chip) delete swan_chip; swan_chip = new WSwan(); swan_chip->SoundReset();
    if (opz_chip) delete opz_chip; opz_chip = new ymfm::ym2414(ymfm_intf); opz_chip->reset();
    if (y8950_chip) delete y8950_chip; y8950_chip = new ymfm::y8950(ymfm_intf); y8950_chip->reset();
    if (snes_chip) delete snes_chip; snes_chip = new SPC_DSP(); snes_chip->init(NULL); snes_chip->reset();
    if (lynx_chip) delete lynx_chip; lynx_chip = new Lynx::Mikey(4000000);
    if (segapcm_chip) delete segapcm_chip; segapcm_chip = new segapcm_device(); segapcm_chip->device_start();
    if (ymz_chip) delete ymz_chip; ymz_chip = new ymz280b_device(); ymz_chip->device_start(NULL);
    if (rf5_chip) delete rf5_chip; rf5_chip = new rf5c68_device(); rf5_chip->device_start(NULL);
    if (ga20_chip) delete ga20_chip; ga20_chip = new iremga20_device(ga20_intf);
    if (vb_chip) delete vb_chip; vb_chip = new VSU();
    if (upd_chip) delete upd_chip; upd_chip = new upd1771c_device();
    if (k7232_chip) delete k7232_chip; k7232_chip = new k007232_core(k7232_intf); k7232_chip->reset();
    if (k53260_chip) delete k53260_chip; k53260_chip = new k053260_core(k53260_intf); k53260_chip->reset();
    if (x1_010_chip) delete x1_010_chip; x1_010_chip = new x1_010_impl(); x1_010_chip->reset();
    if (opl4_chip) delete opl4_chip; opl4_chip = new YMF278(ymf278_mem); opl4_chip->reset();
    if (t6w28_chip) delete t6w28_chip; t6w28_chip = new MDFN_IEN_NGP::T6W28_Apu();

    // Bubble System Init
    if (bubble_timer) delete bubble_timer; bubble_timer = new k005289_core(); bubble_timer->reset();
    memset(bubble_waves, 0, sizeof(bubble_waves));
    memset(bubble_vol, 0, sizeof(bubble_vol));

    // Logging Init
    reg_log.clear();
    logging_enabled = false;
    current_sample_time = 0;
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
void furnace_chip_write(int type, uint32_t port, uint8_t data) {
    if (logging_enabled) {
        reg_log.push_back({current_sample_time, (uint8_t)type, port, data});
    }

    switch (type) {
        case CHIP_OPN2: OPN2_Write(&opn2_chip, port, data); break;
        case CHIP_OPM:  OPM_Write(&opm_chip, port, data); break;
        case CHIP_OPL3: OPL3_WriteReg(&opl3_chip_inst, (uint16_t)port, data); break;
        case CHIP_PSG:  YMPSG_Write(&psg_chip, data); break;
        case CHIP_NES:  if (nes_apu && nes_dmc) { if (port < 0x4010) nes_apu->Write(port, data); else nes_dmc->Write(port, data); } break;
        case CHIP_GB:   GB_apu_write(&gb_chip, port, data); break;
        case CHIP_PCE:  if (pce_chip) pce_chip->SetRegister(port, data); break;
        case CHIP_SCC:  if (scc_chip) scc_chip->scc_w(false, port, data); break; 
        case CHIP_N163: if (n163_chip) { if (port == 0xE000) n163_chip->addr_w(data); else if (port == 0xF800) n163_chip->data_w(data); } break;
        case CHIP_VRC6: if (vrc6_chip) vrc6_chip->write(port, data); break;
        case CHIP_SID:  if (sid_chip) sid3_write(sid_chip, port, data); break;
        case CHIP_OPLL: OPLL_Write(&opll_chip, port, data); break;
        case CHIP_AY:   if (ay_chip) { ay_chip->address_w(port); ay_chip->data_w(data); } break;
        case CHIP_OPNA: if (opna_chip) opna_chip->write(port, data); break;
        case CHIP_OPNB: if (opnb_chip) opnb_chip->write(port, data); break;
        case CHIP_TIA:  if (tia_chip) tia_chip->write(port, data); break;
        case CHIP_FDS:  if (nes_fds) nes_fds->Write(port, data); break;
        case CHIP_MMC5: if (nes_mmc5) nes_mmc5->Write(port, data); break;
        case CHIP_SAA:  if (saa_chip) saa_chip->write(port, data); break;
        case CHIP_SWAN: if (swan_chip) swan_chip->SoundWrite(port, data); break;
        case CHIP_OKI:  if (oki_chip) oki_chip->command_w(data); break;
        case CHIP_ES5506: if (es_chip) es_chip->write(port, data); break;
        case CHIP_OPZ:  if (opz_chip) opz_chip->write(port, data); break;
        case CHIP_Y8950: if (y8950_chip) y8950_chip->write(port, data); break;
        case CHIP_SEGAPCM: if (segapcm_chip) segapcm_chip->write(port, data); break;
        case CHIP_YMZ280B: if (ymz_chip) ymz_chip->write(port, data); break;
        case CHIP_RF5C68: if (rf5_chip) rf5_chip->rf5c68_w(port, data); break;
        case CHIP_GA20: if (ga20_chip) ga20_chip->write(port, data); break;
        case CHIP_UPD1771: if (upd_chip) upd_chip->write(data); break;
        case CHIP_K007232: if (k7232_chip) k7232_chip->write(port, data); break;
        case CHIP_K053260: if (k53260_chip) k53260_chip->write(port, data); break;
        case CHIP_X1_010: if (x1_010_chip) x1_010_chip->ram_w(port, data); break;
        case CHIP_OPL4: if (opl4_chip) opl4_chip->writeReg(port, data); break;
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
    }
}

EMSCRIPTEN_KEEPALIVE
void furnace_chip_render(int type, float* buffer_l, float* buffer_r, int length) {
    ymfm::ym2608::output_data output_2608;
    ymfm::ym2610::output_data output_2610;
    ymfm::ym2414::output_data output_2414;
    ymfm::y8950::output_data output_8950;
    
    for (int i = 0; i < length; i++) {
        int16_t out16[2] = {0, 0};
        int32_t out32[2] = {0, 0};
        uint8_t d1, d2, d3;
        int32_t opll_buf[2];
        
        switch (type) {
            case CHIP_OPN2: OPN2_Clock(&opn2_chip, out16); buffer_l[i] = (float)out16[0] / 32768.0f; buffer_r[i] = (float)out16[1] / 32768.0f; break;
            case CHIP_OPM:  OPM_Clock(&opm_chip, out32, &d1, &d2, &d3); buffer_l[i] = (float)out32[0] / 32768.0f; buffer_r[i] = (float)out32[1] / 32768.0f; break;
            case CHIP_OPL3: OPL3_GenerateResampled(&opl3_chip_inst, out16); buffer_l[i] = (float)out16[0] / 32768.0f; buffer_r[i] = (float)out16[1] / 32768.0f; break;
            case CHIP_PSG:  YMPSG_Clock(&psg_chip); YMPSG_GetOutput(&psg_chip, &out32[0], &out32[1]); buffer_l[i] = (float)out32[0] / 32768.0f; buffer_r[i] = (float)out32[1] / 32768.0f; break;
            case CHIP_NES:  if (nes_apu) { nes_apu->Tick(1); nes_dmc->Tick(1); nes_apu->Render(out32); buffer_l[i] = (float)out32[0] / 32768.0f; buffer_r[i] = (float)out32[0] / 32768.0f; } break;
            case CHIP_GB:   GB_advance_cycles(&gb_chip, 80); buffer_l[i] = (float)gb_chip.apu_output.final_sample.left / 32768.0f; buffer_r[i] = (float)gb_chip.apu_output.final_sample.right / 32768.0f; break;
            case CHIP_SID:  if (sid_chip) { sid3_clock(sid_chip); buffer_l[i] = (float)sid_chip->output_l / 32768.0f; buffer_r[i] = (float)sid_chip->output_r / 32768.0f; } break;
            case CHIP_OPLL: OPLL_Clock(&opll_chip, opll_buf); buffer_l[i] = (float)opll_buf[0] / 32768.0f; buffer_r[i] = (float)opll_buf[1] / 32768.0f; break;
            case CHIP_TIA:  if (tia_chip) { tia_chip->tick(1); buffer_l[i] = (float)tia_chip->myCurrentSample[0] / 32768.0f; buffer_r[i] = (float)tia_chip->myCurrentSample[1] / 32768.0f; } break;
            case CHIP_OPNA: if (opna_chip) { opna_chip->generate(&output_2608); buffer_l[i] = (float)output_2608.data[0] / 32768.0f; buffer_r[i] = (float)output_2608.data[1] / 32768.0f; } break;
            case CHIP_OPNB: if (opnb_chip) { opnb_chip->generate(&output_2610); buffer_l[i] = (float)output_2610.data[0] / 32768.0f; buffer_r[i] = (float)output_2610.data[1] / 32768.0f; } break;
            case CHIP_AY:   if (ay_chip) { short ay_o[3]; ay_chip->sound_stream_update(ay_o, 1); float m = (ay_o[0]+ay_o[1]+ay_o[2])/(3.0f*32768.0f); buffer_l[i] = m; buffer_r[i] = m; } break;
            case CHIP_SWAN: if (swan_chip) { int16_t s_o[2]; swan_chip->SoundUpdate(); swan_chip->SoundFlush(s_o, 1); buffer_l[i] = (float)s_o[0]/32768.0f; buffer_r[i] = (float)s_o[1]/32768.0f; } break;
            case CHIP_OPZ: if (opz_chip) { opz_chip->generate(&output_2414); buffer_l[i] = (float)output_2414.data[0] / 32768.0f; buffer_r[i] = (float)output_2414.data[1] / 32768.0f; } break;
            case CHIP_Y8950: if (y8950_chip) { y8950_chip->generate(&output_8950); buffer_l[i] = (float)output_8950.data[0] / 32768.0f; buffer_r[i] = (float)output_8950.data[1] / 32768.0f; } break;
            case CHIP_K007232: if (k7232_chip) { k7232_chip->tick(1); buffer_l[i] = (float)k7232_chip->output(0)/32768.0f; buffer_r[i] = (float)k7232_chip->output(1)/32768.0f; } break;
            case CHIP_K053260: if (k53260_chip) { k53260_chip->tick(1); buffer_l[i] = (float)k53260_chip->output(0)/32768.0f; buffer_r[i] = (float)k53260_chip->output(1)/32768.0f; } break;
            case CHIP_X1_010: if (x1_010_chip) { x1_010_chip->tick(); buffer_l[i] = (float)x1_010_chip->output(0)/32768.0f; buffer_r[i] = (float)x1_010_chip->output(1)/32768.0f; } break;
            case CHIP_OPL4: if (opl4_chip) { short buf[2]; opl4_chip->generate(buf[0], buf[1], buf[0], buf[1]); buffer_l[i] = (float)buf[0]/32768.0f; buffer_r[i] = (float)buf[1]/32768.0f; } break;
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
            default: buffer_l[i] = 0; buffer_r[i] = 0; break;
        }
        current_sample_time++;
    }
}

} // extern "C"
