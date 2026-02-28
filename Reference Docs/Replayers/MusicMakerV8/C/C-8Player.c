
/* [[[SAS - C compiler option: -b0]]]  */

/* C sample program for using the mmv8 8-channel songs in your own
 programs.

 Written by Dire Cracks Inc.

 This program demonstrates the usage of the mplayer.o modules as well
 as the library coming with MusicMaker.

 1. The first demo shows how to use LINKED functions (mplayer.o) to
    play a LINKED song. (.i.o and .s.o linked to this module)

 2. Then, secondly, it uses the LINKED mplayer.o-module's LoadAndInit
    routine to load a song. For more details, see manual.

 3. At last, it opens the mmv88.library and again uses the
    LoadAndInit function.


 NOTE: c-interface.o required (suitable for both mplayer.o & sysplayer.o)

*/


#include <exec/types.h>
#include <exec/libraries.h>
#include <exec/execbase.h>
#include "MMV8:Developer/C/mmv8.h"

 extern APTR MELODAT;        /* (for 1st - linked sounddata labels) */
 extern APTR INSTDAT;
 int i;

 struct Library *MMV88Base;  /* This is a DECLARED name. This spelling
                                necessarily required ! */
 struct ExecBase *mySysBase;


#define demosongname "MM_Instruments:Bonus-Tracks/TheGame\0"
/*                       ^^^ set this to your own ^^^            */

 ULONG mbs;                  /* these only for 8-channel sound ! */
 BYTE *vectorfield[8];
 BYTE *memhandle;
 BYTE *table;
 BYTE *mbtemp;

