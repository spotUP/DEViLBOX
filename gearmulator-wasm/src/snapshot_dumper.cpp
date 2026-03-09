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
#include "mqLib/mqstate.h"

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

#include "mc68k/peripheralBase.h"
#include "mc68k/hdi08.h"

#include "baseLib/filesystem.h"
#include "dsp56kBase/logging.h"

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
    uint64_t bootLoops = 0;
    while (!mq.isBootCompleted())
    {
        mq.process(64);  // larger batch size, matches mqPerformanceTest
        ++bootLoops;
        if (bootLoops % 10000 == 0)
        {
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::steady_clock::now() - t0).count();
            std::cerr << "  Boot progress: " << elapsed << "s, " << bootLoops << " loops\n";
            if (elapsed > 600)  // 10 minute timeout
            {
                std::cerr << "ERROR: Boot timeout after " << elapsed << "s\n";
                // Still dump DMA state even if boot didn't complete
                auto* hw = mq.getHardware();
                if (hw)
                {
                    auto& periph = hw->getDSP(0).getPeriph();
                    auto& dma = periph.getDMA();
                    std::cerr << "=== DMA Register State (timeout) ===\n";
                    for (int ch = 0; ch < 6; ++ch)
                    {
                        auto dcr = dma.getDCR(ch);
                        auto dco = dma.getDCO(ch);
                        auto ddr = dma.getDDR(ch);
                        auto dsr = dma.getDSR(ch);
                        std::cerr << "  CH" << ch << ": DCR=0x" << std::hex << dcr
                                  << " DCO=0x" << dco
                                  << " DDR=0x" << ddr
                                  << " DSR=0x" << dsr << "\n";
                    }
                    std::cerr << "  DSTR=0x" << std::hex << dma.getDSTR() << "\n";
                    std::cerr << std::dec;
                }
                return 1;
            }
        }
    }
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

    // Print DMA register state for all 6 channels
    auto& dma = periph.getDMA();
    std::cerr << "=== DMA Register State ===\n";
    for (int ch = 0; ch < 6; ++ch)
    {
        auto dcr = dma.getDCR(ch);
        auto dco = dma.getDCO(ch);
        auto ddr = dma.getDDR(ch);
        auto dsr = dma.getDSR(ch);
        // Only print channels that appear configured (DCR non-zero)
        if (dcr || dco || ddr || dsr)
        {
            std::cerr << "  CH" << ch << ": DCR=0x" << std::hex << dcr
                      << " DCO=0x" << dco
                      << " DDR=0x" << ddr
                      << " DSR=0x" << dsr << "\n";
        }
    }
    std::cerr << "  DSTR=0x" << std::hex << dma.getDSTR() << "\n";
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
    auto* hw = mq.getHardware();
    auto& mqDsp = hw->getDSP(0);
    auto& dsp = mqDsp.dsp();

    int pollCount = 0;
    while (!mq.isBootCompleted())
    {
        mq.process(128);
        ++pollCount;
        if (pollCount % 500 == 0)
        {
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - t0).count();
            auto& esai = mqDsp.getPeriph().getEsai();
            std::cerr << "  Still booting... (" << elapsed << "ms, " << pollCount << " calls)"
                      << " dsp_instr=" << dsp.getInstructionCounter()
                      << " dsp_pc=0x" << std::hex << dsp.readRegs().pc.var << std::dec
                      << " esai_in=" << esai.getAudioInputs().size()
                      << " esai_out=" << esai.getAudioOutputs().size()
                      << "\n";
        }
        if (pollCount > 100000)
        {
            std::cerr << "  Boot timeout after " << pollCount << " process calls\n";
            // Print final diagnostics
            auto& esai = mqDsp.getPeriph().getEsai();
            std::cerr << "  Final: dsp_instr=" << dsp.getInstructionCounter()
                      << " dsp_pc=0x" << std::hex << dsp.readRegs().pc.var << std::dec
                      << " esai_in=" << esai.getAudioInputs().size()
                      << " esai_out=" << esai.getAudioOutputs().size()
                      << "\n";
            return 1;
        }
    }

    auto t1 = std::chrono::steady_clock::now();
    auto bootMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    std::cerr << "Snapshot boot completed in " << bootMs << "ms (" << pollCount << " process calls)\n";

    // Let MC68K finish patch dump to DSP (takes several seconds)
    auto& outs = mq.getAudioOutputs();
    std::cerr << "Processing 10 seconds to let MC68K finish patch dump...\n";
    for (int sec = 0; sec < 10; ++sec)
    {
        for (int i = 0; i < 345; ++i)
            mq.process(128);
        std::cerr << "  " << (sec+1) << "s: dsp_instr=" << dsp.getInstructionCounter() << "\n";
    }

    // Now send MIDI note
    synthLib::SMidiEvent noteOn;
    noteOn.a = 0x90;
    noteOn.b = 60;
    noteOn.c = 127;
    mq.sendMidiEvent(noteOn);
    std::cerr << "Sent MIDI note-on, processing 2 seconds...\n";

    float peak = 0;
    for (int sec = 0; sec < 2; ++sec)
    {
        for (int i = 0; i < 345; ++i)
        {
            mq.process(128);
            for (size_t ch = 0; ch < outs.size(); ++ch)
                for (int s = 0; s < 128; ++s)
                {
                    float v = std::abs(dsp56k::dsp2sample<float>(outs[ch][s]));
                    if (v > peak) peak = v;
                }
        }
        std::cerr << "  " << (sec+1) << "s: peak=" << peak << "\n";
    }

    std::cerr << "Audio peak after note: " << peak << "\n";
    if (peak > 0.001f)
        std::cerr << "SUCCESS: Audio output detected!\n";
    else
        std::cerr << "FAIL: No audio output (peak=" << peak << ")\n";

    return peak > 0.001f ? 0 : 1;
}

