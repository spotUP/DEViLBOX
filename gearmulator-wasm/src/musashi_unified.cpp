/**
 * musashi_unified.cpp — Unified Musashi MC68K memory callbacks via virtual dispatch.
 *
 * When multiple synth libs (mqLib, xtLib, nordLib) are linked into a single binary,
 * each would normally define its own set of extern "C" Musashi callbacks via
 * musashiEntry.h with a different MC68K_CLASS. This causes duplicate symbol errors.
 *
 * This file provides a single set of callbacks that use Mc68k's virtual methods
 * (read8, read16, readImm16, write8, write16, getResetPC, getResetSP) to dispatch
 * to the correct synth-specific implementation at runtime.
 *
 * Build with -DGM_MUSASHI_VIRTUAL_DISPATCH to suppress the per-synth definitions.
 */

#include "mc68k/mc68k.h"
#include "mc68k/cpuState.h"

static mc68k::Mc68k* mc68k_get_instance(m68ki_cpu_core* _core)
{
    return static_cast<mc68k::CpuState*>(_core)->instance;
}

extern "C"
{

unsigned int m68k_read_immediate_16(m68ki_cpu_core* core, unsigned int address)
{
    return mc68k_get_instance(core)->readImm16(address);
}

unsigned int m68k_read_immediate_32(m68ki_cpu_core* core, unsigned int address)
{
    auto* inst = mc68k_get_instance(core);
    uint32_t hi = inst->readImm16(address);
    uint32_t lo = inst->readImm16(address + 2);
    return (hi << 16) | lo;
}

unsigned int m68k_read_pcrelative_8(m68ki_cpu_core* core, unsigned int address)
{
    return mc68k_get_instance(core)->read8(address);
}

unsigned int m68k_read_pcrelative_16(m68ki_cpu_core* core, unsigned int address)
{
    return mc68k_get_instance(core)->read16(address);
}

unsigned int m68k_read_pcrelative_32(m68ki_cpu_core* core, unsigned int address)
{
    auto* inst = mc68k_get_instance(core);
    uint32_t hi = inst->read16(address);
    uint32_t lo = inst->read16(address + 2);
    return (hi << 16) | lo;
}

unsigned int m68k_read_memory_8(m68ki_cpu_core* core, unsigned int address)
{
    return mc68k_get_instance(core)->read8(address);
}

unsigned int m68k_read_memory_16(m68ki_cpu_core* core, unsigned int address)
{
    return mc68k_get_instance(core)->read16(address);
}

unsigned int m68k_read_memory_32(m68ki_cpu_core* core, unsigned int address)
{
    auto* inst = mc68k_get_instance(core);
    uint32_t hi = inst->read16(address);
    uint32_t lo = inst->read16(address + 2);
    return (hi << 16) | lo;
}

void m68k_write_memory_8(m68ki_cpu_core* core, unsigned int address, unsigned int value)
{
    mc68k_get_instance(core)->write8(address, static_cast<uint8_t>(value));
}

void m68k_write_memory_16(m68ki_cpu_core* core, unsigned int address, unsigned int value)
{
    mc68k_get_instance(core)->write16(address, static_cast<uint16_t>(value));
}

void m68k_write_memory_32(m68ki_cpu_core* core, unsigned int address, unsigned int value)
{
    auto* inst = mc68k_get_instance(core);
    inst->write16(address, static_cast<uint16_t>(value >> 16));
    inst->write16(address + 2, static_cast<uint16_t>(value & 0xffff));
}

int read_sp_on_reset(m68ki_cpu_core* core)
{
    return static_cast<int>(mc68k_get_instance(core)->getResetSP());
}

int read_pc_on_reset(m68ki_cpu_core* core)
{
    return static_cast<int>(mc68k_get_instance(core)->getResetPC());
}

} // extern "C"
