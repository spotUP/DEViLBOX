/*
 * gui_stubs.cpp — FurnaceGUI method stubs for WASM insEdit
 *
 * Provides the FurnaceGUI constructor (copied from reference gui.cpp)
 * and no-op/minimal implementations for all FurnaceGUI methods
 * called by insEdit.cpp that aren't defined in insEdit.cpp itself.
 */

#include "../gui/gui.h"
#include "../engine/engine.h"
#include "imgui.h"
#include <cstring>

// ── CLAMP macro (used by pushToggleColors/pushAccentColors) ─────────────
#ifndef CLAMP
#define CLAMP(x,lo,hi) ((x)<(lo)?(lo):((x)>(hi)?(hi):(x)))
#endif

// ── noteNames lookup table (used by noteName/noteNameNormal) ────────────
static const char* noteNames[180]={
  "C-0","C#0","D-0","D#0","E-0","F-0","F#0","G-0","G#0","A-0","A#0","B-0",
  "C-1","C#1","D-1","D#1","E-1","F-1","F#1","G-1","G#1","A-1","A#1","B-1",
  "C-2","C#2","D-2","D#2","E-2","F-2","F#2","G-2","G#2","A-2","A#2","B-2",
  "C-3","C#3","D-3","D#3","E-3","F-3","F#3","G-3","G#3","A-3","A#3","B-3",
  "C-4","C#4","D-4","D#4","E-4","F-4","F#4","G-4","G#4","A-4","A#4","B-4",
  "C-5","C#5","D-5","D#5","E-5","F-5","F#5","G-5","G#5","A-5","A#5","B-5",
  "C-6","C#6","D-6","D#6","E-6","F-6","F#6","G-6","G#6","A-6","A#6","B-6",
  "C-7","C#7","D-7","D#7","E-7","F-7","F#7","G-7","G#7","A-7","A#7","B-7",
  "C-8","C#8","D-8","D#8","E-8","F-8","F#8","G-8","G#8","A-8","A#8","B-8",
  "C-9","C#9","D-9","D#9","E-9","F-9","F#9","G-9","G#9","A-9","A#9","B-9",
  "C-A","C#A","D-A","D#A","E-A","F-A","F#A","G-A","G#A","A-A","A#A","B-A",
  "C-B","C#B","D-B","D#B","E-B","F-B","F#B","G-B","G#B","A-B","A#B","B-B",
  "C-C","C#C","D-C","D#C","E-C","F-C","F#C","G-C","G#C","A-C","A#C","B-C",
  "C-D","C#D","D-D","D#D","E-D","F-D","F#D","G-D","G#D","A-D","A#D","B-D",
  "C-E","C#E","D-E","D#E","E-E","F-E","F#E","G-E","G#E","A-E","A#E","B-E",
};

static const char* noteNamesF[180]={
  "C-0","Db0","D-0","Eb0","E-0","F-0","Gb0","G-0","Ab0","A-0","Bb0","B-0",
  "C-1","Db1","D-1","Eb1","E-1","F-1","Gb1","G-1","Ab1","A-1","Bb1","B-1",
  "C-2","Db2","D-2","Eb2","E-2","F-2","Gb2","G-2","Ab2","A-2","Bb2","B-2",
  "C-3","Db3","D-3","Eb3","E-3","F-3","Gb3","G-3","Ab3","A-3","Bb3","B-3",
  "C-4","Db4","D-4","Eb4","E-4","F-4","Gb4","G-4","Ab4","A-4","Bb4","B-4",
  "C-5","Db5","D-5","Eb5","E-5","F-5","Gb5","G-5","Ab5","A-5","Bb5","B-5",
  "C-6","Db6","D-6","Eb6","E-6","F-6","Gb6","G-6","Ab6","A-6","Bb6","B-6",
  "C-7","Db7","D-7","Eb7","E-7","F-7","Gb7","G-7","Ab7","A-7","Bb7","B-7",
  "C-8","Db8","D-8","Eb8","E-8","F-8","Gb8","G-8","Ab8","A-8","Bb8","B-8",
  "C-9","Db9","D-9","Eb9","E-9","F-9","Gb9","G-9","Ab9","A-9","Bb9","B-9",
  "C-A","DbA","D-A","EbA","E-A","F-A","GbA","G-A","AbA","A-A","BbA","B-A",
  "C-B","DbB","D-B","EbB","E-B","F-B","GbB","G-B","AbB","A-B","BbB","B-B",
  "C-C","DbC","D-C","EbC","E-C","F-C","GbC","G-C","AbC","A-C","BbC","B-C",
  "C-D","DbD","D-D","EbD","E-D","F-D","GbD","G-D","AbD","A-D","BbD","B-D",
  "C-E","DbE","D-E","EbE","E-E","F-E","GbE","G-E","AbE","A-E","BbE","B-E",
};

static const char* noteNamesG[180]={
  "C-0","C#0","D-0","D#0","E-0","F-0","F#0","G-0","G#0","A-0","A#0","H-0",
  "C-1","C#1","D-1","D#1","E-1","F-1","F#1","G-1","G#1","A-1","A#1","H-1",
  "C-2","C#2","D-2","D#2","E-2","F-2","F#2","G-2","G#2","A-2","A#2","H-2",
  "C-3","C#3","D-3","D#3","E-3","F-3","F#3","G-3","G#3","A-3","A#3","H-3",
  "C-4","C#4","D-4","D#4","E-4","F-4","F#4","G-4","G#4","A-4","A#4","H-4",
  "C-5","C#5","D-5","D#5","E-5","F-5","F#5","G-5","G#5","A-5","A#5","H-5",
  "C-6","C#6","D-6","D#6","E-6","F-6","F#6","G-6","G#6","A-6","A#6","H-6",
  "C-7","C#7","D-7","D#7","E-7","F-7","F#7","G-7","G#7","A-7","A#7","H-7",
  "C-8","C#8","D-8","D#8","E-8","F-8","F#8","G-8","G#8","A-8","A#8","H-8",
  "C-9","C#9","D-9","D#9","E-9","F-9","F#9","G-9","G#9","A-9","A#9","H-9",
  "C-A","C#A","D-A","D#A","E-A","F-A","F#A","G-A","G#A","A-A","A#A","H-A",
  "C-B","C#B","D-B","D#B","E-B","F-B","F#B","G-B","G#B","A-B","A#B","H-B",
  "C-C","C#C","D-C","D#C","E-C","F-C","F#C","G-C","G#C","A-C","A#C","H-C",
  "C-D","C#D","D-D","D#D","E-D","F-D","F#D","G-D","G#D","A-D","A#D","H-D",
  "C-E","C#E","D-E","D#E","E-E","F-E","F#E","G-E","G#E","A-E","A#E","H-E",
};

