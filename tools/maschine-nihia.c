/**
 * maschine-nihia.c — Maschine MK2 NIHIA bridge
 *
 * Connects to NIHostIntegrationAgent via CFMessagePort "NIHWMainHandler",
 * performs the NIHIA handshake, then streams knob/pad/button events as
 * JSON lines to stdout for the Node.js WebSocket bridge to consume.
 *
 * Protocol reverse-engineered by https://github.com/terminar/rebellion (LGPLv3)
 *
 * Build:
 *   clang -o tools/maschine-nihia tools/maschine-nihia.c \
 *     -framework CoreFoundation -framework Foundation
 *
 * Usage:
 *   ./tools/maschine-nihia <serial>
 *   e.g.: ./tools/maschine-nihia 6F05B5C7
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <CoreFoundation/CoreFoundation.h>

/* ── NIHIA constants ─────────────────────────────────────────────────────── */
#define CONST_NIM2   0x4e694d32u   /* "NiM2" Maschine2 marker */
#define CONST_PRMY   0x70726d79u   /* "prmy" client role */
#define CONST_TRUE   0x74727565u   /* "true" */
#define PORT_MAIN    "NIHWMainHandler"

/* NIHIA message IDs (from rebellion niproto.lua) */
#define MSGID_SERIAL_CONNECT   0x03444900u
#define MSGID_ACK_NOT_PORT     0x03404300u
#define MSGID_VERSION          0x03536756u
#define MSGID_KEYCOUNT         0x03566775u
#define MSGID_KEYCOUNT_KEYS    0x4b657973u   /* payload for keycount */
#define MSGID_RKEYCOUNT_KEYS   0x524b6579u   /* payload for rkeycount */

/* Event message IDs received on notification port */
#define EVT_KNOB_ROTATE  0x3654e00u
#define EVT_PAD_DATA     0x3504e00u
#define EVT_BTN_DATA     0x3424e00u

/* Maschine MK2 product ID */
#define MK2_DEVICE_ID    0x1140u

/* ── Globals ─────────────────────────────────────────────────────────────── */
static CFMessagePortRef g_req_port  = NULL; /* port for sending requests */
static char             g_serial[64] = {0};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/* Write little-endian uint32 */
static void write_u32le(uint8_t *buf, uint32_t v) {
    buf[0] = v & 0xff;
    buf[1] = (v >> 8) & 0xff;
    buf[2] = (v >> 16) & 0xff;
    buf[3] = (v >> 24) & 0xff;
}

static uint32_t read_u32le(const uint8_t *buf) {
    return (uint32_t)buf[0]
         | ((uint32_t)buf[1] << 8)
         | ((uint32_t)buf[2] << 16)
         | ((uint32_t)buf[3] << 24);
}

static int32_t read_i32le(const uint8_t *buf) {
    return (int32_t)read_u32le(buf);
}

/* Send a raw byte buffer to a CFMessagePort, optionally receiving a reply */
static CFDataRef send_msg(CFMessagePortRef port, SInt32 msgid,
                          const uint8_t *payload, CFIndex paylen) {
    CFDataRef data = CFDataCreate(kCFAllocatorDefault, payload, paylen);
    if (!data) return NULL;

    CFDataRef reply = NULL;
    SInt32 ret = CFMessagePortSendRequest(port, msgid, data,
                                          1.0, 5.0,
                                          kCFRunLoopDefaultMode,
                                          &reply);
    CFRelease(data);
    if (ret != kCFMessagePortSuccess) {
        fprintf(stderr, "[nihia] send_msg failed: %d\n", ret);
        return NULL;
    }
    return reply;
}

