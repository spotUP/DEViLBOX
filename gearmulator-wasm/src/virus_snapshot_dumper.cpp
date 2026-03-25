/**
 * virus_snapshot_dumper.cpp — Capture a fresh Virus B snapshot after full boot.
 *
 * Boots the Virus B device natively (with JIT for fast boot), lets it fully
 * initialize, sends a test note to verify MIDI works, then dumps the DSP
 * memory state as a C header file for the WASM build.
 *
 * Usage: ./virus_snapshot_dumper <romPath> <outputPath>
 */
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <vector>
#include <chrono>

#include "synthLib/device.h"
#include "synthLib/deviceTypes.h"
#include "synthLib/midiTypes.h"
#include "virusLib/device.h"

#include "dsp56kEmu/dsp.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/peripherals.h"
#include "dsp56kEmu/esai.h"
#include "dsp56kEmu/hdi08.h"
#include "dsp56kEmu/esaiclock.h"
#include "dsp56kEmu/timers.h"

// RLE block extraction — skip runs of zero
struct MemBlock
{
    uint32_t startAddr;
    std::vector<uint32_t> data;
};

static std::vector<MemBlock> extractBlocks(const dsp56k::Memory& mem, dsp56k::EMemArea area, uint32_t size)
{
    std::vector<MemBlock> blocks;
    MemBlock current;
    current.startAddr = 0;
    bool inBlock = false;

    for (uint32_t i = 0; i < size; ++i)
    {
        uint32_t val = mem.get(area, i);
        if (val != 0)
        {
            if (!inBlock)
            {
                current.startAddr = i;
                current.data.clear();
                inBlock = true;
            }
            current.data.push_back(val);
        }
        else
        {
            if (inBlock)
            {
                blocks.push_back(current);
                inBlock = false;
            }
        }
    }
    if (inBlock)
        blocks.push_back(current);

    return blocks;
}

static void writeBlocks(std::ofstream& out, const std::string& prefix,
                        const std::vector<MemBlock>& blocks)
{
    for (size_t i = 0; i < blocks.size(); ++i)
    {
        out << "static const uint32_t " << prefix << "_data_" << i << "[] = {\n    ";
        for (size_t j = 0; j < blocks[i].data.size(); ++j)
        {
            out << "0x" << std::hex << std::uppercase
                << std::setw(6) << std::setfill('0')
                << blocks[i].data[j];
            if (j + 1 < blocks[i].data.size()) out << ", ";
            if ((j + 1) % 8 == 0 && j + 1 < blocks[i].data.size()) out << "\n    ";
        }
        out << std::dec << "\n};\n\n";
    }

    out << "static const SnapshotMemBlock " << prefix << "blocks[] = {\n";
    for (size_t i = 0; i < blocks.size(); ++i)
    {
        out << "    { " << blocks[i].startAddr << ", " << blocks[i].data.size()
            << ", " << prefix << "_data_" << i << " },\n";
    }
    out << "};\n";
    out << "static const uint32_t " << prefix << "block_count = " << blocks.size() << ";\n\n";
}

static void writeRegisters(std::ofstream& out, const std::string& prefix,
                           const dsp56k::DSP& dsp)
{
    const auto& regs = dsp.readRegs();
    const auto* regsBytes = reinterpret_cast<const uint8_t*>(&regs);
    const size_t regsSize = sizeof(regs);

    out << "static const uint8_t " << prefix << "regs[] = {\n    ";
    for (size_t i = 0; i < regsSize; ++i)
    {
        out << "0x" << std::hex << std::uppercase
            << std::setw(2) << std::setfill('0')
            << static_cast<unsigned>(regsBytes[i]);
        if (i + 1 < regsSize) out << ", ";
        if ((i + 1) % 16 == 0 && i + 1 < regsSize) out << "\n    ";
    }
    out << std::dec << "\n};\n";
    out << "static const uint32_t " << prefix << "regs_size = " << regsSize << ";\n\n";
}

