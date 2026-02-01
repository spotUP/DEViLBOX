#include <emscripten.h>
#include <map>
#include "emu.h"
#include "es5506.h"
#include "es5503.h"
#include "roland_sa.h"
#include "swp30.h"

// Implementation of the device code
#include "es5506.cpp"
#include "es5503.cpp"
#include "roland_sa.cpp"
#include "swp30.cpp"

// Global banks for stubs to access
uint8_t* g_rom_banks[4] = { nullptr, nullptr, nullptr, nullptr };

/**
 * Proxy classes to expose protected MAME methods
 */
class es5506_device_proxy : public es5506_device {
public:
    es5506_device_proxy(const machine_config &mconfig, const char *tag, device_t *owner, u32 clock)
        : es5506_device(mconfig, tag, owner, clock) {}
    void start() { device_start(); }
    void reset() { device_reset(); }
    void update(sound_stream &stream) { sound_stream_update(stream); }
};

class es5503_device_proxy : public es5503_device {
public:
    es5503_device_proxy(const machine_config &mconfig, const char *tag, device_t *owner, u32 clock)
        : es5503_device(mconfig, tag, owner, clock) {}
    void start() { device_start(); }
    void reset() { device_reset(); }
    void update(sound_stream &stream) { sound_stream_update(stream); }
};

class roland_sa_device_proxy : public roland_sa_device {
public:
    roland_sa_device_proxy(const machine_config &mconfig, const char *tag, device_t *owner, u32 clock)
        : roland_sa_device(mconfig, tag, owner, clock) {}
    void start() { device_start(); }
    void reset() { device_reset(); }
    void update(sound_stream &stream) { sound_stream_update(stream); }
};

class swp30_device_proxy : public swp30_device {
public:
    swp30_device_proxy(const machine_config &mconfig, const char *tag, device_t *owner, u32 clock)
        : swp30_device(mconfig, tag, owner, clock) {}
    void start() { device_start(); }
    void reset() { device_reset(); }
    void update(sound_stream &stream) { sound_stream_update(stream); }
};

// Instance tracking
enum SynthType { TYPE_VFX, TYPE_DOC, TYPE_RSA, TYPE_SWP30 };

struct SynthInstance {
    SynthType type;
    device_t* device;
    sound_stream stream;
    
    ~SynthInstance() {
        if (device) delete device;
    }
};

static std::map<int, SynthInstance*> g_instances;
static int g_next_handle = 1;
static uint8_t g_mconfig_dummy[1024]; // Stub machine config

