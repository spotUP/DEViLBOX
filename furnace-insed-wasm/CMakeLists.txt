cmake_minimum_required(VERSION 3.13)
project(FurnaceInsEd CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD 11)

# ── ImGui core ──────────────────────────────────────────────────────────
set(IMGUI_SOURCES
    src/imgui/imgui.cpp
    src/imgui/imgui_draw.cpp
    src/imgui/imgui_tables.cpp
    src/imgui/imgui_widgets.cpp
    src/imgui/misc/cpp/imgui_stdlib.cpp
    src/imgui/backends/imgui_impl_sdl2.cpp
    src/imgui/backends/imgui_impl_opengl3.cpp
)

# ── Chip emulators (for FM preview) ────────────────────────────────────
set(CHIP_SOURCES
    src/extern/opn/ym3438.c
    src/extern/opm/opm.c
    src/extern/opl/opl3.c
    src/extern/ESFMu/esfm.c
    src/extern/Nuked-OPLL/opll.c
    src/engine/platform/sound/ymfm/ymfm_opz.cpp
)

# ── Furnace GUI source (real code from reference) ──────────────────────
set(GUI_SOURCES
    src/gui/insEdit.cpp
    src/gui/fmPreview.cpp
    src/gui/guiConst.cpp
    src/gui/intConst.cpp
    src/gui/plot_nolerp.cpp
    src/gui/util.cpp
)

# ── Furnace engine serialization (read-side) ──────────────────────────
set(ENGINE_SOURCES
    src/engine/instrument_io.cpp
    src/engine/safeReader.cpp
)

# ── Stubs for engine/GUI subsystems not needed for insEdit ─────────────
set(STUB_SOURCES
    src/stubs/engine_stubs.cpp
    src/stubs/gui_stubs.cpp
    src/stubs/wasm_bridge.cpp
)

set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/furnace-gui")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(FurnaceInsEd
    ${IMGUI_SOURCES}
    ${CHIP_SOURCES}
    ${GUI_SOURCES}
    ${ENGINE_SOURCES}
    ${STUB_SOURCES}
)

# Include paths
target_include_directories(FurnaceInsEd PRIVATE
    src
    src/imgui
    src/imgui/backends
    src/gui
    src/engine
    src/extern
)

target_compile_options(FurnaceInsEd PRIVATE
    -O2
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-unused-parameter
    -Wno-sign-compare
    -Wno-missing-field-initializers
    -DNDEBUG
    -DFURNACE_WASM_INSED=1
    "SHELL:-s USE_SDL=2"
)

set_target_properties(FurnaceInsEd PROPERTIES
    OUTPUT_NAME "FurnaceInsEd"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(FurnaceInsEd PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFurnaceInsEd'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=33554432"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s USE_WEBGL2=1"
    "SHELL:-s FULL_ES3=1"
    "SHELL:-s MIN_WEBGL_VERSION=2"
    "SHELL:-s MAX_WEBGL_VERSION=2"
    "SHELL:-s EXPORTED_FUNCTIONS=['_furnace_insed_init','_furnace_insed_start','_furnace_insed_shutdown','_furnace_insed_load_config','_furnace_insed_dump_config','_furnace_insed_set_chip_type','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8']"
    "SHELL:-s ERROR_ON_UNDEFINED_SYMBOLS=1"
    "SHELL:-s LLD_REPORT_UNDEFINED=1"
)
