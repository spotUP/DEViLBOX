/**
** $Filename: mmv8.h $
** $Release:  2.4 $
** $Revision: 1.0 $
** $Date: 93/05/09 $
**
** MusicMaker V8 definitions
**
** (C) 1986-93 Dire Cracks, Inc. (AUSTRIA)
**
* */


/* defines for LOOP/ONESHOT parameters submitted to various functions */
#define ONESHOT  1L
#define LOOP     0L


/* code for PACKED for NewMakeTables() */
#define TABLE_PACKED     0L
#define TABLE_UNPACKED  -1L


/* reaction given to SetAlertReaction() */
#define REACTION_STOP    0L
#define REACTION_IGNORE -1L


/* ERROR CODES returned from LoadAndInit():  */
#define ERROR_LOADOK             0L  /* Load successful. */
#define ERROR_INSTFILEMISSING  101L  /* Instrument file not found. */
#define ERROR_INSTMEMORY       102L  /* Not enough memory for instruments */
#define ERROR_INSTDEPACKMEM    103L  /* Not enough memory for depacking */
#define ERROR_LIBDISKSET       104L  /* Can't use LIB-DISK instr sets */

#define ERROR_SDATAFILEMISSING 106L  /* No sound data file found ... */
#define ERROR_SDATAMEMORY      107L  /* No memory for sound data */

#define ERROR_MIXBUFMEMORY     108L  /* No memory for mixbuffers (mmv88.lib ONLY!)*/
#define ERROR_VOLTABLEMEMORY   109L  /* No memory for a requ. table (mmv88 ONLY!)*/

#define ERROR_FILEFORMAT       111L  /* Illegal file format: Either this
*        is no sound data file, or it is an EXT/STD song, using
*        the wrong library. */


/* The following code can be returned by ALL functions: */

#define ERROR_LIBSPECIAL       123L  /* Special error code returned by
                                        mmvx.library in case it could
                                        not open mmv8.library or
                                        mmv88.library ! */

/* This file may grow in the future */

/* Developer includes contained in mmv8.i */
