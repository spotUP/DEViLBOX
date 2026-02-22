/* uadecore_wasm.c — WASM adapter for uadecore (68k emulator side)
 *
 * Provides uadecore_wasm_init() and uadecore_handle_one_message() which
 * are called by shim_ipc.c to drive the 68k emulator synchronously.
 *
 * In native UADE, uadecore runs as a separate process with its own main().
 * In WASM, we split uadecore_main() into:
 *   - uadecore_wasm_init: one-time hardware initialization
 *   - uadecore_handle_one_message: process one IPC message from the frontend
 *
 * CRITICAL: The native UADE uses fork()+socketpair() so the frontend and
 * core run concurrently. In our single-process WASM shim, the frontend
 * drives the core synchronously via ring buffers. This means we must
 * carefully split the core's processing into phases that return control
 * to the frontend between IPC exchanges:
 *
 *   Phase 1: Receive CONFIG, init hardware.
 *   Phase 2: uadecore_reset() — receives SCORE/player/module/TOKEN from
 *            cmd buffer, sends CAN_PLAY+TOKEN to rsp buffer. Returns to
 *            let frontend process the response and send config messages.
 *   Phase 3: uadecore_handle_r_state() — receives config messages
 *            (filter, frequency, etc.) + TOKEN from frontend.
 *   Phase 4: m68k_run_1() — run 68k emulation cycles.
 */

#include "sysconfig.h"
#include "sysdeps.h"

#include "options.h"
#include "memory.h"
#include "custom.h"
#include "readcpu.h"
#include "newcpu.h"
#include "gensound.h"
#include "events.h"
#include "uadectl.h"

#include <uade/uadeipc.h>
#include <uade/uadeconstants.h>
#include <uade/unixatomic.h>

#include <stdio.h>
#include <string.h>

/* Magic FD values — must match shim_ipc.c */
#define UADE_SHIM_CMD_FD   9001
#define UADE_SHIM_RSP_FD   9002

/* Externs from uade.c */
extern struct uade_ipc uadecore_ipc;
extern int uadecore_reboot;
extern void uadecore_handle_r_state(void);
extern void uadecore_reset(void);

/* Externs from uademain.c */
extern int quit_program;
extern struct uae_prefs currprefs;
extern struct uae_prefs changed_prefs;

/* Externs from newcpu.c */
extern void m68k_run_1(void);
extern void m68k_reset(void);
extern void customreset(void);

/* WASM yield flag — set by uadecore_check_sound_buffers() (in uade.c)
 * when all requested audio data has been sent. Signals m68k_run_1() to
 * break out of its loop so we can return audio to the frontend. */
volatile int uadecore_wasm_yield = 0;

/* State tracking:
 *   0 = uninit
 *   1 = waiting for CONFIG message
 *   2 = reset (receive song data, send CAN_PLAY/CANT_PLAY)
 *   3 = handle_r_state (receive config messages from frontend)
 *   4 = running (68k emulation)
 */
static int s_core_phase = 0;

/* Track whether hardware init (phase 1) has completed.
 * Phase 1 initializes memory, sound, CPU tables — only needs to happen once. */
static int s_hw_initialized = 0;

/*
 * uadecore_wasm_reset_for_load — Reset core state for a new song load.
 *
 * Called by shim_ipc.c before each uade_play(). Resets the core phase
 * to 2 (uadecore_reset) so it processes the new song's SCORE data.
 * Phase 1 (CONFIG + hardware init) is skipped if already done.
 */
void uadecore_wasm_reset_for_load(void) {
    uadecore_wasm_yield = 0;
    if (s_hw_initialized) {
        s_core_phase = 2;
        uadecore_reboot = 1;
    } else {
        /* First load: reset to phase 1 so CONFIG is processed */
        s_core_phase = 1;
    }
}

/* Query whether hardware init (phase 1) has completed */
int uade_wasm_hw_initialized(void) {
    return s_hw_initialized;
}

/*
 * uadecore_wasm_init — Initialize the 68k emulator core.
 *
 * Called by shim_ipc.c's uade_arch_spawn(). At this point the ring buffers
 * are set up but no messages have been sent by the frontend yet.
 *
 * We set up the core's IPC using the same magic FDs as the frontend,
 * but with is_peer=0 (core side). Then we initialize default prefs.
 * Hardware init happens later when we receive the config message.
 */
int uadecore_wasm_init(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    /* Set up core-side IPC: reads from CMD buffer, writes to RSP buffer.
     * is_peer=0 means this is the "child" side:
     *   in_fd  = reads commands  → CMD_FD
     *   out_fd = writes responses → RSP_FD
     */
    uade_set_peer(&uadecore_ipc, 0, UADE_SHIM_CMD_FD, UADE_SHIM_RSP_FD);

    /* Initialize default preferences */
    default_prefs(&currprefs);

    s_core_phase = 1;  /* Waiting for config message */
    return 0;
}

/*
 * uadecore_handle_one_message — Process one IPC cycle.
 *
 * Called synchronously by shim_ipc.c whenever the frontend needs data
 * from the core (i.e., when uade_shim_read_rsp() finds the rsp buffer empty).
 *
 * The phases correspond to the native m68k_go() loop in newcpu.c, but
 * split to allow the single-threaded WASM shim to interleave frontend
 * and core processing:
 *
 *   Native m68k_go() loop:
 *     while (!quit) {
 *       uadecore_reset();           ← Phase 2
 *       m68k_reset(); customreset();
 *       uadecore_handle_r_state();  ← Phase 3 (blocks on socket in native)
 *       while (!reboot && !quit)
 *         m68k_run_1();             ← Phase 4
 *     }
 *
 * In native UADE, uadecore_handle_r_state() blocks on read() until the
 * frontend sends config messages. In WASM, we must return between phases
 * 2 and 3 so the frontend can process CAN_PLAY, send config, and then
 * trigger phase 3 on its next read.
 */