static const char* noteNamesGF[180]={
  "C-0","Db0","D-0","Eb0","E-0","F-0","Gb0","G-0","Ab0","A-0","B-0","H-0",
  "C-1","Db1","D-1","Eb1","E-1","F-1","Gb1","G-1","Ab1","A-1","B-1","H-1",
  "C-2","Db2","D-2","Eb2","E-2","F-2","Gb2","G-2","Ab2","A-2","B-2","H-2",
  "C-3","Db3","D-3","Eb3","E-3","F-3","Gb3","G-3","Ab3","A-3","B-3","H-3",
  "C-4","Db4","D-4","Eb4","E-4","F-4","Gb4","G-4","Ab4","A-4","B-4","H-4",
  "C-5","Db5","D-5","Eb5","E-5","F-5","Gb5","G-5","Ab5","A-5","B-5","H-5",
  "C-6","Db6","D-6","Eb6","E-6","F-6","Gb6","G-6","Ab6","A-6","B-6","H-6",
  "C-7","Db7","D-7","Eb7","E-7","F-7","Gb7","G-7","Ab7","A-7","B-7","H-7",
  "C-8","Db8","D-8","Eb8","E-8","F-8","Gb8","G-8","Ab8","A-8","B-8","H-8",
  "C-9","Db9","D-9","Eb9","E-9","F-9","Gb9","G-9","Ab9","A-9","B-9","H-9",
  "C-A","DbA","D-A","EbA","E-A","F-A","GbA","G-A","AbA","A-A","B-A","H-A",
  "C-B","DbB","D-B","EbB","E-B","F-B","GbB","G-B","AbB","A-B","B-B","H-B",
  "C-C","DbC","D-C","EbC","E-C","F-C","GbC","G-C","AbC","A-C","B-C","H-C",
  "C-D","DbD","D-D","EbD","E-D","F-D","GbD","G-D","AbD","A-D","B-D","H-D",
  "C-E","DbE","D-E","EbE","E-E","F-E","GbE","G-E","AbE","A-E","B-E","H-E",
};

// ── FurnaceGUI method stubs ─────────────────────────────────────────────

void FurnaceGUI::bindEngine(DivEngine* eng) {
  e=eng;
}

const char* FurnaceGUI::noteName(short note) {
  if (note==100) return noteOffLabel;    // DIV_NOTE_OFF
  if (note==101) return noteRelLabel;    // DIV_NOTE_REL
  if (note==102) return macroRelLabel;   // DIV_MACRO_REL
  if (note==-1) return emptyLabel;
  if (note<0 || note>=180) return "???";
  if (settings.flatNotes) {
    if (settings.germanNotation) return noteNamesGF[note];
    return noteNamesF[note];
  }
  if (settings.germanNotation) return noteNamesG[note];
  return noteNames[note];
}

const char* FurnaceGUI::noteNameNormal(short note) {
  if (note==100) return "OFF";
  if (note==101) return "===";
  if (note==102) return "REL";
  if (note==-1) return "...";
  if (note<0 || note>=180) return "???";
  return noteNames[note];
}

bool FurnaceGUI::decodeNote(const char* what, short& note) {
  if (strlen(what)!=3) return false;
  if (strcmp(what,"...")==0) { note=-1; return true; }
  if (strcmp(what,"OFF")==0) { note=100; return true; }
  if (strcmp(what,"===")==0) { note=101; return true; }
  if (strcmp(what,"REL")==0) { note=102; return true; }
  return false;
}

void FurnaceGUI::setCurIns(int newIns) {
  curIns=newIns;
  memset(multiIns,-1,7*sizeof(int));
}

void FurnaceGUI::editStr(String* which) {
  editString=which;
  displayEditString=true;
}

void FurnaceGUI::showWarning(String what, FurnaceGUIWarnings type) {
  warnString=what;
  (void)type;
}

void FurnaceGUI::showError(String what) {
  errorString=what;
  displayError=true;
}

String FurnaceGUI::getLastError() {
  return lastError;
}

void FurnaceGUI::doAction(int what) {
  (void)what;
  // no-op in WASM
}

void FurnaceGUI::pushToggleColors(bool status) {
  ImVec4 toggleColor=status?uiColors[GUI_COLOR_TOGGLE_ON]:uiColors[GUI_COLOR_TOGGLE_OFF];
  ImGui::PushStyleColor(ImGuiCol_Button,toggleColor);
  if (!mobileUI) {
    if (settings.guiColorsBase) {
      toggleColor.x*=0.8f;
      toggleColor.y*=0.8f;
      toggleColor.z*=0.8f;
    } else {
      toggleColor.x=CLAMP(toggleColor.x*1.3f,0.0f,1.0f);
      toggleColor.y=CLAMP(toggleColor.y*1.3f,0.0f,1.0f);
      toggleColor.z=CLAMP(toggleColor.z*1.3f,0.0f,1.0f);
    }
  }
  ImGui::PushStyleColor(ImGuiCol_ButtonHovered,toggleColor);
  if (settings.guiColorsBase) {
    toggleColor.x*=0.8f;
    toggleColor.y*=0.8f;
    toggleColor.z*=0.8f;
  } else {
    toggleColor.x=CLAMP(toggleColor.x*1.5f,0.0f,1.0f);
    toggleColor.y=CLAMP(toggleColor.y*1.5f,0.0f,1.0f);
    toggleColor.z=CLAMP(toggleColor.z*1.5f,0.0f,1.0f);
  }
  ImGui::PushStyleColor(ImGuiCol_ButtonActive,toggleColor);
}