extern "C" {

// Instance Management
EMSCRIPTEN_KEEPALIVE
int mame_create_instance(int type, uint32_t clock) {
    SynthInstance* inst = new SynthInstance();
    inst->type = (SynthType)type;
    
    if (type == TYPE_VFX) {
        auto* dev = new es5506_device_proxy(*(machine_config*)g_mconfig_dummy, "vfx", nullptr, clock);
        dev->start();
        dev->reset();
        inst->device = dev;
        inst->stream.m_views.resize(6);
    } else if (type == TYPE_DOC) {
        auto* dev = new es5503_device_proxy(*(machine_config*)g_mconfig_dummy, "doc", nullptr, clock);
        dev->start();
        dev->reset();
        inst->device = dev;
        inst->stream.m_views.resize(2);
    } else if (type == TYPE_RSA) {
        auto* dev = new roland_sa_device_proxy(*(machine_config*)g_mconfig_dummy, "rsa", nullptr, clock);
        dev->start();
        dev->reset();
        inst->device = dev;
        inst->stream.m_views.resize(2);
    } else if (type == TYPE_SWP30) {
        auto* dev = new swp30_device_proxy(*(machine_config*)g_mconfig_dummy, "swp30", nullptr, clock);
        dev->start();
        dev->reset();
        inst->device = dev;
        inst->stream.m_views.resize(2);
    }
    
    int handle = g_next_handle++;
    g_instances[handle] = inst;
    return handle;
}

EMSCRIPTEN_KEEPALIVE
void mame_delete_instance(int handle) {
    if (g_instances.count(handle)) {
        delete g_instances[handle];
        g_instances.erase(handle);
    }
}

// Common IO
EMSCRIPTEN_KEEPALIVE
void mame_write(int handle, uint32_t offset, uint8_t data) {
    if (g_instances.count(handle)) {
        auto* inst = g_instances[handle];
        if (inst->type == TYPE_VFX) ((es5506_device*)inst->device)->write(offset, data);
        else if (inst->type == TYPE_DOC) ((es5503_device*)inst->device)->write(offset, data);
        else if (inst->type == TYPE_RSA) ((roland_sa_device*)inst->device)->write(offset, data);
        else if (inst->type == TYPE_SWP30) ((swp30_device*)inst->device)->snd_w(offset, data);
    }
}

EMSCRIPTEN_KEEPALIVE
void mame_write16(int handle, uint32_t offset, uint16_t data) {
    if (g_instances.count(handle)) {
        auto* inst = g_instances[handle];
        if (inst->type == TYPE_VFX) {
            auto* dev = (es5506_device*)inst->device;
            dev->write(offset, data & 0xFF);
            dev->write(offset + 1, (data >> 8) & 0xFF);
        } else if (inst->type == TYPE_SWP30) {
            ((swp30_device*)inst->device)->snd_w(offset, data);
        }
    }
}

EMSCRIPTEN_KEEPALIVE
uint8_t mame_read(int handle, uint32_t offset) {
    if (g_instances.count(handle)) {
        auto* inst = g_instances[handle];
        if (inst->type == TYPE_VFX) return ((es5506_device*)inst->device)->read(offset);
        else if (inst->type == TYPE_DOC) return ((es5503_device*)inst->device)->read(offset);
        else if (inst->type == TYPE_SWP30) return ((swp30_device*)inst->device)->snd_r(offset);
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void mame_render(int handle, float* outL, float* outR, uint32_t numSamples) {
    if (g_instances.count(handle)) {
        auto* inst = g_instances[handle];
        inst->stream.m_samples = numSamples;
        inst->stream.m_views[0].m_buffer = outL;
        inst->stream.m_views[0].m_samples = numSamples;
        inst->stream.m_views[1].m_buffer = outR;
        inst->stream.m_views[1].m_samples = numSamples;
        
        if (inst->type == TYPE_VFX) ((es5506_device_proxy*)inst->device)->update(inst->stream);
        else if (inst->type == TYPE_DOC) ((es5503_device_proxy*)inst->device)->update(inst->stream);
        else if (inst->type == TYPE_RSA) ((roland_sa_device_proxy*)inst->device)->update(inst->stream);
        else if (inst->type == TYPE_SWP30) ((swp30_device_proxy*)inst->device)->update(inst->stream);
    }
}

// Global ROM loading
EMSCRIPTEN_KEEPALIVE
void mame_set_rom(int bank, uint8_t* data, uint32_t size) {
    if (bank >= 0 && bank < 4) {
        g_rom_banks[bank] = data;
        for (auto const& [handle, inst] : g_instances) {
            if (inst->type == TYPE_DOC) {
                auto* doc = (es5503_device_proxy*)inst->device;
                doc->m_rom_base = data;
                doc->m_rom_size = size;
            }
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void mame_add_midi_event(int handle, uint8_t* data, uint32_t length) {
    if (g_instances.count(handle)) {
        // Future SysEx handling
    }
}

EMSCRIPTEN_KEEPALIVE
void rsa_load_roms(int handle, uint8_t* ic5, uint8_t* ic6, uint8_t* ic7) {
    if (g_instances.count(handle)) {
        auto* inst = g_instances[handle];
        if (inst->type == TYPE_RSA) {
            ((roland_sa_device*)inst->device)->load_roms(ic5, ic6, ic7);
        }
    }
}

}
