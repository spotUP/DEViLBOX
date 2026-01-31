#ifndef MACHINE_BRIDGE_H
#define MACHINE_BRIDGE_H

#include <stdint.h>
#include <vector>
#include <string>

/**
 * MachineBridge - The interface between DEViLBOX and MAME
 * Inspired by amame's Frontend/MachineManager
 */
namespace DEViLBOX {

class MachineBridge {
public:
    virtual ~MachineBridge() {}

    // Lifecycle
    virtual bool init(const std::string& machineName, uint32_t sampleRate) = 0;
    virtual void start() = 0;
    virtual void stop() = 0;

    // Audio IO
    // Renders requested number of samples into provided stereo buffer
    virtual void render(float* left, float* right, uint32_t numSamples) = 0;

    // MIDI IO
    virtual void addMidiEvent(const uint8_t* data, uint32_t length) = 0;

    // Parameter Control (Sysex or direct memory mapping)
    virtual void writeRegister(uint32_t offset, uint8_t data) = 0;
};

// Factory function to create the bridge (implemented in MachineBridge.cpp)
MachineBridge* createMachineBridge();

} // namespace DEViLBOX

#endif
