// build_juce_data_structures.cpp — Unity build for juce_data_structures module
// Custom build to patch PropertiesFile (no WASM case for file paths).

#include "JuceWasmConfig.h"

#include <juce_data_structures/juce_data_structures.h>

#include <juce_data_structures/values/juce_Value.cpp>
#include <juce_data_structures/values/juce_ValueTree.cpp>
#include <juce_data_structures/values/juce_ValueTreeSynchroniser.cpp>
#include <juce_data_structures/values/juce_CachedValue.cpp>
#include <juce_data_structures/undomanager/juce_UndoManager.cpp>
#include <juce_data_structures/undomanager/juce_UndoableAction.cpp>

// PATCH: PropertiesFile::Options::getDefaultFile() has no WASM case.
// We provide a WASM-compatible version that uses /tmp/ as the storage root.
// First include everything except PropertiesFile, then patch it.
#include <juce_data_structures/app_properties/juce_ApplicationProperties.cpp>

// Provide the PropertiesFile implementation with WASM fix
namespace juce
{
// Forward-declare what's needed from the real PropertiesFile.cpp
// We include the file with a patch: add WASM case before the #endif

} // namespace juce

// Include the real file but with a define that adds the WASM case
// Actually, simplest approach: just define the missing platform for this one file
#if JUCE_WASM && !defined(JUCE_LINUX)
  // Temporarily pretend to be Linux for PropertiesFile's dir variable
  // PropertiesFile only uses File() which is already implemented in juce_core
  #define JUCE_PROPERTIES_FILE_WASM_PATCH
  #define JUCE_LINUX 1
  #include <juce_data_structures/app_properties/juce_PropertiesFile.cpp>
  #undef JUCE_LINUX
#else
  #include <juce_data_structures/app_properties/juce_PropertiesFile.cpp>
#endif
