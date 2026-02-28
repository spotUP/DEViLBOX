/* This example just plays the song which is included when linking.
   Compile with Lattice C 5.04 */

#include <exec/types.h>
#include <libraries/dos.h>
#include <proto/exec.h>
#include "med.h"
#include "modplayer.h"

extern struct MMD0 far song;
void main() /* this can be linked without c.o */
{
	InitPlayer();
	PlayModule(&song);
	Wait(SIGBREAKF_CTRL_C); /* press Ctrl-C to quit */
	RemPlayer();
}
