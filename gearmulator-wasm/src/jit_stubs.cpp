/**
 * Minimal JIT stubs for WASM builds.
 * 
 * The DSP core always creates a Jit object (member of DSP class), but
 * g_jitSupported=false on WASM so JIT paths are never taken at runtime.
 * We provide empty stubs for the linker.
 */

#include "dsp56kEmu/jit.h"
#include "dsp56kEmu/jitprofilingsupport.h"
#include "dsp56kEmu/jitblockruntimedata.h"
#include "dsp56kEmu/jitblockchain.h"

namespace dsp56k
{
    // ── Jit ──────────────────────────────────────────────────────────────────

    Jit::Jit(DSP& _dsp) : m_dsp(_dsp) {}
    Jit::~Jit() = default;

    void Jit::resetHW() {}
    void Jit::notifyProgramMemWrite(TWord) {}

    void Jit::run(TWord) noexcept {}
    void Jit::runCheckPMemWrite(TWord) noexcept {}
    void Jit::runCheckPMemWriteAndModeChange(TWord) noexcept {}
    void Jit::runCheckModeChange(TWord) noexcept {}

    void Jit::create(TWord, bool) {}
    void Jit::recreate(TWord) {}
    void Jit::destroy(TWord) {}
    void Jit::destroyToRecreate(TWord) {}
    void Jit::destroyAllBlocks() {}

    void Jit::checkModeChange() noexcept {}
    void Jit::addLoop(const JitBlockInfo&) {}
    void Jit::addLoop(TWord, TWord) {}
    void Jit::removeLoop(const JitBlockInfo&) {}
    void Jit::removeLoop(TWord) {}

    Jit* Jit::toJitPtr(DspRegs*) { return nullptr; }
    JitConfig Jit::getConfig(TWord) const { return m_config; }

    TJitFunc Jit::updateRunFunc(const JitCacheEntry&) { return nullptr; }

    void Jit::onDebuggerAttached(DebuggerInterface&) const {}

    JitBlockEmitter* Jit::acquireEmitter(JitConfig&&) { return nullptr; }
    JitBlockEmitter* Jit::acquireEmitter(TWord) { return nullptr; }
    void Jit::releaseEmitter(JitBlockEmitter*) {}

    JitBlockRuntimeData* Jit::acquireBlockRuntimeData() { return nullptr; }
    void Jit::releaseBlockRuntimeData(JitBlockRuntimeData*) {}

    void Jit::onFuncsResized(const JitBlockChain&) const {}
    void Jit::checkPMemWrite() noexcept {}

    // ── JitProfilingSupport ──────────────────────────────────────────────────

    JitProfilingSupport::JitProfilingSupport(const DSP&) {}
    JitProfilingSupport::~JitProfilingSupport() = default;
    bool JitProfilingSupport::isBeingProfiled() { return false; }
    void JitProfilingSupport::addJitBlock(JitBlockRuntimeData&) {}
    void JitProfilingSupport::addFunction(const char*, void*, const asmjit::CodeHolder&) {}

    // ── JitBlockRuntimeData ──────────────────────────────────────────────────

    JitBlockRuntimeData::JitBlockRuntimeData(JitBlockChain&) {}
    JitBlockRuntimeData::~JitBlockRuntimeData() = default;

    // ── JitBlockChain ────────────────────────────────────────────────────────

    JitBlockChain::JitBlockChain(Jit& _jit, JitDspMode&& _mode)
        : m_jit(_jit), m_dspMode(std::move(_mode)) {}
    JitBlockChain::~JitBlockChain() = default;
    void JitBlockChain::exec(TWord) {}
    void JitBlockChain::create(TWord, bool) {}
    void JitBlockChain::recreate(TWord) {}
    void JitBlockChain::destroy(TWord) {}
    void JitBlockChain::destroyToRecreate(TWord) {}
    void JitBlockChain::destroyAllBlocks() {}
    void JitBlockChain::notifyProgramMemWrite(TWord) {}
    void JitBlockChain::occupyArea(TWord, TWord) {}
}
