// sst/plugininfra/misc_platform.h — Stub for WASM build
#pragma once

#include <string>

namespace sst::plugininfra
{
inline bool openURL(const std::string&) { return false; }
inline void promptForClipboard(const std::string&) {}
inline std::string getClipboard() { return ""; }

namespace misc_platform
{
// toOSCase: on macOS capitalizes menu items differently, on WASM just pass through
inline std::string toOSCase(const std::string& s) { return s; }
} // namespace misc_platform

} // namespace sst::plugininfra
