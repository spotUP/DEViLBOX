
/* [[[SAS - C compiler option: -b0]]]  */

/* C sample program for using the mmv8 songs in your own programs.
 Written by Dire Cracks Inc.

 This program demonstrates the usage of the sysplayer.o modules as well
 as the library coming with MusicMaker.

 1. The first demo shows how to use LINKED functions (sysplayer.o) to
    play a LINKED song. (.i.o and .s.o linked to this module)

 2. Then, secondly, it uses the LINKED sysplayer.o-module's LoadAndInit
    routine to load a song. For more details, see manual.

 3. At last, it opens the mmv8 library and again uses the
    LoadAndInit function.

*/


#include <exec/types.h>
#include <exec/libraries.h>
#include "MMV8:Developer/C/mmv8.h"

 extern APTR MELODAT;        /* (for 1st - linked sounddata labels) */
 extern APTR INSTDAT;
 int i;

 struct Library *MMV8Base;   /* This is a DECLARED name. This spelling
                                necessarily required ! */

#define demosongname "MMV8:Sound-Demos/Mysterious\0"
/*                     ^^^ set this to your own...^^^               */

main()
 {
   printf("MusicMakerV8 C Playercontrol Example Program.\n");

/* ad 1) (see above)  --------------------------------
   NOTE: All function names have a "C" at end of name. This is for
         distinguishing between library and non-library function names.

   This is really important: You should lock the audio hardware to be inter-
   phered by any other task. The sys|mplayer module provides you 2
   routines for quickly doing this for you:
         LockAudio()  and
         UnlockAudio(). No arguments, LockAudio returns FALSE in case
                      audio can't get locked. */

   if (!(i = LockAudioC())) printf("WARNING: audio.device could NOT be locked!\n");



/*  The initialization for a linked-to sound:
    Does all necessary init stuff (int-vector, etc)
                                         (0L means NO ROUTINE for $) */
   GeneralSndInitC(LOOP,&INSTDAT,&MELODAT,0L);


/* Now we're ready to switch ON sound */
   SoundOnC();

/* New: IsStdSong-function not available in sysplayer version <12) */
   printf("IsStdSong returned ");
   if ((i = IsStdSongC(&MELODAT)) != 0)
       printf("TRUE\n");
   else
       printf("FALSE\n");    /* This is supposed not to happen in
                                THIS example .... */


   printf("Sound is now running. (Waiting 10 secs)\n");
   Delay(500);

/* Demonstration of SetVolumeC() */
   printf("Switching to lower volume using SetVolume()\n");
   SetVolumeC(63);
   Delay(500);

   printf("Going back to full volume level \n");
   SetVolumeC(127);
   Delay(200);

/* Cause the sound to fade out */
   FadeSndC(120);

/* Waiting for the fading to finish */
   while ((i = WaitFadeC()) == 0)
    {   printf("Waiting for the sound to fade out ...\n"); }

/* Switching the sound OFF */
   SoundOffC();

/* Remove the interrupt handler. */
   GeneralSndRemoveC();

 printf("Linked sound finished.\n");



/* Ad 2) (see above) --------------------------------------- */
/* The disk-loading routines from linked module "sysplayer.o" */

 printf("Now loading song from disk using LoadAndInitC().\n");

/* Note: V>=12 of the mmv8 library and the corresponding sysplayer module
   that come together return an error code from LoadAndInit. Prior
   versions returned 0 or NOT 0, but no other DEFINED value. For errorcodes,
   see the "mmv8.h" file in Developer-dir

   LoadAndInit does memory allocation and INIT stuff (int-vector, etc)  */

 if ( (i = LoadAndInitC(demosongname,ONESHOT)) != 0L )
    {
    printf("Can't open soundfiles. ERROR: %ld\n",i);
    printf("Exiting ...\n");
    UnlockAudioC();
    exit(20);
    }

 printf("Song loaded successfully.\n");

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


   UnlockAudioC();      /* See note above */

/* So far ... */
   printf("OK. Test of handling linked sound successful.\n");



/* Ad 3.) (see above)  -----------------------------------------------
   IMPORTANT: From now, all the functions have NO C at the end of their
   names any more. This is for distinguishing between library and
   non-library functions. Library names lack this C.*/

 printf("Open now mmv8.library ...\n");

/* Version 16 of the library is the lowest number supported from this point */
 if ( (MMV8Base = (struct Library *)OpenLibrary("mmv8.library",16L)) == 0 )
    {
    printf("Error in opening mmv8.library ! Exiting ...\n");
    exit(20);
    }


 /* On LockAudio(), see note above */
 if (!(i = LockAudio())) printf("WARNING: audio.device could NOT be locked!\n");


 printf("And now loading sound using the library functions\n");

 if ( (i = LoadAndInit(demosongname,ONESHOT)) != 0L )
    {
    printf("ERROR in loading the soundfiles: %ld",i);
    printf("Exiting ...\n");
    UnlockAudio();
    CloseLibrary(MMV8Base);
    exit(20);
    }

 printf("Song loaded successfully. Playing now for 10 secs\n");

 SoundOn();
 Delay(500);
 SoundOff();

/* Remove the loaded song from memory and dispose interrupt handler */
   RemoveLoaded();

/* Unlocking the audio.device */
   UnlockAudio();

/* Closing the library */
   CloseLibrary(MMV8Base);
   printf("Library closed.\n");

   printf("Good Bye !\n");
 
 }

/* Greetings from Betelgeuse */

