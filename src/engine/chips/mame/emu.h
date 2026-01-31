#ifndef EMU_H
#define EMU_H

#include "mame_stubs.h"

// Common MAME macros used in drivers
#define DEFINE_DEVICE_TYPE(type, cls, shortname, name) const char* type = name;
#define DECLARE_DEVICE_TYPE(type, cls) extern const char* type;
#define DECLARE_DEVICE_TYPE_NS(type, ns, cls) namespace ns { extern const char* type; }

#endif