// ─── Helper: write byte array to C header ────────────────────────────────────

static void writeByteArray(std::ofstream& out, const std::string& name,
                           const uint8_t* data, size_t size)
{
    out << "static const uint8_t " << name << "[] = {\n    ";
    for (size_t i = 0; i < size; ++i)
    {
        out << "0x" << std::hex << std::uppercase
            << std::setw(2) << std::setfill('0')
            << static_cast<unsigned>(data[i]);
        if (i + 1 < size) out << ", ";
        if ((i + 1) % 16 == 0 && i + 1 < size) out << "\n    ";
    }
    out << std::dec << "\n};\n";
    out << "static const uint32_t " << name << "_size = " << size << ";\n\n";
}

// ─── microQ Full System Snapshot ─────────────────────────────────────────────
// Mode 32: Full boot → verify audio → dump DSP + MC68K state

static int dumpMicroQFullSnapshot(const std::vector<uint8_t>& romData, const std::string& outputPath)
{
    std::cerr << "=== FULL SYSTEM SNAPSHOT — microQ ===\n";
    std::cerr << "Booting normally (this takes ~30 min with JIT for microQ)...\n";
    auto t0 = std::chrono::steady_clock::now();

    mqLib::MicroQ mq(mqLib::BootMode::Default, romData, "rom.bin");

    mq.setButton(mqLib::Buttons::ButtonType::Play, true);
    uint64_t bootLoops = 0;
    while (!mq.isBootCompleted())
    {
        mq.process(64);
        ++bootLoops;
        if (bootLoops % 10000 == 0)
        {
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::steady_clock::now() - t0).count();
            std::cerr << "  Boot progress: " << elapsed << "s\n";
            if (elapsed > 3600)
            {
                std::cerr << "ERROR: Boot timeout (60 min)\n";
                return 1;
            }
        }
    }
    mq.setButton(mqLib::Buttons::ButtonType::Play, false);

    auto t1 = std::chrono::steady_clock::now();
    auto bootMs = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    std::cerr << "Boot completed in " << bootMs << "ms\n";

    // Dump DMA register state after boot
    {
        auto& dma = mq.getHardware()->getDSP(0).getPeriph().getDMA();
        auto& hdi = mq.getHardware()->getDSP(0).getPeriph().getHDI08();
        auto& esai = mq.getHardware()->getDSP(0).getPeriph().getEsai();
        std::cerr << "=== Post-boot peripheral state ===\n";
        std::cerr << "  HDI08 HCR=0x" << std::hex << hdi.readControlRegister()
                  << " HPCR=0x" << hdi.readPortControlRegister() << std::dec << "\n";
        std::cerr << "  ESAI TCR=0x" << std::hex << esai.readTransmitControlRegister()
                  << " TCCR=0x" << esai.readTransmitClockControlRegister() << std::dec << "\n";
        for (int ch = 0; ch < 6; ++ch)
        {
            auto dcr = dma.getDCR(ch);
            if (dcr == 0) continue;  // skip unconfigured channels
            fprintf(stderr, "  DMA CH%d: DCR=0x%06X DSR=0x%06X DDR=0x%06X DCO=0x%06X\n",
                ch, dcr, dma.getDSR(ch), dma.getDDR(ch), dma.getDCO(ch));
        }
        std::cerr << "=================================\n";
    }

    // Initialize state (like device.cpp does) — loads preset/instrument selection
    std::cerr << "Initializing synth state (createInitState)...\n";
    mqLib::State state(mq);
    state.createInitState();

    auto* hwInit = mq.getHardware();
    hwInit->resetMidiCounter();
    std::cerr << "State initialized.\n";

    // Stabilize: process several seconds of audio
    std::cerr << "Stabilizing (5 seconds)...\n";
    auto* hwDbg = mq.getHardware();
    auto& esaiDbg = hwDbg->getDSP(0).getPeriph().getEsai();
    std::cerr << "  ESAI output queue before stabilize: " << esaiDbg.getAudioOutputs().size() << "\n";
    for (int sec = 0; sec < 5; ++sec)
    {
        for (int i = 0; i < 345; ++i)
            mq.process(128);
        std::cerr << "  After sec " << sec << ": esaiOutputQ=" << esaiDbg.getAudioOutputs().size() << "\n";
    }

    // Check raw ESAI frame index
    std::cerr << "ESAI frame index after stabilize: " << hwDbg->getEsaiFrameIndex() << "\n";

    // Diagnostic: check raw ESAI output queue data for non-zero values
    {
        auto& esaiQ = esaiDbg.getAudioOutputs();
        std::cerr << "  ESAI output queue size: " << esaiQ.size() << "\n";
        if (!esaiQ.empty())
        {
            // Peek at the front frame — it's a Slot (std::array<TWord, channelCount>)
            const auto& front = esaiQ.front();
            std::cerr << "  ESAI front frame:";
            // Access raw data through pointer to avoid type issues
            const auto* rawPtr = reinterpret_cast<const uint32_t*>(&front);
            for (size_t i = 0; i < 6; ++i)
                fprintf(stderr, " 0x%06X", rawPtr[i]);
            std::cerr << "\n";
        }
    }

    // Diagnostic: check m_audioOutputs raw values after one process call
    {
        auto& outs = mq.getAudioOutputs();
        std::cerr << "  audioOutputs channel count: " << outs.size() << "\n";
        mq.process(128);
        std::cerr << "  After process(128), audioOutputs[0].size()=" << outs[0].size() << "\n";
        uint32_t nz = 0;
        for (size_t ch = 0; ch < outs.size(); ++ch)
            for (size_t s = 0; s < outs[ch].size() && s < 128; ++s)
                if (outs[ch][s] != 0) ++nz;
        std::cerr << "  Raw non-zero DSP words in audioOutputs: " << nz << "\n";
        if (nz > 0)
        {
            // Print first non-zero value
            for (size_t ch = 0; ch < outs.size(); ++ch)
                for (size_t s = 0; s < outs[ch].size() && s < 128; ++s)
                    if (outs[ch][s] != 0)
                    {
                        std::cerr << "    First non-zero: ch=" << ch << " s=" << s << " val=0x" << std::hex << outs[ch][s] << std::dec
                                  << " float=" << dsp56k::dsp2sample<float>(outs[ch][s]) << "\n";
                        goto done_nz;
                    }
            done_nz:;
        }
    }

    // Approach 1: Try demo mode playback (proven to work in mqPerformanceTest)
    std::cerr << "Trying demo mode playback (Multimode+Peek buttons)...\n";
    mq.setButton(mqLib::Buttons::ButtonType::Multimode, true);
    for (int i = 0; i < 500; ++i) mq.process(64);
    mq.setButton(mqLib::Buttons::ButtonType::Peek, true);
    for (int i = 0; i < 500; ++i) mq.process(64);
    mq.setButton(mqLib::Buttons::ButtonType::Peek, false);
    mq.setButton(mqLib::Buttons::ButtonType::Multimode, false);
    for (int i = 0; i < 500; ++i) mq.process(64);
    mq.setButton(mqLib::Buttons::ButtonType::Play, true);
    for (int i = 0; i < 500; ++i) mq.process(64);

    // Check audio from demo mode
    {
        auto& outs = mq.getAudioOutputs();
        float demoPeak = 0;
        uint32_t demoNz = 0;
        for (int sec = 0; sec < 5; ++sec)
        {
            for (int i = 0; i < 345; ++i)
            {
                mq.process(128);
                for (size_t ch = 0; ch < outs.size(); ++ch)
                    for (int s = 0; s < 128; ++s)
                    {
                        if (outs[ch][s] != 0) ++demoNz;
                        float v = std::abs(dsp56k::dsp2sample<float>(outs[ch][s]));
                        if (v > demoPeak) demoPeak = v;
                    }
            }
            std::cerr << "  Demo sec " << sec << ": peak=" << demoPeak << " nonZeroDSPWords=" << demoNz << "\n";
        }
        mq.setButton(mqLib::Buttons::ButtonType::Play, false);

        if (demoPeak >= 0.001f)
        {
            std::cerr << "Demo mode audio verified: peak=" << demoPeak << "\n";
            // Process a bit more to let it settle
            for (int i = 0; i < 345; ++i) mq.process(128);
            goto audio_ok;
        }
        std::cerr << "Demo mode also silent.\n";
    }

    // Approach 2: Try MIDI note-on on all 16 channels
    std::cerr << "Trying MIDI note-on on all 16 channels...\n";
    for (int ch = 0; ch < 16; ++ch)
    {
        synthLib::SMidiEvent noteOn;
        noteOn.a = static_cast<uint8_t>(0x90 | ch);
        noteOn.b = 60;
        noteOn.c = 127;
        mq.sendMidiEvent(noteOn);
    }

    {
        auto& outs = mq.getAudioOutputs();
        float peak = 0;
        uint32_t nonZeroSamples = 0;
        for (int sec = 0; sec < 3; ++sec)
        {
            for (int i = 0; i < 345; ++i)
            {
                mq.process(128);
                for (size_t ch = 0; ch < outs.size(); ++ch)
                    for (int s = 0; s < 128; ++s)
                    {
                        if (outs[ch][s] != 0) ++nonZeroSamples;
                        float v = std::abs(dsp56k::dsp2sample<float>(outs[ch][s]));
                        if (v > peak) peak = v;
                    }
            }
            std::cerr << "  MIDI all-ch sec " << sec << ": peak=" << peak << " nonZeroDSPWords=" << nonZeroSamples << "\n";
        }

        // Stop all notes
        for (int ch = 0; ch < 16; ++ch)
        {
            synthLib::SMidiEvent noteOff;
            noteOff.a = static_cast<uint8_t>(0x80 | ch);
            noteOff.b = 60;
            noteOff.c = 0;
            mq.sendMidiEvent(noteOff);
        }
        for (int i = 0; i < 345; ++i) mq.process(128);

        if (peak >= 0.001f)
        {
            std::cerr << "MIDI audio verified: peak=" << peak << "\n";
            goto audio_ok;
        }
    }

    std::cerr << "ERROR: No audio output from any method. Cannot create snapshot.\n";
    return 1;

