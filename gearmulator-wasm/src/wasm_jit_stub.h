#pragma once

/**
 * WASM stub replacement for dsp56kEmu/jit.h
 * 
 * On WASM, JIT is never used (g_jitSupported=false). This provides a minimal
 * Jit class that satisfies the DSP class member declaration.
 * All methods are inline no-ops.
 */

#include "types.h"
#include "jittypes.h"
#include "debuggerinterface.h"
#include "jitblockchain.h"
#include "jitcacheentry.h"
#include "jitconfig.h"
#include "jitdspmode.h"
#include "jitruntimedata.h"
#include "jitblockinfo.h"
#include "jitblockruntimedata.h"
#include "jitblockemitter.h"
#include "jitprofilingsupport.h"

#include <memory>
#include <set>
#include <vector>
#include <unordered_map>
#include <map>

namespace dsp56k
{
    class DSP;

    class Jit final
    {
    public:
        explicit Jit(DSP& _dsp) : m_dsp(_dsp) {}
        ~Jit() = default;

        DSP& dsp() { return m_dsp; }

        void exec(const TWord) {}

        static Jit* toJitPtr(DspRegs*) { return nullptr; }
        void notifyProgramMemWrite(TWord) {}

        void run(TWord) noexcept {}
        void runCheckPMemWrite(TWord) noexcept {}
        void runCheckPMemWriteAndModeChange(TWord) noexcept {}
        void runCheckModeChange(TWord) noexcept {}

        const JitConfig& getConfig() const { return m_config; }
        JitConfig getConfig(TWord) const { return m_config; }
        void setConfig(const JitConfig&) {}
        void resetHW() {}

        const std::map<TWord, TWord>& getLoops() const { return m_loops; }
        const std::set<TWord>& getLoopEnds() const { return m_loopEnds; }

        static TJitFunc updateRunFunc(const JitCacheEntry&) { return nullptr; }

        void* getRuntime() { return nullptr; }
        JitRuntimeData& getRuntimeData() { return m_runtimeData; }
        const std::set<TWord>& getVolatileP() { return m_volatileP; }
        JitProfilingSupport* getProfilingSupport() const { return nullptr; }

        bool isVolatileP(const TWord) const { return false; }

        void create(TWord, bool) {}
        void recreate(TWord) {}
        void destroy(TWord) {}
        void destroyToRecreate(TWord) {}
        void destroyAllBlocks() {}

        void checkModeChange() noexcept {}
        void addLoop(const JitBlockInfo&) {}
        void addLoop(TWord, TWord) {}
        void removeLoop(const JitBlockInfo&) {}
        void removeLoop(TWord) {}

        void onDebuggerAttached(DebuggerInterface&) const {}

        JitBlockEmitter* acquireEmitter(JitConfig&&) { return nullptr; }
        JitBlockEmitter* acquireEmitter(TWord) { return nullptr; }
        void releaseEmitter(JitBlockEmitter*) {}

        JitBlockRuntimeData* acquireBlockRuntimeData() { return nullptr; }
        void releaseBlockRuntimeData(JitBlockRuntimeData*) {}

        void onFuncsResized(const JitBlockChain&) const {}

    private:
        void checkPMemWrite() noexcept {}

        DSP& m_dsp;
        JitConfig m_config;
        std::set<TWord> m_volatileP;
        std::map<TWord, TWord> m_loops;
        std::set<TWord> m_loopEnds;
        JitRuntimeData m_runtimeData{};
    };
}