void uadecore_handle_one_message(void)
{
    switch (s_core_phase) {
    case 1: {
        /* Phase 1: Receive config file path from frontend */
        char optionsfile[256];
        int ret = uade_receive_string(optionsfile, UADE_COMMAND_CONFIG,
                                      sizeof(optionsfile), &uadecore_ipc);
        if (ret <= 0) {
            fprintf(stderr, "[uadecore-wasm] Failed to receive config message\n");
            return;
        }

        /* Load the config file (sets up currprefs) */
        cfgfile_load(&currprefs, optionsfile);

        /* Hardware initialization (mirrors uadecore_main) */
        machdep_init();

        if (!setup_sound()) {
            fprintf(stderr, "[uadecore-wasm] Sound setup failed\n");
            currprefs.produce_sound = 0;
        }
        init_sound();

        /* Inline the essential parts of fix_options() (static in uademain.c).
         * Validate memory sizes to avoid crashes during memory_init(). */
        if ((currprefs.chipmem_size & (currprefs.chipmem_size - 1)) != 0
            || currprefs.chipmem_size < 0x80000
            || currprefs.chipmem_size > 0x800000) {
            currprefs.chipmem_size = 0x200000;
        }
        currprefs.fastmem_size = 0;
        currprefs.gfxmem_size = 0;
        currprefs.z3fastmem_size = 0;
        currprefs.bogomem_size = 0;
        currprefs.socket_emu = 0;
        if (currprefs.produce_sound < 0 || currprefs.produce_sound > 3)
            currprefs.produce_sound = 2;

        changed_prefs = currprefs;
        check_prefs_changed_cpu();

        memory_init();
        custom_init();

        reset_frame_rate_hack();
        init_m68k();

        uadecore_reboot = 1;
        s_hw_initialized = 1;
        s_core_phase = 2;
        break;
    }

    case 2:
        /* Phase 2: Reset — receive song data, send CAN_PLAY/CANT_PLAY.
         *
         * uadecore_reset() reads SCORE, player file, module file, and TOKEN
         * from the cmd ring buffer, then sends CAN_PLAY + TOKEN (or
         * CANT_PLAY + TOKEN) to the rsp ring buffer.
         *
         * After this, we MUST return so the frontend can:
         *   1. Read the CAN_PLAY + TOKEN response
         *   2. Send config messages (filter, frequency, etc.) + TOKEN
         * Then phase 3 will process those config messages.
         */
        uadecore_reset();
        m68k_reset();
        customreset();
        s_core_phase = 3;
        break;

    case 3:
        /* Phase 3: Process config messages from frontend.
         *
         * After the frontend receives CAN_PLAY + TOKEN from phase 2,
         * it sends additional config messages (filter, resampling mode,
         * frequency, speed hack, NTSC, etc.) followed by TOKEN.
         *
         * uadecore_handle_r_state() reads these messages in a loop
         * until it receives TOKEN, then returns.
         *
         * In native UADE (m68k_go loop in newcpu.c:1312), this call
         * blocks on the socket until the frontend sends data. In our
         * WASM shim, the data is already in the cmd buffer because
         * the frontend sent it before triggering this read.
         */
        uadecore_handle_r_state();
        if (uadecore_reboot == 0)
            s_core_phase = 4;
        else
            s_core_phase = 2;  /* Reboot requested — go back to reset */
        break;

    case 4:
        /* Phase 4: Run 68k emulation.
         *
         * m68k_run_1() breaks out of its loop when:
         *   a) uadecore_wasm_yield is set — audio data was sent to the
         *      rsp buffer (REPLY_DATA + TOKEN). The frontend consumed it
         *      and sent READ + TOKEN back. We must call handle_r_state()
         *      to process that READ + TOKEN before running more 68k.
         *   b) uadecore_reboot is set — module finished or needs restart.
         *   c) quit_program is set — shutdown.
         */
        if (uadecore_wasm_yield) {
            /* Audio was sent last cycle. Frontend has now consumed it
             * and sent READ + TOKEN. Process that before continuing. */
            uadecore_wasm_yield = 0;
            uadecore_handle_r_state();
            if (uadecore_reboot) {
                s_core_phase = 2;
                break;
            }
        }
        if (uadecore_reboot) {
            /* Module finished or needs restart.
             * In native m68k_go(), a TOKEN is sent before looping.
             * Send it here too for protocol correctness. */
            if (uade_send_short_message(UADE_COMMAND_TOKEN,
                                        &uadecore_ipc) < 0) {
                fprintf(stderr, "[uadecore-wasm] can not send reboot ack token\n");
            }
            s_core_phase = 2;
            break;
        }
        if (quit_program) {
            return;
        }
        /* Run CPU cycles until audio is produced or module ends. */
        m68k_run_1();
        break;

    default:
        fprintf(stderr, "[uadecore-wasm] handle_one_message called in bad state %d\n",
                s_core_phase);
        break;
    }
}
