#ifndef FMT_PRINTF_H
#define FMT_PRINTF_H

#include <stdio.h>

namespace fmt {
    // Mock types
    struct printf_args {};
    
    template <typename... Args>
    printf_args make_printf_args(Args... args) {
        return printf_args();
    }

    template <typename... Args>
    void printf(const char* format, Args... args) {
    }
    
    template <typename... Args>
    void print(const char* format, Args... args) {
    }
}

#endif