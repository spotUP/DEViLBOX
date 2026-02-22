/* ft2_sysreqs.c — WASM stub: system dialogs handled by JS */
#include <stdint.h>
#include <stdbool.h>
#include <stdarg.h>
#include "ft2_sysreqs.h"

okBoxData_t okBoxData;

static void defaultMsgBox(const char *fmt, ...) { (void)fmt; }
static int16_t defaultSysReq(int16_t t, const char *h, const char *txt, void (*cb)(void))
{
    (void)t; (void)h; (void)txt; (void)cb; return 0;
}

void (*loaderMsgBox)(const char *, ...) = defaultMsgBox;
int16_t (*loaderSysReq)(int16_t, const char *, const char *, void (*)(void)) = defaultSysReq;

int16_t okBoxThreadSafe(int16_t t, const char *h, const char *txt, void (*cb)(void))
{ (void)t;(void)h;(void)txt;(void)cb; return 0; }

int16_t okBox(int16_t t, const char *h, const char *txt, void (*cb)(void))
{ (void)t;(void)h;(void)txt;(void)cb; return 0; }

int16_t quitBox(bool skip)
{ (void)skip; return 0; }

int16_t inputBox(int16_t t, const char *h, char *edText, uint16_t maxLen)
{ (void)t;(void)h;(void)edText;(void)maxLen; return 0; }

bool askUnsavedChanges(uint8_t t) { (void)t; return true; }

void myLoaderMsgBoxThreadSafe(const char *fmt, ...) { (void)fmt; }
void myLoaderMsgBox(const char *fmt, ...) { (void)fmt; }