void FurnaceGUI::popToggleColors() {
  ImGui::PopStyleColor(3);
}

void FurnaceGUI::pushAccentColors(const ImVec4& one, const ImVec4& two, const ImVec4& border, const ImVec4& borderShadow) {
  float hue, sat, val;

  ImVec4 primaryActive=one;
  ImVec4 primaryHover, primary;
  primaryHover.w=primaryActive.w;
  primary.w=primaryActive.w;
  ImGui::ColorConvertRGBtoHSV(primaryActive.x,primaryActive.y,primaryActive.z,hue,sat,val);
  if (settings.guiColorsBase) {
    primary=primaryActive;
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.9f,val*0.9f,primaryHover.x,primaryHover.y,primaryHover.z);
    ImGui::ColorConvertHSVtoRGB(hue,sat,val*0.5f,primaryActive.x,primaryActive.y,primaryActive.z);
  } else {
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.9f,val*0.5f,primaryHover.x,primaryHover.y,primaryHover.z);
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.8f,val*0.35f,primary.x,primary.y,primary.z);
  }

  ImVec4 secondaryActive=two;
  ImVec4 secondaryHover, secondary, secondarySemiActive;
  secondarySemiActive.w=secondaryActive.w;
  secondaryHover.w=secondaryActive.w;
  secondary.w=secondaryActive.w;
  ImGui::ColorConvertRGBtoHSV(secondaryActive.x,secondaryActive.y,secondaryActive.z,hue,sat,val);
  if (settings.guiColorsBase) {
    secondary=secondaryActive;
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.9f,val*0.7f,secondarySemiActive.x,secondarySemiActive.y,secondarySemiActive.z);
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.9f,val*0.9f,secondaryHover.x,secondaryHover.y,secondaryHover.z);
    ImGui::ColorConvertHSVtoRGB(hue,sat,val*0.5f,secondaryActive.x,secondaryActive.y,secondaryActive.z);
  } else {
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.9f,val*0.75f,secondarySemiActive.x,secondarySemiActive.y,secondarySemiActive.z);
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.9f,val*0.5f,secondaryHover.x,secondaryHover.y,secondaryHover.z);
    ImGui::ColorConvertHSVtoRGB(hue,sat*0.9f,val*0.25f,secondary.x,secondary.y,secondary.z);
  }

  ImGui::PushStyleColor(ImGuiCol_Button,primary);
  ImGui::PushStyleColor(ImGuiCol_ButtonHovered,primaryHover);
  ImGui::PushStyleColor(ImGuiCol_ButtonActive,primaryActive);
  ImGui::PushStyleColor(ImGuiCol_Tab,primary);
  ImGui::PushStyleColor(ImGuiCol_TabHovered,secondaryHover);
  ImGui::PushStyleColor(ImGuiCol_TabActive,secondarySemiActive);
  ImGui::PushStyleColor(ImGuiCol_TabUnfocused,primary);
  ImGui::PushStyleColor(ImGuiCol_TabUnfocusedActive,primaryHover);
  ImGui::PushStyleColor(ImGuiCol_Header,secondary);
  ImGui::PushStyleColor(ImGuiCol_HeaderHovered,secondaryHover);
  ImGui::PushStyleColor(ImGuiCol_HeaderActive,secondaryActive);
  ImGui::PushStyleColor(ImGuiCol_ResizeGrip,secondary);
  ImGui::PushStyleColor(ImGuiCol_ResizeGripHovered,secondaryHover);
  ImGui::PushStyleColor(ImGuiCol_ResizeGripActive,secondaryActive);
  ImGui::PushStyleColor(ImGuiCol_FrameBg,secondary);
  ImGui::PushStyleColor(ImGuiCol_FrameBgHovered,secondaryHover);
  ImGui::PushStyleColor(ImGuiCol_FrameBgActive,secondaryActive);
  ImGui::PushStyleColor(ImGuiCol_SliderGrab,primaryActive);
  ImGui::PushStyleColor(ImGuiCol_SliderGrabActive,primaryActive);
  ImGui::PushStyleColor(ImGuiCol_TitleBgActive,primary);
  ImGui::PushStyleColor(ImGuiCol_CheckMark,primaryActive);
  ImGui::PushStyleColor(ImGuiCol_TextSelectedBg,secondaryHover);
  ImGui::PushStyleColor(ImGuiCol_Border,border);
  ImGui::PushStyleColor(ImGuiCol_BorderShadow,borderShadow);
}

void FurnaceGUI::popAccentColors() {
  ImGui::PopStyleColor(24);
}

void FurnaceGUI::pushDestColor() {
  pushAccentColors(uiColors[GUI_COLOR_DESTRUCTIVE],uiColors[GUI_COLOR_DESTRUCTIVE],uiColors[GUI_COLOR_DESTRUCTIVE],ImVec4(0.0f,0.0f,0.0f,0.0f));
}

void FurnaceGUI::popDestColor() {
  popAccentColors();
}

void FurnaceGUI::pushWarningColor(bool warnCond, bool errorCond) {
  if (errorCond) {
    ImGui::PushStyleColor(ImGuiCol_Text,uiColors[GUI_COLOR_ERROR]);
    warnColorPushed=true;
  } else if (warnCond) {
    ImGui::PushStyleColor(ImGuiCol_Text,uiColors[GUI_COLOR_WARNING]);
    warnColorPushed=true;
  } else {
    warnColorPushed=false;
  }
}

void FurnaceGUI::popWarningColor() {
  if (warnColorPushed) {
    ImGui::PopStyleColor();
    warnColorPushed=false;
  }
}

// renderFMPreview is defined in fmPreview.cpp — not stubbed here

bool FurnaceGUI::isCtrlWheelModifierHeld() const {
  const SDL_Keymod mod=SDL_GetModState();
  return (mod&KMOD_CTRL)!=0;
}

