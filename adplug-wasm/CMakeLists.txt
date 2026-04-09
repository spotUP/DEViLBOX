cmake_minimum_required(VERSION 3.16)
project(AdPlugPlayer LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(ADPLUG_DIR "${CMAKE_CURRENT_SOURCE_DIR}/adplug-adplug-2.4")
set(BINIO_DIR  "${CMAKE_CURRENT_SOURCE_DIR}/libbinio-libbinio-1.5")

# ── libbinio ─────────────────────────────────────────────────────────────────

set(LIBBINIO_SOURCES
    ${BINIO_DIR}/src/binio.cpp
    ${BINIO_DIR}/src/binfile.cpp
    ${BINIO_DIR}/src/binstr.cpp
    ${BINIO_DIR}/src/binwrap.cpp
)

add_library(binio_static STATIC ${LIBBINIO_SOURCES})
target_include_directories(binio_static PUBLIC ${BINIO_DIR}/src)
set_target_properties(binio_static PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_compile_options(binio_static PRIVATE -w)

# ── AdPlug ───────────────────────────────────────────────────────────────────

set(ADPLUG_SOURCES
    ${ADPLUG_DIR}/src/adplug.cpp
    ${ADPLUG_DIR}/src/player.cpp
    ${ADPLUG_DIR}/src/players.cpp
    ${ADPLUG_DIR}/src/fprovide.cpp
    ${ADPLUG_DIR}/src/database.cpp
    ${ADPLUG_DIR}/src/emuopl.cpp
    ${ADPLUG_DIR}/src/woodyopl.cpp
    ${ADPLUG_DIR}/src/fmopl.c
    ${ADPLUG_DIR}/src/nukedopl.c
    ${ADPLUG_DIR}/src/debug.c
    ${ADPLUG_DIR}/src/unlzw.c
    ${ADPLUG_DIR}/src/unlzh.c
    ${ADPLUG_DIR}/src/unlzss.c
    ${ADPLUG_DIR}/src/depack.c
    ${ADPLUG_DIR}/src/sixdepack.cpp
    ${ADPLUG_DIR}/src/a2m.cpp
    ${ADPLUG_DIR}/src/a2m-v2.cpp
    ${ADPLUG_DIR}/src/adl.cpp
    ${ADPLUG_DIR}/src/adtrack.cpp
    ${ADPLUG_DIR}/src/amd.cpp
    ${ADPLUG_DIR}/src/bam.cpp
    ${ADPLUG_DIR}/src/bmf.cpp
    ${ADPLUG_DIR}/src/cff.cpp
    ${ADPLUG_DIR}/src/cmf.cpp
    ${ADPLUG_DIR}/src/cmfmcsop.cpp
    ${ADPLUG_DIR}/src/coktel.cpp
    ${ADPLUG_DIR}/src/composer.cpp
    ${ADPLUG_DIR}/src/d00.cpp
    ${ADPLUG_DIR}/src/dfm.cpp
    ${ADPLUG_DIR}/src/dmo.cpp
    ${ADPLUG_DIR}/src/dro.cpp
    ${ADPLUG_DIR}/src/dro2.cpp
    ${ADPLUG_DIR}/src/dtm.cpp
    ${ADPLUG_DIR}/src/flash.cpp
    ${ADPLUG_DIR}/src/fmc.cpp
    ${ADPLUG_DIR}/src/got.cpp
    ${ADPLUG_DIR}/src/herad.cpp
    ${ADPLUG_DIR}/src/hsc.cpp
    ${ADPLUG_DIR}/src/hsp.cpp
    ${ADPLUG_DIR}/src/hybrid.cpp
    ${ADPLUG_DIR}/src/hyp.cpp
    ${ADPLUG_DIR}/src/imf.cpp
    ${ADPLUG_DIR}/src/jbm.cpp
    ${ADPLUG_DIR}/src/ksm.cpp
    ${ADPLUG_DIR}/src/lds.cpp
    ${ADPLUG_DIR}/src/mad.cpp
    ${ADPLUG_DIR}/src/mdi.cpp
    ${ADPLUG_DIR}/src/mid.cpp
    ${ADPLUG_DIR}/src/mkj.cpp
    ${ADPLUG_DIR}/src/msc.cpp
    ${ADPLUG_DIR}/src/mtk.cpp
    ${ADPLUG_DIR}/src/mtr.cpp
    ${ADPLUG_DIR}/src/mus.cpp
    ${ADPLUG_DIR}/src/pis.cpp
    ${ADPLUG_DIR}/src/plx.cpp
    ${ADPLUG_DIR}/src/protrack.cpp
    ${ADPLUG_DIR}/src/psi.cpp
    ${ADPLUG_DIR}/src/rad2.cpp
    ${ADPLUG_DIR}/src/rat.cpp
    ${ADPLUG_DIR}/src/raw.cpp
    ${ADPLUG_DIR}/src/rix.cpp
    ${ADPLUG_DIR}/src/rol.cpp
    ${ADPLUG_DIR}/src/s3m.cpp
    ${ADPLUG_DIR}/src/sa2.cpp
    ${ADPLUG_DIR}/src/sng.cpp
    ${ADPLUG_DIR}/src/sop.cpp
    ${ADPLUG_DIR}/src/surroundopl.cpp
    ${ADPLUG_DIR}/src/u6m.cpp
    ${ADPLUG_DIR}/src/vgm.cpp
    ${ADPLUG_DIR}/src/xad.cpp
    ${ADPLUG_DIR}/src/xsm.cpp
    ${ADPLUG_DIR}/src/temuopl.cpp
    ${ADPLUG_DIR}/src/kemuopl.cpp
    ${ADPLUG_DIR}/src/nemuopl.cpp
)

add_library(adplug_static STATIC ${ADPLUG_SOURCES})
target_include_directories(adplug_static PUBLIC ${ADPLUG_DIR}/src ${BINIO_DIR}/src)
target_link_libraries(adplug_static PRIVATE binio_static)
set_target_properties(adplug_static PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_compile_definitions(adplug_static PRIVATE stricmp=strcasecmp)
target_compile_options(adplug_static PRIVATE -w)

# ── WASM executable ──────────────────────────────────────────────────────────

add_executable(AdPlugPlayer src/adplug_wasm.cpp)

target_include_directories(AdPlugPlayer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${ADPLUG_DIR}/src
    ${BINIO_DIR}/src
)

target_link_libraries(AdPlugPlayer PRIVATE adplug_static binio_static)
target_compile_definitions(AdPlugPlayer PRIVATE stricmp=strcasecmp)

set(EMSCRIPTEN_FLAGS
    "-s MODULARIZE=1"
    "-s EXPORT_NAME='createAdPlugPlayer'"
    "-s EXPORTED_FUNCTIONS=['_adplug_init','_adplug_shutdown','_adplug_load','_adplug_rewind','_adplug_render','_adplug_get_title','_adplug_get_type','_adplug_get_subsongs','_adplug_get_refresh','_adplug_get_num_instruments','_adplug_get_instrument_name','_adplug_alloc','_adplug_free','_malloc','_free']"
    "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAP16','UTF8ToString']"
    "-s ALLOW_MEMORY_GROWTH=1"
    "-s INITIAL_MEMORY=16777216"
    "-s MAXIMUM_MEMORY=67108864"
    "-s STACK_SIZE=262144"
    "-s ENVIRONMENT='web,worker'"
    "-s SINGLE_FILE=0"
    "-s NO_EXIT_RUNTIME=1"
    "-s ASSERTIONS=0"
    "-s WASM=1"
    "-O3"
    "-flto"
)

string(REPLACE ";" " " EMSCRIPTEN_FLAGS_STR "${EMSCRIPTEN_FLAGS}")

set_target_properties(AdPlugPlayer PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "${EMSCRIPTEN_FLAGS_STR}"
)

target_compile_options(AdPlugPlayer PRIVATE -w -O3 -flto)
