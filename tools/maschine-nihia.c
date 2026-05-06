/**
 * maschine-nihia.c — Maschine MK2 hybrid bridge
 *
 * OUTPUT: Direct HID (opened before NIHardwareAgent starts, survives its seizure)
 *   Display: reports 0xE0 / 0xE1, 8 chunks × 265 bytes per screen
 *   Pad RGB LEDs: report 0x80, 49 bytes
 *   Button mono LEDs: report 0x82, 32 bytes
 *
 * INPUT: NIHIA IPC via NIHostIntegrationAgent
 *   Knob rotate, pad pressure, button events → JSON lines to stdout
 *
 * Build:
 *   clang -o tools/maschine-nihia tools/maschine-nihia.c \
 *     -framework CoreFoundation -framework Foundation \
 *     -I/opt/homebrew/include -L/opt/homebrew/lib -lhidapi \
 *     -Wall -O2
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <pthread.h>
#include <unistd.h>
#include <CoreFoundation/CoreFoundation.h>
#include "/opt/homebrew/include/hidapi/hidapi.h"

/* ── NIHIA constants ─────────────────────────────────────────────────────── */
#define CONST_NIM2   0x4e694d32u
#define CONST_PRMY   0x70726d79u
#define CONST_TRUE   0x74727565u
#define PORT_MAIN    "NIHWMainHandler"
#define MK2_ID       0x1140u

#define MSGID_PID_CONNECT      0x03447500u
#define MSGID_ACK_NOT_PORT     0x03404300u
#define MSGID_SERIAL_CONNECT   0x03444900u
#define MSGID_KEYCOUNT         0x03566775u
#define MSGID_KEYCOUNT_KEYS    0x4b657973u
#define MSGID_RKEYCOUNT_KEYS   0x524b6579u
#define MSGID_GETSERIAL        0x03436753u
#define MSGID_PROJECTNAME      0x0349734eu
#define MSGID_MGD              0x0364474du
#define MSGID_TRTS             0x03434300u
#define MSGID_TRTS_PAYLOAD     0x73747274u
#define MSGID_TSI              0x03497354u
#define MSGID_FGC              0x03436746u
#define MSGID_TSI_TRUE         0x03497374u
#define MSGID_TSI_TRUE_PAYLOAD 0x74727565u
#define MSGID_RD               0x03445200u
#define MSGID_AD               0x03444100u

#define EVT_KNOB_ROTATE  0x03654e00u
#define EVT_PAD_DATA     0x03504e00u
#define EVT_BTN_DATA     0x03734e00u

/* ── HID constants ───────────────────────────────────────────────────────── */
#define MK2_VID 0x17CCu
#define MK2_PID 0x1140u

/* ── Globals ─────────────────────────────────────────────────────────────── */
static hid_device       *g_hid = NULL;
static pthread_mutex_t   g_hid_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_t         g_stdin_thread;
static CFMessagePortRef  g_inst_req_port = NULL;
static char              g_device_serial[64] = "00000000";

/* ── NIHIA helpers ───────────────────────────────────────────────────────── */
static void write_u32le(uint8_t *buf, uint32_t v) {
    buf[0]=v&0xff; buf[1]=(v>>8)&0xff; buf[2]=(v>>16)&0xff; buf[3]=(v>>24)&0xff;
}
static uint32_t read_u32le(const uint8_t *b) {
    return (uint32_t)b[0]|((uint32_t)b[1]<<8)|((uint32_t)b[2]<<16)|((uint32_t)b[3]<<24);
}
static int32_t read_i32le(const uint8_t *b) { return (int32_t)read_u32le(b); }

static CFDataRef nihia_send(CFMessagePortRef port, const uint8_t *payload, CFIndex len) {
    CFDataRef d = CFDataCreate(kCFAllocatorDefault, payload, len);
    if (!d) return NULL;
    CFDataRef reply = NULL;
    CFMessagePortSendRequest(port, 0, d, 1000.0, 5000.0, kCFRunLoopDefaultMode, &reply);
    CFRelease(d);
    return reply;
}
static void nihia_inst(const uint8_t *p, CFIndex len) {
    if (!g_inst_req_port) return;
    CFDataRef r = nihia_send(g_inst_req_port, p, len);
    if (r) CFRelease(r);
}