bool FurnaceGUI::CWSliderInt(const char* label, int* v, int v_min, int v_max, const char* format, ImGuiSliderFlags flags) {
  return ImGui::SliderInt(label, v, v_min, v_max, format, flags);
}

void FurnaceGUI::processDrags(int dragX, int dragY) {
  (void)dragX;
  (void)dragY;
  // no-op — drag handling for macros/waves
}

void FurnaceGUI::encodeMMLStr(String& target, int* macro, int macroLen, int macroLoop, int macroRel, bool hex, bool bit30) {
  (void)target; (void)macro; (void)macroLen; (void)macroLoop; (void)macroRel; (void)hex; (void)bit30;
  target="";
}

void FurnaceGUI::decodeMMLStr(String& source, int* macro, unsigned char& macroLen, unsigned char& macroLoop, int macroMin, int macroMax, unsigned char& macroRel, bool bit30) {
  (void)source; (void)macro; (void)macroLen; (void)macroLoop; (void)macroMin; (void)macroMax; (void)macroRel; (void)bit30;
}

bool FurnaceGUI::CWSliderScalar(const char* label, ImGuiDataType data_type, void* p_data, const void* p_min, const void* p_max, const char* format, ImGuiSliderFlags flags) {
  return ImGui::SliderScalar(label, data_type, p_data, p_min, p_max, format, flags);
}

bool FurnaceGUI::CWVSliderInt(const char* label, const ImVec2& size, int* v, int v_min, int v_max, const char* format, ImGuiSliderFlags flags) {
  return ImGui::VSliderInt(label, size, v, v_min, v_max, format, flags);
}

bool FurnaceGUI::CWVSliderScalar(const char* label, const ImVec2& size, ImGuiDataType data_type, void* p_data, const void* p_min, const void* p_max, const char* format, ImGuiSliderFlags flags) {
  return ImGui::VSliderScalar(label, size, data_type, p_data, p_min, p_max, format, flags);
}

void FurnaceGUI::decodeMMLStrW(String& source, int* macro, int& macroLen, int macroMin, int macroMax, bool hex) {
  (void)source; (void)macro; (void)macroLen; (void)macroMin; (void)macroMax; (void)hex;
}

bool FurnaceGUI::LocalizedComboGetter(void* data, int idx, const char** out_text) {
  const char** items=(const char**)data;
  if (out_text) *out_text=items[idx];
  return true;
}

// ── Additional method stubs that insEdit may call ───────────────────────

void FurnaceGUI::pushPartBlend() {}
void FurnaceGUI::popPartBlend() {}
void FurnaceGUI::updateScroll(int amount) { (void)amount; }
void FurnaceGUI::addScroll(int amount) { (void)amount; }
void FurnaceGUI::addScrollX(int amount) { (void)amount; }

bool FurnaceGUI::init() { return true; }
bool FurnaceGUI::finish(bool saveConfig) { (void)saveConfig; return true; }
bool FurnaceGUI::loop() { return true; }
int FurnaceGUI::processEvent(SDL_Event* ev) { (void)ev; return 0; }
bool FurnaceGUI::requestQuit() { return true; }
void FurnaceGUI::enableSafeMode() {}
void FurnaceGUI::updateScrollRaw(float amount) { (void)amount; }
void FurnaceGUI::setFileName(String name) { (void)name; }
void FurnaceGUI::runBackupThread() {}
void FurnaceGUI::runPendingDrawOsc(PendingDrawOsc* which) { (void)which; }
bool FurnaceGUI::detectOutOfBoundsWindow(SDL_Rect& failing) { (void)failing; return false; }

// ── FurnaceGUI constructor — copied from reference gui.cpp ──────────────
// Lines 8767-9496 of the original gui.cpp.

