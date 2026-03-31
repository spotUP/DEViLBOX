// sst/plugininfra/strnatcmp.h — Stub for WASM build
#pragma once

#include <cstring>

namespace sst::plugininfra
{
inline int strnatcmp(const char* a, const char* b) { return std::strcmp(a, b); }
inline int strnatcasecmp(const char* a, const char* b) { return std::strcmp(a, b); }
} // namespace sst::plugininfra