static int parse_port_reply(const uint8_t *rd, CFIndex rlen,
                            char *req, size_t rsz, char *notif, size_t nsz) {
    if (rlen < 8) return 0;
    if (read_u32le(rd) != CONST_TRUE) return 0;
    uint32_t l1 = read_u32le(rd+4);
    if (8+l1 > (uint32_t)rlen) return 0;
    size_t c1 = l1 < rsz-1 ? l1 : rsz-1;
    memcpy(req, rd+8, c1); req[c1]=0;
    uint32_t o2 = 8+l1;
    if (o2+4 > (uint32_t)rlen) return 0;
    uint32_t l2 = read_u32le(rd+o2);
    if (o2+4+l2 > (uint32_t)rlen) return 0;
    size_t c2 = l2 < nsz-1 ? l2 : nsz-1;
    memcpy(notif, rd+o2+4, c2); notif[c2]=0;
    return 1;
}

/* ── HID output ──────────────────────────────────────────────────────────── */
static void hid_try_reopen(void) {
    if (g_hid) { hid_close(g_hid); g_hid = NULL; }
    usleep(500000);
    struct hid_device_info *devs = hid_enumerate(MK2_VID, MK2_PID);
    for (struct hid_device_info *cur = devs; cur && !g_hid; cur = cur->next) {
        hid_device *d = hid_open_path(cur->path);
        if (d) { g_hid = d; fprintf(stderr,"[nihia] HID reopened\n"); }
    }
    hid_free_enumeration(devs);
}

static void hid_send(const uint8_t *data, size_t len) {
    pthread_mutex_lock(&g_hid_mutex);
    if (g_hid) {
        int r = hid_write(g_hid, data, len);
        if (r < 0) {
            fprintf(stderr,"[nihia] hid_write failed, reopening\n");
            hid_try_reopen();
            if (g_hid) hid_write(g_hid, data, len);
        }
    }
    pthread_mutex_unlock(&g_hid_mutex);
}

static void hid_open_device(void) {
    if (hid_init() != 0) return;
    struct hid_device_info *devs = hid_enumerate(MK2_VID, MK2_PID);
    for (struct hid_device_info *cur = devs; cur; cur = cur->next) {
        fprintf(stderr,"[nihia] HID iface %d usage_page=0x%04x\n",
                cur->interface_number, cur->usage_page);
        if (!g_hid) {
            hid_device *d = hid_open_path(cur->path);
            if (d) { g_hid = d;
                fprintf(stderr,"[nihia] HID opened iface %d\n",cur->interface_number); }
        }
    }
    hid_free_enumeration(devs);
    if (!g_hid) fprintf(stderr,"[nihia] HID open failed\n");
}

static void hid_send_display(int screen, const uint8_t *bytes, int byte_count) {
    if (!g_hid || byte_count < 2048) { return; }
    uint8_t report[265];
    for (int chunk = 0; chunk < 8; chunk++) {
        memset(report, 0, sizeof(report));
        report[0] = (screen==0) ? 0xE0 : 0xE1;
        report[3] = (uint8_t)(chunk * 8);
        report[5] = 0x20;
        report[7] = 0x08;
        memcpy(report + 9, bytes + chunk * 256, 256);
        hid_send(report, sizeof(report));
    }
    fprintf(stderr,"[nihia] display %d sent\n", screen);
}

static void hid_send_pad_leds(const uint8_t *rgb48) {
    uint8_t report[49];
    report[0] = 0x80;
    for (int i = 0; i < 48; i++) report[1+i] = rgb48[i] >> 1;
    hid_send(report, sizeof(report));
}

static void hid_send_button_leds(const uint8_t *vals31) {
    uint8_t report[32];
    report[0] = 0x82;
    memcpy(report+1, vals31, 31);
    hid_send(report, sizeof(report));
}

