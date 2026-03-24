/*
 * GTUltraBridge.cpp — WASM bridge API for DEViLBOX integration
 *
 * This file:
 * 1. Defines all extern globals from goattrk2.h (normally in goattrk2.c)
 * 2. Provides the C API for JavaScript (EMSCRIPTEN_KEEPALIVE functions)
 * 3. Routes ASID register writes via EM_JS callback
 */

#include <emscripten.h>
#include <string.h>
#include <stdlib.h>

/* Define GOATTRK2_C before including header so externs become definitions */
#define GOATTRK2_C

extern "C" {
#include "goattrk2.h"
#include "greloc.h"
extern unsigned framerate;  /* defined in gsound.c, no header declaration */
}
#include "gsid.h"

/* ========================================================================
 * Global variable definitions (normally in goattrk2.c which is the main app)
 * ======================================================================== */

char packedsongname[MAX_FILENAME] = {0};
int SIDTracker64ForIPadIsAmazing = 0;
int autoNextPattern = 1;
char appFileName[MAX_PATHNAME] = {0};
int menu = 0;
int recordmode = 0;
int followplay = 0;
int hexnybble = -1;
int stepsize = 1;
int autoadvance = 0;
int defaultpatternlength = 0x3F;
int cursorflash = 0;
int cursorcolortable[2] = {0};
int exitprogram = 0;
int eamode = 0;
unsigned keypreset = 0;
unsigned playerversion = 0;
int fileformat = 0;
int zeropageadr = 0xfe;
int playeradr = 0x1000;
int debugEnabled = 0;
unsigned patterndispmode = 0;
unsigned sidaddress = 0xD400;
unsigned b = 0;
unsigned mr = 0;
unsigned writer = 0;
unsigned hardsid = 0;
unsigned catweasel = 0;
unsigned usbsid = 0;
unsigned interpolate = 1;
unsigned hardsidbufinteractive = 0;
unsigned hardsidbufplayback = 0;
unsigned monomode = 0;
unsigned stereoMode = 0;
float basepitch = 0.0f;
char configbuf[MAX_PATHNAME] = {0};
char loadedsongfilename[MAX_PATHNAME] = {0};
char wavfilename[MAX_PATHNAME] = {0};
char songfilename[MAX_PATHNAME] = {0};
char songfilter[MAX_FILENAME] = {0};
char wavfilter[MAX_FILENAME] = {0};
char songpath[MAX_PATHNAME] = {0};
char instrfilename[MAX_FILENAME] = {0};
char instrfilter[MAX_FILENAME] = {0};
char instrpath[MAX_PATHNAME] = {0};
char packedpath[MAX_PATHNAME] = {0};
char *programname = (char*)"GTUltra-WASM";
char textbuffer[MAX_PATHNAME] = {0};
char debugTextbuffer[MAX_PATHNAME] = {0};
unsigned char hexkeytbl[16] = {
    '0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'
};
char charsetFilename[MAX_PATHNAME] = {0};
int jdebug[16] = {0};
char palettefilter[MAX_FILENAME] = {0};
char palettepath[MAX_FILENAME] = {0};
char paletteFileName[MAX_FILENAME] = {0};
char backupFolderName[MAX_PATHNAME] = {0};
char backupSngFilename[MAX_PATHNAME] = {0};
char fkeysFilename[MAX_PATHNAME] = {0};
int patternOrderArray[256] = {0};
int patternOrderList[256] = {0};
int patternRemapOrderIndex = 0;
char sourceBackupFolderName[MAX_FILENAME] = {0};
char destBackupFolderName[MAX_FILENAME] = {0};
int debugTicks = 0;
int forceSave3ChannelSng = 0;
int normalizeWAV = 0;
float masterVolume = 1.0f;
unsigned int lmanMode = 0;
unsigned int editPaletteMode = 0;
int currentPalettePreset = 0;
short tableBackgroundColors[MAX_TABLES][MAX_TABLELEN] = {{0}};
unsigned char paletteR[256] = {0};
unsigned char paletteG[256] = {0};
unsigned char paletteB[256] = {0};
char infoTextBuffer[256] = {0};
int SID_StereoPanPositions[4][4] = {{0}};
char editPan = 0;
char transportPolySIDEnabled[4] = {0};
char transportLoopPattern = 0;
char transportLoopPatternSelectArea = 0;
char transportRecord = 0;
char transportPlay = 0;
char transportFollowPlay = 0;
char transportShowKeyboard = 0;
unsigned int enablekeyrepeat = 1;
char paletteChanged = 0;
WAVEFORM_INFO waveformDisplayInfo = {0};
int selectedMIDIPort = 0;
unsigned int enableAntiAlias = 0;
int useOriginalGTFunctionKeys = 0;
float detuneCent = 0.0f;
int displayingPanel = 0;
int displayStopped = 0;
int useRepeatsWhenCompressing = 1;
int songExported = 0;
int songExportSuccessFlag = 0;
int sidAddr1 = 0xD400;
int sidAddr2 = 0xD420;
int sidAddr3 = 0xD440;
int sidAddr4 = 0xD460;

