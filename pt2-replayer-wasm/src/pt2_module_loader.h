#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "pt2_header.h"
#include "pt2_structs.h"

module_t *modLoad(const char *fileName);
void setupLoadedMod(void);
