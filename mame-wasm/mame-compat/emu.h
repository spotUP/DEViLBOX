/**
 * MAME Compatibility Layer - Minimal stubs for standalone chip compilation
 *
 * MAME sound chips depend on the broader MAME framework. This header provides
 * minimal stubs and replacements so chips can compile standalone for WASM.
 */

#ifndef MAME_COMPAT_EMU_H
#define MAME_COMPAT_EMU_H

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <functional>

// Type definitions
typedef int8_t s8;
typedef uint8_t u8;
typedef int16_t s16;
typedef uint16_t u16;
typedef int32_t s32;
typedef uint32_t u32;
typedef int64_t s64;
typedef uint64_t u64;

typedef u32 offs_t;

// Endianness
enum endianness_t {
    ENDIANNESS_LITTLE = 0,
    ENDIANNESS_BIG = 1
};

// Stub for ATTR_COLD (cold function attribute)
#define ATTR_COLD

// Stub for [[maybe_unused]]
// Already supported in C++17

// Forward declarations
class device_t;
class machine_config;

// Device callback stubs
class devcb_write_line {
public:
    devcb_write_line(device_t& owner) {}
    devcb_write_line& bind() { return *this; }
    bool isunset() const { return true; }
    void operator()(int) {}
};

class devcb_write8 {
public:
    devcb_write8(device_t& owner) {}
    devcb_write8& bind() { return *this; }
    bool isunset() const { return true; }
    void operator()(offs_t, u8) {}
};

// Sound stream stub
class sound_stream {
public:
    int samples() const { return m_samples; }
    void update() {}
    void set_sample_rate(u32 rate) { m_sample_rate = rate; }

    int m_samples = 128;
    u32 m_sample_rate = 44100;
};

// Timer stub
class emu_timer {
public:
    void adjust(double) {}
};

// Attotime stub
class attotime {
public:
    static attotime from_ticks(u32, u32) { return attotime(); }
};

// Machine stub
class running_machine {
public:
    u32 rand() { return m_rand_state = m_rand_state * 1103515245 + 12345; }
private:
    u32 m_rand_state = 12345;
};

// Machine config stub
class machine_config {
public:
    machine_config() = default;
};

// Feature type stub (used in imperfect_features)
class feature {
public:
    enum type { SOUND = 1 };
};

// Device base stubs
class device_t {
public:
    device_t() : m_clock(44100) {}
    device_t(const machine_config& mconfig, const char* type, const char* tag, device_t* owner, u32 clock)
        : m_clock(clock), m_tag(tag), m_owner(owner) {}
    virtual ~device_t() = default;

    u32 clock() const { return m_clock; }
    void set_clock(u32 clk) { m_clock = clk; m_clock_dirty = true; }

    running_machine& machine() { return m_machine; }
    const char* tag() const { return m_tag; }

    // Timer allocation (stubbed)
    emu_timer* timer_alloc(int) {
        static emu_timer dummy;
        return &dummy;
    }

    void start() { device_start(); }

protected:
    virtual void device_start() {}
    virtual void device_post_load() {}
    virtual void device_clock_changed() {}
    virtual void rom_bank_pre_change() {}

    u32 m_clock;
    bool m_clock_dirty = false;
    running_machine m_machine;
    const char* m_tag = "";
    device_t* m_owner = nullptr;
};

class device_sound_interface {
public:
    device_sound_interface(const machine_config& mconfig, device_t& device) {}
    device_sound_interface() = default;

protected:
    sound_stream* stream_alloc(int inputs, int outputs, u32 rate) {
        m_stream.m_sample_rate = rate;
        return &m_stream;
    }

    void set_output_gain(int, float) {}

    virtual void sound_stream_update(sound_stream& stream) {}

    sound_stream m_stream;
};

// Memory interface stub
template<int AddrBits, int DataWidth, int AddrShift, endianness_t Endian>
class device_rom_interface {
public:
    device_rom_interface(const machine_config& mconfig, device_t& device) {}
    device_rom_interface() = default;

    void rom_bank_pre_change() {}

    u8 read_byte(offs_t addr) {
        if (m_rom && addr < m_rom_size) return m_rom[addr];
        return 0;
    }

    u16 read_word(offs_t addr) {
        if (!m_rom || addr + 1 >= m_rom_size) return 0;
        if (Endian == ENDIANNESS_BIG)
            return (m_rom[addr] << 8) | m_rom[addr + 1];
        else
            return m_rom[addr] | (m_rom[addr + 1] << 8);
    }

    void set_rom(const u8* data, size_t size) {
        m_rom = data;
        m_rom_size = size;
    }

protected:
    const u8* m_rom = nullptr;
    size_t m_rom_size = 0;
};

// Memory access stubs
template<int AddrBits, int DataWidth, int AddrShift, endianness_t Endian>
class memory_access {
public:
    class cache {
    public:
        u8 read_byte(offs_t addr) {
            if (m_data && addr < m_size) return m_data[addr];
            return 0;
        }
        u16 read_word(offs_t addr) {
            if (!m_data || addr + 1 >= m_size) return 0;
            if (Endian == ENDIANNESS_BIG)
                return (m_data[addr] << 8) | m_data[addr + 1];
            else
                return m_data[addr] | (m_data[addr + 1] << 8);
        }
        void set_data(const u8* data, size_t size) { m_data = data; m_size = size; }
    private:
        const u8* m_data = nullptr;
        size_t m_size = 0;
    };

    class specific {
    public:
        u8 read_byte(offs_t addr) { return m_cache.read_byte(addr); }
        u16 read_word(offs_t addr) { return m_cache.read_word(addr); }
        cache m_cache;
    };
};

class device_memory_interface {
public:
    struct space_config_vector {};
    virtual space_config_vector memory_space_config() const { return {}; }
};

class address_space_config {};

// Address space stub (for DSP)
class address_space {
public:
    u8 read_byte(offs_t addr) { return 0; }
    u16 read_word(offs_t addr) { return 0; }
    void write_byte(offs_t addr, u8 data) {}
    void write_word(offs_t addr, u16 data) {}
};

// Timer callback macro stub
#define TIMER_CALLBACK_MEMBER(name) void name()

// Device type declaration stubs
#define DECLARE_DEVICE_TYPE(Type, Class)
#define DEFINE_DEVICE_TYPE(Type, Class, ShortName, FullName)

// Logging stubs
#define logerror(...)
#define popmessage(...)

// feature_type is defined above as 'feature' class

#endif // MAME_COMPAT_EMU_H
