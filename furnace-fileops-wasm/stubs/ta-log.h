// Stub for ta-log.h — redirect logging to printf (or no-op)
#ifndef _TA_LOG_H
#define _TA_LOG_H

#include <cstdio>
#include <cstdarg>

enum LogLevel {
  LOGLEVEL_TRACE=0,
  LOGLEVEL_DEBUG,
  LOGLEVEL_INFO,
  LOGLEVEL_WARN,
  LOGLEVEL_ERROR
};

// No-op logging for WASM file ops
#define logD(...)
#define logV(...)
#define logI(...)
#define logW(...)
#define logE(...)

// writeLog stub — some code calls it directly
template<typename... T>
inline int writeLog(int level, const char* msg, T&&...) {
  return 0;
}

#endif