/* ── Notification port callback ──────────────────────────────────────────── */
static CFDataRef notification_callback(CFMessagePortRef local __attribute__((unused)),
                                       SInt32 msgid,
                                       CFDataRef data,
                                       void *info __attribute__((unused))) {
    if (!data) return NULL;
    const uint8_t *d = CFDataGetBytePtr(data);
    CFIndex len = CFDataGetLength(data);

    if (msgid == (SInt32)EVT_KNOB_ROTATE && len >= 24) {
        /* struct: [_:4][cnt:4][unk1:4][msgtype:4][knob:4][rotation:4] */
        uint32_t knob     = read_u32le(d + 16);
        int32_t  rotation = read_i32le(d + 20);
        /* Normalize rotation to MIDI-friendly delta (-63..+63) */
        int delta = rotation > 0 ? 1 : (rotation < 0 ? -1 : 0);
        printf("{\"type\":\"knob\",\"knob\":%u,\"delta\":%d,\"raw\":%d}\n",
               knob, delta, rotation);
        fflush(stdout);
    } else if (msgid == (SInt32)EVT_PAD_DATA && len >= 28) {
        /* struct: [_:4][cnt:4][unk1:4][order:4][pad:4][nstate:4][pressure:4] */
        uint32_t pad      = read_u32le(d + 16);
        uint32_t pressure = read_u32le(d + 24);
        int pressed = pressure > 0;
        /* Pad layout: linear 0-15 → physical pad 1-16 (bottom-left first) */
        uint32_t r = pad / 4, c = pad % 4;
        uint32_t phys = (3 - r) * 4 + c + 1;
        /* Convert pressure (float bits) to velocity 0-127 */
        float pf;
        memcpy(&pf, &pressure, 4);
        int vel = (int)(pf * 127.0f);
        if (vel < 0) vel = 0;
        if (vel > 127) vel = 127;
        printf("{\"type\":\"pad\",\"pad\":%u,\"velocity\":%d,\"pressed\":%d}\n",
               phys, vel, pressed);
        fflush(stdout);
    } else if (msgid == (SInt32)EVT_BTN_DATA && len >= 8) {
        /* Button events — just forward raw for now */
        uint32_t btn   = read_u32le(d + 4);
        uint32_t state = len >= 12 ? read_u32le(d + 8) : 0;
        printf("{\"type\":\"button\",\"btn\":%u,\"state\":%u}\n", btn, state);
        fflush(stdout);
    }

    return NULL;
}

