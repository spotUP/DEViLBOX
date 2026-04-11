set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fvisibility=hidden")

set(QUAMPLEX_DSP_TOOLS_PATH ${GKICK_DSP_DIR}/src/quamplex_dsp_tools)

set(GKICK_DSP_HEADERS
        ${QUAMPLEX_DSP_TOOLS_PATH}/qx_math.h
        ${QUAMPLEX_DSP_TOOLS_PATH}/qx_randomizer.h
        ${GKICK_DSP_DIR}/src/humanizer.h
	${GKICK_DSP_DIR}/src/audio_output.h
	${GKICK_DSP_DIR}/src/distortion.h
	${GKICK_DSP_DIR}/src/envelope.h
	${GKICK_DSP_DIR}/src/filter.h
	${GKICK_DSP_DIR}/src/geonkick.h
	${GKICK_DSP_DIR}/src/geonkick_internal.h
	${GKICK_DSP_DIR}/src/gkick_audio.h
        ${GKICK_DSP_DIR}/src/mixer.h
	${GKICK_DSP_DIR}/src/gkick_buffer.h
        ${GKICK_DSP_DIR}/src/ring_buffer.h
	${GKICK_DSP_DIR}/src/gkick_log.h
	${GKICK_DSP_DIR}/src/oscillator.h
	${GKICK_DSP_DIR}/src/synthesizer.h
        ${GKICK_DSP_DIR}/src/worker.h)

if (GKICK_STANDALONE)
  if (CMAKE_SYSTEM_NAME MATCHES Windows)
  	message(STATUS "No Jack implementation for Windows")
  else()
        list(APPEND GKICK_DSP_HEADERS ${GKICK_DSP_DIR}/src/gkick_jack.h)
  endif()
endif(GKICK_STANDALONE)

set(GKICK_DSP_SOURCES
        ${GKICK_DSP_DIR}/src/humanizer.c
        ${GKICK_DSP_DIR}/src/audio_output.c
        ${GKICK_DSP_DIR}/src/distortion.c
	${GKICK_DSP_DIR}/src/envelope.c
	${GKICK_DSP_DIR}/src/filter.c
	${GKICK_DSP_DIR}/src/geonkick.c
	${GKICK_DSP_DIR}/src/gkick_audio.c
        ${GKICK_DSP_DIR}/src/mixer.c
	${GKICK_DSP_DIR}/src/gkick_buffer.c
        ${GKICK_DSP_DIR}/src/ring_buffer.c
	${GKICK_DSP_DIR}/src/gkick_log.c
	${GKICK_DSP_DIR}/src/oscillator.c
	${GKICK_DSP_DIR}/src/synthesizer.c
        ${GKICK_DSP_DIR}/src/worker.c)

if (GKICK_STANDALONE)
  if (CMAKE_SYSTEM_NAME MATCHES Windows)
  	message(STATUS "No Jack implementation for Windows")
  else()
       list(APPEND GKICK_DSP_SOURCES ${GKICK_DSP_DIR}/src/gkick_jack.c)
  endif()
endif(GKICK_STANDALONE)

include_directories(${GKICK_DSP_DIR}/src)
include_directories(${QUAMPLEX_DSP_TOOLS_PATH})

if (GKICK_STANDALONE)
	add_library(dsp_standalone STATIC
		${GKICK_DSP_HEADERS}
		${GKICK_DSP_SOURCES})
        target_compile_options(dsp_standalone PUBLIC ${GKICK_DSP_FLAGS})
endif (GKICK_STANDALONE)

if (GKICK_PLUGIN)
	add_library(dsp_plugin_single STATIC
		${GKICK_DSP_HEADERS}
		${GKICK_DSP_SOURCES})
	target_compile_options(dsp_plugin_single PUBLIC ${GKICK_DSP_PLUGIN_SINGLE_FLAGS})
   	add_library(dsp_plugin STATIC
		${GKICK_DSP_HEADERS}
		${GKICK_DSP_SOURCES})
	target_compile_options(dsp_plugin PRIVATE ${GKICK_DSP_PLUGIN_FLAGS})
endif (GKICK_PLUGIN)

