/* ft2_diskop.c — WASM stub: disk operations handled by JS bridge */
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "ft2_unicode.h"
#include "ft2_diskop.h"

static char emptyStr[1] = {0};
char *supportedModExtensions[] = { NULL }; /* ft2_module_loader.h extern */

bool setupExecutablePath(void)                   { return true; }
int32_t getFileSize(UNICHAR *f)                  { (void)f; return 0; }
uint8_t getDiskOpItem(void)                      { return 0; }
void updateCurrSongFilename(void)                {}
char *getCurrSongFilename(void)                  { return emptyStr; }
char *getDiskOpFilename(void)                    { return emptyStr; }
const UNICHAR *getDiskOpCurPath(void)            { return (UNICHAR *)emptyStr; }
const UNICHAR *getDiskOpModPath(void)            { return (UNICHAR *)emptyStr; }
const UNICHAR *getDiskOpSmpPath(void)            { return (UNICHAR *)emptyStr; }
void changeFilenameExt(char *n, char *e, int32_t m) { (void)n;(void)e;(void)m; }
void diskOpChangeFilenameExt(char *e)            { (void)e; }
void freeDiskOp(void)                            {}
bool setupDiskOp(void)                           { return true; }
void diskOpSetFilename(uint8_t t, UNICHAR *p)    { (void)t;(void)p; }
void sanitizeFilename(const char *s)             { (void)s; }
bool diskOpGoParent(void)                        { return false; }
void pbDiskOpRoot(void)                          {}
int32_t getExtOffset(char *s, int32_t len)       { (void)s;(void)len; return -1; }
bool testDiskOpMouseDown(bool held)              { (void)held; return false; }
void testDiskOpMouseRelease(void)                {}
void diskOp_StartDirReadThread(void)             {}
void diskOp_DrawFilelist(void)                   {}
void diskOp_DrawDirectory(void)                  {}
void showDiskOpScreen(void)                      {}
void hideDiskOpScreen(void)                      {}
void exitDiskOpScreen(void)                      {}
void toggleDiskOpScreen(void)                    {}
void sbDiskOpSetPos(uint32_t p)                  { (void)p; }
void pbDiskOpListUp(void)   {} void pbDiskOpListDown(void) {}
void pbDiskOpParent(void)   {} void pbDiskOpShowAll(void)  {}
void pbDiskOpSave(void)     {} void pbDiskOpDelete(void)   {}
void pbDiskOpRename(void)   {} void pbDiskOpMakeDir(void)  {}
void pbDiskOpRefresh(void)  {} void pbDiskOpSetPath(void)  {}
void pbDiskOpExit(void)     {}
void rbDiskOpModule(void)   {} void rbDiskOpInstr(void)    {}
void rbDiskOpSample(void)   {} void rbDiskOpPattern(void)  {}
void rbDiskOpTrack(void)    {}
void rbDiskOpModSaveXm(void)  {} void rbDiskOpModSaveMod(void) {}
void rbDiskOpModSaveWav(void) {}
void rbDiskOpSmpSaveWav(void) {} void rbDiskOpSmpSaveRaw(void) {}
void rbDiskOpSmpSaveIff(void) {}
void trimEntryName(char *n, bool d)              { (void)n;(void)d; }
void createFileOverwriteText(char *f, char *b)   { (void)f;(void)b; }
bool fileExistsAnsi(char *s)                     { (void)s; return false; }
