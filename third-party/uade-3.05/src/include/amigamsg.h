#ifndef _AMIGAMSG_H_
#define _AMIGAMSG_H_

enum amigamsg {
	AMIGAMSG_SETSUBSONG = 1,
	AMIGAMSG_SONG_END,
	AMIGAMSG_PLAYERNAME,
	AMIGAMSG_MODULENAME,
	AMIGAMSG_SUBSINFO,
	AMIGAMSG_CHECKERROR,
	AMIGAMSG_SCORECRASH,
	AMIGAMSG_SCOREDEAD,
	AMIGAMSG_GENERALMSG,
	AMIGAMSG_NTSC,
	AMIGAMSG_FORMATNAME,
	AMIGAMSG_LOADFILE,
	AMIGAMSG_READ,
	AMIGAMSG_FILESIZE,
	AMIGAMSG_TIME_CRITICAL,
	AMIGAMSG_GET_INFO,
	AMIGAMSG_START_OUTPUT,  /* 17 */
	AMIGAMSG_RESERVED_0,  /* 18: For an audio.device experiment */
	AMIGAMSG_STATE_DETECTION_INIT, /* 19 */
	AMIGAMSG_STATE_DETECTION_STEP, /* 20 */
	AMIGAMSG_TEST_LOGGING, /* 21 */
	AMIGAMSG_DEBUG_U32_STRING, /* 22 */
	AMIGAMSG_DEBUG_U32_I32_STRING, /* 23 */
	/* The score (amigasrc/score/score.s) hardcodes these ids as `equ`
	 * constants, so they are a wire protocol between the 68k side and the
	 * host, not an internal enum.  Pin the values explicitly and assert them
	 * below: inserting an enumerator above this point would otherwise shift
	 * them silently and make the host decode OpenDevice as something else. */
	AMIGAMSG_AUDIO_DEV_OPEN    = 24, /* fake audio.device OpenDevice */
	AMIGAMSG_AUDIO_DEV_BEGINIO = 25, /* fake audio.device BeginIO (CMD_WRITE etc) */
	AMIGAMSG_AUDIO_DEV_ABORTIO = 26, /* fake audio.device AbortIO */
};

/* Keep in lockstep with score.s:
 *   AMIGAMSG_AUDIO_DEV_OPEN    equ 24
 *   AMIGAMSG_AUDIO_DEV_BEGINIO equ 25
 *   AMIGAMSG_AUDIO_DEV_ABORTIO equ 26
 * uade-wasm/verify_amigamsg.py checks both sides agree at build time. */
#if defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
_Static_assert(AMIGAMSG_AUDIO_DEV_OPEN    == 24, "score.s expects AMIGAMSG_AUDIO_DEV_OPEN == 24");
_Static_assert(AMIGAMSG_AUDIO_DEV_BEGINIO == 25, "score.s expects AMIGAMSG_AUDIO_DEV_BEGINIO == 25");
_Static_assert(AMIGAMSG_AUDIO_DEV_ABORTIO == 26, "score.s expects AMIGAMSG_AUDIO_DEV_ABORTIO == 26");
#endif

#endif
