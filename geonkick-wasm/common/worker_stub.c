/*
 * worker_stub.c — single-threaded replacement for geonkick's worker thread.
 *
 * The upstream worker.c runs `geonkick_process()` on a background pthread
 * every 40 ms. WebAssembly (without -pthread/COOP+COEP) has no real threads,
 * so we run the baking pass synchronously on `geonkick_worker_wakeup()`.
 *
 * This matches the realtime contract because geonkick_audio_process() just
 * reads from a pre-baked buffer — the expensive rebake happens on param
 * changes, which come from the main thread anyway.
 */
#include "worker.h"
#include "geonkick_internal.h"
#include "gkick_log.h"

#include <stdlib.h>
#include <string.h>

/* Global worker singleton, matching the upstream API shape. */
static struct gkick_worker *geonkick_worker = NULL;

bool
geonkick_worker_created(void)
{
        return geonkick_worker != NULL;
}

size_t
geonkick_worker_reference_count(void)
{
        return geonkick_worker ? geonkick_worker->ref_count : 0;
}

enum geonkick_error
geonkick_worker_create(void)
{
        if (geonkick_worker != NULL)
                return GEONKICK_OK;

        geonkick_worker = (struct gkick_worker *)calloc(1, sizeof(struct gkick_worker));
        if (geonkick_worker == NULL)
                return GEONKICK_ERROR_MEM_ALLOC;

        geonkick_worker->running = true;
        geonkick_worker->ref_count = 0;
        geonkick_worker->process_completed = true;
        /* No pthread init — the stub never spawns a thread. */
        return GEONKICK_OK;
}

enum geonkick_error
geonkick_worker_start(void)
{
        /* No thread to start. */
        return GEONKICK_OK;
}

void
geonkick_worker_destroy(void)
{
        if (geonkick_worker == NULL)
                return;
        free(geonkick_worker);
        geonkick_worker = NULL;
}

void
geonkick_worker_add_instance(struct geonkick *instance)
{
        if (!geonkick_worker || !instance)
                return;
        if (geonkick_worker->ref_count >= GEONKICK_MAX_INSTANCES)
                return;
        instance->id = geonkick_worker->ref_count;
        geonkick_worker->instances[geonkick_worker->ref_count++] = instance;
}

void
geonkick_worker_remove_instance(struct geonkick *instance)
{
        if (!geonkick_worker || !instance)
                return;
        /* Find instance and compact the array. */
        for (size_t i = 0; i < geonkick_worker->ref_count; i++) {
                if (geonkick_worker->instances[i] == instance) {
                        if (i != geonkick_worker->ref_count - 1) {
                                geonkick_worker->instances[i] =
                                        geonkick_worker->instances[geonkick_worker->ref_count - 1];
                                geonkick_worker->instances[i]->id = i;
                        }
                        geonkick_worker->instances[--geonkick_worker->ref_count] = NULL;
                        return;
                }
        }
}

void *
geonkick_worker_thread(void *arg)
{
        (void)arg;
        return NULL;
}

void
geonkick_worker_wakeup(void)
{
        /* Synchronously rebake every registered instance. */
        if (!geonkick_worker)
                return;
        for (size_t i = 0; i < geonkick_worker->ref_count; i++) {
                if (geonkick_worker->instances[i] != NULL)
                        geonkick_process(geonkick_worker->instances[i]);
        }
}

void
geonkick_worker_sync(void)
{
        /* Already synchronous — nothing to wait for. */
}
