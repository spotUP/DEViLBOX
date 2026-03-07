#include <time.h>

#include "common.h"
#include "util.h"

namespace uade::write_audio::util
{

int64_t get_ms_time()
{
    struct timespec res;
    int ret = clock_gettime(CLOCK_MONOTONIC, &res);
    CHECK(ret == 0);
    return ((int64_t) (res.tv_sec * 1000)) + res.tv_nsec / 1000000;
}

}