/* ── NIHIA MAIN sequence ─────────────────────────────────────────────────── */
static void send_ack_not_port(CFMessagePortRef rp, const char *n) {
    size_t nl = strlen(n);
    size_t al = 4*4 + nl;
    uint8_t *a = (uint8_t*)calloc(al, 1);
    write_u32le(a, MSGID_ACK_NOT_PORT);
    write_u32le(a+4, CONST_TRUE);
    write_u32le(a+8, 0);
    write_u32le(a+12, (uint32_t)nl);
    memcpy(a+16, n, nl);
    CFDataRef r = nihia_send(rp, a, (CFIndex)al);
    free(a); if (r) CFRelease(r);
}

static void send_main_sequence(void) {
    uint8_t buf[64];
    write_u32le(buf, MSGID_KEYCOUNT); write_u32le(buf+4, MSGID_KEYCOUNT_KEYS); nihia_inst(buf,8);
    write_u32le(buf, MSGID_KEYCOUNT); write_u32le(buf+4, MSGID_RKEYCOUNT_KEYS); nihia_inst(buf,8);
    write_u32le(buf, MSGID_GETSERIAL); nihia_inst(buf,4);
    /* Project name */
    const char *name = "DEViLBOX";
    size_t nl = strlen(name);
    size_t pl = 4*4 + nl + 1;
    uint8_t *pb = (uint8_t*)calloc(pl, 1);
    write_u32le(pb, MSGID_PROJECTNAME); write_u32le(pb+4, 0x70001006);
    write_u32le(pb+8, 0xf6b24000); write_u32le(pb+12, (uint32_t)(nl+1));
    memcpy(pb+16, name, nl); pb[16+nl]=0;
    nihia_inst(pb, (CFIndex)pl); free(pb);
    /* Remaining sequence */
    write_u32le(buf, MSGID_MGD); write_u32le(buf+4, MK2_ID); nihia_inst(buf,8);
    write_u32le(buf, MSGID_TRTS); write_u32le(buf+4, MSGID_TRTS_PAYLOAD); nihia_inst(buf,8);
    write_u32le(buf, MSGID_TSI); write_u32le(buf+4, 0); nihia_inst(buf,8);
    write_u32le(buf, MSGID_FGC); nihia_inst(buf,4);
    write_u32le(buf, MSGID_TSI_TRUE); write_u32le(buf+4, MSGID_TSI_TRUE_PAYLOAD); nihia_inst(buf,8);
    write_u32le(buf, MSGID_RD); write_u32le(buf+4, 0x02); nihia_inst(buf,8);
    write_u32le(buf, MSGID_AD); write_u32le(buf+4, 0x03);
    write_u32le(buf+8, 0); write_u32le(buf+12, 0x4e297b0); nihia_inst(buf,16);
    fprintf(stderr,"[nihia] MAIN sequence sent — knob events should flow\n");
}

/* ── NIHIA event callbacks ───────────────────────────────────────────────── */
static CFDataRef instance_cb(CFMessagePortRef local __attribute__((unused)),
                             SInt32 msgid, CFDataRef data,
                             void *info __attribute__((unused))) {
    if (!data) return NULL;
    const uint8_t *d = CFDataGetBytePtr(data);
    CFIndex len = CFDataGetLength(data);
    uint32_t mid = (len>=4) ? read_u32le(d) : 0;

    /* Debug: dump all incoming messages */
    fprintf(stderr,"[nihia] EVT mid=0x%08x len=%ld msgid=%d", mid, (long)len, (int)msgid);
    if (len >= 8) fprintf(stderr," d4=0x%08x", read_u32le(d+4));
    if (len >= 12) fprintf(stderr," d8=0x%08x", read_u32le(d+8));
    if (len >= 16) fprintf(stderr," d12=0x%08x", read_u32le(d+12));
    if (len >= 20) fprintf(stderr," d16=0x%08x", read_u32le(d+16));
    if (len >= 24) fprintf(stderr," d20=0x%08x", read_u32le(d+20));
    fprintf(stderr,"\n");
    if (mid == EVT_KNOB_ROTATE && len >= 24) {
        uint32_t knob = read_u32le(d+16);
        int32_t  rot  = read_i32le(d+20);
        int dir = rot > 0 ? 1 : (rot < 0 ? -1 : 0);
        printf("{\"type\":\"knob\",\"knob\":%u,\"delta\":%d,\"raw\":%d}\n", knob, dir, rot);
        fflush(stdout);
    } else if (mid == EVT_PAD_DATA && len >= 28) {
        uint32_t pad = read_u32le(d+16);
        uint32_t pres = read_u32le(d+24);
        float pf; memcpy(&pf, &pres, 4);
        int vel = (int)(pf*127.0f); if(vel<0)vel=0; if(vel>127)vel=127;
        uint32_t r2=pad/4, c2=pad%4, phys=(3-r2)*4+c2+1;
        printf("{\"type\":\"pad\",\"pad\":%u,\"velocity\":%d,\"pressed\":%d}\n",
               phys, vel, vel>0);
        fflush(stdout);
    } else if (mid == EVT_BTN_DATA && len >= 21) {
        /* Layout: mid(4) cnt(4) unk1(4) msgtype(4) btn(4) state(1)
         * MK2 uses msgtype==1 for parseable button events */
        uint32_t msgtype = read_u32le(d+12);
        if (msgtype != 1) { /* ignore msgtype 0 (MK2 quirk) */ }
        else {
            uint32_t btn   = read_u32le(d+16);
            uint8_t  state = d[20];
            printf("{\"type\":\"button\",\"btn\":%u,\"pressed\":%d}\n", btn, state > 0);
            fflush(stdout);
        }
    }
    (void)msgid;
    return NULL;
}

