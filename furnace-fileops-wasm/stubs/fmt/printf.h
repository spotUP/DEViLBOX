// Stub for fmt/printf.h — only used by ta-log.h for log formatting
// We don't need actual formatting since we redirect all logging to printf
#ifndef FMT_PRINTF_H_STUB
#define FMT_PRINTF_H_STUB

#include <string>

namespace fmt {
  template<typename... Args>
  inline std::string sprintf(const char* format, Args&&...) {
    return std::string(format);
  }
}

#endif
