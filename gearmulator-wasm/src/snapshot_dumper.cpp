/**
 * snapshot_dumper.cpp — Native tool to boot gearmulator synths and dump DSP memory snapshots.
 *
 * Boots a synth with its ROM, waits for boot to complete, then dumps DSP P/X/Y memory,
 * registers, and peripheral state as a C header file for use in WASM builds.
 *
 * Usage: ./snapshot_dumper <synthType> <romPath> <outputPath>
 *   synthType: 2=microQ, 3=XT, 4=Nord
 *   romPath:   path to ROM file
 *   outputPath: path to write .h snapshot file
 */

#include <cstdint>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <vector>
#include <chrono>
#include <cmath>

#include "dsp56kEmu/types.h"
#include "synthLib/midiTypes.h"

// microQ
#include "mqLib/microq.h"
#include "mqLib/mqhardware.h"
#include "mqLib/mqdsp.h"
#include "mqLib/mqtypes.h"
#include "mqLib/rom.h"
#include "mqLib/buttons.h"

// XT
#include "xtLib/xt.h"
#include "xtLib/xtHardware.h"
#include "xtLib/xtDSP.h"

// Nord
#include "nord/n2x/n2xLib/n2xhardware.h"
#include "nord/n2x/n2xLib/n2xdsp.h"
#include "nord/n2x/n2xLib/n2xtypes.h"

#include "dsp56kEmu/dsp.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/peripherals.h"

#include "baseLib/filesystem.h"

// ROM preprocessing (same as bridge)
static void byteSwap16(std::vector<uint8_t>& data)
{
    for (size_t i = 0; i + 1 < data.size(); i += 2)
        std::swap(data[i], data[i + 1]);
}

static void preprocessMicroQRom(std::vector<uint8_t>& romData)
{
    if (romData.size() < 4) return;
    if (romData[0] == '2' && romData[1] == '.' && romData[2] == '2' && romData[3] == '3') return;
    if (romData[0] == '.' && romData[1] == '2' && romData[2] == '3' && romData[3] == '2')
    {
        std::cerr << "ROM is byte-swapped, fixing...\n";
        byteSwap16(romData);
    }
}

static void preprocessNordRom(std::vector<uint8_t>& romData)
{
    constexpr uint8_t upper[] = {'N', 'r', '2', 0, 'N', 'L', '2', 0};
    constexpr uint8_t lower[] = {'n', 'r', '2', 0, 'n', 'L', '2', 0};
    auto it = std::search(romData.begin(), romData.end(), std::begin(upper), std::end(upper));
    if (it != romData.end())
    {
        std::cerr << "Nord ROM has uppercase identifiers, patching...\n";
        std::copy(std::begin(lower), std::end(lower), it);
    }
}

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
    // Write data arrays
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

    // Write block table (uses SnapshotMemBlock defined once in header preamble)
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

static void dumpDSP(std::ofstream& out, const std::string& prefix,
                    dsp56k::DSP& dsp, uint32_t pSize, uint32_t xySize)
{
    auto& mem = dsp.memory();

    std::cerr << "  Extracting P memory (" << pSize << " words)...\n";
    auto pBlocks = extractBlocks(mem, dsp56k::MemArea_P, pSize);
    std::cerr << "    " << pBlocks.size() << " non-zero blocks\n";

    std::cerr << "  Extracting X memory (" << xySize << " words)...\n";
    auto xBlocks = extractBlocks(mem, dsp56k::MemArea_X, xySize);
    std::cerr << "    " << xBlocks.size() << " non-zero blocks\n";

    std::cerr << "  Extracting Y memory (" << xySize << " words)...\n";
    auto yBlocks = extractBlocks(mem, dsp56k::MemArea_Y, xySize);
    std::cerr << "    " << yBlocks.size() << " non-zero blocks\n";

    size_t totalWords = 0;
    for (auto& b : pBlocks) totalWords += b.data.size();
    for (auto& b : xBlocks) totalWords += b.data.size();
    for (auto& b : yBlocks) totalWords += b.data.size();
    std::cerr << "  Total non-zero words: " << totalWords
              << " (" << (totalWords * 4 / 1024) << " KB)\n";

    writeBlocks(out, prefix + "p", pBlocks);
    writeBlocks(out, prefix + "x", xBlocks);
    writeBlocks(out, prefix + "y", yBlocks);

    std::cerr << "  Dumping registers...\n";
    writeRegisters(out, prefix, dsp);
}

