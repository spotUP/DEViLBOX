/*
 * fmt library shim for WASM compilation.
 * Provides fmt::sprintf, fmt::printf_args, fmt::make_printf_args.
 */
#pragma once
#include <cstdio>
#include <string>
#include <sstream>

namespace fmt {

// Minimal printf_args type — just needs to exist for writeLog signature
struct printf_args {};

// make_printf_args — returns a printf_args (discards all args)
template<typename... Args>
inline printf_args make_printf_args(const Args&...) {
  return printf_args{};
}

// Helper: convert arg to printf-safe type
template<typename T>
inline T _to_printf(const T& v) { return v; }

inline const char* _to_printf(const std::string& v) { return v.c_str(); }

// sprintf implementation using snprintf with auto c_str() conversion
template<typename... Args>
inline std::string sprintf(const char* format, const Args&... args) {
  char buf[1024];
  int n = snprintf(buf, sizeof(buf), format, _to_printf(args)...);
  if (n < 0) return "";
  if (n < (int)sizeof(buf)) return std::string(buf, n);
  std::string result(n + 1, '\0');
  snprintf(&result[0], result.size(), format, _to_printf(args)...);
  result.resize(n);
  return result;
}

inline std::string sprintf(const char* format) {
  return std::string(format);
}

} // namespace fmt