/* Globals from ginfo.c — already defined in ginfo.c, just externs needed */
/* (ginfo.c is compiled separately, no need to redefine here) */

/* residdelay — defined in gt2reloc.c/gt2stereo.c which we don't compile */
unsigned residdelay = 0;

/* Globals from gconsole.c (keyboard/mouse input state) */
#define GCONSOLE_C
int key = 0;
int rawkey = 0;
int shiftpressed = 0;
int cursorflashdelay = 0;
int ctrlpressed = 0;
int bothShiftAndCtrlPressed = 0;
int shiftOrCtrlPressed = 0;
int mouseb = 0;
int prevmouseb = 0;
int mouseheld = 0;
int mousex = 0;
int mousey = 0;
int mousebDoubleClick = 0;
unsigned bigwindow = 0;
int keyDownCount = 0;
unsigned char *chardata = NULL;

/* Note names */
static char *noteNames[] = {
    (char*)"C-", (char*)"C#", (char*)"D-", (char*)"D#",
    (char*)"E-", (char*)"F-", (char*)"F#", (char*)"G-",
    (char*)"G#", (char*)"A-", (char*)"A#", (char*)"B-"
};
char *notename[12];
char *notenameTableView[12];

/* Palette data (UI only, stub with zeros) */
unsigned char paletteLoadRGB[MAX_PALETTE_PRESETS][3][64] = {{{0}}};
unsigned char paletteRGB[MAX_PALETTE_PRESETS][3][MAX_PALETTE_ENTRIES] = {{{0}}};

/* datafile placeholder - goatdata.c should provide this */
/* unsigned char datafile[] provided by goatdata.c */

/* ========================================================================
 * ASID hardware callback (EM_JS — calls into JavaScript)
 * ======================================================================== */

EM_JS(void, js_asid_write, (int chip, int reg, int value), {
    if (typeof Module._asidCallback === 'function') {
        Module._asidCallback(chip, reg, value);
    }
});

static int asid_enabled = 0;

/* ========================================================================
 * Internal state
 * ======================================================================== */

static int gt_sample_rate = 44100;
static int gt_sid_count = 1;  /* 1 = single SID (3ch), 2 = dual SID (6ch) */
static int gt_initialized = 0;
static int gt_playroutine_accumulator = 0; /* sample counter for playroutine tick */

/* ========================================================================
 * Stub functions for UI-only code referenced by engine
 * ======================================================================== */

/* BME window system */
int win_quitted = 0;
unsigned char win_keystate[512] = {0};

/* gdisplay.c globals */
#define GDISPLAY_C
char debugtext[256] = {0};
char* paletteText[] = { NULL };
int displayOriginal3Channel = 0;
int timemin = 0;
int timesec = 0;
int timeframe = 0;
int lastDisplayChanCount = 3;
int getFreeMem = 0;
int UIUnderline = 0;

