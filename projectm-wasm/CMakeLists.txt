# projectm-wasm — Emscripten build of projectM v4 for DEViLBOX
#
# Two-step build:
#   Step 1 (run build.sh or manually):
#     cd /path/to/Reference Code/projectm-master
#     mkdir -p build-em && cd build-em
#     emcmake cmake .. -G "Unix Makefiles" \
#       -DCMAKE_INSTALL_PREFIX=$PWD/../install-em \
#       -DENABLE_PLAYLIST=OFF -DENABLE_SDL_UI=OFF \
#       -DBUILD_TESTING=OFF -DBUILD_DOCS=OFF
#     emmake make -j8 && emmake make install
#
#   Step 2:
#     cd projectm-wasm/build
#     emcmake cmake .. -G "Unix Makefiles"
#     emmake make -j8
#
# Output: public/projectm/ProjectM.js + ProjectM.wasm

cmake_minimum_required(VERSION 3.13)
project(ProjectMBridge C)

set(CMAKE_C_STANDARD 11)

# ── Paths ────────────────────────────────────────────────────
set(PROJECTM_SRC     "${CMAKE_SOURCE_DIR}/../Reference Code/projectm-master")
set(PROJECTM_INSTALL "${PROJECTM_SRC}/install-em")
set(OUTPUT_DIR       "${CMAKE_SOURCE_DIR}/../public/projectm")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

# ── Find the installed projectM static lib ───────────────────
set(PROJECTM_LIB "${PROJECTM_INSTALL}/lib/libprojectM-4.a")
if(NOT EXISTS "${PROJECTM_LIB}")
    message(FATAL_ERROR
        "libprojectM-4.a not found at ${PROJECTM_LIB}\n"
        "Run build.sh first to build projectM, or build it manually:\n"
        "  cd '${PROJECTM_SRC}' && mkdir -p build-em && cd build-em\n"
        "  emcmake cmake .. -DCMAKE_INSTALL_PREFIX=${PROJECTM_INSTALL} "
        "-DENABLE_PLAYLIST=OFF -DENABLE_SDL_UI=OFF -DBUILD_TESTING=OFF -DBUILD_DOCS=OFF\n"
        "  emmake make -j8 && emmake make install"
    )
endif()

# Also need projectm-eval — check in the projectM build directory
set(PROJECTM_EVAL_LIB "")
file(GLOB_RECURSE _eval_lib "${PROJECTM_SRC}/build-em/*libprojectM_eval*")
if(_eval_lib)
    list(GET _eval_lib 0 PROJECTM_EVAL_LIB)
endif()

message(STATUS "projectM lib: ${PROJECTM_LIB}")
message(STATUS "projectM-eval lib: ${PROJECTM_EVAL_LIB}")

# ── Our bridge executable ────────────────────────────────────
add_executable(ProjectMBridge src/projectm_bridge.c)

target_include_directories(ProjectMBridge PRIVATE
    "${PROJECTM_INSTALL}/include"
)

target_link_libraries(ProjectMBridge PRIVATE
    ${PROJECTM_LIB}
    ${PROJECTM_EVAL_LIB}
)

set_target_properties(ProjectMBridge PROPERTIES
    OUTPUT_NAME "ProjectM"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_compile_options(ProjectMBridge PRIVATE -O2 "SHELL:-s USE_SDL=2")

target_link_options(ProjectMBridge PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createProjectM'"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s USE_SDL=2"
    "SHELL:-s MIN_WEBGL_VERSION=2"
    "SHELL:-s MAX_WEBGL_VERSION=2"
    "SHELL:-s FULL_ES2=1"
    "SHELL:-s FULL_ES3=1"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=67108864"
    "SHELL:-s NO_DISABLE_EXCEPTION_CATCHING"
    "SHELL:-s EXPORTED_FUNCTIONS=['_pm_init','_pm_render_frame','_pm_add_pcm','_pm_load_preset_data','_pm_load_preset_file','_pm_set_size','_pm_set_beat_sensitivity','_pm_set_soft_cut_duration','_pm_set_preset_duration','_pm_set_preset_locked','_pm_set_hard_cut_enabled','_pm_set_mesh_size','_pm_get_max_samples','_pm_destroy','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8','HEAPF32']"
    "SHELL:-s FORCE_FILESYSTEM=1"
)