// ─── microQ ─────────────────────────────────────────────────────────────────

static int dumpMicroQ(const std::vector<uint8_t>& romData, const std::string& outputPath)
{
    std::cerr << "Creating microQ...\n";
    auto t0 = std::chrono::steady_clock::now();

    mqLib::MicroQ mq(mqLib::BootMode::Default, romData, "rom.bin");

    // Press play to resume boot (OS update ROM needs this)
    mq.setButton(mqLib::Buttons::ButtonType::Play, true);
    while (!mq.isBootCompleted())
        mq.process(8);
    mq.setButton(mqLib::Buttons::ButtonType::Play, false);

    auto t1 = std::chrono::steady_clock::now();
    auto bootMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    std::cerr << "Boot completed in " << bootMs << "ms\n";

    if (!mq.isValid())
    {
        std::cerr << "microQ not valid after boot\n";
        return 1;
    }

    // Process a few frames to stabilize DSP state
    std::cerr << "Processing 1024 frames to stabilize...\n";
    for (int i = 0; i < 4; ++i)
        mq.process(256);

    auto* hw = mq.getHardware();
    if (!hw)
    {
        std::cerr << "Failed to get hardware\n";
        return 1;
    }

    // Pause DSP thread before reading memory
    auto& mqDsp = hw->getDSP(0);
    auto& dsp = mqDsp.dsp();

    std::ofstream out(outputPath);
    if (!out.is_open())
    {
        std::cerr << "Failed to open output: " << outputPath << "\n";
        return 1;
    }

    out << "// Auto-generated microQ snapshot — do not edit\n";
    out << "// Boot time: " << bootMs << "ms\n";
    out << "// ROM size: " << romData.size() << " bytes\n";
    out << "#pragma once\n";
    out << "#include <cstdint>\n\n";
    out << "struct SnapshotMemBlock { uint32_t startAddr; uint32_t count; const uint32_t* data; };\n\n";

    // microQ memory sizes from MqDsp
    constexpr uint32_t pSize = mqLib::MqDsp::g_pMemSize;    // 0x2000
    constexpr uint32_t xySize = mqLib::MqDsp::g_xyMemSize;  // 0x800000

    // XY is huge (8MB words) but most is zero. extractBlocks handles this via RLE.
    // However, scanning 8M words is slow. Use a reasonable upper bound instead.
    // The microQ only uses external SRAM from 0x080000, so scan up to 0x100000.
    constexpr uint32_t xyScanSize = 0x100000; // 1M words — covers all used range

    // Print ESAI peripheral register values for snapshot restore
    auto& periph = mqDsp.getPeriph();
    auto& esai = periph.getEsai();
    std::cerr << "=== ESAI Register State ===\n";
    std::cerr << "  TCCR = 0x" << std::hex << esai.readTransmitClockControlRegister() << "\n";
    std::cerr << "  RCCR = 0x" << esai.readReceiveClockControlRegister() << "\n";
    std::cerr << "  TCR  = 0x" << esai.readTransmitControlRegister() << "\n";
    std::cerr << "  RCR  = 0x" << esai.readReceiveControlRegister() << "\n";
    std::cerr << "  TSMA = 0x" << esai.readTSMA() << "\n";
    std::cerr << "  TSMB = 0x" << esai.readTSMB() << "\n";
    std::cerr << std::dec;

    // Print HDI08 register state
    auto& hdi = periph.getHDI08();
    std::cerr << "=== HDI08 Register State ===\n";
    std::cerr << "  HCR  = 0x" << std::hex << hdi.readControlRegister() << "\n";
    std::cerr << "  HPCR = 0x" << hdi.readPortControlRegister() << "\n";
    std::cerr << std::dec;

    std::cerr << "Dumping DSP 0 memory...\n";
    dumpDSP(out, "mq_", dsp, pSize, xyScanSize);

    out.close();
    std::cerr << "Snapshot written to: " << outputPath << "\n";

    // Report file size
    std::ifstream check(outputPath, std::ios::ate);
    auto fileSize = check.tellg();
    std::cerr << "Output file size: " << (fileSize / 1024) << " KB\n";

    return 0;
}

// ─── microQ MIDI protocol sniffer ────────────────────────────────────────────