static CFMessagePortRef g_dev_req_port = NULL;

static CFDataRef device_cb(CFMessagePortRef local __attribute__((unused)),
                           SInt32 msgid __attribute__((unused)),
                           CFDataRef data, void *info __attribute__((unused))) {
    if (!data) return NULL;
    const uint8_t *d = CFDataGetBytePtr(data);
    CFIndex len = CFDataGetLength(data);
    if (len >= 25) {
        char serial[16]={0}; memcpy(serial, d+16, 8); serial[8]=0;
        fprintf(stderr,"[nihia] device serial=%s\n", serial);
        strncpy(g_device_serial, serial, sizeof(g_device_serial)-1);
        dispatch_async(dispatch_get_main_queue(), ^{
            CFMessagePortRef mp = CFMessagePortCreateRemote(kCFAllocatorDefault, CFSTR(PORT_MAIN));
            if (!mp) return;
            size_t sl = strlen(g_device_serial)+1;
            size_t pl = 5*4 + sl;
            uint8_t *sm = (uint8_t*)calloc(pl,1);
            write_u32le(sm, MSGID_SERIAL_CONNECT); write_u32le(sm+4, MK2_ID);
            write_u32le(sm+8, CONST_NIM2); write_u32le(sm+12, CONST_PRMY);
            write_u32le(sm+16, (uint32_t)sl);
            memcpy(sm+20, g_device_serial, sl);
            CFDataRef reply = nihia_send(mp, sm, (CFIndex)pl);
            free(sm); CFRelease(mp);
            if (!reply) return;
            const uint8_t *rd = CFDataGetBytePtr(reply);
            CFIndex rlen = CFDataGetLength(reply);
            char ireq[256]={0}, inotif[256]={0};
            if (!parse_port_reply(rd, rlen, ireq, sizeof(ireq), inotif, sizeof(inotif))) {
                CFRelease(reply); return;
            }
            CFRelease(reply);
            fprintf(stderr,"[nihia] Phase 2 req=%s\n", ireq);
            CFMessagePortContext ctx={0};
            Boolean sf=false;
            CFStringRef nc = CFStringCreateWithCString(kCFAllocatorDefault, inotif, kCFStringEncodingASCII);
            CFMessagePortRef inp = CFMessagePortCreateLocal(kCFAllocatorDefault, nc,
                (CFMessagePortCallBack)instance_cb, &ctx, &sf);
            CFRelease(nc);
            if (!inp) return;
            CFRunLoopSourceRef src = CFMessagePortCreateRunLoopSource(kCFAllocatorDefault, inp, 0);
            CFRunLoopAddSource(CFRunLoopGetMain(), src, kCFRunLoopCommonModes);
            CFRelease(src);
            CFStringRef rc = CFStringCreateWithCString(kCFAllocatorDefault, ireq, kCFStringEncodingASCII);
            g_inst_req_port = CFMessagePortCreateRemote(kCFAllocatorDefault, rc);
            CFRelease(rc);
            send_ack_not_port(g_inst_req_port, inotif);
            send_main_sequence();
        });
    }
    return NULL;
}

