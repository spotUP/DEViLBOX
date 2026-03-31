// sst/plugininfra/version_information.h — Stub for WASM build
#pragma once

#include <string>

namespace sst::plugininfra
{
struct VersionInformation
{
    static constexpr const char* project_version_and_hash = "OB-Xf WASM 0.1.0";
    static constexpr const char* build_date = "2025-01-01";
    static constexpr const char* build_time = "00:00:00";
    static constexpr const char* build_host = "wasm";
    static constexpr const char* cmake_compiler = "emscripten";
};
} // namespace sst::plugininfra
