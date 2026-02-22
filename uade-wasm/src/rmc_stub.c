/* rmc_stub.c — WASM stub for RMC (bencode container) support.
 * RMC requires bencodetools which we don't need in WASM.
 * All functions return "not RMC" / NULL. */

#include <stddef.h>

/* Forward declare opaque types used in the API */
struct bencode;
struct uade_file;
struct uade_state;

int uade_is_rmc(const char *buf, size_t size)
{
	(void)buf; (void)size;
	return 0;
}

int uade_is_rmc_file(const char *fname)
{
	(void)fname;
	return 0;
}

/* uade_get_rmc_from_state is defined in uadestate.c — do not duplicate here */

struct uade_file *uade_rmc_get_file(const struct bencode *rmc, const char *name)
{
	(void)rmc; (void)name;
	return NULL;
}

int uade_rmc_get_module(struct uade_file **module, const struct bencode *rmc)
{
	(void)module; (void)rmc;
	return -1;
}

struct bencode *uade_rmc_get_meta(const struct bencode *rmc)
{
	(void)rmc;
	return NULL;
}

const struct bencode *uade_rmc_get_subsongs(const struct bencode *rmc)
{
	(void)rmc;
	return NULL;
}

double uade_rmc_get_song_length(const struct bencode *rmc)
{
	(void)rmc;
	return -1.0;
}

struct bencode *uade_rmc_decode(const void *data, size_t size)
{
	(void)data; (void)size;
	return NULL;
}

struct bencode *uade_rmc_decode_file(const char *fname)
{
	(void)fname;
	return NULL;
}

int uade_rmc_record_file(struct bencode *rmc, const char *name,
			 const void *data, size_t len)
{
	(void)rmc; (void)name; (void)data; (void)len;
	return -1;
}

/* ben_free() stub — called by uadestate.c cleanup when rmc != NULL.
 * Since we never allocate rmc, this should never be called, but provide
 * the symbol to avoid link errors. */
void ben_free(struct bencode *b)
{
	(void)b;
}
