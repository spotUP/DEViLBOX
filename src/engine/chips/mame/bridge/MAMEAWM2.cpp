#include "MAMEAWM2.h"

namespace DEViLBOX {

class swp30_device_proxy : public swp30_device {
public:
    swp30_device_proxy(const machine_config &mconfig, const char *tag, device_t *owner, u32 clock)
        : swp30_device(mconfig, tag, owner, clock) {}
        
    void start() { device_start(); }
    void reset() { device_reset(); }
    void update(sound_stream &stream) { sound_stream_update(stream); }
};

MAMEAWM2::MAMEAWM2(uint32_t clock) {
    static uint8_t mconfig_dummy[1024];
    m_device = new swp30_device_proxy(*(machine_config*)mconfig_dummy, "swp30", nullptr, clock);
    ((swp30_device_proxy*)m_device)->start();
    ((swp30_device_proxy*)m_device)->reset();
    
    m_stream.m_views.resize(2);
}

MAMEAWM2::~MAMEAWM2() {
    delete m_device;
}

void MAMEAWM2::write(uint32_t offset, uint16_t data) {
    m_device->snd_w(offset, data);
}

uint16_t MAMEAWM2::read(uint32_t offset) {
    return m_device->snd_r(offset);
}

void MAMEAWM2::render(float* outL, float* outR, uint32_t numSamples) {
    m_stream.m_samples = numSamples;
    m_stream.m_views[0].m_buffer = outL;
    m_stream.m_views[0].m_samples = numSamples;
    m_stream.m_views[1].m_buffer = outR;
    m_stream.m_views[1].m_samples = numSamples;
    
    ((swp30_device_proxy*)m_device)->update(m_stream);
}

} // namespace DEViLBOX
