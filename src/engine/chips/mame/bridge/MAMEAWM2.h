#ifndef MAME_AWM2_H
#define MAME_AWM2_H

#include "emu.h"
#include "swp30.h"

namespace DEViLBOX {

/**
 * MAMEAWM2 - Specific bridge for Yamaha AWM2 (SWP30)
 */
class MAMEAWM2 {
public:
    MAMEAWM2(uint32_t clock);
    ~MAMEAWM2();

    void write(uint32_t offset, uint16_t data);
    uint16_t read(uint32_t offset);
    void render(float* outL, float* outR, uint32_t numSamples);

private:
    swp30_device* m_device;
    sound_stream m_stream;
};

} // namespace DEViLBOX

#endif
