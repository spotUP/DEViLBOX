/*
 * wasm_bridge.cpp — Main entry point for Furnace insEdit WASM module
 *
 * Sets up SDL2 window + OpenGL ES 3.0 / WebGL2 context, initializes Dear ImGui,
 * creates a minimal DivEngine with one instrument and one wavetable, then runs
 * an Emscripten main loop that calls FurnaceGUI::drawInsEdit() each frame.
 *
 * Exported C functions for JavaScript:
 *   furnace_insed_init()          — full initialization (SDL, GL, ImGui, engine, GUI)
 *   furnace_insed_shutdown()      — tear down everything
 *   furnace_insed_load_config()   — load instrument config from binary blob
 *   furnace_insed_dump_config()   — serialize current instrument to binary blob
 *   furnace_insed_set_chip_type() — change the instrument type / chip context
 *   furnace_insed_tick()          — advance one frame (called by JS if not using emscripten main loop)
 */

#include <emscripten.h>
#include <emscripten/html5.h>

#include <SDL.h>
#ifdef __EMSCRIPTEN__
#include <SDL_opengles2.h>
#else
#include <SDL_opengl.h>
#endif

#include "imgui.h"
#include "imgui_impl_sdl2.h"
#include "imgui_impl_opengl3.h"

#include "../gui/gui.h"
#include "../engine/engine.h"
#include "../engine/safeReader.h"

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static SDL_Window*   g_window   = nullptr;
static SDL_GLContext  g_glCtx    = nullptr;
static DivEngine*    g_engine   = nullptr;
static FurnaceGUI*   g_gui      = nullptr;
static bool          g_running  = false;

// Default canvas dimensions — resizable at runtime via CSS / JS
static constexpr int INIT_WIDTH  = 800;
static constexpr int INIT_HEIGHT = 600;

// ---------------------------------------------------------------------------
// Forward declarations
// ---------------------------------------------------------------------------

static void mainLoopIteration();
static bool initSDLAndGL();
static bool initImGui();
static bool initEngine();
static bool initGUI();

// ---------------------------------------------------------------------------
// SDL2 + OpenGL ES 3.0 (WebGL2) initialization
// ---------------------------------------------------------------------------

static bool initSDLAndGL() {
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) != 0) {
    printf("[wasm_bridge] SDL_Init error: %s\n", SDL_GetError());
    return false;
  }

  // Request OpenGL ES 3.0 — maps to WebGL2 under Emscripten
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_FLAGS, 0);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_ES);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
  SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);

  // Framebuffer attributes
  SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
  SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);
  SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);

  g_window = SDL_CreateWindow(
    "Furnace Instrument Editor",
    SDL_WINDOWPOS_CENTERED,
    SDL_WINDOWPOS_CENTERED,
    INIT_WIDTH,
    INIT_HEIGHT,
    SDL_WINDOW_OPENGL | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI
  );
  if (!g_window) {
    printf("[wasm_bridge] SDL_CreateWindow error: %s\n", SDL_GetError());
    return false;
  }

  g_glCtx = SDL_GL_CreateContext(g_window);
  if (!g_glCtx) {
    printf("[wasm_bridge] SDL_GL_CreateContext error: %s\n", SDL_GetError());
    return false;
  }

  SDL_GL_MakeCurrent(g_window, g_glCtx);
  SDL_GL_SetSwapInterval(1); // vsync

  return true;
}

// ---------------------------------------------------------------------------
// Dear ImGui initialization (SDL2 + OpenGL3/ES backends)
// ---------------------------------------------------------------------------

