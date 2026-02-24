/*
 * projectm_bridge.c — Thin Emscripten bridge for projectM v4
 *
 * Initialises SDL2+WebGL2, creates a projectM instance, and exposes
 * a tick-based render loop + PCM push for the JS/React host.
 *
 * Build via the sibling CMakeLists.txt with emcmake/emmake.
 * Output: public/projectm/ProjectM.js + .wasm
 */
#include <emscripten.h>
#include <emscripten/html5.h>
#include <emscripten/html5_webgl.h>

#include <SDL.h>
#include <GL/gl.h>

#include <projectM-4/projectM.h>

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

/* ── State ────────────────────────────────────────────────── */
static projectm_handle g_pm  = NULL;
static SDL_Window*      g_win = NULL;
static SDL_GLContext     g_ctx = NULL;

static int g_width  = 0;
static int g_height = 0;

/* ── Exported helpers ──────────────────────────────────────── */

/* Initialise SDL2 + WebGL2 context, create projectM instance.
 * canvas_selector: CSS selector for the target <canvas> (e.g. "#projectm-canvas")
 * width, height: initial viewport size
 * Returns 0 on success, non-zero on error. */
EMSCRIPTEN_KEEPALIVE
int pm_init(int width, int height)
{
    if (g_pm) return 0; /* already initialised */

    g_width  = width;
    g_height = height;

    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
        fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        return 1;
    }

    /* Request WebGL2 (OpenGL ES 3.0) */
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);

    g_win = SDL_CreateWindow("projectM",
                             SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
                             width, height,
                             SDL_WINDOW_OPENGL);
    if (!g_win) {
        fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        return 2;
    }

    g_ctx = SDL_GL_CreateContext(g_win);
    if (!g_ctx) {
        fprintf(stderr, "SDL_GL_CreateContext failed: %s\n", SDL_GetError());
        return 3;
    }

    /* Enable OES_texture_float — required by projectM for motion vectors */
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE webgl = emscripten_webgl_get_current_context();
    emscripten_webgl_enable_extension(webgl, "OES_texture_float");

    /* Create projectM */
    g_pm = projectm_create();
    if (!g_pm) {
        fprintf(stderr, "projectm_create() failed\n");
        return 4;
    }

    projectm_set_window_size(g_pm, width, height);
    projectm_set_fps(g_pm, 60);
    projectm_set_mesh_size(g_pm, 48, 36);
    projectm_set_aspect_correction(g_pm, true);
    projectm_set_beat_sensitivity(g_pm, 1.0);
    projectm_set_soft_cut_duration(g_pm, 3.0);
    projectm_set_preset_duration(g_pm, 30.0);
    projectm_set_hard_cut_enabled(g_pm, false);

    printf("projectM initialised: %dx%d\n", width, height);
    return 0;
}

/* Render one frame. Call this from requestAnimationFrame. */
EMSCRIPTEN_KEEPALIVE
void pm_render_frame(void)
{
    if (!g_pm) return;
    projectm_opengl_render_frame(g_pm);
    SDL_GL_SwapWindow(g_win);
}

/* Push interleaved stereo float PCM data.
 * samples: pointer to float array (LRLRLR...)
 * count: number of samples PER CHANNEL */
EMSCRIPTEN_KEEPALIVE
void pm_add_pcm(float* samples, unsigned int count)
{
    if (!g_pm) return;
    projectm_pcm_add_float(g_pm, samples, count, PROJECTM_STEREO);
}

/* Load a preset from a string (Milkdrop .milk file contents).
 * smooth: whether to do a smooth transition */
EMSCRIPTEN_KEEPALIVE
void pm_load_preset_data(const char* data, int smooth)
{
    if (!g_pm) return;
    projectm_load_preset_data(g_pm, data, smooth ? true : false);
}

/* Load a preset from a virtual file path (Emscripten FS).
 * path: path in the Emscripten virtual filesystem
 * smooth: whether to do a smooth transition */
EMSCRIPTEN_KEEPALIVE
void pm_load_preset_file(const char* path, int smooth)
{
    if (!g_pm) return;
    projectm_load_preset_file(g_pm, path, smooth ? true : false);
}

/* Resize the viewport */
EMSCRIPTEN_KEEPALIVE
void pm_set_size(int width, int height)
{
    if (!g_pm) return;
    g_width  = width;
    g_height = height;
    projectm_set_window_size(g_pm, width, height);
}

/* Set beat sensitivity (default 1.0) */
EMSCRIPTEN_KEEPALIVE
void pm_set_beat_sensitivity(float sensitivity)
{
    if (!g_pm) return;
    projectm_set_beat_sensitivity(g_pm, sensitivity);
}

/* Set soft cut (crossfade) duration in seconds */
EMSCRIPTEN_KEEPALIVE
void pm_set_soft_cut_duration(double seconds)
{
    if (!g_pm) return;
    projectm_set_soft_cut_duration(g_pm, seconds);
}

/* Set auto-advance duration (seconds per preset, 0 to disable) */
EMSCRIPTEN_KEEPALIVE
void pm_set_preset_duration(double seconds)
{
    if (!g_pm) return;
    projectm_set_preset_duration(g_pm, seconds);
}

/* Lock/unlock preset auto-switching */
EMSCRIPTEN_KEEPALIVE
void pm_set_preset_locked(int locked)
{
    if (!g_pm) return;
    projectm_set_preset_locked(g_pm, locked ? true : false);
}

/* Enable/disable hard cuts */
EMSCRIPTEN_KEEPALIVE
void pm_set_hard_cut_enabled(int enabled)
{
    if (!g_pm) return;
    projectm_set_hard_cut_enabled(g_pm, enabled ? true : false);
}

/* Set mesh resolution (default 48x36). Higher = more detail but slower. */
EMSCRIPTEN_KEEPALIVE
void pm_set_mesh_size(int width, int height)
{
    if (!g_pm) return;
    projectm_set_mesh_size(g_pm, width, height);
}

/* Get max PCM buffer size */
EMSCRIPTEN_KEEPALIVE
unsigned int pm_get_max_samples(void)
{
    return projectm_pcm_get_max_samples();
}

/* Clean up */
EMSCRIPTEN_KEEPALIVE
void pm_destroy(void)
{
    if (g_pm) {
        projectm_destroy(g_pm);
        g_pm = NULL;
    }
    if (g_ctx) {
        SDL_GL_DeleteContext(g_ctx);
        g_ctx = NULL;
    }
    if (g_win) {
        SDL_DestroyWindow(g_win);
        g_win = NULL;
    }
    SDL_Quit();
}