audio_ok:

    // Now pause everything and take the snapshot
    auto* hw = mq.getHardware();
    if (!hw)
    {
        std::cerr << "Failed to get hardware\n";
        return 1;
    }

    auto& mqDsp = hw->getDSP(0);
    auto& dsp = mqDsp.dsp();
    auto& uc = hw->getUC();

    // Open output file
    std::ofstream out(outputPath);
    if (!out.is_open())
    {
        std::cerr << "Failed to open output: " << outputPath << "\n";
        return 1;
    }

    out << "// Auto-generated microQ FULL SYSTEM snapshot — do not edit\n";
    out << "// Boot time: " << bootMs << "ms\n";
    out << "// ROM size: " << romData.size() << " bytes\n";
    out << "// Audio: verified\n";
    out << "#pragma once\n";
    out << "#include <cstdint>\n\n";
    out << "#define MQ_FULL_SNAPSHOT 1\n\n";
    out << "struct SnapshotMemBlock { uint32_t startAddr; uint32_t count; const uint32_t* data; };\n\n";

    // ─── DSP State ───────────────────────────────────────────────────────
    std::cerr << "Dumping DSP state...\n";
    constexpr uint32_t pSize = mqLib::MqDsp::g_pMemSize;    // 0x2000
    constexpr uint32_t xyScanSize = 0x100000;

    dumpDSP(out, "mq_", dsp, pSize, xyScanSize);

    // DSP peripheral state (ESAI, HDI08, DMA)
    auto& periph = mqDsp.getPeriph();
    auto& esai = periph.getEsai();
    auto& hdi = periph.getHDI08();
    auto& dma = periph.getDMA();

    out << "// DSP ESAI register values\n";
    out << "static const uint32_t mq_esai_tccr = 0x" << std::hex << esai.readTransmitClockControlRegister() << ";\n";
    out << "static const uint32_t mq_esai_rccr = 0x" << esai.readReceiveClockControlRegister() << ";\n";
    out << "static const uint32_t mq_esai_tcr  = 0x" << esai.readTransmitControlRegister() << ";\n";
    out << "static const uint32_t mq_esai_rcr  = 0x" << esai.readReceiveControlRegister() << ";\n";
    out << "static const uint32_t mq_esai_tsma = 0x" << esai.readTSMA() << ";\n";
    out << "static const uint32_t mq_esai_tsmb = 0x" << esai.readTSMB() << ";\n";
    out << std::dec << "\n";

    out << "// DSP HDI08 register values\n";
    out << "static const uint32_t mq_hdi08_hcr  = 0x" << std::hex << hdi.readControlRegister() << ";\n";
    out << "static const uint32_t mq_hdi08_hpcr = 0x" << hdi.readPortControlRegister() << ";\n";
    out << std::dec << "\n";

    out << "// DSP DMA register values\n";
    for (int ch = 0; ch < 6; ++ch)
    {
        auto dcr = dma.getDCR(ch);
        auto dco = dma.getDCO(ch);
        auto ddr = dma.getDDR(ch);
        auto dsr = dma.getDSR(ch);
        out << "static const uint32_t mq_dma_ch" << ch << "_dcr = 0x" << std::hex << dcr << ";\n";
        out << "static const uint32_t mq_dma_ch" << ch << "_dco = 0x" << std::hex << dco << ";\n";
        out << "static const uint32_t mq_dma_ch" << ch << "_ddr = 0x" << std::hex << ddr << ";\n";
        out << "static const uint32_t mq_dma_ch" << ch << "_dsr = 0x" << std::hex << dsr << ";\n";
    }
    out << std::dec << "\n";

    // ─── MC68K State ─────────────────────────────────────────────────────
    std::cerr << "Dumping MC68K state...\n";

    // CPU state (600 bytes — Musashi core state including all registers)
    writeByteArray(out, "mq_cpu_state", uc.getCpuStateBuf(), mc68k::Mc68k::CpuStateSize);

    // CPU cycle counter
    out << "static const uint64_t mq_cpu_cycles = " << uc.getCycles() << "ULL;\n\n";

    // RAM (256KB)
    std::cerr << "  RAM: " << uc.getMemory().size() << " bytes\n";
    writeByteArray(out, "mq_ram", uc.getMemory().data(), uc.getMemory().size());

    // ROM runtime data (flash state — may differ from original ROM)
    std::cerr << "  ROM runtime: " << uc.getRomRuntimeData().size() << " bytes\n";
    // Check if it differs from original ROM
    bool romDiffers = (uc.getRomRuntimeData().size() != romData.size()) ||
        std::memcmp(uc.getRomRuntimeData().data(), romData.data(),
                    std::min(uc.getRomRuntimeData().size(), romData.size())) != 0;
    out << "static const bool mq_rom_modified = " << (romDiffers ? "true" : "false") << ";\n";
    if (romDiffers)
    {
        std::cerr << "  ROM was modified during boot (flash writes)\n";
        writeByteArray(out, "mq_rom_runtime", uc.getRomRuntimeData().data(), uc.getRomRuntimeData().size());
    }
    else
    {
        std::cerr << "  ROM unchanged — will use original ROM on restore\n";
        out << "static const uint8_t* mq_rom_runtime = nullptr;\n";
        out << "static const uint32_t mq_rom_runtime_size = 0;\n\n";
    }

    // MC68K peripheral register buffers
    std::cerr << "  Peripheral registers...\n";
    auto& gpt = uc.getGPT();
    auto& sim = uc.getSim();
    auto& qsm = uc.getQSM();

    writeByteArray(out, "mq_gpt_regs", gpt.getBufferData(), gpt.getBufferSize());
    writeByteArray(out, "mq_sim_regs", sim.getBufferData(), sim.getBufferSize());
    writeByteArray(out, "mq_qsm_regs", qsm.getBufferData(), qsm.getBufferSize());

    // Port state
    out << "// MC68K Port state\n";
    out << "static const uint8_t mq_port_e_dir = 0x" << std::hex
        << static_cast<unsigned>(uc.getPortE().getDirection()) << ";\n";
    out << "static const uint8_t mq_port_f_dir = 0x"
        << static_cast<unsigned>(uc.getPortF().getDirection()) << ";\n";
    out << "static const uint8_t mq_port_gp_dir = 0x"
        << static_cast<unsigned>(uc.getPortGP().getDirection()) << ";\n";
    out << "static const uint8_t mq_port_qs_dir = 0x"
        << static_cast<unsigned>(uc.getPortQS().getDirection()) << ";\n";
    out << std::dec << "\n";

    // HDI08 (MC68K side) register state
    auto& hdi08a = uc.getHdi08A().getHdi08();
    writeByteArray(out, "mq_uc_hdi08a_regs", hdi08a.getBufferData(), hdi08a.getBufferSize());

    // Boot flags
    out << "// Boot state flags\n";
    out << "static const bool mq_boot_completed = " << (hw->isBootCompleted() ? "true" : "false") << ";\n";
    out << "static const uint32_t mq_esai_frame_index = " << hw->getEsaiFrameIndex() << ";\n";
    out << "static const bool mq_dsp_reset_request = " << (uc.getDspResetRequest() ? "true" : "false") << ";\n";
    out << "static const bool mq_dsp_reset_completed = " << (uc.getDspResetCompleted() ? "true" : "false") << ";\n\n";

    out.close();

    // Report
    std::ifstream check(outputPath, std::ios::ate);
    auto fileSize = check.tellg();
    std::cerr << "\nFull system snapshot written to: " << outputPath << "\n";
    std::cerr << "Output file size: " << (fileSize / 1024) << " KB\n";

    auto t2 = std::chrono::steady_clock::now();
    auto totalMs = std::chrono::duration_cast<std::chrono::milliseconds>(t2 - t0).count();
    std::cerr << "Total time: " << totalMs << "ms\n";

    return 0;
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

    // Suppress all LOG() output — the ESAI underrun LOG fires 44K times/sec
    // with JIT and fills disk in seconds
    Logging::setLogFunc([](const std::string&) {});

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
    if (synthType == 2 || synthType == 3 || synthType == 12 || synthType == 22 || synthType == 32)
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
    case 32: return dumpMicroQFullSnapshot(romData, outputPath); // 32 = full system snapshot
    default:
        std::cerr << "Unsupported synth type: " << synthType << "\n";
        return 1;
    }
}
