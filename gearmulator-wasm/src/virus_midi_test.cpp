/**
 * Quick native test: does Virus B MIDI Note On produce audio?
 * Tests both full boot and snapshot boot paths.
 *
 * Build (from build-native/):
 *   cmake .. && make virus_midi_test -j8
 * Run:
 *   ./virus_midi_test <romPath>
 */
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <vector>
#include <memory>

#include "synthLib/device.h"
#include "synthLib/deviceTypes.h"
#include "synthLib/midiTypes.h"
#include "virusLib/device.h"

int main(int argc, char** argv)
{
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <virusBRomPath>\n", argv[0]);
        return 1;
    }

    // Load ROM
    FILE* f = fopen(argv[1], "rb");
    if (!f) { fprintf(stderr, "Cannot open ROM: %s\n", argv[1]); return 1; }
    fseek(f, 0, SEEK_END);
    size_t romSize = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::vector<uint8_t> romData(romSize);
    fread(romData.data(), 1, romSize, f);
    fclose(f);
    printf("ROM loaded: %zu bytes\n", romSize);

    // Create Virus B device (full boot with JIT — should be fast natively)
    synthLib::DeviceCreateParams params;
    params.romData = romData;
    params.romName = "rom.bin";
    params.hostSamplerate = 44100.0f;
    params.preferredSamplerate = 44100.0f;
    params.customData = static_cast<uint32_t>(virusLib::DeviceModel::ABC);

    printf("Creating Virus B device (full boot)...\n");
    auto device = std::make_unique<virusLib::Device>(params);
    if (!device || !device->isValid()) {
        fprintf(stderr, "Device creation failed!\n");
        return 1;
    }
    printf("Device created, sampleRate=%f\n", device->getSamplerate());

    // Process some audio to let the DSP settle
    constexpr uint32_t blockSize = 256;
    std::vector<float> outL(blockSize), outR(blockSize), dummy(blockSize);
    std::vector<synthLib::SMidiEvent> midiIn, midiOut;

    const synthLib::TAudioInputs inputs = {dummy.data(), dummy.data(), dummy.data(), dummy.data()};
    const synthLib::TAudioOutputs outputs = {
        outL.data(), outR.data(),
        dummy.data(), dummy.data(), dummy.data(), dummy.data(),
        dummy.data(), dummy.data(), dummy.data(), dummy.data(),
        dummy.data(), dummy.data()
    };

    // Render 1 second of silence to let DSP settle
    printf("Rendering 1s of silence (settling)...\n");
    float peakBefore = 0;
    for (int i = 0; i < 172; i++) {  // 172 * 256 ≈ 44032 samples ≈ 1s
        midiOut.clear();
        device->process(inputs, outputs, blockSize, midiIn, midiOut);
        for (uint32_t s = 0; s < blockSize; s++) {
            float a = fabsf(outL[s]);
            if (a > peakBefore) peakBefore = a;
        }
    }
    printf("Peak before note: %f\n", peakBefore);

    // Send MIDI Note On: C4 (60), velocity 127, channel 0
    printf("Sending Note On C4 vel=127 ch=0...\n");
    midiIn.clear();
    synthLib::SMidiEvent noteOn(synthLib::MidiEventSource::Host, 0x90, 60, 127);
    midiIn.push_back(noteOn);

    // Render 1 second of audio after the note
    float peakAfter = 0;
    int nonZeroBlocks = 0;
    for (int i = 0; i < 172; i++) {
        midiOut.clear();
        device->process(inputs, outputs, blockSize, midiIn, midiOut);
        midiIn.clear(); // Only send note on first block

        float blockPeak = 0;
        for (uint32_t s = 0; s < blockSize; s++) {
            float a = fabsf(outL[s]);
            if (a > blockPeak) blockPeak = a;
        }
        if (blockPeak > 0.001f) nonZeroBlocks++;
        if (blockPeak > peakAfter) peakAfter = blockPeak;

        if (i < 5 || (i % 50 == 0))
            printf("  Block %d: peak=%f midiOut=%zu\n", i, blockPeak, midiOut.size());
    }

    printf("\n=== RESULTS ===\n");
    printf("Peak before note: %f\n", peakBefore);
    printf("Peak after note:  %f\n", peakAfter);
    printf("Non-zero blocks:  %d / 172\n", nonZeroBlocks);

    if (peakAfter > 0.01f && nonZeroBlocks > 10)
        printf("VERDICT: MIDI NOTE PRODUCES AUDIO ✓\n");
    else if (peakAfter > 0.001f)
        printf("VERDICT: VERY QUIET AUDIO — patch may need configuration\n");
    else
        printf("VERDICT: NO AUDIO FROM NOTE — MIDI or patch issue ✗\n");

    return 0;
}