int main(int argc, char** argv)
{
    if (argc < 3)
    {
        fprintf(stderr, "Usage: %s <virusBRomPath> <outputPath.h>\n", argv[0]);
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
    fprintf(stderr, "ROM loaded: %zu bytes\n", romSize);

    // Create Virus B device (full boot with JIT)
    synthLib::DeviceCreateParams params;
    params.romData = romData;
    params.romName = "rom.bin";
    params.hostSamplerate = 44100.0f;
    params.preferredSamplerate = 44100.0f;
    params.customData = static_cast<uint32_t>(virusLib::DeviceModel::ABC);

    fprintf(stderr, "Creating Virus B device (full boot with JIT)...\n");
    auto t0 = std::chrono::steady_clock::now();
    auto device = std::make_unique<virusLib::Device>(params);
    auto t1 = std::chrono::steady_clock::now();
    auto bootMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();

    if (!device || !device->isValid())
    {
        fprintf(stderr, "Device creation failed!\n");
        return 1;
    }
    fprintf(stderr, "Device created in %lldms, sampleRate=%f\n", bootMs, device->getSamplerate());

    // Process enough audio to fully stabilize the DSP
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

    // Render 2 seconds to fully stabilize
    fprintf(stderr, "Rendering 2s of silence to stabilize DSP...\n");
    for (int i = 0; i < 344; i++) // 344 * 256 ≈ 88064 samples ≈ ~1.88s at 46875Hz
    {
        midiOut.clear();
        device->process(inputs, outputs, blockSize, midiIn, midiOut);
    }

    // === DUMP SNAPSHOT FROM CLEAN IDLE STATE ===
    // Capture BEFORE any MIDI — notes would contaminate DSP memory
    fprintf(stderr, "Dumping snapshot from clean idle state...\n");

    // Access DSP internals for snapshot dump
    auto* dspSingle = device->getDSP();
    auto& dsp = dspSingle->getDSP();
    auto& mem = dsp.memory();
    const uint32_t pSize = 0x40000;   // Virus B P memory: 256K words (see device.cpp line 543)
    const uint32_t xySize = 0x40000;  // Virus B X/Y memory: 256K words each

    std::ofstream out(argv[2]);
    if (!out.is_open())
    {
        fprintf(stderr, "Failed to open output: %s\n", argv[2]);
        return 1;
    }

    out << "// Auto-generated Virus B snapshot — do not edit\n";
    out << "// Created by virus_snapshot_dumper from fully-booted device state\n";
    out << "// Boot time: " << bootMs << "ms\n";
    out << "// ROM size: " << romSize << " bytes\n";
    out << "// Captured from clean idle state (JIT boot, 2s stabilization, no MIDI sent)\n";
    out << "#pragma once\n";
    out << "#include <cstdint>\n\n";
    out << "struct MemBlock { uint32_t startAddr; uint32_t count; const uint32_t* data; };\n\n";

    // Use RLE blocks — skip runs of zeros to reduce binary size (~80% is zero)
    auto dumpMemAreaRLE = [&](const char* prefix, dsp56k::EMemArea area, uint32_t size) {
        fprintf(stderr, "Extracting %s memory (%u words, RLE)...\n", prefix, size);
        auto blocks = extractBlocks(mem, area, size);

        uint32_t totalWords = 0;
        for (size_t i = 0; i < blocks.size(); ++i)
        {
            totalWords += blocks[i].data.size();
            out << "static const uint32_t virusb_" << prefix << "data_" << i << "[] = {\n    ";
            for (size_t j = 0; j < blocks[i].data.size(); ++j)
            {
                out << "0x" << std::hex << std::uppercase
                    << std::setw(6) << std::setfill('0')
                    << blocks[i].data[j];
                if (j + 1 < blocks[i].data.size()) out << ", ";
                if ((j + 1) % 8 == 0 && j + 1 < blocks[i].data.size()) out << "\n    ";
            }
            out << std::dec << "\n};\n\n";
        }

        out << "static const MemBlock virusb_" << prefix << "blocks[] = {\n";
        for (size_t i = 0; i < blocks.size(); ++i)
        {
            out << "    { " << blocks[i].startAddr << ", "
                << blocks[i].data.size() << ", virusb_"
                << prefix << "data_" << i << " },\n";
        }
        out << "};\n";
        out << "static const uint32_t virusb_" << prefix << "block_count = " << blocks.size() << ";\n\n";
        fprintf(stderr, "  %u non-zero words in %zu blocks / %u total\n", totalWords, blocks.size(), size);
    };

    dumpMemAreaRLE("p", dsp56k::MemArea_P, pSize);
    dumpMemAreaRLE("x", dsp56k::MemArea_X, xySize);
    dumpMemAreaRLE("y", dsp56k::MemArea_Y, xySize);

    fprintf(stderr, "Dumping registers...\n");
    writeRegisters(out, "virusb_", dsp);

    // === DUMP PERIPHERAL REGISTER VALUES ===
    // These are the ACTUAL values set by the JIT boot — use these in loadMemorySnapshot()
    {
        auto& periphX = dspSingle->getPeriphX();
        auto& esai = periphX.getEsai();
        auto& hdi08 = periphX.getHDI08();
        auto& timers = periphX.getTimers();
        auto& clock = periphX.getEsaiClock();

        fprintf(stderr, "\n=== PERIPHERAL REGISTERS (use these in loadMemorySnapshot) ===\n");
        fprintf(stderr, "ESAI TCCR = 0x%06X\n", esai.readTransmitClockControlRegister());
        fprintf(stderr, "ESAI RCCR = 0x%06X\n", esai.readReceiveClockControlRegister());
        fprintf(stderr, "ESAI TCR  = 0x%06X\n", esai.readTransmitControlRegister());
        fprintf(stderr, "ESAI RCR  = 0x%06X\n", esai.readReceiveControlRegister());
        fprintf(stderr, "HDI08 HCR  = 0x%06X\n", hdi08.readControlRegister());
        fprintf(stderr, "HDI08 HPCR = 0x%06X\n", hdi08.readPortControlRegister());
        fprintf(stderr, "PLL PCTL   = 0x%06X\n", clock.getPCTL());
        for (int t = 0; t < 3; ++t)
        {
            fprintf(stderr, "Timer%d TCSR=0x%06X TLR=0x%06X TCPR=0x%06X\n",
                    t, timers.readTCSR(t), timers.readTLR(t), timers.readTCPR(t));
        }
        fprintf(stderr, "=== END PERIPHERAL REGISTERS ===\n\n");

        // Write peripheral values into the snapshot header for loadMemorySnapshot() to use
        out << "\n// Peripheral register values captured from JIT boot\n";
        out << "static const uint32_t virusb_esai_tccr = 0x" << std::hex << std::uppercase
            << std::setw(6) << std::setfill('0') << esai.readTransmitClockControlRegister() << ";\n";
        out << "static const uint32_t virusb_esai_rccr = 0x"
            << std::setw(6) << std::setfill('0') << esai.readReceiveClockControlRegister() << ";\n";
        out << "static const uint32_t virusb_esai_tcr = 0x"
            << std::setw(6) << std::setfill('0') << esai.readTransmitControlRegister() << ";\n";
        out << "static const uint32_t virusb_esai_rcr = 0x"
            << std::setw(6) << std::setfill('0') << esai.readReceiveControlRegister() << ";\n";
        out << "static const uint32_t virusb_hdi08_hcr = 0x"
            << std::setw(6) << std::setfill('0') << hdi08.readControlRegister() << ";\n";
        out << "static const uint32_t virusb_hdi08_hpcr = 0x"
            << std::setw(6) << std::setfill('0') << hdi08.readPortControlRegister() << ";\n";
        out << "static const uint32_t virusb_pctl = 0x"
            << std::setw(6) << std::setfill('0') << clock.getPCTL() << ";\n";
        for (int t = 0; t < 3; ++t)
        {
            out << "static const uint32_t virusb_timer" << std::dec << t << "_tcsr = 0x" << std::hex
                << std::setw(6) << std::setfill('0') << timers.readTCSR(t) << ";\n";
            out << "static const uint32_t virusb_timer" << std::dec << t << "_tlr = 0x" << std::hex
                << std::setw(6) << std::setfill('0') << timers.readTLR(t) << ";\n";
            out << "static const uint32_t virusb_timer" << std::dec << t << "_tcpr = 0x" << std::hex
                << std::setw(6) << std::setfill('0') << timers.readTCPR(t) << ";\n";
        }
        out << std::dec;
    }

    out.close();

    // Report file size
    std::ifstream check(argv[2], std::ios::ate);
    auto fileSize = check.tellg();
    fprintf(stderr, "Snapshot written to: %s (%lld KB)\n", argv[2], static_cast<long long>(fileSize / 1024));

    // === VERIFY MIDI AFTER SNAPSHOT ===
    // The snapshot is already saved; this test just confirms the device works
    fprintf(stderr, "Verifying MIDI Note On produces audio...\n");
    midiIn.clear();
    synthLib::SMidiEvent noteOn(synthLib::MidiEventSource::Host, 0x90, 60, 127);
    midiIn.push_back(noteOn);

    float peakNote = 0;
    for (int i = 0; i < 50; i++)
    {
        midiOut.clear();
        device->process(inputs, outputs, blockSize, midiIn, midiOut);
        midiIn.clear();
        for (uint32_t s = 0; s < blockSize; s++)
        {
            float a = fabsf(outL[s]);
            if (a > peakNote) peakNote = a;
        }
    }
    fprintf(stderr, "MIDI note peak: %f %s\n", peakNote, peakNote > 0.01f ? "✓ OK" : "✗ SILENT!");

    return 0;
}
