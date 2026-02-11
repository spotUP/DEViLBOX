/**
 * vital_wasm_prelude.h — Force-included header for WASM build
 *
 * Vital's source headers rely on include ordering from the JUCE build system.
 * Many headers forward-declare types but access members inline, expecting the
 * full definition to be available from the translation unit's includes.
 *
 * This prelude ensures all commonly-needed types are available everywhere.
 */
#pragma once

// Framework core (must come first — defines poly_float, Processor, etc.)
#include "synthesis/framework/common.h"
#include "synthesis/framework/value.h"
#include "synthesis/framework/processor.h"
#include "synthesis/framework/processor_router.h"
#include "synthesis/framework/synth_module.h"

// Utility functions (used inline in many headers without being included)
#include "synthesis/framework/futils.h"
#include "synthesis/framework/poly_utils.h"
#include "synthesis/framework/utils.h"

// Types referenced by pointer/value in headers that only forward-declare them
#include "synthesis/lookups/memory.h"
#include "synthesis/modulators/envelope.h"
#include "synthesis/modulators/synth_lfo.h"
#include "synthesis/modulators/line_map.h"
#include "synthesis/modulators/trigger_random.h"

// Module headers used inline in sound_engine.cpp without being included
#include "synthesis/modules/chorus_module.h"
#include "synthesis/modules/phaser_module.h"
#include "synthesis/modules/flanger_module.h"
#include "synthesis/modules/compressor_module.h"
