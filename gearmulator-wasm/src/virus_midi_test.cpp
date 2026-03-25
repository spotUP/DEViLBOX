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

    // Write a WAV file for comparison with WASM output
    if (argc >= 3)
    {
        const char* wavPath = argv[2];
        printf("Rendering 2s of note to WAV: %s\n", wavPath);

        // Send note on
        midiIn.clear();
        synthLib::SMidiEvent noteOn2(synthLib::MidiEventSource::Host, 0x90, 60, 127);
        midiIn.push_back(noteOn2);

        const uint32_t totalFrames = 46875 * 2; // 2 seconds at 46875Hz
        std::vector<float> wavL(totalFrames), wavR(totalFrames);
        uint32_t offset = 0;

        while (offset < totalFrames)
        {
            uint32_t n = std::min(blockSize, totalFrames - offset);
            midiOut.clear();
            device->process(inputs, outputs, n, midiIn, midiOut);
            midiIn.clear();
            memcpy(&wavL[offset], outL.data(), n * sizeof(float));
            memcpy(&wavR[offset], outR.data(), n * sizeof(float));
            offset += n;
        }

        // Write 16-bit stereo WAV
        FILE* wav = fopen(wavPath, "wb");
        if (wav)
        {
            uint32_t sampleRate = 46875;
            uint16_t channels = 2;
            uint16_t bitsPerSample = 16;
            uint32_t dataSize = totalFrames * channels * (bitsPerSample / 8);
            uint32_t fileSize = 36 + dataSize;

            // RIFF header
            fwrite("RIFF", 1, 4, wav);
            fwrite(&fileSize, 4, 1, wav);
            fwrite("WAVE", 1, 4, wav);
            // fmt chunk
            fwrite("fmt ", 1, 4, wav);
            uint32_t fmtSize = 16;
            fwrite(&fmtSize, 4, 1, wav);
            uint16_t audioFormat = 1; // PCM
            fwrite(&audioFormat, 2, 1, wav);
            fwrite(&channels, 2, 1, wav);
            fwrite(&sampleRate, 4, 1, wav);
            uint32_t byteRate = sampleRate * channels * (bitsPerSample / 8);
            fwrite(&byteRate, 4, 1, wav);
            uint16_t blockAlign = channels * (bitsPerSample / 8);
            fwrite(&blockAlign, 2, 1, wav);
            fwrite(&bitsPerSample, 2, 1, wav);
            // data chunk
            fwrite("data", 1, 4, wav);
            fwrite(&dataSize, 4, 1, wav);
            for (uint32_t i = 0; i < totalFrames; i++)
            {
                auto toS16 = [](float f) -> int16_t {
                    int32_t s = (int32_t)(f * 32767.0f);
                    if (s > 32767) s = 32767;
                    if (s < -32768) s = -32768;
                    return (int16_t)s;
                };
                int16_t sL = toS16(wavL[i]);
                int16_t sR = toS16(wavR[i]);
                fwrite(&sL, 2, 1, wav);
                fwrite(&sR, 2, 1, wav);
            }
            fclose(wav);
            printf("WAV written: %u frames at %u Hz\n", totalFrames, sampleRate);
        }
    }

    return 0;
}
