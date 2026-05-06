/**
 * maschine-nihia.c — Maschine MK2 hybrid bridge
 *
 * OUTPUT: Direct HID (opened before NIHardwareAgent starts, survives its seizure)
 *   Display: reports 0xE0 / 0xE1, 8 chunks × 265 bytes per screen
 *   Pad RGB LEDs: report 0x80, 49 bytes
 *   Button mono LEDs: report 0x82, 32 bytes
 *
 * INPUT: HID reports (NIHIA does NOT forward input events for MK2!)
 *   Report 0x01: Buttons (6 bytes bitmask) + encoder (1 byte counter)
 *   Report 0x20: 16 pads × u16 pressure (12-bit, 0-4095)
 *
 * NIHIA is used ONLY for display/LED handshake (keeping agent from seizing HID).
 *
 * Build:
 *   cc -o maschine-nihia tools/maschine-nihia.c \
 *     -framework CoreFoundation -framework IOKit -framework AppKit \
 *     -I/opt/homebrew/opt/hidapi/include/hidapi \
 *     -L/opt/homebrew/opt/hidapi/lib -lhidapi \
 *     -Wl,-rpath,/opt/homebrew/opt/hidapi/lib
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <pthread.h>
#include <unistd.h>
#include <CoreFoundation/CoreFoundation.h>
#include "/opt/homebrew/include/hidapi/hidapi.h"
#include <objc/runtime.h>
#include <objc/message.h>

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
#define MSGID_MGD              0x0344674du
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
static int              g_main_sent = 0;
static int do_nihia_connect(void);  /* forward decl */

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