static bool initImGui() {
  IMGUI_CHECKVERSION();
  ImGui::CreateContext();

  ImGuiIO& io = ImGui::GetIO();
  io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
  // Disable .ini layout persistence in WASM — we manage state from JS
  io.IniFilename = nullptr;

  // Use the dark color scheme as default (matches Furnace tracker style)
  ImGui::StyleColorsDark();

  // Scale UI for readability
  ImGuiStyle& style = ImGui::GetStyle();
  style.ScaleAllSizes(1.0f);

  // GLSL version string for OpenGL ES 3.0 (WebGL2)
  const char* glslVersion = "#version 300 es";

  if (!ImGui_ImplSDL2_InitForOpenGL(g_window, g_glCtx)) {
    printf("[wasm_bridge] ImGui_ImplSDL2_InitForOpenGL failed\n");
    return false;
  }

  if (!ImGui_ImplOpenGL3_Init(glslVersion)) {
    printf("[wasm_bridge] ImGui_ImplOpenGL3_Init failed\n");
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// DivEngine stub setup — one instrument, one wavetable, one sample slot
// ---------------------------------------------------------------------------

static bool initEngine() {
  g_engine = new DivEngine();

  // The DivSong constructor already creates one DivSubSong and sets
  // system[0]=YM2612, system[1]=SMS with systemLen=2.
  // Point curSubSong at the first (and only) subsong.
  g_engine->curSubSong = g_engine->song.subsong[0];

  // Create one default instrument
  DivInstrument* ins = new DivInstrument();
  ins->name = "New Instrument";
  ins->type = DIV_INS_FM; // default to FM, can be changed via set_chip_type
  g_engine->song.ins.push_back(ins);
  g_engine->song.insLen = 1;

  // Create one default wavetable (required by some instrument types)
  DivWavetable* wave = new DivWavetable();
  g_engine->song.wave.push_back(wave);
  g_engine->song.waveLen = 1;

  // Allocate a tempIns for the GUI to use during editing
  g_engine->tempIns = new DivInstrument();

  return true;
}

// ---------------------------------------------------------------------------
// FurnaceGUI setup — bind engine, configure for insEdit-only mode
// ---------------------------------------------------------------------------

static bool initGUI() {
  g_gui = new FurnaceGUI();

  // bindEngine is the public API to set the engine pointer
  g_gui->bindEngine(g_engine);

  g_gui->wasmSetCurIns(0);
  g_gui->wasmSetInsEditOpen(true);
  g_gui->wasmSetDpiScale(1.0f);

  return true;
}

// ---------------------------------------------------------------------------
// Main loop — one iteration per frame
// ---------------------------------------------------------------------------

static void mainLoopIteration() {
  if (!g_running) return;

  // --- Process SDL events and forward to ImGui ---
  SDL_Event event;
  while (SDL_PollEvent(&event)) {
    ImGui_ImplSDL2_ProcessEvent(&event);

    switch (event.type) {
      case SDL_QUIT:
        g_running = false;
        return;

      case SDL_WINDOWEVENT:
        if (event.window.event == SDL_WINDOWEVENT_CLOSE &&
            event.window.windowID == SDL_GetWindowID(g_window)) {
          g_running = false;
          return;
        }
        break;
    }
  }

  // --- Start a new ImGui frame ---
  ImGui_ImplOpenGL3_NewFrame();
  ImGui_ImplSDL2_NewFrame();
  ImGui::NewFrame();

  // --- Draw the Furnace instrument editor ---
  // drawInsEdit() renders the full instrument editor panel.
  // It reads curIns, insEditOpen, dpiScale, and e->song from FurnaceGUI internals.
  g_gui->wasmDrawInsEdit();

  // --- Render ImGui draw data ---
  ImGui::Render();

  ImGuiIO& io = ImGui::GetIO();
  glViewport(0, 0, (int)io.DisplaySize.x, (int)io.DisplaySize.y);
  glClearColor(0.1f, 0.1f, 0.1f, 1.0f);
  glClear(GL_COLOR_BUFFER_BIT);

  ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());

  SDL_GL_SwapWindow(g_window);
}

// ---------------------------------------------------------------------------
// Exported C functions for JavaScript
// ---------------------------------------------------------------------------

extern "C" {

EMSCRIPTEN_KEEPALIVE
void furnace_insed_init(void) {
  printf("[wasm_bridge] furnace_insed_init — starting\n");

  if (!initSDLAndGL()) {
    printf("[wasm_bridge] FATAL: SDL/GL initialization failed\n");
    return;
  }
  printf("[wasm_bridge] SDL/GL initialized\n");

  if (!initImGui()) {
    printf("[wasm_bridge] FATAL: ImGui initialization failed\n");
    return;
  }
  printf("[wasm_bridge] ImGui initialized\n");

  if (!initEngine()) {
    printf("[wasm_bridge] FATAL: DivEngine initialization failed\n");
    return;
  }
  printf("[wasm_bridge] DivEngine initialized (1 ins, 1 wave)\n");

  if (!initGUI()) {
    printf("[wasm_bridge] FATAL: FurnaceGUI initialization failed\n");
    return;
  }
  printf("[wasm_bridge] FurnaceGUI initialized\n");

  g_running = true;
  printf("[wasm_bridge] furnace_insed_init — complete (call _start to begin loop)\n");
}

EMSCRIPTEN_KEEPALIVE
void furnace_insed_start(void) {
  if (!g_running) return;
  // Start the Emscripten main loop with simulate_infinite_loop=0
  // so this function returns and the JS caller can proceed.
  emscripten_set_main_loop(mainLoopIteration, 0, 0);
}

EMSCRIPTEN_KEEPALIVE
void furnace_insed_shutdown(void) {
  printf("[wasm_bridge] furnace_insed_shutdown\n");
  g_running = false;

  // Cancel the emscripten main loop
  emscripten_cancel_main_loop();

  // Tear down ImGui backends
  ImGui_ImplOpenGL3_Shutdown();
  ImGui_ImplSDL2_Shutdown();
  ImGui::DestroyContext();

  // Tear down SDL
  if (g_glCtx) {
    SDL_GL_DeleteContext(g_glCtx);
    g_glCtx = nullptr;
  }
  if (g_window) {
    SDL_DestroyWindow(g_window);
    g_window = nullptr;
  }
  SDL_Quit();

  // Tear down GUI (does not own engine or instruments)
  if (g_gui) {
    delete g_gui;
    g_gui = nullptr;
  }

  // Tear down engine (DivEngine destructor should clean up song.ins, song.wave, etc.)
  if (g_engine) {
    // Clean up tempIns if we allocated it
    if (g_engine->tempIns) {
      delete g_engine->tempIns;
      g_engine->tempIns = nullptr;
    }
    delete g_engine;
    g_engine = nullptr;
  }
}

// ---------------------------------------------------------------------------
// Field-by-field binary format parser (DEViLBOX 0xDE format)
// ---------------------------------------------------------------------------

static void parseFieldFormat(DivInstrument* ins, const unsigned char* data, int len) {
  if (len < 240) return;

  // [4] DivInstrumentType
  ins->type = (DivInstrumentType)data[4];

  // FM section (offset 8)
  ins->fm.alg = data[8];
  ins->fm.fb = data[9];
  ins->fm.fms = data[10];
  ins->fm.ams = data[11];
  ins->fm.ops = data[12];
  ins->fm.opllPreset = data[13];
  ins->fm.fixedDrums = data[14] != 0;
  ins->fm.fms2 = data[15];

  // FM operators (4 x 22 bytes at offsets 16, 38, 60, 82)
  for (int i = 0; i < 4; i++) {
    int off = 16 + i * 22;
    ins->fm.op[i].enable = data[off] != 0;
    ins->fm.op[i].mult = data[off+1];
    ins->fm.op[i].tl = data[off+2];
    ins->fm.op[i].ar = data[off+3];
    ins->fm.op[i].dr = data[off+4];
    ins->fm.op[i].d2r = data[off+5];
    ins->fm.op[i].sl = data[off+6];
    ins->fm.op[i].rr = data[off+7];
    ins->fm.op[i].dt = data[off+8];
    ins->fm.op[i].dt2 = data[off+9];
    ins->fm.op[i].rs = data[off+10];
    ins->fm.op[i].am = data[off+11];
    ins->fm.op[i].ksr = data[off+12];
    ins->fm.op[i].ksl = data[off+13];
    ins->fm.op[i].sus = data[off+14];
    ins->fm.op[i].vib = data[off+15];
    ins->fm.op[i].ws = data[off+16];
    ins->fm.op[i].ssgEnv = data[off+17];
    ins->fm.op[i].dam = data[off+18];
    ins->fm.op[i].dvb = data[off+19];
    ins->fm.op[i].egt = data[off+20];
    ins->fm.op[i].kvs = data[off+21];
  }

  // GB section (offset 104)
  ins->gb.envVol = data[104];
  ins->gb.envDir = data[105];
  ins->gb.envLen = data[106];
  ins->gb.soundLen = data[107];

  // C64 section (offset 112)
  unsigned char c64wave = data[112];
  ins->c64.triOn = (c64wave & 1) != 0;
  ins->c64.sawOn = (c64wave & 2) != 0;
  ins->c64.pulseOn = (c64wave & 4) != 0;
  ins->c64.noiseOn = (c64wave & 8) != 0;
  ins->c64.a = data[113];
  ins->c64.d = data[114];
  ins->c64.s = data[115];
  ins->c64.r = data[116];
  ins->c64.duty = data[117] | (data[118] << 8);
  ins->c64.ringMod = data[119];
  ins->c64.oscSync = data[120];
  ins->c64.res = data[121];
  ins->c64.cut = data[122] | (data[123] << 8);
  unsigned char c64filt = data[124];
  ins->c64.lp = (c64filt & 1) != 0;
  ins->c64.bp = (c64filt & 2) != 0;
  ins->c64.hp = (c64filt & 4) != 0;
  ins->c64.ch3off = (c64filt & 8) != 0;
  unsigned char c64misc = data[125];
  ins->c64.toFilter = (c64misc & 1) != 0;
  ins->c64.initFilter = (c64misc & 2) != 0;
  ins->c64.dutyIsAbs = (c64misc & 4) != 0;
  ins->c64.filterIsAbs = (c64misc & 8) != 0;

  // SNES section (offset 128)
  ins->snes.useEnv = data[128] != 0;
  ins->snes.gainMode = (DivInstrumentSNES::GainMode)data[129];
  ins->snes.gain = data[130];
  ins->snes.a = data[131];
  ins->snes.d = data[132];
  ins->snes.s = data[133];
  ins->snes.r = data[134];
  ins->snes.d2 = data[135];

  // N163 section (offset 136)
  ins->n163.wave = (int)(data[136] | (data[137] << 8) | (data[138] << 16) | (data[139] << 24));
  ins->n163.wavePos = data[140];
  ins->n163.waveLen = data[141];
  ins->n163.waveMode = data[142];
  ins->n163.perChanPos = data[143] != 0;

  // FDS section (offset 144)
  ins->fds.modSpeed = (int)(data[144] | (data[145] << 8) | (data[146] << 16) | (data[147] << 24));
  ins->fds.modDepth = (int)(data[148] | (data[149] << 8) | (data[150] << 16) | (data[151] << 24));
  for (int i = 0; i < 32; i++) {
    ins->fds.modTable[i] = (signed char)data[152 + i];
  }
  ins->fds.initModTableWithFirstWave = data[184] != 0;

  // ESFM section (offset 188)
  ins->esfm.noise = data[188];
  for (int i = 0; i < 4; i++) {
    int off = 189 + i * 8;
    ins->esfm.op[i].delay = data[off];
    ins->esfm.op[i].outLvl = data[off+1];
    ins->esfm.op[i].modIn = data[off+2];
    ins->esfm.op[i].left = data[off+3];
    ins->esfm.op[i].right = data[off+4];
    ins->esfm.op[i].ct = data[off+5];
    ins->esfm.op[i].dt = data[off+6];
    ins->esfm.op[i].fixed = data[off+7];
  }

  // ES5506 section (offset 224)
  ins->es5506.filter.mode = (DivInstrumentES5506::Filter::FilterMode)data[224];
  ins->es5506.filter.k1 = data[225] | (data[226] << 8);
  ins->es5506.filter.k2 = data[227] | (data[228] << 8);
  ins->es5506.envelope.ecount = data[229] | (data[230] << 8);
  ins->es5506.envelope.lVRamp = (signed char)data[231];
  ins->es5506.envelope.rVRamp = (signed char)data[232];
  ins->es5506.envelope.k1Ramp = (signed char)data[233];
  ins->es5506.envelope.k2Ramp = (signed char)data[234];
  ins->es5506.envelope.k1Slow = data[235] != 0;
  ins->es5506.envelope.k2Slow = data[236] != 0;

  printf("[wasm_bridge] parseFieldFormat: type=%d alg=%d fb=%d ops=%d\n",
    ins->type, ins->fm.alg, ins->fm.fb, ins->fm.ops);
}

// ---------------------------------------------------------------------------
// Field-by-field binary format writer (DEViLBOX 0xDE format, 240 bytes)
// ---------------------------------------------------------------------------

static int writeFieldFormat(const DivInstrument* ins, unsigned char* data, int maxLen) {
  if (maxLen < 240) return 0;
  memset(data, 0, 240);

  // Header
  data[0] = 0xDE;
  data[1] = 1; // version
  data[2] = 240 & 0xFF;
  data[3] = (240 >> 8) & 0xFF;
  data[4] = (unsigned char)ins->type;

  // FM section (offset 8)
  data[8] = ins->fm.alg;
  data[9] = ins->fm.fb;
  data[10] = ins->fm.fms;
  data[11] = ins->fm.ams;
  data[12] = ins->fm.ops;
  data[13] = ins->fm.opllPreset;
  data[14] = ins->fm.fixedDrums ? 1 : 0;
  data[15] = ins->fm.fms2;

  // FM operators (4 x 22 bytes at offsets 16, 38, 60, 82)
  for (int i = 0; i < 4; i++) {
    int off = 16 + i * 22;
    data[off] = ins->fm.op[i].enable ? 1 : 0;
    data[off+1] = ins->fm.op[i].mult;
    data[off+2] = ins->fm.op[i].tl;
    data[off+3] = ins->fm.op[i].ar;
    data[off+4] = ins->fm.op[i].dr;
    data[off+5] = ins->fm.op[i].d2r;
    data[off+6] = ins->fm.op[i].sl;
    data[off+7] = ins->fm.op[i].rr;
    data[off+8] = ins->fm.op[i].dt;
    data[off+9] = ins->fm.op[i].dt2;
    data[off+10] = ins->fm.op[i].rs;
    data[off+11] = ins->fm.op[i].am;
    data[off+12] = ins->fm.op[i].ksr;
    data[off+13] = ins->fm.op[i].ksl;
    data[off+14] = ins->fm.op[i].sus;
    data[off+15] = ins->fm.op[i].vib;
    data[off+16] = ins->fm.op[i].ws;
    data[off+17] = ins->fm.op[i].ssgEnv;
    data[off+18] = ins->fm.op[i].dam;
    data[off+19] = ins->fm.op[i].dvb;
    data[off+20] = ins->fm.op[i].egt;
    data[off+21] = ins->fm.op[i].kvs;
  }

  // GB section (offset 104)
  data[104] = ins->gb.envVol;
  data[105] = ins->gb.envDir;
  data[106] = ins->gb.envLen;
  data[107] = ins->gb.soundLen;

  // C64 section (offset 112)
  data[112] = (ins->c64.triOn ? 1 : 0) | (ins->c64.sawOn ? 2 : 0) |
              (ins->c64.pulseOn ? 4 : 0) | (ins->c64.noiseOn ? 8 : 0);
  data[113] = ins->c64.a;
  data[114] = ins->c64.d;
  data[115] = ins->c64.s;
  data[116] = ins->c64.r;
  data[117] = ins->c64.duty & 0xFF;
  data[118] = (ins->c64.duty >> 8) & 0xFF;
  data[119] = ins->c64.ringMod;
  data[120] = ins->c64.oscSync;
  data[121] = ins->c64.res;
  data[122] = ins->c64.cut & 0xFF;
  data[123] = (ins->c64.cut >> 8) & 0xFF;
  data[124] = (ins->c64.lp ? 1 : 0) | (ins->c64.bp ? 2 : 0) |
              (ins->c64.hp ? 4 : 0) | (ins->c64.ch3off ? 8 : 0);
  data[125] = (ins->c64.toFilter ? 1 : 0) | (ins->c64.initFilter ? 2 : 0) |
              (ins->c64.dutyIsAbs ? 4 : 0) | (ins->c64.filterIsAbs ? 8 : 0);

  // SNES section (offset 128)
  data[128] = ins->snes.useEnv ? 1 : 0;
  data[129] = (unsigned char)ins->snes.gainMode;
  data[130] = ins->snes.gain;
  data[131] = ins->snes.a;
  data[132] = ins->snes.d;
  data[133] = ins->snes.s;
  data[134] = ins->snes.r;
  data[135] = ins->snes.d2;

  // N163 section (offset 136)
  data[136] = ins->n163.wave & 0xFF;
  data[137] = (ins->n163.wave >> 8) & 0xFF;
  data[138] = (ins->n163.wave >> 16) & 0xFF;
  data[139] = (ins->n163.wave >> 24) & 0xFF;
  data[140] = ins->n163.wavePos;
  data[141] = ins->n163.waveLen;
  data[142] = ins->n163.waveMode;
  data[143] = ins->n163.perChanPos ? 1 : 0;

  // FDS section (offset 144)
  data[144] = ins->fds.modSpeed & 0xFF;
  data[145] = (ins->fds.modSpeed >> 8) & 0xFF;
  data[146] = (ins->fds.modSpeed >> 16) & 0xFF;
  data[147] = (ins->fds.modSpeed >> 24) & 0xFF;
  data[148] = ins->fds.modDepth & 0xFF;
  data[149] = (ins->fds.modDepth >> 8) & 0xFF;
  data[150] = (ins->fds.modDepth >> 16) & 0xFF;
  data[151] = (ins->fds.modDepth >> 24) & 0xFF;
  for (int i = 0; i < 32; i++) {
    data[152 + i] = (unsigned char)ins->fds.modTable[i];
  }
  data[184] = ins->fds.initModTableWithFirstWave ? 1 : 0;

  // ESFM section (offset 188)
  data[188] = ins->esfm.noise;
  for (int i = 0; i < 4; i++) {
    int off = 189 + i * 8;
    data[off] = ins->esfm.op[i].delay;
    data[off+1] = ins->esfm.op[i].outLvl;
    data[off+2] = ins->esfm.op[i].modIn;
    data[off+3] = ins->esfm.op[i].left;
    data[off+4] = ins->esfm.op[i].right;
    data[off+5] = ins->esfm.op[i].ct;
    data[off+6] = ins->esfm.op[i].dt;
    data[off+7] = ins->esfm.op[i].fixed;
  }

  // ES5506 section (offset 224)
  data[224] = (unsigned char)ins->es5506.filter.mode;
  data[225] = ins->es5506.filter.k1 & 0xFF;
  data[226] = (ins->es5506.filter.k1 >> 8) & 0xFF;
  data[227] = ins->es5506.filter.k2 & 0xFF;
  data[228] = (ins->es5506.filter.k2 >> 8) & 0xFF;
  data[229] = ins->es5506.envelope.ecount & 0xFF;
  data[230] = (ins->es5506.envelope.ecount >> 8) & 0xFF;
  data[231] = (unsigned char)ins->es5506.envelope.lVRamp;
  data[232] = (unsigned char)ins->es5506.envelope.rVRamp;
  data[233] = (unsigned char)ins->es5506.envelope.k1Ramp;
  data[234] = (unsigned char)ins->es5506.envelope.k2Ramp;
  data[235] = ins->es5506.envelope.k1Slow ? 1 : 0;
  data[236] = ins->es5506.envelope.k2Slow ? 1 : 0;

  return 240;
}

EMSCRIPTEN_KEEPALIVE
void furnace_insed_load_config(const unsigned char* data, int len) {
  if (!g_engine || !data || len < 4) return;
  if (g_engine->song.ins.empty()) return;

  DivInstrument* ins = g_engine->song.ins[0];

  // Detect format by first bytes
  if ((len >= 4) &&
      (memcmp(data, "INS2", 4) == 0 || memcmp(data, "IN2B", 4) == 0 ||
       memcmp(data, "INST", 4) == 0 ||
       memcmp(data, "FINS", 4) == 0 || memcmp(data, "FINB", 4) == 0)) {
    // Native Furnace format — use readInsData
    SafeReader reader(data, len);
    DivDataErrors err = ins->readInsData(reader, DIV_ENGINE_VERSION, &g_engine->song);
    if (err != DIV_DATA_SUCCESS) {
      printf("[wasm_bridge] furnace_insed_load_config: readInsData error %d\n", (int)err);
    } else {
      printf("[wasm_bridge] furnace_insed_load_config: native format loaded, type=%d\n", (int)ins->type);
    }
  } else if (data[0] == 0xDE && len >= 240) {
    // DEViLBOX field format
    parseFieldFormat(ins, data, len);
  } else {
    printf("[wasm_bridge] furnace_insed_load_config: unknown format (first bytes: %02x %02x %02x %02x, len=%d)\n",
      data[0], data[1], data[2], data[3], len);
  }
}

EMSCRIPTEN_KEEPALIVE
int furnace_insed_dump_config(unsigned char* data, int maxLen) {
  if (!g_engine || !data || maxLen < 240) return 0;
  if (g_engine->song.ins.empty()) return 0;

  const DivInstrument* ins = g_engine->song.ins[0];
  return writeFieldFormat(ins, data, maxLen);
}

EMSCRIPTEN_KEEPALIVE
void furnace_insed_set_chip_type(int chipType) {
  if (!g_engine) return;
  if (g_engine->song.ins.empty()) return;

  // Cast the integer chip type to DivInstrumentType and update the instrument.
  // This controls which parameter panels insEdit.cpp displays.
  DivInstrumentType newType = (DivInstrumentType)chipType;
  g_engine->song.ins[0]->type = newType;

  printf("[wasm_bridge] furnace_insed_set_chip_type: %d\n", chipType);
}

EMSCRIPTEN_KEEPALIVE
void furnace_insed_tick(void) {
  // Manual single-frame advance — can be called from JS instead of
  // relying on emscripten_set_main_loop. Useful for integration with
  // an external rAF loop managed by the host application.
  mainLoopIteration();
}

} // extern "C"