FurnaceGUI::FurnaceGUI():
  e(NULL),
  renderBackend(GUI_BACKEND_SDL),
  rend(NULL),
  bestTexFormat(GUI_TEXFORMAT_UNKNOWN),
  sdlWin(NULL),
  vibrator(NULL),
  vibratorAvailable(false),
  cv(NULL),
  cvTex(NULL),
  lastCVFrame(0),
  cvFrameTime(100000),
  cvFrameHold(0),
  sampleTex(NULL),
  sampleTexW(0),
  sampleTexH(0),
  updateSampleTex(true),
  csTex(NULL),
  quit(false),
  warnQuit(false),
  willCommit(false),
  edit(false),
  editClone(false),
  isPatUnique(false),
  modified(false),
  displayError(false),
  displayExporting(false),
  vgmExportLoop(true),
  vgmExportPatternHints(false),
  vgmExportDPCM07(false),
  vgmExportDirectStream(false),
  displayInsTypeList(false),
  displayWaveSizeList(false),
  portrait(false),
  injectBackUp(false),
  mobileMenuOpen(false),
  warnColorPushed(false),
  wantCaptureKeyboard(false),
  oldWantCaptureKeyboard(false),
  displayMacroMenu(false),
  displayNew(false),
  displayExport(false),
  displayPalette(false),
  fullScreen(false),
  sysFullScreen(false),
  preserveChanPos(false),
  sysDupCloneChannels(true),
  sysDupEnd(false),
  noteInputMode(0),
  notifyWaveChange(false),
  notifySampleChange(false),
  recalcTimestamps(true),
  wantScrollListIns(false),
  wantScrollListWave(false),
  wantScrollListSample(false),
  displayPendingIns(false),
  pendingInsSingle(false),
  displayPendingRawSample(false),
  snesFilterHex(false),
  modTableHex(false),
  displayEditString(false),
  displayPendingSamples(false),
  replacePendingSample(false),
  displayExportingROM(false),
  displayExportingCS(false),
  newPatternRenderer(false),
  quitNoSave(false),
  changeCoarse(false),
  orderLock(false),
  mobileEdit(false),
  killGraphics(false),
  safeMode(false),
  midiWakeUp(true),
  makeDrumkitMode(false),
  filePlayerSync(true),
  audioEngineChanged(false),
  settingsChanged(false),
  debugFFT(false),
  debugRowTimestamps(false),
  vgmExportVersion(0x171),
  vgmExportTrailingTicks(-1),
  vgmExportCorrectedRate(44100),
  drawHalt(10),
  macroPointSize(16),
  waveEditStyle(0),
  chordInputOffset(0),
  displayInsTypeListMakeInsSample(-1),
  makeDrumkitOctave(3),
  mobileEditPage(0),
  wheelCalmDown(0),
  shallDetectScale(0),
  cpuCores(0),
  secondTimer(0.0f),
  userEvents(0xffffffff),
  mobileMenuPos(0.0f),
  autoButtonSize(0.0f),
  mobileEditAnim(0.0f),
  mobileEditButtonPos(0.7f,0.7f),
  mobileEditButtonSize(60.0f,60.0f),
  curSysSection(NULL),
  updateFMPreview(true),
  fmPreviewOn(false),
  fmPreviewPaused(false),
  fmPreviewOPN(NULL),
  fmPreviewOPM(NULL),
  fmPreviewOPL(NULL),
  fmPreviewOPLL(NULL),
  fmPreviewOPZ(NULL),
  fmPreviewOPZInterface(NULL),
  editString(NULL),
  pendingRawSampleDepth(8),
  pendingRawSampleChannels(1),
  pendingRawSampleRate(32000),
  pendingRawSampleUnsigned(false),
  pendingRawSampleBigEndian(false),
  pendingRawSampleSwapNibbles(false),
  pendingRawSampleReplace(false),
  globalWinFlags(0),
  curFileDialog(GUI_FILE_OPEN),
  warnAction(GUI_WARN_OPEN),
  postWarnAction(GUI_WARN_GENERIC),
  mobScene(GUI_SCENE_PATTERN),
  fileDialog(NULL),
  newFilePicker(NULL),
  scrW(1280),
  scrH(800),
  scrConfW(1280),
  scrConfH(800),
  canvasW(1280),
  canvasH(800),
  scrX(0),
  scrY(0),
  scrConfX(0),
  scrConfY(0),
  scrMax(false),
  sysManagedScale(false),
  dpiScale(1),
  aboutScroll(0),
  aboutSin(0),
  aboutHue(0.0f),
  backupTimer(0.0),
  totalBackupSize(0),
  refreshBackups(true),
  learning(-1),
  mainFont(NULL),
  iconFont(NULL),
  furIconFont(NULL),
  patFont(NULL),
  bigFont(NULL),
  headFont(NULL),
  songLength(0.0),
  totalLength(0.0),
  curProgress(0.0f),
  totalFiles(0),
  localeRequiresJapanese(false),
  localeRequiresChinese(false),
  localeRequiresChineseTrad(false),
  localeRequiresKorean(false),
  prevInsData(NULL),
  cachedCurInsPtr(NULL),
  insEditMayBeDirty(false),
  pendingLayoutImport(NULL),
  pendingLayoutImportLen(0),
  pendingLayoutImportStep(0),
  curIns(0),
  curWave(0),
  curSample(0),
  curOctave(3),
  curOrder(0),
  playOrder(0),
  prevIns(0),
  oldRow(0),
  editStep(1),
  editStepCoarse(16),
  soloChan(-1),
  orderEditMode(0),
  orderCursor(-1),
  isClipping(0),
  newSongCategory(0),
  latchTarget(0),
  undoOrder(0),
  wheelX(0),
  wheelY(0),
  dragSourceX(0),
  dragSourceXFine(0),
  dragSourceY(0),
  dragSourceOrder(0),
  dragDestinationX(0),
  dragDestinationXFine(0),
  dragDestinationY(0),
  dragDestinationOrder(0),
  oldBeat(-1),
  oldBar(-1),
  curGroove(-1),
  exitDisabledTimer(0),
  curPaletteChoice(0),
  curPaletteType(0),
  soloTimeout(0.0f),
  mobileMultiInsToggle(false),
  purgeYear(2021),
  purgeMonth(4),
  purgeDay(4),
  patExtraButtons(false),
  patChannelNames(false),
  patChannelPairs(true),
  patChannelHints(0),
  newSongFirstFrame(false),
  oldRowChanged(false),
  editControlsOpen(true),
  ordersOpen(true),
  insListOpen(true),
  songInfoOpen(true),
  patternOpen(true),
  insEditOpen(true),
  waveListOpen(true),
  waveEditOpen(false),
  sampleListOpen(true),
  sampleEditOpen(false),
  aboutOpen(false),
  settingsOpen(false),
  mixerOpen(false),
  debugOpen(false),
  inspectorOpen(false),
  oscOpen(true),
  volMeterOpen(true),
  statsOpen(false),
  compatFlagsOpen(false),
  pianoOpen(false),
  notesOpen(false),
  tunerOpen(false),
  spectrumOpen(false),
  channelsOpen(false),
  regViewOpen(false),
  logOpen(false),
  effectListOpen(false),
  chanOscOpen(false),
  subSongsOpen(true),
  findOpen(false),
  spoilerOpen(false),
  patManagerOpen(false),
  sysManagerOpen(false),
  clockOpen(false),
  speedOpen(true),
  groovesOpen(false),
  xyOscOpen(false),
  memoryOpen(false),
  csPlayerOpen(false),
  cvOpen(false),
  userPresetsOpen(false),
  refPlayerOpen(false),
  multiInsSetupOpen(false),
  cvNotSerious(false),
  shortIntro(false),
  insListDir(false),
  waveListDir(false),
  sampleListDir(false),
  clockShowReal(true),
  clockShowRow(true),
  clockShowBeat(true),
  clockShowMetro(true),
  clockShowTime(true),
  selecting(false),
  selectingFull(false),
  dragging(false),
  curNibble(false),
  orderNibble(false),
  followOrders(true),
  followPattern(true),
  wasFollowing(false),
  changeAllOrders(false),
  mobileUI(false),
  collapseWindow(false),
  demandScrollX(false),
  fancyPattern(false),
  firstFrame(true),
  tempoView(true),
  waveHex(false),
  waveSigned(false),
  waveGenVisible(false),
  lockLayout(false),
  editOptsVisible(false),
  latchNibble(false),
  nonLatchNibble(false),
  keepLoopAlive(false),
  keepGrooveAlive(false),
  orderScrollLocked(false),
  orderScrollTolerance(false),
  dragMobileMenu(false),
  dragMobileEditButton(false),
  wantGrooveListFocus(false),
  mobilePatSel(false),
  openEditMenu(false),
  lastAssetType(0),
  curWindow(GUI_WINDOW_NOTHING),
  nextWindow(GUI_WINDOW_NOTHING),
  curWindowLast(GUI_WINDOW_NOTHING),
  curWindowThreadSafe(GUI_WINDOW_NOTHING),
  failedNoteOn(false),
  lastPatternWidth(0.0f),
  longThreshold(0.48f),
  buttonLongThreshold(0.20f),
  lastAudioLoadsPos(0),
  latchNote(-1),
  latchIns(-2),
  latchVol(-1),
  latchEffect(-1),
  latchEffectVal(-1),
  wavePreviewLen(32),
  wavePreviewHeight(255),
  wavePreviewInit(true),
  wavePreviewPaused(false),
  wavePreviewAccum(0.0f),
  pgSys(0),
  pgAddr(0),
  pgVal(0),
  curQueryRangeX(false),
  curQueryBackwards(false),
  curQueryRangeXMin(0), curQueryRangeXMax(0),
  curQueryRangeY(0),
  curQueryEffectPos(0),
  queryReplaceEffectCount(0),
  queryReplaceEffectPos(1),
  queryReplaceNoteMode(0),
  queryReplaceInsMode(0),
  queryReplaceVolMode(0),
  queryReplaceNote(108),
  queryReplaceIns(0),
  queryReplaceVol(0),
  queryReplaceNoteDo(false),
  queryReplaceInsDo(false),
  queryReplaceVolDo(false),
  queryViewingResults(false),
  supportsOgg(false),
  supportsMP3(false),
  wavePreviewOn(false),
  wavePreviewKey((SDL_Scancode)0),
  wavePreviewNote(0),
  samplePreviewOn(false),
  samplePreviewKey((SDL_Scancode)0),
  samplePreviewNote(0),
  sampleMapSelStart(-1),
  sampleMapSelEnd(-1),
  sampleMapDigit(0),
  sampleMapColumn(0),
  sampleMapFocused(false),
  sampleMapWaitingInput(false),
  macroDragStart(0,0),
  macroDragAreaSize(0,0),
  macroDragCTarget(NULL),
  macroDragTarget(NULL),
  macroDragLen(0),
  macroDragMin(0),
  macroDragMax(0),
  macroDragLastX(-1),
  macroDragLastY(-1),
  macroDragScroll(0),
  macroDragBitMode(false),
  macroDragInitialValueSet(false),
  macroDragInitialValue(false),
  macroDragChar(false),
  macroDragBit30(false),
  macroDragSettingBit30(false),
  macroDragLineMode(false),
  macroDragMouseMoved(false),
  macroDragLineInitial(0,0),
  macroDragLineInitialV(0,0),
  macroDragActive(false),
  lastMacroDesc(NULL,NULL,0,0,0.0f),
  macroOffX(0),
  macroOffY(0),
  macroScaleX(100.0f),
  macroScaleY(100.0f),
  macroRandMin(0),
  macroRandMax(0),
  macroLoopDragStart(0,0),
  macroLoopDragAreaSize(0,0),
  macroLoopDragTarget(NULL),
  macroLoopDragLen(0),
  macroLoopDragActive(false),
  waveDragStart(0,0),
  waveDragAreaSize(0,0),
  waveDragTarget(NULL),
  waveDragLen(0),
  waveDragMin(0),
  waveDragMax(0),
  waveDragActive(false),
  bindSetTarget(0),
  bindSetTargetIdx(0),
  bindSetPrevValue(0),
  bindSetActive(false),
  bindSetPending(false),
  nextScroll(-1.0f),
  nextAddScroll(0.0f),
  orderScroll(0.0f),
  orderScrollSlideOrigin(0.0f),
  patScroll(-1.0f),
  orderScrollRealOrigin(0.0f,0.0f),
  dragMobileMenuOrigin(0.0f,0.0f),
  layoutTimeBegin(0),
  layoutTimeEnd(0),
  layoutTimeDelta(0),
  renderTimeBegin(0),
  renderTimeEnd(0),
  renderTimeDelta(0),
  drawTimeBegin(0),
  drawTimeEnd(0),
  drawTimeDelta(0),
  swapTimeBegin(0),
  swapTimeEnd(0),
  swapTimeDelta(0),
  eventTimeBegin(0),
  eventTimeEnd(0),
  eventTimeDelta(0),
  nextPresentTime(0),
  perfMetricsLen(0),
  chanToMove(-1),
  sysToMove(-1),
  sysToDelete(-1),
  opToMove(-1),
  assetToMove(-1),
  dirToMove(-1),
  insToMove(-1),
  waveToMove(-1),
  sampleToMove(-1),
  transposeAmount(0),
  randomizeMin(0),
  randomizeMax(255),
  fadeMin(0),
  fadeMax(255),
  collapseAmount(2),
  randomizeEffectVal(0),
  topMostOrder(-1),
  topMostRow(-1),
  bottomMostOrder(-1),
  bottomMostRow(-1),
  playheadY(0.0f),
  scaleMax(100.0f),
  fadeMode(false),
  randomMode(false),
  haveHitBounds(false),
  randomizeEffect(false),
  pendingStepUpdate(0),
  oldOrdersLen(0),
  opTouched(NULL),
  sampleZoom(1.0),
  prevSampleZoom(1.0),
  minSampleZoom(1.0),
  samplePos(0),
  resizeSize(1024),
  silenceSize(1024),
  resampleTarget(32000),
  resampleStrat(5),
  amplifyVol(100.0),
  amplifyOff(0.0),
  sampleSelStart(-1),
  sampleSelEnd(-1),
  sampleInfo(true),
  sampleDragActive(false),
  sampleDragMode(false),
  sampleDrag16(false),
  sampleZoomAuto(true),
  sampleCheckLoopStart(true),
  sampleCheckLoopEnd(true),
  sampleSelTarget(0),
  sampleDragTarget(NULL),
  sampleDragStart(0,0),
  sampleDragAreaSize(0,0),
  sampleDragLen(0),
  sampleFilterL(1.0f),
  sampleFilterB(0.0f),
  sampleFilterH(0.0f),
  sampleFilterRes(0.25f),
  sampleFilterCutStart(16000.0f),
  sampleFilterCutEnd(100.0f),
  sampleFilterSweep(false),
  sampleFilterFirstFrame(true),
  sampleCrossFadeLoopLength(0),
  sampleCrossFadeLoopLaw(50),
  sampleFilterPower(1),
  sampleClipboard(NULL),
  sampleClipboardLen(0),
  openSampleResizeOpt(false),
  openSampleResampleOpt(false),
  openSampleAmplifyOpt(false),
  openSampleSilenceOpt(false),
  openSampleFilterOpt(false),
  openSampleCrossFadeOpt(false),
  selectedPortSet(0x1fff),
  selectedSubPort(-1),
  hoveredPortSet(0x1fff),
  hoveredSubPort(-1),
  portDragActive(false),
  displayHiddenPorts(false),
  displayInternalPorts(false),
  subPortPos(0.0f,0.0f),
  oscTotal(0),
  oscWidth(512),
  oscValuesAverage(NULL),
  oscZoom(0.5f),
  oscWindowSize(20.0f),
  oscInput(0.0f),
  oscInput1(0.0f),
  oscZoomSlider(false),
  chanOscCols(3),
  chanOscColorX(GUI_OSCREF_CENTER),
  chanOscColorY(GUI_OSCREF_CENTER),
  chanOscCenterStrat(1),
  chanOscColorMode(0),
  chanOscWindowSize(20.0f),
  chanOscTextX(0.0f),
  chanOscTextY(0.0f),
  chanOscAmplify(0.95f),
  chanOscLineSize(1.0f),
  chanOscWaveCorr(true),
  chanOscOptions(false),
  updateChanOscGradTex(true),
  chanOscUseGrad(false),
  chanOscNormalize(false),
  chanOscRandomPhase(false),
  chanOscAutoCols(false),
  chanOscTextFormat("%c"),
  chanOscColor(1.0f,1.0f,1.0f,1.0f),
  chanOscTextColor(1.0f,1.0f,1.0f,0.75f),
  chanOscGrad(64,64),
  chanOscGradTex(NULL),
  chanOscWorkPool(NULL),
  xyOscPointTex(NULL),
  xyOscOptions(false),
  xyOscXChannel(0),
  xyOscXInvert(false),
  xyOscYChannel(1),
  xyOscYInvert(false),
  xyOscZoom(1.0f),
  xyOscSamples(32768),
  xyOscDecayTime(10.0f),
  xyOscIntensity(2.0f),
  xyOscThickness(2.0f),
  tunerFFTInBuf(NULL),
  tunerFFTOutBuf(NULL),
  tunerPlan(NULL),
  fpCueInput(""),
  fpCueInputFailed(false),
  fpCueInputFailReason(""),
  followLog(true),
  pianoOctaves(7),
  pianoOctavesEdit(4),
  pianoOptions(false),
  pianoSharePosition(true),
  pianoReadonly(false),
  pianoOffset(6),
  pianoOffsetEdit(6),
  pianoView(PIANO_LAYOUT_STANDARD),
  pianoInputPadMode(PIANO_INPUT_PAD_DISABLE),
  pianoLabelsMode(PIANO_LABELS_OCTAVE),
  pianoKeyColorMode(PIANO_KEY_COLOR_SINGLE),
  hasACED(false),
  waveGenBaseShape(0),
  waveInterpolation(0),
  waveGenDuty(0.5f),
  waveGenPower(1),
  waveGenInvertPoint(1.0f),
  waveGenScaleX(32),
  waveGenScaleY(32),
  waveGenOffsetX(0),
  waveGenOffsetY(0),
  waveGenSmooth(1),
  waveGenAmplify(1.0f),
  waveGenFM(false),
  introPos(0.0),
  introSkip(0.0),
  monitorPos(0.0),
  mustClear(2),
  initialScreenWipe(1.0f),
  introSkipDo(false),
  introStopped(false),
  curTutorial(-1),
  curTutorialStep(0),
  csDisAsmAddr(0),
  csExportThread(NULL),
  csExportResult(NULL),
  csExportTarget(false),
  csExportDone(false),
  audioExportFilterName("???"),
  audioExportFilterExt("*"),
  dmfExportVersion(0),
  curExportType(GUI_EXPORT_NONE),
  romTarget(DIV_ROM_ABSTRACT),
  romMultiFile(false),
  romExportSave(false),
  pendingExport(NULL),
  romExportExists(false) {
  // value keys
  valueKeys[SDLK_0]=0;
  valueKeys[SDLK_1]=1;
  valueKeys[SDLK_2]=2;
  valueKeys[SDLK_3]=3;
  valueKeys[SDLK_4]=4;
  valueKeys[SDLK_5]=5;
  valueKeys[SDLK_6]=6;
  valueKeys[SDLK_7]=7;
  valueKeys[SDLK_8]=8;
  valueKeys[SDLK_9]=9;
  valueKeys[SDLK_a]=10;
  valueKeys[SDLK_b]=11;
  valueKeys[SDLK_c]=12;
  valueKeys[SDLK_d]=13;
  valueKeys[SDLK_e]=14;
  valueKeys[SDLK_f]=15;
  valueKeys[SDLK_KP_0]=0;
  valueKeys[SDLK_KP_1]=1;
  valueKeys[SDLK_KP_2]=2;
  valueKeys[SDLK_KP_3]=3;
  valueKeys[SDLK_KP_4]=4;
  valueKeys[SDLK_KP_5]=5;
  valueKeys[SDLK_KP_6]=6;
  valueKeys[SDLK_KP_7]=7;
  valueKeys[SDLK_KP_8]=8;
  valueKeys[SDLK_KP_9]=9;

  memset(willExport,1,DIV_MAX_CHIPS*sizeof(bool));
  memset(peak,0,DIV_MAX_OUTPUTS*sizeof(float));

  opMaskTransposeNote.note=true;
  opMaskTransposeNote.ins=false;
  opMaskTransposeNote.vol=false;
  opMaskTransposeNote.effect=false;
  opMaskTransposeNote.effectVal=false;

  opMaskTransposeValue.note=false;
  opMaskTransposeValue.ins=true;
  opMaskTransposeValue.vol=true;
  opMaskTransposeValue.effect=false;
  opMaskTransposeValue.effectVal=true;

  memset(patChanX,0,sizeof(float)*(DIV_MAX_CHANS+1));
  memset(patChanSlideY,0,sizeof(float)*(DIV_MAX_CHANS+1));
  memset(lastIns,-1,sizeof(int)*DIV_MAX_CHANS);
  memset(oscValues,0,sizeof(void*)*DIV_MAX_OUTPUTS);

  memset(chanOscLP0,0,sizeof(float)*DIV_MAX_CHANS);
  memset(chanOscLP1,0,sizeof(float)*DIV_MAX_CHANS);
  memset(chanOscVol,0,sizeof(float)*DIV_MAX_CHANS);
  for (int i=0; i<DIV_MAX_CHANS; i++) {
    chanOscChan[i].pitch=0.0f;
  }
  memset(chanOscBright,0,sizeof(float)*DIV_MAX_CHANS);
  memset(lastCorrPos,0,sizeof(short)*DIV_MAX_CHANS);

  memset(acedData,0,23);

  memset(waveGenAmp,0,sizeof(float)*16);
  memset(waveGenPhase,0,sizeof(float)*16);
  waveGenTL[0]=0.0f;
  waveGenTL[1]=0.0f;
  waveGenTL[2]=0.0f;
  waveGenTL[3]=1.0f;
  fmWaveform[0]=0;
  fmWaveform[1]=0;
  fmWaveform[2]=0;
  fmWaveform[3]=0;
  waveGenMult[0]=1;
  waveGenMult[1]=1;
  waveGenMult[2]=1;
  waveGenMult[3]=1;
  memset(waveGenFB,0,sizeof(int)*4);
  memset(waveGenFMCon0,0,sizeof(bool)*5);
  memset(waveGenFMCon1,0,sizeof(bool)*5);
  memset(waveGenFMCon2,0,sizeof(bool)*5);
  memset(waveGenFMCon3,0,sizeof(bool)*5);
  memset(waveGenFMCon4,0,sizeof(bool)*5);

  waveGenAmp[0]=1.0f;
  waveGenFMCon0[0]=false;
  waveGenFMCon1[0]=true;
  waveGenFMCon2[1]=true;
  waveGenFMCon3[2]=true;
  waveGenFMCon4[0]=false;

  waveGenFMCon0[4]=false;
  waveGenFMCon1[4]=false;
  waveGenFMCon2[4]=false;
  waveGenFMCon3[4]=true;

  memset(keyHit,0,sizeof(float)*DIV_MAX_CHANS);
  memset(keyHit1,0,sizeof(float)*DIV_MAX_CHANS);

  memset(lastAudioLoads,0,sizeof(float)*120);

  memset(pianoKeyHit,0,sizeof(pianoKeyState)*180);
  memset(pianoKeyPressed,0,sizeof(bool)*180);

  memset(queryReplaceEffectMode,0,sizeof(int)*8);
  memset(queryReplaceEffectValMode,0,sizeof(int)*8);
  memset(queryReplaceEffect,0,sizeof(int)*8);
  memset(queryReplaceEffectVal,0,sizeof(int)*8);
  memset(queryReplaceEffectDo,0,sizeof(bool)*8);
  memset(queryReplaceEffectValDo,0,sizeof(bool)*8);

  chanOscGrad.bgColor=ImVec4(0.0f,0.0f,0.0f,1.0f);

  memset(noteOffLabel,0,32);
  memset(noteRelLabel,0,32);
  memset(macroRelLabel,0,32);
  memset(emptyLabel,0,32);
  memset(emptyLabel2,0,32);

  memset(effectsShow,1,sizeof(bool)*10);

  memset(romExportAvail,0,sizeof(bool)*DIV_ROM_MAX);

  memset(multiIns,-1,7*sizeof(int));
  memset(multiInsTranspose,0,7*sizeof(int));

  strncpy(noteOffLabel,"OFF",32);
  strncpy(noteRelLabel,"===",32);
  strncpy(macroRelLabel,"REL",32);
  strncpy(emptyLabel,"...",32);
  strncpy(emptyLabel2,"..",32);

  // Initialize default colors so insEdit doesn't use garbage
  for (int i=0; i<GUI_COLOR_MAX; i++) {
    uiColors[i]=ImVec4(0.5f,0.5f,0.5f,1.0f);
  }
  // Set some key colors to reasonable defaults
  uiColors[GUI_COLOR_TEXT]=ImVec4(1.0f,1.0f,1.0f,1.0f);
  uiColors[GUI_COLOR_TOGGLE_ON]=ImVec4(0.2f,0.6f,1.0f,1.0f);
  uiColors[GUI_COLOR_TOGGLE_OFF]=ImVec4(0.3f,0.3f,0.3f,1.0f);
  uiColors[GUI_COLOR_WARNING]=ImVec4(1.0f,0.8f,0.0f,1.0f);
  uiColors[GUI_COLOR_ERROR]=ImVec4(1.0f,0.2f,0.2f,1.0f);
  uiColors[GUI_COLOR_DESTRUCTIVE]=ImVec4(1.0f,0.0f,0.0f,1.0f);
}