main()
 {
   printf("MusicMakerV8 C 8-Playercontrol Example Program.\n");

/* ad 1) All functions from LINKED module have C at end of name.
         This is for distinguishing between library and non-library
         function names.

   1.STEP: Decrunch instruments.
          -- skipped, for info, see assembler examples. --


   2.STEP: Allocate mixbuffers. We need 8 buffers; aptr's stored into
   an array; this array is given to SetmixBuffersC()                      */

   mbs = ObtainMixBufLenC(&MELODAT);

   memhandle = (BYTE *)AllocMem(mbs*8,0x10003L);

   mbtemp = memhandle;
   for (i=0;i<8;i++)
       {
       vectorfield[i]=mbtemp;
       mbtemp = mbtemp+mbs;
       }
   SetMixBuffersC(vectorfield);


/* 3. STEP: Allocate memory for another table needed. Size is 4544+(64*256) */

   table = (BYTE *)AllocMem(4544+(64*256),0x10001L);
   NewMakeTablesC(table,TABLE_UNPACKED);


/* Lock audio.device to avoid disturbance ... (returns false if error...) */
   if (!(i=LockAudioC())) printf("WARNING: audio.device could NOT get locked!\n");


/* 4.STEP: FINAL Initialization          (0L means NO ROUTINE for $) */
   GeneralSndInitC(LOOP,&INSTDAT,&MELODAT,0L);


/* *************************************************************************
   The following is REALLY important:
   Starting version 3, the mplayer features SetupCacheControl() to handle
   68020,30,40 caches and 68040 CachePreDMA(). By default, the caches are
   ignored. On machines equipped with 68040, especially, this can be
   troubleful in case COPYBACK mode is ON. Arguments to this functions
   are: d0: Kickstart version, because ClearCache() and CachePreDMA() are
            supported from 37, yet.
        d1: System-Attn Flags from Execbase for sensing the CPU type.

   This function MUST be called AFTER a song has been initialized.

   NOTE: The 8-channel player module requires a CORRECTLY INITIALIZED
   ¯¯¯¯¯ ExecBase area due to VBR handling routines inside. */


   SetupCacheControlC(mySysBase->LibNode.lib_Version,mySysBase->AttnFlags);



/* FINAL STEP: Switch sound on ... */
   SoundOnC();

/* Now have some fun with sound:          */


/* New: IsStdSong-function not available in player version <12) */
    printf("IsStdSong returned ");
    if ((i = IsStdSongC(&MELODAT)) != 0)
        printf("TRUE\n");
    else
        printf("FALSE\n");


   printf("Sound is now running. (Waiting 10 secs)\n");
   Delay(500);

/* Demonstration of SetVolumeC() */
   printf("Switching to lower volume using SetVolume()\n");
   SetVolumeC(63);
   Delay(500);

   printf("Going back to full volume level\n");
   SetVolumeC(127);
   Delay(200);


/* Cause the sound to fade out */
   FadeSndC(120);

/* Waiting for the fading to finish */
   while ((i = WaitFadeC()) == 0)
    {   printf("Waiting for the sound to fade out ...\n"); }


/* Switching the sound OFF */
   SoundOffC();


/* Free the memory we've allocated */
   FreeMem(memhandle,mbs*8);
   FreeMem(table,20928L);

/* Remove the interrupt handler. (Was set up GeneralSndInitC(); */
   GeneralSndRemoveC();


 printf("Linked sound finished.\n\n");



/* Ad 2) (see above) --------------------------------------- */
/* The disk-loading routines from linked module "mplayer.o" */

 printf("Now loading from disk using LoadAndInitC().\n");


/* Note: V>=2 of the mmv88 library and the corresponding mplayer module
   that come together return an error code from LoadAndInit. Prior
   versions had no function of this kind.
     See the "mmv8.h" file in __C-dir               */

 if ( (i = LoadAndInitC(demosongname,ONESHOT)) != 0L )
    {
    printf("Can't open soundfiles. ERROR: %ld\n",i);
    printf("Exiting ...\n");
    UnlockAudioC();
    exit(20);
    }

 printf("Song loaded successfully.\n");


/* Setup cache handling */
   SetupCacheControlC(mySysBase->LibNode.lib_Version,mySysBase->AttnFlags);

 printf("Sound is now playing in oneshot mode. (Play it for 5 secs)\n");

/* Switching sound ON */
   SoundOnC();

/* EXAMPLE: wait for sound to finish         ; comment-ed, because demo
 while (!(i = WaitOneShotFinC()))            ; song plays for 5 mins;
  {                                          ; no one can wait THAT long...
  }                                  */

 Delay(500L);
 printf("Sound has finished. Turning it OFF\n");

/* Switching Sound Off */
   SoundOffC();

 printf("I will remove it from memory now.\n");
  
/* Remove it from memory. This is pendant function to GeneralSndRemove()
   when using LoadAndInit(): It frees memory AND removes interrupt-handler */
   RemoveLoadedC();

/* So far ... */
   printf("OK. Test of handling linked sound successful.\n\n");

   UnlockAudioC();  /* Unlock audio.device */



/* Ad 3.) (see above)  -----------------------------------------------
   IMPORTANT: From now, all the functions have NO C at the end of their
   names any more. This is for distinguishing between library and
   non-library functions. Library names lack this C.

   NOTE:
         All 8-channel player functions have char "8" at end of name !!!
         So you can use mmv8 AND mmv88.library at the same time !
             (which, I confess is more easily done by using mmvx.library
                  but... who knows?!) */

 printf("Open now mmv88.library ...\n");

/* Version 3 of the library is the lowest number supported from this point */
 if ( (MMV88Base = (struct Library *)OpenLibrary("mmv88.library",3L)) == 0 )
    {
    printf("Error in opening mmv88.library ! Exiting ...\n");
    exit(20);
    }


 if (!(i=LockAudio8())) printf("WARNING: Could not lock audio.device!\n");


 printf("And now loading sound using the library functions\n");

 if ( (i = LoadAndInit8(demosongname,ONESHOT)) != 0L )
    {
    printf("ERROR in loading the soundfiles: %ld",i);
    printf("Exiting ...\n");
    UnlockAudio8();
    CloseLibrary(MMV88Base);
    exit(20);
    }

 printf("Song loaded successfully. Playing now for 10 secs\n");

/* Setup cache handling */
   SetupCacheControl8(mySysBase->LibNode.lib_Version,mySysBase->AttnFlags);

 SoundOn8();
 Delay(500);
 SoundOff8();

/* Remove the loaded song from memory and dispose interrupt handler */
 RemoveLoaded8();

 UnlockAudio8();     /* unlocks audio.device */

/* Closing the library */
 CloseLibrary(MMV88Base);
 printf("Library closed.\n");

 printf("Good Bye !\n");
 
 }

/* Greetings from Betelgeuse */