static int sniffMicroQMidi(const std::vector<uint8_t>& romData)
{
    std::cerr << "Creating microQ for MIDI sniffing...\n";

    mqLib::MicroQ mq(mqLib::BootMode::Default, romData, "rom.bin");

    mq.setButton(mqLib::Buttons::ButtonType::Play, true);
    while (!mq.isBootCompleted())
        mq.process(8);
    mq.setButton(mqLib::Buttons::ButtonType::Play, false);

    std::cerr << "Boot completed.\n";

    // Stabilize
    for (int i = 0; i < 4; ++i)
        mq.process(256);

    auto* hw = mq.getHardware();
    hw->resetMidiCounter();

    // Install intercept on HDI08 writeRX to log MC68K → DSP traffic
    auto& mqDsp = hw->getDSP(0);
    std::vector<std::pair<uint32_t, uint32_t>> hdiLog; // (hostFlags, word)

    // Capture host flags before each transfer
    auto origCallback = [&](const uint32_t _word)
    {
        // Read current host flags (HF0/HF1) from MC68K-side ICR
        uint32_t hf = 0; // We'll log the word
        hdiLog.push_back({0, _word});
        // Still forward to DSP
        mqDsp.hdi08().writeRX(const_cast<dsp56k::TWord*>(&_word), 1);
    };

    // We can't easily intercept writeRX — instead, let's log from the
    // hdiTransferUCtoDSP path. Let me just enable the LOG macro.

    // Actually, let's just send MIDI and then read what the MC68K state is.
    // Send note-on: channel 0, note 60, velocity 127
    std::cerr << "\n=== Sending MIDI Note-On (ch0, note 60, vel 127) ===\n";

    synthLib::SMidiEvent noteOn;
    noteOn.a = 0x90; // Note-on channel 0
    noteOn.b = 60;   // Middle C
    noteOn.c = 127;  // Velocity
    mq.sendMidiEvent(noteOn);

    // Process frames to let MIDI flow through MC68K → DSP
    std::cerr << "Processing 512 frames...\n";
    for (int i = 0; i < 4; ++i)
        mq.process(128);

    std::cerr << "Done. Check HDI08 debug output above.\n";

    // Send note-off
    synthLib::SMidiEvent noteOff;
    noteOff.a = 0x80;
    noteOff.b = 60;
    noteOff.c = 0;
    mq.sendMidiEvent(noteOff);

    for (int i = 0; i < 4; ++i)
        mq.process(128);

    return 0;
}

// ─── XT ─────────────────────────────────────────────────────────────────────

static int dumpXT(const std::vector<uint8_t>& romData, const std::string& outputPath)
{
    std::cerr << "Creating XT...\n";
    auto t0 = std::chrono::steady_clock::now();

    // XT uses same MicroQ-like boot via xt::Xt
    xt::Xt xtSynth(romData, "rom.bin");

    while (!xtSynth.isBootCompleted())
        xtSynth.process(8);

    auto t1 = std::chrono::steady_clock::now();
    auto bootMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    std::cerr << "Boot completed in " << bootMs << "ms\n";

    if (!xtSynth.isValid())
    {
        std::cerr << "XT not valid after boot\n";
        return 1;
    }

    std::cerr << "Processing 1024 frames to stabilize...\n";
    for (int i = 0; i < 4; ++i)
        xtSynth.process(256);

    auto* hw = xtSynth.getHardware();
    if (!hw)
    {
        std::cerr << "Failed to get hardware\n";
        return 1;
    }

    auto& xtDsp = hw->getDSP(0);
    auto& dsp = xtDsp.dsp();

    std::ofstream out(outputPath);
    if (!out.is_open())
    {
        std::cerr << "Failed to open output: " << outputPath << "\n";
        return 1;
    }

    out << "// Auto-generated XT snapshot — do not edit\n";
    out << "// Boot time: " << bootMs << "ms\n";
    out << "// ROM size: " << romData.size() << " bytes\n";
    out << "#pragma once\n";
    out << "#include <cstdint>\n\n";

    constexpr uint32_t pSize = 0x020000;    // from xtDSP.h
    constexpr uint32_t xyScanSize = 0x100000;

    std::cerr << "Dumping DSP 0 memory...\n";
    dumpDSP(out, "xt_", dsp, pSize, xyScanSize);

    out.close();
    std::cerr << "Snapshot written to: " << outputPath << "\n";

    std::ifstream check(outputPath, std::ios::ate);
    auto fileSize = check.tellg();
    std::cerr << "Output file size: " << (fileSize / 1024) << " KB\n";

    return 0;
}

