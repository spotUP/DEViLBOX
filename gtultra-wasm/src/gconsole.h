/* gconsole.h — Stub for WASM build */
#ifndef GCONSOLE_H
#define GCONSOLE_H

#define MAX_COLUMNS 100
#define MAX_ROWS 41
#define HOLDDELAY 24
#define DOUBLECLICKDELAY 15
#define UNDERLINE_MASK 0x8000
#define UNDERLINE_FOREGROUND_MASK 0x4000

static inline int initscreen(void) { return 1; }
static inline void closescreen(void) {}
static inline void clearscreen(int backColor) { (void)backColor; }
static inline void fliptoscreen(void) {}
static inline void printtext(int x, int y, int color, const char *text) {
    (void)x; (void)y; (void)color; (void)text;
}
static inline void printtextc(int y, int color, const char *text) {
    (void)y; (void)color; (void)text;
}
static inline void printtextcp(int cp, int y, int color, const char *text) {
    (void)cp; (void)y; (void)color; (void)text;
}
static inline void printblank(int x, int y, int length) {
    (void)x; (void)y; (void)length;
}
static inline void printblankc(int x, int y, int color, int length) {
    (void)x; (void)y; (void)color; (void)length;
}
static inline void drawbox(int x, int y, int color, int sx, int sy) {
    (void)x; (void)y; (void)color; (void)sx; (void)sy;
}
static inline void printbg(int x, int y, int color, int length) {
    (void)x; (void)y; (void)color; (void)length;
}
static inline void getkey(void) {}
static inline void fillArea(int x, int y, int width, int height, int color, int fillchar) {
    (void)x; (void)y; (void)width; (void)height; (void)color; (void)fillchar;
}
static inline void printbyte(int x, int y, int color, unsigned int b) {
    (void)x; (void)y; (void)color; (void)b;
}
static inline void printbyterow(int x, int y, int color, unsigned int b, int length) {
    (void)x; (void)y; (void)color; (void)b; (void)length;
}
static inline void printbytecol(int x, int y, int color, unsigned int b, int length) {
    (void)x; (void)y; (void)color; (void)b; (void)length;
}
static inline void modifyChars(void) {}
static inline int getColor(int fcolor, int bcolor) { (void)fcolor; (void)bcolor; return 0; }
static inline void forceRedraw(void) {}

#ifndef GCONSOLE_C
extern int key, rawkey, shiftpressed, cursorflashdelay, ctrlpressed;
extern int bothShiftAndCtrlPressed;
extern int shiftOrCtrlPressed;
extern int mouseb, prevmouseb;
extern int mouseheld;
extern int mousex, mousey;
extern int mousebDoubleClick;
extern unsigned bigwindow;
extern int keyDownCount;
extern unsigned char *chardata;
#endif

#endif
