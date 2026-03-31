// Stub version header for Monique WASM build
#pragma once
#define MONIQUE_VERSION "1.1.0"
#define MONIQUE_VERSION_STRING "1.1.0"

namespace Monique {
struct Build {
    static constexpr const char* MajorVersionStr = "1";
    static constexpr int MajorVersionInt = 1;
    static constexpr const char* SubVersionStr = "1";
    static constexpr int SubVersionInt = 1;
    static constexpr const char* ReleaseNumberStr = "0";
    static constexpr const char* ReleaseStr = "1.1.0";
    static constexpr const char* GitHash = "wasm";
    static constexpr const char* GitBranch = "main";
    static constexpr const char* BuildNumberStr = "0";
    static constexpr const char* FullVersionStr = "1.1.0-wasm";
    static constexpr const char* BuildHost = "emscripten";
    static constexpr const char* BuildArch = "wasm32";
    static constexpr const char* BuildCompiler = "emcc";
    static constexpr const char* BuildLocation = "Local";
    static constexpr const char* BuildDate = __DATE__;
    static constexpr const char* BuildTime = __TIME__;
    static constexpr const char* BuildYear = "2026";
    static constexpr const char* CMAKE_INSTALL_PREFIX = "/";
};
} // namespace Monique