/* ── NIHIA Phase 1 ───────────────────────────────────────────────────────── */
static int do_nihia_connect(void) {
    CFMessagePortRef mp = CFMessagePortCreateRemote(kCFAllocatorDefault, CFSTR(PORT_MAIN));
    if (!mp) { fprintf(stderr,"[nihia] NIHIA not available (NIHardwareAgent not running?)\n"); return 0; }
    fprintf(stderr,"[nihia] Connected to NIHWMainHandler\n");
    uint8_t msg[20];
    write_u32le(msg, MSGID_PID_CONNECT); write_u32le(msg+4, MK2_ID);
    write_u32le(msg+8, CONST_NIM2); write_u32le(msg+12, CONST_PRMY); write_u32le(msg+16, 0);
    CFDataRef reply = nihia_send(mp, msg, 20);
    CFRelease(mp);
    if (!reply) return 0;
    const uint8_t *rd = CFDataGetBytePtr(reply);
    CFIndex rlen = CFDataGetLength(reply);
    char dreq[256]={0}, dnotif[256]={0};
    if (!parse_port_reply(rd, rlen, dreq, sizeof(dreq), dnotif, sizeof(dnotif))) {
        CFRelease(reply); return 0;
    }
    CFRelease(reply);
    fprintf(stderr,"[nihia] Phase 1 devReq=%s\n", dreq);
    CFMessagePortContext ctx={0};
    Boolean sf=false;
    CFStringRef nc = CFStringCreateWithCString(kCFAllocatorDefault, dnotif, kCFStringEncodingASCII);
    CFMessagePortRef dnp = CFMessagePortCreateLocal(kCFAllocatorDefault, nc,
        (CFMessagePortCallBack)device_cb, &ctx, &sf);
    CFRelease(nc);
    if (!dnp) return 0;
    CFRunLoopSourceRef src = CFMessagePortCreateRunLoopSource(kCFAllocatorDefault, dnp, 0);
    CFRunLoopAddSource(CFRunLoopGetMain(), src, kCFRunLoopCommonModes);
    CFRelease(src);
    CFStringRef rc = CFStringCreateWithCString(kCFAllocatorDefault, dreq, kCFStringEncodingASCII);
    g_dev_req_port = CFMessagePortCreateRemote(kCFAllocatorDefault, rc);
    CFRelease(rc);
    send_ack_not_port(g_dev_req_port, dnotif);
    uint8_t ds[4]; write_u32le(ds, 0x03447143u);
    CFDataRef dsr = nihia_send(g_dev_req_port, ds, 4);
    if (dsr) CFRelease(dsr);
    return 1;
}

