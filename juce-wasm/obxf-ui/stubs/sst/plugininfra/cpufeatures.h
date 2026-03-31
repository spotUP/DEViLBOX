// sst/plugininfra/cpufeatures.h — Stub for WASM build
#pragma once

#include <string>

namespace sst::plugininfra
{
struct CPUFeatures
{
    bool isSSE = false;
    bool isSSE2 = false;
    bool isSSE3 = false;
    bool isAVX = false;
    bool isAVX2 = false;
    bool isNeon = false;
};

inline CPUFeatures cpuFeatures() { return CPUFeatures{}; }

namespace cpufeatures
{
inline std::string brand() { return "WebAssembly"; }
} // namespace cpufeatures

} // namespace sst::plugininfra