/* gdisplay.c function stubs (all no-op — UI is handled in JS) */
void displayTransportBar(GTOBJECT *gt) { (void)gt; }
void displayPattern(GTOBJECT *gt) { (void)gt; }
void displayPattern3Chn(GTOBJECT *gt) { (void)gt; }
void displayPattern6Chn(GTOBJECT *gt) { (void)gt; }
void printmainscreen(GTOBJECT *gt) { (void)gt; }
void displayupdate(GTOBJECT *gt) { (void)gt; }
void printstatus(GTOBJECT *gt) { (void)gt; }
void resettime(GTOBJECT *gt) { (void)gt; }
void incrementtime(GTOBJECT *gt) { (void)gt; }
void displayOrderList(GTOBJECT *gt, int cc, int OX, int OY) { (void)gt; (void)cc; (void)OX; (void)OY; }
void displayPaletteInfo(int cc) { (void)cc; }
void clearOrderListDisplay(void) {}
int getPaletteTextArraySize(void) { return 0; }
void setSongLengthTime(GTOBJECT *gt) { (void)gt; }
void displayInstrument(GTOBJECT *gt, int cc, int OX, int OY) { (void)gt; (void)cc; (void)OX; (void)OY; }
void displaySongInfo(int cc, int OX, int OY) { (void)cc; (void)OX; (void)OY; }
void updateDisplayWhenFollowingAndPlaying(GTOBJECT *gt) { (void)gt; }
void displayTopBar(int menu, int cc) { (void)menu; (void)cc; }
void displayExpandedOrderList(GTOBJECT *gt, int cc, int OX, int OY) { (void)gt; (void)cc; (void)OX; (void)OY; }
void displayKeyboard(void) {}
void setNote(int noteNumber) { (void)noteNumber; }
void resetKeyboardDisplay(void) {}
void displayNotes(GTOBJECT *gt) { (void)gt; }
void displayTables(int OX, int OY) { (void)OX; (void)OY; }
void displayTable(int c, int OX, int OY) { (void)c; (void)OX; (void)OY; }
void displayWaveformInfo(int x, int y) { (void)x; (void)y; }
int getWaveforumColour(int bit, int value) { (void)bit; (void)value; return 0; }
void updateDisplayWhenFollowingAndPlaying_Expanded(GTOBJECT *gt) { (void)gt; }
void updateDisplayWhenFollowingAndPlaying_Compressed(GTOBJECT *gt) { (void)gt; }
void setSIDTracker64KeyOnStyle(void) {}
int doDisplay(void *gt) { (void)gt; return 0; }
int FreeMem(void) { return 0; }
void displayTransportBarLoopPattern(int x, int y) { (void)x; (void)y; }
void displayTransportBarFollow(int x, int y) { (void)x; (void)y; }
void displayTransportBarRecord(int x, int y) { (void)x; (void)y; }
void displayTransportBarPlaying(GTOBJECT *gt, int x, int y) { (void)gt; (void)x; (void)y; }
void displayTransportBarPolyChannels(int x, int y) { (void)x; (void)y; }
void displayTransportBarFastForward(int x, int y) { (void)x; (void)y; }
void displayTransportBarRewind(int x, int y) { (void)x; (void)y; }
void displayTransportBarOctave(int x, int y) { (void)x; (void)y; }
void displayTransportBarSkinning(int x, int y) { (void)x; (void)y; }
void displayTransportBarSIDCount(int x, int y) { (void)x; (void)y; }
void displayTransportBarKeyboard(int x, int y) { (void)x; (void)y; }
void displayTransportBarMasterVolume(int x, int y) { (void)x; (void)y; }
void displayTransportBarDetune(int x, int y) { (void)x; (void)y; }
void displayTransportBarMonoStereo(int x, int y) { (void)x; (void)y; }
int getTableTitleColour(int c) { (void)c; return 0; }
void displayOriginalTableView(int cc, int OX, int OY) { (void)cc; (void)OX; (void)OY; }
void displayDetailedWaveTable(int cc, int OX, int OY) { (void)cc; (void)OX; (void)OY; }
void displayDetailedFilterTable(int cc, int OX, int OY) { (void)cc; (void)OX; (void)OY; }
void displayDetailedPulseTable(int cc, int OX, int OY) { (void)cc; (void)OX; (void)OY; }