/* Fire-and-forget send — don't wait for reply */
static void nihia_send_noreply(CFMessagePortRef port, const uint8_t *payload, CFIndex len) {
    CFDataRef d = CFDataCreate(kCFAllocatorDefault, payload, len);
    if (!d) return;
    CFMessagePortSendRequest(port, 0, d, 5.0, 0.0, NULL, NULL);
    CFRelease(d);
}
static void nihia_inst(const uint8_t *p, CFIndex len) {
    if (!g_inst_req_port) return;
    CFDataRef r = nihia_send(g_inst_req_port, p, len);
    if (r) {
        const uint8_t *rd = CFDataGetBytePtr(r);
        CFIndex rlen = CFDataGetLength(r);
        uint32_t mid = len >= 4 ? read_u32le(p) : 0;
        if (rlen >= 4) {
            uint32_t r0 = read_u32le(rd);
            fprintf(stderr,"[nihia] REPLY to 0x%08x: len=%ld r0=0x%08x", mid, (long)rlen, r0);
            if (rlen >= 8) fprintf(stderr," r1=0x%08x", read_u32le(rd+4));
            if (rlen >= 12) fprintf(stderr," r2=0x%08x", read_u32le(rd+8));
            fprintf(stderr,"\n");
        }
        CFRelease(r);
    } else {
        uint32_t mid = len >= 4 ? read_u32le(p) : 0;
        fprintf(stderr,"[nihia] REPLY to 0x%08x: NULL (no reply)\n", mid);
    }
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
        fprintf(stderr,"[nihia] HID iface %d usage_page=0x%04x usage=0x%04x\n",
                cur->interface_number, cur->usage_page, cur->usage);
        if (cur->interface_number == 2 && !g_hid) {
            hid_device *d = hid_open_path(cur->path);
            if (d) { g_hid = d;
                fprintf(stderr,"[nihia] HID opened iface 2 (display+input)\n"); }
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
    fprintf(stderr,"[nihia] MAIN: sending KEYCOUNT...\n");
    write_u32le(buf, MSGID_KEYCOUNT); write_u32le(buf+4, MSGID_KEYCOUNT_KEYS); nihia_inst(buf,8);
    fprintf(stderr,"[nihia] MAIN: sending RKEYCOUNT...\n");
    write_u32le(buf, MSGID_KEYCOUNT); write_u32le(buf+4, MSGID_RKEYCOUNT_KEYS); nihia_inst(buf,8);
    fprintf(stderr,"[nihia] MAIN: sending GETSERIAL...\n");
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
    fprintf(stderr,"[nihia] MAIN: sending MGD...\n");
    write_u32le(buf, MSGID_MGD); write_u32le(buf+4, MK2_ID); nihia_inst(buf,8);
    fprintf(stderr,"[nihia] MAIN: sending TRTS...\n");
    write_u32le(buf, MSGID_TRTS); write_u32le(buf+4, MSGID_TRTS_PAYLOAD); nihia_inst(buf,8);
    fprintf(stderr,"[nihia] MAIN: sending TSI...\n");
    write_u32le(buf, MSGID_TSI); write_u32le(buf+4, 0); nihia_inst(buf,8);
    fprintf(stderr,"[nihia] MAIN: sending FGC...\n");
    write_u32le(buf, MSGID_FGC); nihia_inst(buf,4);
    fprintf(stderr,"[nihia] MAIN: sending TSI_TRUE...\n");
    write_u32le(buf, MSGID_TSI_TRUE); write_u32le(buf+4, MSGID_TSI_TRUE_PAYLOAD); nihia_inst(buf,8);
    fprintf(stderr,"[nihia] MAIN: sending RD...\n");
    write_u32le(buf, MSGID_RD); write_u32le(buf+4, 0x02); nihia_inst(buf,8);
    fprintf(stderr,"[nihia] MAIN: sending AD...\n");
    write_u32le(buf, MSGID_AD); write_u32le(buf+4, 0x03);
    write_u32le(buf+8, 0); write_u32le(buf+12, 0x4e297b0); nihia_inst(buf,16);
    /* DSD (Display Setup Data) — required by NIHIA protocol for all devices except KKM */
    fprintf(stderr,"[nihia] MAIN: sending DSD_1...\n");
    {
        uint8_t dsd[52];
        write_u32le(dsd,    0x03647344);
        write_u32le(dsd+4,  0x00000000);
        write_u32le(dsd+8,  0x00000000);
        write_u32le(dsd+12, 0x01e00110);
        write_u32le(dsd+16, 0x00000020);
        write_u32le(dsd+20, 0x60000084);
        write_u32le(dsd+24, 0x00000000);
        write_u32le(dsd+28, 0x00000000);
        write_u32le(dsd+32, 0x1001e001);
        write_u32le(dsd+36, 0x00ff0001);
        write_u32le(dsd+40, 0x00000000);
        write_u32le(dsd+44, 0x00000003);
        write_u32le(dsd+48, 0x00000040);
        nihia_send_noreply(g_inst_req_port, dsd, 52);
        fprintf(stderr,"[nihia] MAIN: sending DSD_2...\n");
        write_u32le(dsd+4,  0x00000001);
        write_u32le(dsd+20, 0x60010084);
        write_u32le(dsd+48, 0x00010040);
        nihia_send_noreply(g_inst_req_port, dsd, 52);
    }
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

    /* Handle disconnect notification — agent wants us to reconnect */
    if (mid == 0x03444e00u && len >= 8 && read_u32le(d+4) == 0x00000000) {
        fprintf(stderr,"[nihia] Device disconnected — reconnecting...\n");
        g_main_sent = 0;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500*NSEC_PER_MSEC),
            dispatch_get_main_queue(), ^{ do_nihia_connect(); });
        return NULL;
    }

    /* Send MAIN sequence on first instance callback — dispatch off main queue
       to avoid blocking callback delivery */
    if (!g_main_sent) {
        fprintf(stderr,"[nihia] First callback received — sending MAIN on background thread\n");
        g_main_sent = 1;
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
            send_main_sequence();
        });
    }

    /* "controller ready" ack (0x03434e00 + "true") — just log, MAIN already sent FGC+TSI */
    if (mid == 0x03434e00u && len >= 8 && read_u32le(d+4) == MSGID_TSI_TRUE_PAYLOAD) {
        fprintf(stderr,"[nihia] Controller ready ack received\n");
    }

    /* Debug: dump ALL messages to stderr for now */
    fprintf(stderr,"[nihia] CB mid=0x%08x len=%ld", mid, (long)len);
    if (len >= 8) fprintf(stderr," d4=0x%08x", read_u32le(d+4));
    if (len >= 12) fprintf(stderr," d8=0x%08x", read_u32le(d+8));
    if (len >= 16) fprintf(stderr," d12=0x%08x", read_u32le(d+12));
    if (len >= 20) fprintf(stderr," d16=0x%08x", read_u32le(d+16));
    if (len >= 24) fprintf(stderr," d20=0x%08x", read_u32le(d+20));
    fprintf(stderr,"\n");
    if (mid == EVT_KNOB_ROTATE && len >= 24) {
        uint32_t knob = read_u32le(d+16);
        uint32_t rbits = read_u32le(d+20);
        float rot; memcpy(&rot, &rbits, 4);
        int dir = rot > 0.0f ? 1 : (rot < 0.0f ? -1 : 0);
        printf("{\"type\":\"knob\",\"knob\":%u,\"delta\":%d,\"raw\":%f}\n", knob, dir, rot);
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
            fprintf(stderr,"[nihia] Phase 2 req=%s notif=%s\n", ireq, inotif);
            CFMessagePortContext ctx={0};
            Boolean sf=false;
            CFStringRef nc = CFStringCreateWithCString(kCFAllocatorDefault, inotif, kCFStringEncodingASCII);
            CFMessagePortRef inp = CFMessagePortCreateLocal(kCFAllocatorDefault, nc,
                (CFMessagePortCallBack)instance_cb, &ctx, &sf);
            CFRelease(nc);
            if (!inp) { fprintf(stderr,"[nihia] FAILED to create instance port (sf=%d)!\n", sf); return; }
            CFMessagePortSetDispatchQueue(inp, dispatch_get_main_queue());
            CFStringRef rc = CFStringCreateWithCString(kCFAllocatorDefault, ireq, kCFStringEncodingASCII);
            g_inst_req_port = CFMessagePortCreateRemote(kCFAllocatorDefault, rc);
            CFRelease(rc);
            send_ack_not_port(g_inst_req_port, inotif);
            g_main_sent = 0; /* will send MAIN on first instance callback */
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
    CFMessagePortSetDispatchQueue(dnp, dispatch_get_main_queue());
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

/* ── HID input reader thread ─────────────────────────────────────────────── */
static hid_device *g_hid_input = NULL; /* separate handle for input */

/* Pad state tracking — median filter + threshold (from maschine.rs) */
#define PAD_THRESHOLD    (700.0f / 4095.0f)  /* ~17% — filters table bumps + capacitive noise */
#define PAD_MEDIAN_LEN   7
typedef struct {
    float history[PAD_MEDIAN_LEN];
    int   head;
    int   pressed;  /* 0=unpressed, 1=pressed */
} PadState;
static PadState g_pads[16] = {0};

static float pad_filtered(PadState *ps) {
    float sorted[PAD_MEDIAN_LEN];
    memcpy(sorted, ps->history, sizeof(sorted));
    /* simple insertion sort for small N */
    for (int i=1; i<PAD_MEDIAN_LEN; i++) {
        float t = sorted[i]; int j=i-1;
        while (j>=0 && sorted[j]>t) { sorted[j+1]=sorted[j]; j--; }
        sorted[j+1] = t;
    }
    return sorted[PAD_MEDIAN_LEN/2];
}

static void pad_update(int idx, float raw_pressure) {
    PadState *ps = &g_pads[idx];
    ps->history[ps->head] = raw_pressure;
    ps->head = (ps->head + 1) % PAD_MEDIAN_LEN;
    float p = pad_filtered(ps);

    if (!ps->pressed && p > PAD_THRESHOLD) {
        ps->pressed = 1;
        int vel = (int)(p * 127.0f); if (vel>127) vel=127; if (vel<1) vel=1;
        /* Remap pad layout: HID sends row-major bottom-left=0, we want standard MPC layout */
        int row = idx / 4, col = idx % 4;
        int phys = (3-row)*4 + col;  /* flip rows so bottom-left pad = 0 */
        printf("{\"type\":\"pad\",\"pad\":%d,\"velocity\":%d,\"pressed\":true}\n", phys, vel);
        fflush(stdout);
    } else if (ps->pressed && p <= 0.0f) {
        ps->pressed = 0;
        int row = idx / 4, col = idx % 4;
        int phys = (3-row)*4 + col;
        printf("{\"type\":\"pad\",\"pad\":%d,\"velocity\":0,\"pressed\":false}\n", phys);
        fflush(stdout);
    }
    /* aftertouch: could emit here for ps->pressed && p changed, but skip for now */
}

/* MK2 button names — matched to physical layout.
 * Button report 0x01: buf[1..6] = 6 bytes button bitmask (48 buttons).
 * Bit order: LSB first within each byte.
 * Mapping verified against maschine.rs (SnovaxZ/MaschineMK2_linux). */
static const char *MK2_BUTTON_NAMES[48] = {
    /* Byte 0, bits 0-7: soft buttons (F1-F8, above screens) */
    "soft1","soft2","soft3","soft4","soft5","soft6","soft7","soft8",
    /* Byte 1, bits 0-7 */
    "control","step","browse","sampling","pageRight","pageLeft","all","auto",
    /* Byte 2, bits 0-7 */
    "volume","swing","tempo","navLeft","navRight","enter","noteRepeat","nav",
    /* Byte 3, bits 0-7: group buttons A-H */
    "groupA","groupB","groupC","groupD","groupE","groupF","groupG","groupH",
    /* Byte 4, bits 0-7: transport row */
    "restart","stepLeft","stepRight","grid","play","rec","erase","shift",
    /* Byte 5, bits 0-7: left column */
    "scene","pattern","padMode","navigate","duplicate","select","solo","mute"
};

static void *hid_reader_thread(void *arg) {
    (void)arg;
    uint8_t buf[256];
    uint8_t prev_buttons[8] = {0};
    uint16_t prev_knobs[8] = {0};
    int knob_pos[8] = {64,64,64,64,64,64,64,64}; /* virtual 0-127 position, start at center */
    int knob_accum[8] = {0}; /* sub-step accumulator for smooth scaling */
    uint8_t prev_encoder = 0x80;  /* initial invalid value to detect first read */
    int first_btn = 1;
    fprintf(stderr,"[nihia] HID reader thread started\n");
    hid_device *dev = g_hid_input ? g_hid_input : g_hid;
    if (!dev) { fprintf(stderr,"[nihia] HID reader: no device\n"); return NULL; }
    hid_set_nonblocking(dev, 0);  /* blocking reads with timeout */
    while (1) {
        int n = hid_read_timeout(dev, buf, sizeof(buf), 100);
        if (n <= 0) continue;
        uint8_t report = buf[0];

        if (report == 0x01) {
            /* MK2 button report: 25 bytes total
             * buf[1..6]  = 6 bytes button bitmask (48 buttons)
             * buf[7]     = encoder (4-bit wrapping counter)
             * buf[8..23] = 8 × u16 LE knob absolute positions */
            if (n < 8) { /* too short, skip */ }
            else {
            int btn_bytes = 6;
            if (btn_bytes > n - 2) btn_bytes = n - 2;
            uint8_t enc = buf[7];

            if (first_btn) {
                memcpy(prev_buttons, buf+1, btn_bytes);
                prev_encoder = enc;
                /* Store initial knob positions */
                if (n >= 24) {
                    for (int k=0; k<8; k++)
                        prev_knobs[k] = buf[8+k*2] | (buf[9+k*2]<<8);
                }
                first_btn = 0;
                continue;
            }

            /* Detect button changes */
            for (int byte_idx = 0; byte_idx < btn_bytes; byte_idx++) {
                uint8_t curr = buf[1 + byte_idx];
                uint8_t diff = curr ^ prev_buttons[byte_idx];
                if (!diff) continue;
                for (int bit = 0; bit < 8; bit++) {
                    if (!(diff & (1 << bit))) continue;
                    int btn_id = byte_idx * 8 + bit;
                    int pressed = (curr & (1 << bit)) ? 1 : 0;
                    const char *name = (btn_id < 48 && MK2_BUTTON_NAMES[btn_id])
                        ? MK2_BUTTON_NAMES[btn_id] : "unknown";
                    printf("{\"type\":\"button\",\"name\":\"%s\",\"btnId\":%d,\"pressed\":%s}\n",
                           name, btn_id, pressed ? "true" : "false");
                    fflush(stdout);
                }
                prev_buttons[byte_idx] = curr;
            }

            /* Encoder: 4-bit wrapping counter */
            if (enc != prev_encoder) {
                int diff = (int)(enc & 0x0F) - (int)(prev_encoder & 0x0F);
                if (diff > 7) diff -= 16;
                if (diff < -7) diff += 16;
                if (diff != 0) {
                    printf("{\"type\":\"encoder\",\"index\":0,\"name\":\"mainEncoder\",\"value\":%d,\"raw\":%d}\n",
                           diff > 0 ? 65 : 63, diff);
                    fflush(stdout);
                }
                prev_encoder = enc;
            }

            /* 8 knobs: endless encoders — u16 accumulating counter
             * We track a virtual 0-127 position, adjusting by delta direction */
            if (n >= 24) {
                static const char *KNOB_NAMES[8] = {
                    "knob1","knob2","knob3","knob4","knob5","knob6","knob7","knob8"
                };
                for (int k=0; k<8; k++) {
                    uint16_t val = buf[8+k*2] | (buf[9+k*2]<<8);
                    if (val != prev_knobs[k]) {
                        int16_t delta = (int16_t)(val - prev_knobs[k]);
                        prev_knobs[k] = val;
                        /* Accumulate sub-step residue for smooth 1:1 feel.
                         * ~1024 raw units per detent click → 1 MIDI step */
                        knob_accum[k] += delta;
                        int steps = knob_accum[k] / 1024;
                        if (steps == 0) continue;
                        knob_accum[k] -= steps * 1024;
                        int old_pos = knob_pos[k];
                        knob_pos[k] += steps;
                        if (knob_pos[k] < 0) knob_pos[k] = 0;
                        if (knob_pos[k] > 127) knob_pos[k] = 127;
                        if (knob_pos[k] == old_pos) continue;
                        printf("{\"type\":\"encoder\",\"index\":%d,\"name\":\"%s\",\"value\":%d,\"raw\":%d}\n",
                               k, KNOB_NAMES[k], knob_pos[k], (int)delta);
                        fflush(stdout);
                    }
                }
            }
            } /* end else (n >= 8) */

        } else if (report == 0x20 && n >= 33) {
            /* Pad pressure: 16 × u16 LE, 12-bit values (masked by 0xFFF) */
            for (int i=0; i<16 && (1+i*2+1)<n; i++) {
                uint16_t raw = buf[1+i*2] | (buf[2+i*2]<<8);
                float pressure = (float)(raw & 0xFFF) / 4095.0f;
                pad_update(i, pressure);
            }

        } else if (report != 0x01 && report != 0x20) {
            /* Unknown report — log once */
            static uint8_t seen_reports[256] = {0};
            if (!seen_reports[report]) {
                seen_reports[report] = 1;
                fprintf(stderr,"[nihia] Unknown HID report 0x%02x (%d bytes):", report, n);
                for (int i=1; i<n && i<20; i++) fprintf(stderr," %02x", buf[i]);
                fprintf(stderr,"\n");
            }
        }
    }
    return NULL;
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

    /* Become a foreground macOS app so NIHardwareAgent treats us as active */
    id app = ((id(*)(id,SEL))objc_msgSend)((id)objc_getClass("NSApplication"),
        sel_registerName("sharedApplication"));
    ((void(*)(id,SEL,long))objc_msgSend)(app,
        sel_registerName("setActivationPolicy:"), 1L); /* NSApplicationActivationPolicyAccessory */
    ((void(*)(id,SEL,BOOL))objc_msgSend)(app,
        sel_registerName("activateIgnoringOtherApps:"), 1);

    /* Open HID FIRST before NIHardwareAgent can seize the device */
    hid_open_device();

    /* Start HID input reader for buttons/pads */
    pthread_t hid_thread;
    pthread_create(&hid_thread, NULL, hid_reader_thread, NULL);

    pthread_create(&g_stdin_thread, NULL, stdin_reader_thread, NULL);

    /* Connect to NIHIA — keeps agent from seizing HID, enables display commands */
    do_nihia_connect();

    /* Run main loop — 50ms tick is fine since NIHIA is display-only,
       all input comes from the HID reader thread */
    while (1) {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.05, false);
    }
    return 0;
}
