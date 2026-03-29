// Minimal liblo stub for WASM build (ZynAddSubFX MiddleWare)
#ifndef LO_LO_H
#define LO_LO_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void *lo_server;
typedef void *lo_address;
typedef void *lo_message;
typedef int lo_method;
typedef void *lo_blob;
typedef const void *lo_arg;

#define LO_UDP 0

typedef void (*lo_err_handler)(int num, const char *msg, const char *where);
typedef int (*lo_method_handler)(const char *path, const char *types,
                                 lo_arg **argv, int argc, lo_message msg,
                                 void *user_data);

static inline lo_server lo_server_new_with_proto(const char *port, int proto, lo_err_handler err_h) {
    (void)port; (void)proto; (void)err_h;
    return (lo_server)0;
}
static inline lo_server lo_server_new(const char *port, lo_err_handler err_h) {
    (void)port; (void)err_h;
    return (lo_server)0;
}
static inline void lo_server_free(lo_server s) { (void)s; }
static inline int lo_server_get_port(lo_server s) { (void)s; return 0; }
static inline char *lo_server_get_url(lo_server s) { (void)s; return (char*)""; }
static inline lo_method lo_server_add_method(lo_server s, const char *path, const char *typespec,
                                              lo_method_handler h, void *user_data) {
    (void)s; (void)path; (void)typespec; (void)h; (void)user_data;
    return 0;
}
static inline int lo_server_recv_noblock(lo_server s, int timeout) {
    (void)s; (void)timeout;
    return 0;
}
static inline int lo_send_message_from(lo_address targ, lo_server from,
                                        const char *path, lo_message msg) {
    (void)targ; (void)from; (void)path; (void)msg;
    return 0;
}
static inline lo_address lo_address_new(const char *host, const char *port) {
    (void)host; (void)port;
    return (lo_address)0;
}
static inline lo_address lo_address_new_from_url(const char *url) {
    (void)url;
    return (lo_address)0;
}
static inline void lo_address_free(lo_address a) { (void)a; }
static inline lo_message lo_message_new(void) { return (lo_message)0; }
static inline void lo_message_free(lo_message m) { (void)m; }
static inline lo_address lo_message_get_source(lo_message m) { (void)m; return (lo_address)0; }
static inline lo_message lo_message_deserialise(void *data, size_t size, int *result) {
    (void)data; (void)size; (void)result;
    return (lo_message)0;
}
static inline void lo_message_serialise(lo_message msg, const char *path, void *buffer, size_t *size) {
    (void)msg; (void)path; (void)buffer;
    if (size) *size = 0;
}
static inline char *lo_address_get_url(lo_address a) { (void)a; return (char*)""; }
static inline int lo_send_message(lo_address targ, const char *path, lo_message msg) {
    (void)targ; (void)path; (void)msg;
    return 0;
}
static inline const char *lo_address_get_hostname(lo_address a) { (void)a; return ""; }
static inline const char *lo_address_get_port(lo_address a) { (void)a; return ""; }
static inline int lo_address_get_protocol(lo_address a) { (void)a; return 0; }
static inline char *lo_url_get_hostname(const char *url) { (void)url; return (char*)""; }
static inline char *lo_url_get_port(const char *url) { (void)url; return (char*)""; }
static inline int lo_url_get_protocol(const char *url) { (void)url; return 0; }

#ifdef __cplusplus
}
#endif

#endif // LO_LO_H
