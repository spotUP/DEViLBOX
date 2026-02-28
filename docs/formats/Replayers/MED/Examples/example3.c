/* This example uses medplayer.library. Use Lattice C V5.04 */
#include <libraries/dos.h>
#include "libproto.h"
#include <proto/exec.h>

struct Library *MEDPlayerBase;
struct MMD0 *mod;

void main(int argc,char *argv[])
{
	LONG gp;
	if(argc < 2) {
		printf("Usage: example3 song\n");
		return;
	}
	MEDPlayerBase = OpenLibrary("medplayer.library",0);
	if(!MEDPlayerBase) {
		printf("Can't open medplayer.library\n");
		return;
	}
	gp = GetPlayer(0);
	printf("Player allocation %s.\n",gp ? "failed" : "succeeded");
	mod = LoadModule(argv[1]);
	printf("Module address = %lx\n",mod);
	PlayModule(mod);
	printf("Press Ctrl-C...\n");
	Wait(SIGBREAKF_CTRL_C);
	FreePlayer();
	UnLoadModule(mod);
	CloseLibrary(MEDPlayerBase);
}