/* Stub for functions declared in goattrk2.h but defined in UI-only .c files */
void setSkin(int p) { (void)p; }
int isMatchingRGB(int p, int c) { (void)p; (void)c; return 0; }
void setTableColour(int a, int b, int c, int d, int e) {
    (void)a; (void)b; (void)c; (void)d; (void)e;
}
void setTableBackgroundColours(int i) { (void)i; }
void highlightInstrument(int t, int p) { (void)t; (void)p; }
int quickSave(void) { return 0; }
void initRemapArrays(void) {}
int mouseTransportBar(GTOBJECT *gt) { (void)gt; return 0; }
int checkMouseRange(int x, int y, int w, int h) {
    (void)x; (void)y; (void)w; (void)h; return 0;
}
void handleSIDChannelCountChange(GTOBJECT *gt) { (void)gt; }
int mouseTrackModify(int e) { (void)e; return 0; }
void mouseTrack(void) {}
void ModifyTrackGetOriginalValue(void) {}
int checkForMouseInTable(int c, int x, int y) { (void)c; (void)x; (void)y; return 0; }
int checkForMouseInDetailedWaveTable(int x, int y) { (void)x; (void)y; return 0; }
int checkForMouseInDetailedFilterTable(int x, int y) { (void)x; (void)y; return 0; }
int checkForMouseInDetailedPulseTable(int x, int y) { (void)x; (void)y; return 0; }
void detailedWaveTableChangeRelativeNote(int x, int y) { (void)x; (void)y; }
void detailedWaveTableChangeData(int x, int y) { (void)x; (void)y; }
void detailedWaveTableChangeCommand(int x, int y) { (void)x; (void)y; }
void detailedFilterTableChangeCommand(int x, int y) { (void)x; (void)y; }
void detailedFilterTableChangeSign(int x, int y) { (void)x; (void)y; }
void detailedFilterTableChangeFilterType(int x, int y) { (void)x; (void)y; }
void detailedPulseTableChangeSign(int x, int y) { (void)x; (void)y; }
void detailedPulseTableChangeCommand(int x, int y) { (void)x; (void)y; }
void checkForMouseInOrderList(GTOBJECT *gt, int m) { (void)gt; (void)m; }
void checkForMouseInExtendedOrderList(GTOBJECT *gt, int m) { (void)gt; (void)m; }
int checkMouseInWaveformInfo(void) { return 0; }
int HzToSIDFreq(float hz) { (void)hz; return 0; }
float noteToHz(int n) { (void)n; return 440.0f; }
float centToHz(int c) { (void)c; return 0.0f; }
void detunePitchTable(void) {}
void swapPalettes(int a, int b) { (void)a; (void)b; }
void handlePressRewind(int d, GTOBJECT *gt) { (void)d; (void)gt; }
void createFilename(char *a, char *b, char *c) { (void)a; (void)b; (void)c; }
void backupPatternDisplayInfo(GTOBJECT *gt) { (void)gt; }
void restorePatternDisplayInfo(GTOBJECT *gt) { (void)gt; }
void validateStereoMode(void) {}
void editSIDPan(GTOBJECT *gt) { (void)gt; }
void convertInsToPans(int s) { (void)s; }
void convertPansToInts(int s) { (void)s; }
void saveBackupSong(void) {}
int createBackupFolder(void) { return 0; }
int copyBackupFile(char *a, char *b) { (void)a; (void)b; return 0; }
int replacechar(char *s, char o, char r) { (void)s; (void)o; (void)r; return 0; }
void stopScreenDisplay(void) {}
void restartScreenDisplay(void) {}
void ExportAsPCM(int s, int n, GTOBJECT *gt) { (void)s; (void)n; (void)gt; }
void playUntilEnd(int s) { (void)s; }
void playUntilEnd2(int s) { (void)s; }
void displayPatternInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displayInstrumentInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displayTableInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displayWaveTableInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displayPulseTableInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displayFilterTableInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displaySpeedTableInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displayOrderTableInfo(GTOBJECT *gt); /* defined in ginfo.c */
void displayWaveTableLeft(GTOBJECT *gt, char *lr); /* defined in ginfo.c */
void displayWaveTableRight(GTOBJECT *gt); /* defined in ginfo.c */
void nextSongPos(GTOBJECT *gt) { (void)gt; }
void previousSongPos(GTOBJECT *gt, int o) { (void)gt; (void)o; }
void setSongToBeginning(GTOBJECT *gt) { (void)gt; }
void playFromCurrentPosition(GTOBJECT *gt, int p) { (void)gt; (void)p; }
void handleLoad(GTOBJECT *gt, char *f) { (void)gt; (void)f; }
void waitkey(GTOBJECT *gt) { (void)gt; }
void waitkeymouse(GTOBJECT *gt) { (void)gt; }
void waitkeynoupdate(void) {}
void waitkeymousenoupdate(void) {}
void onlinehelp(int s, int c, GTOBJECT *gt) { (void)s; (void)c; (void)gt; }
void reInitSID(void) {}