/* ── Stdin command processor ─────────────────────────────────────────────── */
static const char B64[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static int b64_decode(const char *in, size_t il, uint8_t *out, size_t os) {
    int v=0,b=-8; size_t ol=0;
    for(size_t i=0;i<il;i++){char c=in[i];if(c=='='||c=='"')break;
        const char*p=strchr(B64,c);if(!p)continue;
        v=(v<<6)|(int)(p-B64);b+=6;
        if(b>=0){if(ol<os)out[ol++]=(uint8_t)((v>>b)&0xff);b-=8;}}
    return (int)ol;
}

static const char *json_str(const char *j, const char *key, size_t *ol) {
    char s[128]; snprintf(s,sizeof(s),"\"%s\"",key);
    const char *p=strstr(j,s); if(!p) return NULL;
    p+=strlen(s); while(*p==' '||*p==':'||*p=='\t')p++;
    if(*p!='"') return NULL; p++;
    const char *st=p;
    while(*p&&*p!='"'){if(*p=='\\')p++;if(*p)p++;}
    *ol=(size_t)(p-st); return st;
}

static int parse_int(const char **pp) {
    const char *p=*pp; while(*p==' '||*p==','||*p=='['||*p==']')p++;
    int s=1; if(*p=='-'){s=-1;p++;}
    int v=0; while(*p>='0'&&*p<='9'){v=v*10+(*p-'0');p++;}
    *pp=p; return s*v;
}

static void process_command(const char *line) {
    size_t tl=0; const char *tv=json_str(line,"type",&tl);
    if(!tv) return;

    if (tl==11 && !memcmp(tv,"drawDisplay",11)) {
        const char *sp=strstr(line,"\"screen\""); if(!sp) return;
        sp+=8; while(*sp==' '||*sp==':')sp++;
        int scr=parse_int(&sp)&1;
        size_t pl=0; const char *pv=json_str(line,"pixels",&pl);
        if(!pv||pl==0) return;
        size_t mr=(pl/4)*3+4; uint8_t *raw=(uint8_t*)malloc(mr); if(!raw) return;
        int rl=b64_decode(pv,pl,raw,mr);
        hid_send_display(scr,raw,rl); free(raw);

    } else if (tl==15 && !memcmp(tv,"setAllPadColors",15)) {
        const char *cp=strstr(line,"\"colors\""); if(!cp) return;
        cp=strstr(cp,"["); if(!cp) return;
        uint8_t rgb[48]={0}; const char *p=cp+1;
        for(int pad=0;pad<16;pad++){
            while(*p&&*p!='{'&&*p!=']')p++;
            if(!*p||*p==']')break;
            const char *oe=p; while(*oe&&*oe!='}')oe++;
            int r=0,g=0,b=0;
            const char *rp=strstr(p,"\"r\""); if(rp&&rp<oe){rp+=3;while(*rp==' '||*rp==':')rp++;r=parse_int(&rp);}
            const char *gp=strstr(p,"\"g\""); if(gp&&gp<oe){gp+=3;while(*gp==' '||*gp==':')gp++;g=parse_int(&gp);}
            const char *bp=strstr(p,"\"b\""); if(bp&&bp<oe){bp+=3;while(*bp==' '||*bp==':')bp++;b=parse_int(&bp);}
            if(r>255)r=255;if(g>255)g=255;if(b>255)b=255;
            rgb[pad*3]=(uint8_t)r;rgb[pad*3+1]=(uint8_t)g;rgb[pad*3+2]=(uint8_t)b;
            p=oe+1;
        }
        hid_send_pad_leds(rgb);

    } else if (tl==12 && !memcmp(tv,"setButtonLed",12)) {
        const char *lp=strstr(line,"\"leds\""); if(!lp) return;
        lp=strstr(lp,"["); if(!lp) return;
        uint8_t v[31]={0}; size_t cnt=0; const char *p=lp+1;
        while(*p&&*p!=']'&&cnt<31){while(*p==' '||*p==',')p++;if(*p==']'||!*p)break;
            v[cnt++]=(uint8_t)parse_int(&p);}
        if(cnt>=31) hid_send_button_leds(v);

    } else if (tl==14 && !memcmp(tv,"setProjectName",14)) {
        /* no-op in hybrid mode — NIHIA handles the project name display separately */
    }
}

static void *stdin_reader_thread(void *arg) {
    char *line=NULL; size_t cap=0; ssize_t len;
    (void)arg;
    while((len=getline(&line,&cap,stdin))>0){
        while(len>0&&(line[len-1]=='\n'||line[len-1]=='\r'))line[--len]=0;
        if(len==0)continue;
        char *copy=strdup(line); if(!copy)continue;
        dispatch_async(dispatch_get_main_queue(),^{process_command(copy);free(copy);});
    }
    free(line); return NULL;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
int main(void) {
    fprintf(stderr,"[nihia] Maschine MK2 hybrid bridge (HID output + NIHIA input)\n");

    /* Open HID FIRST before NIHardwareAgent can seize the device */
    hid_open_device();

    pthread_create(&g_stdin_thread, NULL, stdin_reader_thread, NULL);

    /* Connect to NIHIA for knob/pad/button input */
    do_nihia_connect();

    /* CFRunLoop drives both NIHIA IPC callbacks and hidapi IOKit events */
    CFRunLoopRun();
    return 0;
}
