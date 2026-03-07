/**
 * gen_jp8k_ram.cpp — Generate JP-8000 factory reset RAM dump.
 *
 * Boots the JP-8000 firmware, runs the factory reset procedure,
 * and saves the resulting 256KB SRAM to a file.
 *
 * Build: c++ -O2 -std=c++17 -I../../"Reference Code"/gearmulator-main/source \
 *        -I../../"Reference Code"/gearmulator-main/source/ronaldo/h8s/.. \
 *        -I../../"Reference Code"/gearmulator-main/source/ronaldo/esp/.. \
 *        -I../../"Reference Code"/gearmulator-main/source/ronaldo/common/.. \
 *        gen_jp8k_ram.cpp -L../build-native -lronaldoLib -lsynthLib -lhardwareLib \
 *        -lbaseLib -ldsp56kEmu -ldsp56kBase -lasmjit -lrLib -lesp -lmc68k \
 *        -llbresample -lpthread -o gen_jp8k_ram
 *
 * Run:   ./gen_jp8k_ram <jp8000_rom.bin> <output_ram.bin>
 */

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <vector>

#include "ronaldo/je8086/jeLib/device.h"
#include "synthLib/deviceTypes.h"

int main(int argc, char* argv[])
{
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <jp8000_rom.bin> <output_ram.bin>\n", argv[0]);
        return 1;
    }

    // Read ROM file
    std::ifstream romFile(argv[1], std::ios::binary);
    if (!romFile) {
        fprintf(stderr, "Cannot open ROM: %s\n", argv[1]);
        return 1;
    }
    std::vector<uint8_t> romData((std::istreambuf_iterator<char>(romFile)),
                                  std::istreambuf_iterator<char>());
    romFile.close();
    printf("ROM loaded: %zu bytes\n", romData.size());

    // Create device — this triggers factory reset since no ram_dump.bin exists
    printf("Creating JP-8000 device (factory reset will run)...\n");
    synthLib::DeviceCreateParams params;
    params.romData = romData;
    params.hostSamplerate = 44100.0f;
    params.preferredSamplerate = 44100.0f;

    try {
        auto device = std::make_unique<jeLib::Device>(params);
        printf("Device created successfully.\n");

        // The device constructor runs factory reset internally.
        // Now extract state which contains the initialized RAM.
        std::vector<uint8_t> state;
        if (device->getState(state, synthLib::StateTypeGlobal)) {
            printf("Got device state: %zu bytes\n", state.size());
        }

        // Process a few frames to ensure everything is stable
        float outL[128] = {}, outR[128] = {};
        const synthLib::TAudioInputs inputs = {nullptr, nullptr, nullptr, nullptr};
        const synthLib::TAudioOutputs outputs = {outL, outR, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr};
        std::vector<synthLib::SMidiEvent> midiIn, midiOut;
        device->process(inputs, outputs, 128, midiIn, midiOut);
        printf("Processed 128 frames OK.\n");

        printf("Device is %s\n", device->isValid() ? "valid" : "invalid");
    } catch (const std::exception& e) {
        fprintf(stderr, "Exception: %s\n", e.what());
        return 1;
    }

    // The factory reset wrote ram_dump.bin to the current directory.
    // Copy it to the output path.
    std::ifstream ramIn("ram_dump.bin", std::ios::binary);
    if (!ramIn) {
        fprintf(stderr, "ram_dump.bin not found — factory reset may not have written it.\n");
        return 1;
    }
    std::vector<uint8_t> ramData((std::istreambuf_iterator<char>(ramIn)),
                                  std::istreambuf_iterator<char>());
    ramIn.close();
    printf("RAM dump: %zu bytes\n", ramData.size());

    std::ofstream ramOut(argv[2], std::ios::binary);
    ramOut.write(reinterpret_cast<const char*>(ramData.data()), ramData.size());
    ramOut.close();
    printf("Saved to %s\n", argv[2]);

    return 0;
}