/* ── Handshake ───────────────────────────────────────────────────────────── */
static int do_handshake(void) {
    /* Step 1: Open NIHWMainHandler (bootstrap port for sending) */
    CFStringRef main_port_name = CFStringCreateWithCString(
        kCFAllocatorDefault, PORT_MAIN, kCFStringEncodingASCII);
    CFMessagePortRef main_port = CFMessagePortCreateRemote(
        kCFAllocatorDefault, main_port_name);
    CFRelease(main_port_name);

    if (!main_port) {
        fprintf(stderr, "[nihia] Cannot open NIHWMainHandler — is NIHostIntegrationAgent running?\n");
        return 0;
    }
    fprintf(stderr, "[nihia] Connected to NIHWMainHandler\n");

    /* Step 2: Send MSG_SERIAL_CONNECT */
    size_t slen = strlen(g_serial);
    size_t plen = 5 * 4 + slen;
    uint8_t *connect_msg = calloc(plen, 1);
    write_u32le(connect_msg +  0, MSGID_SERIAL_CONNECT);
    write_u32le(connect_msg +  4, MK2_DEVICE_ID);
    write_u32le(connect_msg +  8, CONST_NIM2);
    write_u32le(connect_msg + 12, CONST_PRMY);
    write_u32le(connect_msg + 16, (uint32_t)slen);
    memcpy(connect_msg + 20, g_serial, slen);

    fprintf(stderr, "[nihia] Sending SERIAL_CONNECT (%zu bytes):\n", plen);
    for (size_t i = 0; i < plen; i++) {
        fprintf(stderr, "%02x ", connect_msg[i]);
        if ((i+1) % 16 == 0) fprintf(stderr, "\n");
    }
    fprintf(stderr, "\n");

    /* Also try MSG_VERSION first */
    uint8_t ver_msg[4];
    write_u32le(ver_msg, 0x03536756);
    fprintf(stderr, "[nihia] Sending MSG_VERSION first...\n");
    CFDataRef ver_reply = send_msg(main_port, 0, ver_msg, 4);
    if (ver_reply) {
        const uint8_t *vd = CFDataGetBytePtr(ver_reply);
        CFIndex vlen = CFDataGetLength(ver_reply);
        fprintf(stderr, "[nihia] VERSION reply: %ld bytes: ", (long)vlen);
        for (CFIndex i = 0; i < vlen && i < 32; i++) fprintf(stderr, "%02x ", vd[i]);
        fprintf(stderr, "\n");
        CFRelease(ver_reply);
    } else {
        fprintf(stderr, "[nihia] VERSION: no reply\n");
    }

    CFDataRef reply = send_msg(main_port, 0, connect_msg, (CFIndex)plen);
    free(connect_msg);

    if (!reply) {
        fprintf(stderr, "[nihia] No reply to SERIAL_CONNECT\n");
        CFRelease(main_port);
        return 0;
    }

    /* Step 3: Parse reply → reqportname + notifportname */
    const uint8_t *rd = CFDataGetBytePtr(reply);
    CFIndex rlen = CFDataGetLength(reply);
    fprintf(stderr, "[nihia] SERIAL_CONNECT reply: %ld bytes\n", (long)rlen);
    for (CFIndex i = 0; i < rlen && i < 64; i++) {
        fprintf(stderr, "%02x ", rd[i]);
        if ((i+1) % 16 == 0) fprintf(stderr, "\n");
    }
    fprintf(stderr, "\n");

    if (rlen < 4) {
        fprintf(stderr, "[nihia] SERIAL_CONNECT reply too short\n");
        CFRelease(reply); CFRelease(main_port);
        return 0;
    }

    uint32_t result = read_u32le(rd);
    if (result != CONST_TRUE) {
        fprintf(stderr, "[nihia] SERIAL_CONNECT failed (result=0x%08x)\n", result);
        CFRelease(reply); CFRelease(main_port);
        return 0;
    }

    uint32_t reqportlen = read_u32le(rd + 4);
    char reqportname[256] = {0};
    if (reqportlen > 0 && (8 + reqportlen) <= (uint32_t)rlen) {
        memcpy(reqportname, rd + 8, reqportlen < 255 ? reqportlen : 255);
    }

    uint32_t notifportlen = 0;
    char notifportname[256] = {0};
    size_t notif_offset = 8 + reqportlen;
    if ((notif_offset + 4) <= (size_t)rlen) {
        notifportlen = read_u32le(rd + notif_offset);
        if (notifportlen > 0 && (notif_offset + 4 + notifportlen) <= (size_t)rlen) {
            memcpy(notifportname, rd + notif_offset + 4,
                   notifportlen < 255 ? notifportlen : 255);
        }
    }
    CFRelease(reply);

    fprintf(stderr, "[nihia] reqport=%s notifport=%s\n", reqportname, notifportname);

    /* Step 4: Open the request port for further messages */
    CFStringRef req_name = CFStringCreateWithCString(
        kCFAllocatorDefault, reqportname, kCFStringEncodingASCII);
    g_req_port = CFMessagePortCreateRemote(kCFAllocatorDefault, req_name);
    CFRelease(req_name);
    if (!g_req_port) {
        fprintf(stderr, "[nihia] Cannot open request port: %s\n", reqportname);
        CFRelease(main_port);
        return 0;
    }

    /* Step 5: Create local notification port */
    CFMessagePortContext ctx = {0, NULL, NULL, NULL, NULL};
    Boolean should_free = false;
    CFStringRef notif_cfname = CFStringCreateWithCString(
        kCFAllocatorDefault, notifportname, kCFStringEncodingASCII);
    CFMessagePortRef notif_port = CFMessagePortCreateLocal(
        kCFAllocatorDefault, notif_cfname,
        (CFMessagePortCallBack)notification_callback,
        &ctx, &should_free);
    CFRelease(notif_cfname);

    if (!notif_port) {
        fprintf(stderr, "[nihia] Cannot create notification port: %s\n", notifportname);
        CFRelease(main_port); CFRelease(g_req_port);
        return 0;
    }

    CFRunLoopSourceRef src = CFMessagePortCreateRunLoopSource(
        kCFAllocatorDefault, notif_port, 0);
    CFRunLoopAddSource(CFRunLoopGetMain(), src, kCFRunLoopCommonModes);
    CFRelease(src);

    /* Step 6: Send MSG_ACK_NOT_PORT to request port */
    size_t nlen = strlen(notifportname);
    size_t ack_plen = 4 * 4 + nlen;
    uint8_t *ack_msg = calloc(ack_plen, 1);
    write_u32le(ack_msg +  0, MSGID_ACK_NOT_PORT);
    write_u32le(ack_msg +  4, CONST_TRUE);
    write_u32le(ack_msg +  8, 0);
    write_u32le(ack_msg + 12, (uint32_t)nlen);
    memcpy(ack_msg + 16, notifportname, nlen);

    CFDataRef ack_reply = send_msg(g_req_port, 0, ack_msg, (CFIndex)ack_plen);
    free(ack_msg);
    if (ack_reply) CFRelease(ack_reply);

    fprintf(stderr, "[nihia] Handshake complete — listening for events\n");
    CFRelease(main_port);
    return 1;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: maschine-nihia <serial>\n");
        fprintf(stderr, "  e.g.: maschine-nihia 6F05B5C7\n");
        return 1;
    }
    strncpy(g_serial, argv[1], sizeof(g_serial) - 1);
    fprintf(stderr, "[nihia] Maschine MK2 NIHIA bridge (serial=%s)\n", g_serial);

    if (!do_handshake()) {
        return 1;
    }

    /* Run until killed */
    CFRunLoopRun();
    return 0;
}
