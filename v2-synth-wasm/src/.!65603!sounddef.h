#ifndef _SOUNDDEF_H_
#define _SOUNDDEF_H_

class file;

// no problem if this header is included multiple times
// in case you get any linker collisions, prepend 
// to the problematic declaration

enum V2CTLTYPES { VCTL_SKIP, VCTL_SLIDER, VCTL_MB, };

typedef struct {
	int		no;
	char  *name;
	char	*name2;
} V2TOPIC;

typedef struct {

	int   version;
	char  *name;
	V2CTLTYPES ctltype;
	int	  offset, min, max;
	int   isdest;
	char  *ctlstr;
} V2PARAM;

////////////////////////////////////////////
//
// V2 Patch Topics
//
////////////////////////////////////////////

const V2TOPIC v2topics[] = {
	{  2, "Voice","Vo" },
	{  6, "Osc 1","O1" },
	{  6, "Osc 2","O2" },
	{  6, "Osc 3","O3" },
	{  3, "VCF 1","F1" },
	{  3, "VCF 2","F2" },
	{  2, "Filters","Fi" },
	{  4, "Voice Dist","VD" },
	{  6, "Amp EG","E1" },
	{  6, "EG 2","E2" },
	{  7, "LFO 1","L1" },
	{  7, "LFO 2","L2" },
	{ 10, "Global","Gl" },
	{  4, "Channel Dist","CD" },
	{  7, "Chorus/Flanger","CF" },
	{  9, "Compressor","CC" },
	{  1, "Polyphony","Po" },
};
const int v2ntopics = sizeof(v2topics)/sizeof(V2TOPIC);

////////////////////////////////////////////
//
// V2 Modulation Sources
//
////////////////////////////////////////////

const char *v2sources[] = {
	"Velocity",
	"Modulation",
	"Breath",
	"Ctl #3",
	"Ctl #4",
	"Ctl #5",
	"Ctl #6",
	"Volume",
	"Amp EG",
	"EG 2",
	"LFO 1",
	"LFO 2",
	"Note",
};
const int v2nsources = sizeof(v2sources)/sizeof(char *);

////////////////////////////////////////////
//
// V2 Patch Parameters
//
////////////////////////////////////////////

const V2PARAM v2parms[] = {
	// Voice (2)
	{ 0, "Panning", VCTL_SLIDER, 64,   0, 127, 1, 0		    											},
	{ 2, "Txpose",  VCTL_SLIDER, 64,   0, 127, 1, 0		    											},
  // Osc 1 (6)
	{ 0, "Mode"  ,  VCTL_MB    ,  0,   0,   7, 0, "Off|Saw/Tri|Pulse|Sin|Noise|XX|AuxA|AuxB"	},
	{ 2, "Ringmod", VCTL_SKIP  ,  0,   0,   1, 0, ""			      									},
	{ 0, "Txpose",  VCTL_SLIDER, 64,   0, 127, 1, 0		    											},
	{ 0, "Detune",  VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Color",   VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Volume",  VCTL_SLIDER,  0,   0, 127, 1, 0	                            },
  // Osc 2 (6)
	{ 0, "Mode"  ,  VCTL_MB    ,  0,   0,   7, 0, "!Off|Tri|Pul|Sin|Noi|FM|AuxA|AuxB"			},
	{ 2, "RingMod", VCTL_MB    ,  0,   0,   1, 0, "Off|On"					      				},
	{ 0, "Txpose" , VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Detune",  VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Color",   VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Volume",  VCTL_SLIDER,  0,   0, 127, 1, 0                              },
  // Osc 3 (6)
	{ 0, "Mode"  ,  VCTL_MB    ,  0,   0,   7, 0, "!Off|Tri|Pul|Sin|Noi|FM|AuxA|AuxB"			},
	{ 2, "RingMod", VCTL_MB    ,  0,   0,   1, 0, "Off|On"												},
	{ 0, "Txpose",  VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Detune",  VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Color",   VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Volume",  VCTL_SLIDER,  0,   0, 127, 1, 0                              },
  // VCF 1 (3)
	{ 0, "Mode",    VCTL_MB    ,  0,   0,   7, 0, "Off|Low|Band|High|Notch|All|MoogL|MoogH"  },
	{ 0, "Cutoff",  VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Reso",	  VCTL_SLIDER,  0,   0, 127, 1, 0															},
  // VCF 2 (3)
	{ 0, "Mode",    VCTL_MB    ,  0,   0,   7, 0, "Off|Low|Band|High|Notch|All|MoogL|MoogH"  },
	{ 0, "Cutoff",  VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Reso",		VCTL_SLIDER,  0,   0, 127, 1, 0															},
	// Routing (2)
	{ 0, "Routing", VCTL_MB    ,  0,   0,   2, 0, "!single|serial|parallel"			  },
	{ 3, "Balance", VCTL_SLIDER, 64,   0, 127, 1, 0														  },
	// Distortion (4)
	{ 0, "Mode",    VCTL_MB    ,  0,   0,  10, 0, "Off|OD|Clip|Crush|Dec|LPF|BPF|HPF|NoF|APF|MoL"   },
	{ 0, "InGain",  VCTL_SLIDER, 32,   0, 127, 1, 0															},
	{ 0, "Param 1", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Param 2", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	// Amp Envelope (6)
	{ 0, "Attack",  VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Decay",   VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Sustain", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "SusTime", VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Release", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Amplify", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	// Envelope 2 (6)
	{ 0, "Attack",  VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Decay",   VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Sustain", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "SusTime", VCTL_SLIDER, 64,   0, 127, 1, 0															},
	{ 0, "Release", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Amplify", VCTL_SLIDER,  0,   0, 127, 1, 0															},
	// LFO 1 (7)
	{ 0, "Mode"  ,  VCTL_MB    ,  0,   0,   4, 0, "Saw|Tri|Pulse|Sin|S+H"				},
	{ 0, "KeySync", VCTL_MB    ,  0,   0,   2, 0, "!Off|On"											},
	{ 0, "EnvMode", VCTL_MB    ,  0,   0,   2, 0, "!Off|On"											},
	{ 0, "Rate",		VCTL_SLIDER,  0,   0, 127, 1, 0															},
	{ 0, "Phase",   VCTL_SLIDER,  0,   0, 127, 1, 0															},
