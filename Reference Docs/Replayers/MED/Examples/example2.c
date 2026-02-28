/* This example loads two songs, the first one is the load music of the
   second song. Compile with Lattice C V5.04 */

#include <libraries/dos.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include "modplayer.h"

void main(argc,argv)
int argc;
char *argv[];
{
	struct MMD0 *sng1,*sng2;
	printf("---example2---\n");
	if(argc < 3) {
		printf("Usage: example2 <song1> <song2>\n");
		return;
	}
	InitPlayer(); /* If this fails, no crash. Just no music. */
	printf("Loading the first song...\n");
	sng1 = LoadModule(argv[1]);
	PlayModule(sng1); /* start the load music */
	printf("Loading the second song...\n");
	sng2 = LoadModule(argv[2]);
	DimOffPlayer(35);	/* fade out the first tune */
	Delay(250);		/* wait 5 seconds for fading */
	PlayModule(sng2);
	printf("Press Ctrl-C to quit.\n");
	Wait(SIGBREAKF_CTRL_C);
	RemPlayer();	/* will stop it automatically */
	UnLoadModule(sng1); /* Even if LoadModule failed, this won't crash */
	UnLoadModule(sng2);
	printf("Bye!!!\n");
}