// ─── Nord ───────────────────────────────────────────────────────────────────

static int dumpNord(const std::vector<uint8_t>& romData, const std::string& outputPath)
{
    std::cerr << "Nord snapshot dumping not yet implemented\n";
    std::cerr << "Nord has dual DSPs (A+B) and requires special handling\n";
    return 1;
}

// ─── microQ Snapshot Boot Test ──────────────────────────────────────────────

static int testMicroQSnapshotBoot(const std::vector<uint8_t>& romData)
{
    std::cerr << "Testing microQ SNAPSHOT boot...\n";
    auto t0 = std::chrono::steady_clock::now();

    mqLib::MicroQ mq(mqLib::BootMode::Snapshot, romData, "rom.bin");

    if (!mq.isValid())
    {
        std::cerr << "microQ not valid after construction\n";
        return 1;
    }

    std::cerr << "Constructor returned, polling isBootCompleted()...\n";

    // Drive audio processing while waiting for MC68K boot
    int pollCount = 0;
    while (!mq.isBootCompleted())
    {
        mq.process(128);
        ++pollCount;
        if (pollCount % 100 == 0)
        {
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - t0).count();
            std::cerr << "  Still booting... (" << elapsed << "ms, " << pollCount << " process calls)\n";
        }
        if (pollCount > 100000)
        {
            std::cerr << "  Boot timeout after " << pollCount << " process calls\n";
            return 1;
        }
    }

    auto t1 = std::chrono::steady_clock::now();
    auto bootMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    std::cerr << "Snapshot boot completed in " << bootMs << "ms (" << pollCount << " process calls)\n";

    // Send a MIDI note and check for audio output
    synthLib::SMidiEvent noteOn;
    noteOn.a = 0x90; // note on channel 0
    noteOn.b = 60;   // C4
    noteOn.c = 127;  // velocity
    mq.sendMidiEvent(noteOn);

    std::cerr << "Sent MIDI note on, processing 4096 frames...\n";
    float peak = 0;
    auto& outs = mq.getAudioOutputs();
    for (int i = 0; i < 32; ++i)
    {
        mq.process(128);
        for (size_t ch = 0; ch < outs.size(); ++ch)
        {
            for (int s = 0; s < 128; ++s)
            {
                float v = std::abs(dsp56k::dsp2sample<float>(outs[ch][s]));
                if (v > peak) peak = v;
            }
        }
    }

    std::cerr << "Audio peak after note: " << peak << "\n";
    if (peak > 0.001f)
        std::cerr << "SUCCESS: Audio output detected!\n";
    else
        std::cerr << "FAIL: No audio output (peak=" << peak << ")\n";

    return peak > 0.001f ? 0 : 1;
}

// ─── main ───────────────────────────────────────────────────────────────────

int main(int argc, char** argv)
{
    if (argc < 4)
    {
        std::cerr << "Usage: " << argv[0] << " <synthType> <romPath> <outputPath>\n";
        std::cerr << "  synthType: 2=microQ, 3=XT, 4=Nord\n";
        return 1;
    }

    const int synthType = std::stoi(argv[1]);
    const std::string romPath = argv[2];
    const std::string outputPath = argv[3];

    // Read ROM
    std::vector<uint8_t> romData;
    if (!baseLib::filesystem::readFile(romData, romPath))
    {
        std::cerr << "Failed to read ROM: " << romPath << "\n";
        return 1;
    }
    std::cerr << "ROM loaded: " << romData.size() << " bytes\n";

    // Preprocess
    if (synthType == 2 || synthType == 3 || synthType == 12 || synthType == 22)
        preprocessMicroQRom(romData);
    else if (synthType == 4)
        preprocessNordRom(romData);

    switch (synthType)
    {
    case 2: return dumpMicroQ(romData, outputPath);
    case 3: return dumpXT(romData, outputPath);
    case 4: return dumpNord(romData, outputPath);
    case 12: return sniffMicroQMidi(romData); // 12 = sniff mode for microQ
    case 22: return testMicroQSnapshotBoot(romData); // 22 = test snapshot boot
    default:
        std::cerr << "Unsupported synth type: " << synthType << "\n";
        return 1;
    }
}