/* ========================================================================
 * WASM Bridge API — exported to JavaScript
 * ======================================================================== */

#ifdef __cplusplus
extern "C" {
#endif

/* --- Lifecycle --- */

EMSCRIPTEN_KEEPALIVE
void gt_init(int sampleRate, int model) {
    gt_sample_rate = sampleRate;
    gt_initialized = 1;

    /* Initialize note name tables */
    for (int i = 0; i < 12; i++) {
        notename[i] = noteNames[i];
        notenameTableView[i] = noteNames[i];
    }

    /* Initialize reSID */
    sid_init(sampleRate, model, 0, interpolate, 0, 0);

    /* Initialize song data */
    clearsong(1, 1, 1, 1, 1, &gtObject);

    /* Initialize the GT objects */
    initSID(&gtObject);
    initSID(&gtEditorObject);
}

EMSCRIPTEN_KEEPALIVE
void gt_shutdown(void) {
    gt_initialized = 0;
}

/* --- Song I/O --- */

EMSCRIPTEN_KEEPALIVE
int gt_load_sng(const unsigned char* data, int len) {
    /* Write data to a temp in-memory "file" and load via gsong.c */
    FILE *f = fopen("/tmp/temp.sng", "wb");
    if (!f) return 0;
    fwrite(data, 1, len, f);
    fclose(f);
    strcpy(songfilename, "/tmp/temp.sng");
    return loadsong(&gtObject, 0);
}

EMSCRIPTEN_KEEPALIVE
int gt_save_sng(unsigned char* outBuf, int maxLen) {
    strcpy(songfilename, "/tmp/temp_save.sng");
    if (savesong() == 0) return 0;
    FILE *f = fopen("/tmp/temp_save.sng", "rb");
    if (!f) return 0;
    fseek(f, 0, SEEK_END);
    int size = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (size > maxLen) { fclose(f); return 0; }
    fread(outBuf, 1, size, f);
    fclose(f);
    return size;
}

/* --- Export PRG/SID --- */

EMSCRIPTEN_KEEPALIVE
int gt_export_prg(unsigned char* outBuf, int maxLen) {
    if (editorInfo.maxSIDChannels == 0) editorInfo.maxSIDChannels = 3;
    if (editorInfo.adparam == 0) editorInfo.adparam = 0x0f00;
    if (editorInfo.multiplier == 0) editorInfo.multiplier = 1;
    editorInfo.optimizepulse = 1;
    editorInfo.optimizerealtime = 1;
    editorInfo.finevibrato = 1;
    fileformat = FORMAT_PRG;
    playerversion = PLAYER_BUFFERED;
    zeropageadr = 0xfc;
    playeradr = 0x1000;
    strcpy(packedsongname, "/tmp/temp_export.prg");

    songExported = 0;
    songExportSuccessFlag = 0;
    relocator(&gtObject, 0, 1);

    if (!songExported) return 0;

    FILE *f = fopen("/tmp/temp_export.prg", "rb");
    if (!f) return 0;
    fseek(f, 0, SEEK_END);
    int size = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (size > maxLen) { fclose(f); return 0; }
    fread(outBuf, 1, size, f);
    fclose(f);
    return size;
}

EMSCRIPTEN_KEEPALIVE
int gt_export_sid(unsigned char* outBuf, int maxLen) {
    if (editorInfo.maxSIDChannels == 0) editorInfo.maxSIDChannels = 3;
    if (editorInfo.adparam == 0) editorInfo.adparam = 0x0f00;
    if (editorInfo.multiplier == 0) editorInfo.multiplier = 1;
    editorInfo.optimizepulse = 1;
    editorInfo.optimizerealtime = 1;
    editorInfo.finevibrato = 1;
    fileformat = FORMAT_SID;
    playerversion = PLAYER_BUFFERED | PLAYER_AUTHORINFO;
    zeropageadr = 0xfc;
    playeradr = 0x1000;
    strcpy(packedsongname, "/tmp/temp_export.sid");

    songExported = 0;
    songExportSuccessFlag = 0;
    relocator(&gtObject, 0, 1);

    if (!songExported) return 0;

    FILE *f = fopen("/tmp/temp_export.sid", "rb");
    if (!f) return 0;
    fseek(f, 0, SEEK_END);
    int size = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (size > maxLen) { fclose(f); return 0; }
    fread(outBuf, 1, size, f);
    fclose(f);
    return size;
}

EMSCRIPTEN_KEEPALIVE
void gt_new_song(void) {
    clearsong(1, 1, 1, 1, 1, &gtObject);
}

/* --- Playback --- */

EMSCRIPTEN_KEEPALIVE
void gt_play(int songNum, int fromPos, int fromRow) {
    (void)fromRow;
    gt_playroutine_accumulator = 0;
    gtObject.psnum = songNum;
    gtObject.startpattpos = fromPos;
    gtObject.songinit = 1;
}

EMSCRIPTEN_KEEPALIVE
void gt_stop(void) {
    stopsong(&gtObject);
}

EMSCRIPTEN_KEEPALIVE
void gt_render_audio(float* outL, float* outR, int frames) {
    /* Render audio via reSID into temp buffers then convert to float */
    static Sint16 sid0buf[65536];
    static Sint16 sid1buf[65536];
    static Sint16 sid2buf[65536];
    static Sint16 sid3buf[65536];
    int samplesToRender = frames;
    if (samplesToRender > 32768) samplesToRender = 32768;

    /* Tick the playroutine (sequencer) at the correct rate.
     * Desktop GT calls playroutine() from a timer at `framerate` Hz (50 PAL / 60 NTSC).
     * In WASM we must interleave it with audio rendering.
     * samplesPerTick = samplerate / framerate (e.g. 44100/50 = 882). */
    int samplesPerTick = gt_sample_rate / (framerate > 0 ? framerate : 50);
    if (samplesPerTick < 1) samplesPerTick = 1;

    gt_playroutine_accumulator += samplesToRender;
    while (gt_playroutine_accumulator >= samplesPerTick) {
        gt_playroutine_accumulator -= samplesPerTick;
        playroutine(&gtObject);
    }

    /* Run play routine + fill SID buffer */
    sid_fillbuffer(sid0buf, sid1buf, sid2buf, sid3buf, samplesToRender, samplesToRender, editorInfo.adparam);

    /* ASID: send register writes to JavaScript callback */
    if (asid_enabled) {
        for (int r = 0; r < NUMSIDREGS; r++) {
            js_asid_write(0, r, sidreg[r]);
        }
        if (gt_sid_count >= 2) {
            for (int r = 0; r < NUMSIDREGS; r++) {
                js_asid_write(1, r, sidreg2[r]);
            }
        }
    }

    /* Convert Sint16 buffers to float L/R (SID0+SID2=L, SID1+SID3=R) */
    for (int i = 0; i < samplesToRender; i++) {
        outL[i] = (sid0buf[i] + sid2buf[i]) / 32768.0f;
        outR[i] = (sid1buf[i] + sid3buf[i]) / 32768.0f;
    }
}

EMSCRIPTEN_KEEPALIVE
int gt_get_current_row(void) {
    return gtObject.chn[0].pattptr;
}

EMSCRIPTEN_KEEPALIVE
int gt_get_current_pos(void) {
    return gtObject.chn[0].songptr;
}

EMSCRIPTEN_KEEPALIVE
int gt_is_playing(void) {
    return gtObject.songinit || (gtObject.chn[0].gate != 0);
}

/* Debug: return packed state info for diagnosing silent playback */
EMSCRIPTEN_KEEPALIVE
int gt_debug_songinit(void) { return gtObject.songinit; }

EMSCRIPTEN_KEEPALIVE
int gt_debug_maxchannels(void) { return editorInfo.maxSIDChannels; }

EMSCRIPTEN_KEEPALIVE
int gt_debug_framerate(void) { return (int)framerate; }

EMSCRIPTEN_KEEPALIVE
int gt_debug_adparam(void) { return (int)editorInfo.adparam; }

EMSCRIPTEN_KEEPALIVE
int gt_debug_multiplier(void) { return (int)editorInfo.multiplier; }

EMSCRIPTEN_KEEPALIVE
int gt_debug_tempo_ch0(void) { return (int)gtObject.chn[0].tempo; }

EMSCRIPTEN_KEEPALIVE
int gt_debug_sidreg_sum(void) {
    int sum = 0;
    for (int i = 0; i < NUMSIDREGS; i++) sum += sidreg[i];
    return sum;
}

/* --- Direct memory access (zero-copy reads) --- */

EMSCRIPTEN_KEEPALIVE
unsigned char* gt_get_pattern_ptr(int patNum) {
    if (patNum < 0 || patNum >= MAX_PATT) return NULL;
    return (unsigned char*)&pattern[patNum][0];
}

EMSCRIPTEN_KEEPALIVE
unsigned char* gt_get_instrument_ptr(int instNum) {
    if (instNum < 0 || instNum >= MAX_INSTR) return NULL;
    return (unsigned char*)&instr[instNum];
}

EMSCRIPTEN_KEEPALIVE
unsigned char* gt_get_ltable_ptr(int tableType) {
    if (tableType < 0 || tableType >= MAX_TABLES) return NULL;
    return &ltable[tableType][0];
}

EMSCRIPTEN_KEEPALIVE
unsigned char* gt_get_rtable_ptr(int tableType) {
    if (tableType < 0 || tableType >= MAX_TABLES) return NULL;
    return &rtable[tableType][0];
}

EMSCRIPTEN_KEEPALIVE
unsigned char* gt_get_order_ptr(int song, int ch) {
    if (song < 0 || song >= MAX_SONGS || ch < 0 || ch >= MAX_CHN) return NULL;
    return &songorder[song][ch][0];
}

EMSCRIPTEN_KEEPALIVE
unsigned char* gt_get_sid_registers(int chip) {
    switch (chip) {
        case 0: return sidreg;
        case 1: return sidreg2;
        case 2: return sidreg3;
        case 3: return sidreg4;
        default: return NULL;
    }
}

/* --- Editing --- */

EMSCRIPTEN_KEEPALIVE
void gt_set_pattern_cell(int pat, int row, int note, int instr_val,
                          int cmd, int data) {
    if (pat < 0 || pat >= MAX_PATT || row < 0 || row >= MAX_PATTROWS) return;
    pattern[pat][row * 4 + 0] = note;
    pattern[pat][row * 4 + 1] = instr_val;
    pattern[pat][row * 4 + 2] = cmd;
    pattern[pat][row * 4 + 3] = data;
}

EMSCRIPTEN_KEEPALIVE
int gt_get_pattern_length(int patNum) {
    if (patNum < 0 || patNum >= MAX_PATT) return 0;
    return pattlen[patNum];
}

EMSCRIPTEN_KEEPALIVE
void gt_set_pattern_length(int patNum, int len) {
    if (patNum < 0 || patNum >= MAX_PATT) return;
    if (len < 1) len = 1;
    if (len > MAX_PATTROWS) len = MAX_PATTROWS;
    pattlen[patNum] = len;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_instrument_ad(int inst, int attack, int decay) {
    if (inst < 0 || inst >= MAX_INSTR) return;
    instr[inst].ad = ((attack & 0xF) << 4) | (decay & 0xF);
}

EMSCRIPTEN_KEEPALIVE
void gt_set_instrument_sr(int inst, int sustain, int release) {
    if (inst < 0 || inst >= MAX_INSTR) return;
    instr[inst].sr = ((sustain & 0xF) << 4) | (release & 0xF);
}

EMSCRIPTEN_KEEPALIVE
void gt_set_instrument_table_ptr(int inst, int table, int ptr) {
    if (inst < 0 || inst >= MAX_INSTR || table < 0 || table >= MAX_TABLES) return;
    instr[inst].ptr[table] = ptr;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_instrument_vibdelay(int inst, int val) {
    if (inst < 0 || inst >= MAX_INSTR) return;
    instr[inst].vibdelay = val;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_instrument_gatetimer(int inst, int val) {
    if (inst < 0 || inst >= MAX_INSTR) return;
    instr[inst].gatetimer = val;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_instrument_firstwave(int inst, int val) {
    if (inst < 0 || inst >= MAX_INSTR) return;
    instr[inst].firstwave = val;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_instrument_name(int inst, const char* name) {
    if (inst < 0 || inst >= MAX_INSTR) return;
    strncpy(instr[inst].name, name, MAX_INSTRNAMELEN);
    instr[inst].name[MAX_INSTRNAMELEN - 1] = 0;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_table_entry(int type, int row, int left, int right) {
    if (type < 0 || type >= MAX_TABLES || row < 0 || row >= MAX_TABLELEN) return;
    ltable[type][row] = left;
    rtable[type][row] = right;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_order_entry(int song, int ch, int pos, int val) {
    if (song < 0 || song >= MAX_SONGS || ch < 0 || ch >= MAX_CHN
        || pos < 0 || pos >= MAX_SONGLEN) return;
    songorder[song][ch][pos] = val;
}

/* --- Configuration --- */

EMSCRIPTEN_KEEPALIVE
void gt_set_sid_model(int chip, int model) {
    (void)chip;
    /* Reinit reSID with new model */
    sid_init(gt_sample_rate, model, 0, interpolate, 0, 0);
}

EMSCRIPTEN_KEEPALIVE
void gt_set_clock(int ntsc) {
    sid_init(gt_sample_rate, 0, ntsc, interpolate, 0, 0);
}

EMSCRIPTEN_KEEPALIVE
void gt_set_sid_count(int count) {
    if (count < 1) count = 1;
    if (count > 2) count = 2;
    gt_sid_count = count;
}

EMSCRIPTEN_KEEPALIVE
int gt_get_sid_count(void) {
    return gt_sid_count;
}

EMSCRIPTEN_KEEPALIVE
int gt_get_channel_count(void) {
    return gt_sid_count * 3;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_tempo(int tempo) {
    if (tempo < 1) tempo = 1;
    if (tempo > 255) tempo = 255;
    /* Set tempo for all channels */
    for (int c = 0; c < MAX_CHN; c++) {
        gtObject.chn[c].tempo = tempo;
    }
}

EMSCRIPTEN_KEEPALIVE
void gt_set_multiplier(int mul) {
    editorInfo.multiplier = mul;
}

/* --- Jam mode --- */

EMSCRIPTEN_KEEPALIVE
void gt_jam_note_on(int channel, int note, int instrNum) {
    if (channel < 0 || channel >= MAX_CHN) return;
    gtObject.chn[channel].newnote = note;
    gtObject.chn[channel].instr = instrNum;
}

EMSCRIPTEN_KEEPALIVE
void gt_jam_note_off(int channel) {
    if (channel < 0 || channel >= MAX_CHN) return;
    gtObject.chn[channel].gate = 0;
}

/* --- Undo --- */

EMSCRIPTEN_KEEPALIVE
void gt_undo(void) {
    /* TODO: integrate with gundo.c */
}

EMSCRIPTEN_KEEPALIVE
void gt_redo(void) {
    /* TODO: integrate with gundo.c */
}

EMSCRIPTEN_KEEPALIVE
int gt_can_undo(void) {
    return 0; /* TODO */
}

/* --- ASID hardware --- */

EMSCRIPTEN_KEEPALIVE
void gt_enable_asid(int enabled) {
    asid_enabled = enabled;
}

/* --- Song metadata --- */

EMSCRIPTEN_KEEPALIVE
const char* gt_get_song_name(void) {
    return songname;
}

EMSCRIPTEN_KEEPALIVE
const char* gt_get_author_name(void) {
    return authorname;
}

EMSCRIPTEN_KEEPALIVE
const char* gt_get_copyright(void) {
    return copyrightname;
}

EMSCRIPTEN_KEEPALIVE
void gt_set_song_name(const char* name) {
    strncpy(songname, name, MAX_STR);
}

EMSCRIPTEN_KEEPALIVE
void gt_set_author_name(const char* name) {
    strncpy(authorname, name, MAX_STR);
}

EMSCRIPTEN_KEEPALIVE
void gt_set_copyright(const char* name) {
    strncpy(copyrightname, name, MAX_STR);
}

EMSCRIPTEN_KEEPALIVE
int gt_get_num_songs(void) {
    return MAX_SONGS;
}

EMSCRIPTEN_KEEPALIVE
int gt_get_num_instruments(void) {
    return MAX_INSTR;
}

EMSCRIPTEN_KEEPALIVE
int gt_get_num_patterns(void) {
    return MAX_PATT;
}

#ifdef __cplusplus
}
#endif
