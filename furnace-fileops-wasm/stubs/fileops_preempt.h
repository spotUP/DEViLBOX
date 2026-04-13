/**
 * fileops_preempt.h — Force-included before ALL source files
 *
 * Provides stub replacements for headers that can't compile in WASM:
 * - ta-log.h (uses fmt library)
 * - sfWrapper.h (uses libsndfile)
 *
 * Unlike the dispatch module's preempt, we DO NOT block engine.h/song.h etc.
 * We want the REAL Furnace data structures for file parsing.
 */

#ifndef _FILEOPS_PREEMPT_H
#define _FILEOPS_PREEMPT_H

// ============================================================
// Block ta-log.h — uses fmt::make_printf_args which we don't have
// ============================================================
#ifndef _TA_LOG_H
#define _TA_LOG_H

#ifdef __cplusplus

#include <cstdio>

enum LogLevel {
  LOGLEVEL_TRACE=0,
  LOGLEVEL_DEBUG,
  LOGLEVEL_INFO,
  LOGLEVEL_WARN,
  LOGLEVEL_ERROR
};

// No-op logging for WASM file ops (Furnace passes std::string to %s varargs, incompatible with fprintf)
#define logD(...)
#define logV(...)
#define logI(...)
#define logW(...)
#define logE(...)

// writeLog stub
template<typename... T>
inline int writeLog(int level, const char* msg, T&&...) {
  return 0;
}

#endif // __cplusplus
#endif // _TA_LOG_H

// ============================================================
// Block sfWrapper.h — uses libsndfile
// ============================================================
#ifndef _SFWRAPPER_H
#define _SFWRAPPER_H

#ifdef __cplusplus
class SFWrapper {
public:
  SFWrapper() {}
  ~SFWrapper() {}
};
#endif

#endif // _SFWRAPPER_H

// ============================================================
// Stub fmt/printf.h — only used by ta-log.h which we've already stubbed
// ============================================================
#ifndef FMT_PRINTF_H_STUB
#define FMT_PRINTF_H_STUB
#ifdef __cplusplus
#include <string>
namespace fmt {
  template<typename... Args>
  inline std::string sprintf(const char* format, Args&&...) {
    return std::string(format);
  }
}
#endif
#endif

// ============================================================
// Icon stubs — referenced by instrument.h
// ============================================================
#ifndef _FUR_ICONS_H
#define _FUR_ICONS_H
#define ICON_FUR_NOISE ""
#define ICON_FUR_SAW ""
#define ICON_FUR_TRIANGLE ""
#define ICON_FUR_SQUARE ""
#define ICON_FUR_PULSE ""
#define ICON_FUR_ADSR_A ""
#define ICON_FUR_ADSR_D ""
#define ICON_FUR_ADSR_S ""
#define ICON_FUR_ADSR_R ""
#define ICON_FUR_DEC_LINEAR ""
#define ICON_FUR_DEC_EXP ""
#define ICON_FUR_INC_LINEAR ""
#define ICON_FUR_INC_BENT ""
#define ICON_FUR_VOL_DIRECT ""
#define ICON_FUR_WAVE ""
#define ICON_FA_EXCLAMATION_TRIANGLE ""
#define ICON_FA_VOLUME_UP ""
#define ICON_FA_VOLUME_DOWN ""
#define ICON_FA_LOCK ""
#define ICON_FA_BELL_SLASH_O ""
#endif

#ifndef ICONS_FONTAWESOME_4_H
#define ICONS_FONTAWESOME_4_H
#endif

// ============================================================
// Translation stub
// ============================================================
#ifndef _FURNACE_I18N
#define _FURNACE_I18N
#define _(x) (x)
#endif

#endif // _FILEOPS_PREEMPT_H
