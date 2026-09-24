// Stand-in for fmt/printf.h. The real {fmt} library is not linked into this
// build, but Furnace's loaders build their user-facing error messages with
// fmt::sprintf ("order at %d, %d out of range! (%d)"), so this must actually
// format — a stub that returned the format string unchanged shipped those
// messages to the UI with the placeholders still in them.
//
// Like {fmt}, the argument's own type decides how it is printed; printf length
// modifiers in the format (l, ll, z, h, ...) are ignored, so a size_t passed to
// %d cannot misread the argument list the way it would under C varargs.
#ifndef FMT_PRINTF_H_STUB
#define FMT_PRINTF_H_STUB

#include <cstdio>
#include <string>
#include <type_traits>

namespace fmt {
namespace detail {

template<typename... CArgs>
inline void appendC(std::string& out, const std::string& spec, CArgs... cargs) {
  char buf[256];
  int n=std::snprintf(buf,sizeof(buf),spec.c_str(),cargs...);
  if (n<0) return;
  if ((size_t)n<sizeof(buf)) {
    out.append(buf,(size_t)n);
    return;
  }
  std::string big((size_t)n+1,'\0');
  std::snprintf(&big[0],big.size(),spec.c_str(),cargs...);
  big.resize((size_t)n);
  out+=big;
}

// `flags` is everything between '%' and the conversion letter, length
// modifiers already removed; `conv` is the conversion letter.
template<typename T>
inline void appendArg(std::string& out, const std::string& flags, char conv, const T& arg) {
  using D=typename std::decay<T>::type;
  const std::string pct="%"+flags;
  if constexpr (std::is_same<D,std::string>::value) {
    appendC(out,pct+"s",arg.c_str());
  } else if constexpr (std::is_same<D,const char*>::value || std::is_same<D,char*>::value) {
    appendC(out,pct+"s",arg?arg:"(null)");
  } else if constexpr (std::is_same<D,bool>::value) {
    appendC(out,pct+"s",arg?"true":"false");
  } else if constexpr (std::is_floating_point<D>::value) {
    if (conv=='d' || conv=='i') appendC(out,pct+"lld",(long long)arg);
    else if (conv=='s') appendC(out,pct+"g",(double)arg);
    else appendC(out,pct+std::string(1,conv),(double)arg);
  } else if constexpr (std::is_integral<D>::value) {
    if (conv=='c') appendC(out,pct+"c",(int)arg);
    else if (conv=='f' || conv=='F' || conv=='e' || conv=='E' || conv=='g' || conv=='G') appendC(out,pct+std::string(1,conv),(double)arg);
    else if (conv=='u' || conv=='x' || conv=='X' || conv=='o') appendC(out,pct+"ll"+std::string(1,conv),(unsigned long long)arg);
    else if (std::is_signed<D>::value) appendC(out,pct+"lld",(long long)arg);
    else appendC(out,pct+"llu",(unsigned long long)arg);
  } else if constexpr (std::is_enum<D>::value) {
    appendC(out,pct+"lld",(long long)arg);
  } else if constexpr (std::is_pointer<D>::value) {
    appendC(out,pct+"p",(const void*)arg);
  } else {
    out+="{?}";
  }
}

// Copy literal text up to the next conversion, unescaping %%. Returns false at
// the end of the format. On true, `flags`/`conv` describe the conversion found.
inline bool nextSpec(std::string& out, const char*& f, std::string& flags, char& conv) {
  while (*f) {
    if (*f!='%') {
      out+=*f++;
      continue;
    }
    if (f[1]=='%') {
      out+='%';
      f+=2;
      continue;
    }
    if (!f[1]) {
      out+=*f++;
      return false;
    }
    f++;
    flags.clear();
    while (*f && std::string("-+ #0123456789.*").find(*f)!=std::string::npos) flags+=*f++;
    while (*f && std::string("hlLqjzt").find(*f)!=std::string::npos) f++;
    if (!*f) return false;
    conv=*f++;
    return true;
  }
  return false;
}

inline void format(std::string& out, const char* f) {
  std::string flags;
  char conv;
  // No arguments left: keep any remaining conversions visible as written.
  while (nextSpec(out,f,flags,conv)) {
    out+="%"+flags+conv;
  }
}

template<typename T, typename... Rest>
inline void format(std::string& out, const char* f, const T& arg, const Rest&... rest) {
  std::string flags;
  char conv;
  if (!nextSpec(out,f,flags,conv)) return;
  appendArg(out,flags,conv,arg);
  format(out,f,rest...);
}

} // namespace detail

template<typename... Args>
inline std::string sprintf(const char* format, const Args&... args) {
  std::string out;
  detail::format(out,format,args...);
  return out;
}

template<typename... Args>
inline std::string sprintf(const std::string& format, const Args&... args) {
  return sprintf(format.c_str(),args...);
}

} // namespace fmt

#endif
