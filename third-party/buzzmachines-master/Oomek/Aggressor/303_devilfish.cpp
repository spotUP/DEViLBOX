/*
 * Copyright (C) 2001 Radoslaw Dutkiewicz <radicdotkey@gmail.com>
 * Devil Fish Modifications (C) 2024 - Based on TB-303 Devil Fish mod analysis
 *
 * This library is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License,
 * or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <https://www.gnu.org/licenses>.
 */

// Devil Fish Enhanced Oomek Aggressor 3o3
// Added features:
// - Separate Normal/Accent Decay
// - VEG (Volume Envelope) Decay and Sustain
// - Soft Attack for non-accented notes
// - Filter Tracking (filter follows note pitch)
// - High Resonance mode (self-oscillation)
// - Slide Time control
// - Muffler (soft clipping)
// - Accent Sweep Speed

#include <windef.h>
#include <math.h>
#include <float.h>
#include <stdio.h>

#include <MachineInterface.h>
#include <mdk/mdk.h>

#include "fft.h"


#define PITCHRESOLUTION 32
#define LEVELSPEROCTAVE 4

#pragma optimize ("awy", on)

// ============================================
// GLOBAL PARAMETERS - Original + Devil Fish
// ============================================

CMachineParameter const paraOscType =
{
	pt_switch,
	"Osc Type",
	"Oscillator type (0 = Saw, 1 = Square)",
	-1, -1, SWITCH_NO, MPF_STATE, 0
};

CMachineParameter const paraCutoff=
{
	pt_byte, "Cutoff", "Filter cutoff",
	0x0, 0xF0, 0xFF, MPF_STATE, 0x78
};

CMachineParameter const paraResonance=
{
	pt_byte, "Res", "Filter resonance",
	0, 0x80, 0xFF, MPF_STATE, 0x40
};

CMachineParameter const paraEnvmod=
{
	pt_byte, "Env.Mod", "Envelope modulation",
	0, 0x80, 0xFF, MPF_STATE, 0x40
};

CMachineParameter const paraDecay=
{
	pt_byte, "Decay", "Normal envelope decay time",
	0, 0x80, 0xFF, MPF_STATE, 0x40
};

CMachineParameter const paraAcclevel=
{
	pt_byte, "Accent Level", "Accent level",
	0, 0x80, 0xFF, MPF_STATE, 0x40
};

CMachineParameter const paraFinetune=
{
	pt_byte, "Finetune", "Finetune",
	0, 0xC8, 0xFF, MPF_STATE, 0x64
};

CMachineParameter const paraVolume=
{
	pt_byte, "Volume", "Volume",
	0, 0xC8, 0xFF, MPF_STATE, 0x64
};

// ============================================
// DEVIL FISH PARAMETERS
// ============================================

CMachineParameter const paraAccentDecay=
{
	pt_byte, "Acc.Decay", "Accent envelope decay time (Devil Fish)",
	0, 0x80, 0xFF, MPF_STATE, 0x40
};

CMachineParameter const paraVegDecay=
{
	pt_byte, "VEG Decay", "Volume envelope decay (Devil Fish)",
	0, 0x80, 0xFF, MPF_STATE, 0x60  // Default longer than filter decay
};

CMachineParameter const paraVegSustain=
{
	pt_byte, "VEG Sust", "Volume envelope sustain 0-100% (Devil Fish)",
	0, 0x64, 0xFF, MPF_STATE, 0x00  // 0 = normal 303, 100 = infinite
};

CMachineParameter const paraSoftAttack=
{
	pt_byte, "Soft Atk", "Soft attack time 0.3-30ms (Devil Fish)",
	0, 0x64, 0xFF, MPF_STATE, 0x00  // 0 = 0.3ms (normal 303)
};

CMachineParameter const paraFilterTracking=
{
	pt_byte, "Flt.Track", "Filter tracking 0-200% (Devil Fish)",
	0, 0xC8, 0xFF, MPF_STATE, 0x00  // 0 = off, 100 = 1:1, 200 = over-tracking
};

CMachineParameter const paraHighResonance=
{
	pt_switch, "Hi-Res", "High resonance mode - self oscillation (Devil Fish)",
	-1, -1, SWITCH_NO, MPF_STATE, 0
};

CMachineParameter const paraSlideTime=
{
	pt_byte, "Slide Time", "Slide/glide time 10-500ms (Devil Fish)",
	0, 0x64, 0xFF, MPF_STATE, 0x1E  // Default ~60ms (original 303)
};

CMachineParameter const paraMuffler=
{
	pt_byte, "Muffler", "Output soft clipping 0=off, 1=soft, 2=hard (Devil Fish)",
	0, 0x02, 0xFF, MPF_STATE, 0x00
};

CMachineParameter const paraSweepSpeed=
{
	pt_byte, "Sweep Spd", "Accent sweep speed 0=fast, 1=normal, 2=slow (Devil Fish)",
	0, 0x02, 0xFF, MPF_STATE, 0x01  // Normal by default
};

// Track params
CMachineParameter const paraNote =
{
	pt_note, "Note", "Note",
	NOTE_MIN, NOTE_MAX, 0, 0, 0
};

CMachineParameter const paraSlide =
{
	pt_switch, "Slide", "Slide pitch to next note",
	-1, -1, SWITCH_NO, 0, 0,
};

CMachineParameter const paraAccent =
{
	pt_switch, "Accent", "Adds accent to volume and cutoff",
	-1, -1, SWITCH_NO, 0, 0
};

// Parameter array - 17 global + 3 track = 20 total
CMachineParameter const *pParameters[]=
{
	// Original global (0-7)
	&paraOscType,
	&paraCutoff,
	&paraResonance,
	&paraEnvmod,
	&paraDecay,
	&paraAcclevel,
	&paraFinetune,
	&paraVolume,
	// Devil Fish global (8-16)
	&paraAccentDecay,
	&paraVegDecay,
	&paraVegSustain,
	&paraSoftAttack,
	&paraFilterTracking,
	&paraHighResonance,
	&paraSlideTime,
	&paraMuffler,
	&paraSweepSpeed,
	// Track (17-19)
	&paraNote,
	&paraSlide,
	&paraAccent
};

#pragma pack(1)

class gvals
{
public:
	// Original parameters
	byte osctype;
	byte cutoff;
	byte resonance;
	byte envmod;
	byte decay;
	byte acclevel;
	byte finetune;
	byte volume;
	// Devil Fish parameters
	byte accentDecay;
	byte vegDecay;
	byte vegSustain;
	byte softAttack;
	byte filterTracking;
	byte highResonance;
	byte slideTime;
	byte muffler;
	byte sweepSpeed;
};

class tvals
{
public:
	byte note;
	byte slide;
	byte accent;
};

#pragma pack()

CMachineInfo const MacInfo=
{
	MT_GENERATOR,
	MI_VERSION,
	0,
	1, 1,  // min/max tracks
	17,    // numGlobalParameters (was 8, now 17)
	3,     // numTrackParameters
	pParameters,
	0,
	NULL,
	"Oomek Aggressor 3o3 DF",  // DF = Devil Fish
	"3o3DF",
	"Radoslaw Dutkiewicz + Devil Fish Mods",
	"&About"
};


class miex : public CMDKMachineInterfaceEx
{
};


class mi : public CMDKMachineInterface
{
public:
	mi();
	virtual ~mi();
	virtual void Tick();
	virtual void MDKInit(CMachineDataInput *const pi);
	virtual bool MDKWork(float *psamples, int numsamples, int const mode);
	virtual bool MDKWorkStereo(float *psamples, int numsamples, int const mode);
	virtual void Command(int const i);
	virtual void MDKSave(CMachineDataOutput *const po);
	virtual char const *DescribeValue(int const param, int const value);
	virtual CMDKMachineInterfaceEx *GetEx() {return &ex;}
	virtual void OutputModeChanged(bool stereo){};
	virtual inline int ilog2(float x);
	virtual inline float fscale(float x);
	virtual inline int f2i(double d);

	// Devil Fish helper functions
	inline float applyMuffler(float sample);
	inline float calculateFilterTracking(float noteFreq);

public:
	miex ex;

public:
	int tunelv;
	float amlv;
	float out;
	float oscsaw[2048*10*LEVELSPEROCTAVE];
	float oscsqa[2048*10*LEVELSPEROCTAVE];
	float oscpitch[12*100*10];
	bool osctype;
	bool slidestate;
	bool slidestateold;
	float vca[100+1000+500+1];
	float acc[601];
	float accl[12201];
	int Accphase1, Accphase2, Accphase3;
	int Accphasel1, Accphasel2, Accphasel3;
	float Acclevel;
	int Accphaseid;

	float oscphase;
	float oscphaseinc;
	float oldnote;
	float newnote;
	float slidenote;
	int oscphaseint0, oscphaseint1;
	int pitchcounter;

	int level;
	int osclevel;
	int vcaphase;

	// 3p HP filter variables
	float hXa, hXb, hXc;
	float hYa, hYb, hYc;
	float hXaz, hXbz, hXcz;
	float hYaz, hYbz, hYcz;
	float hFh, hFhh;

	// 3p LP filter variables
	float Xa, Xb, Xc;
	float Ya, Yb, Yc;
	float Xaz, Xbz, Xcz;
	float Yaz, Ybz, Ycz;
	float Flpfold;
	float Flpfnew, Qlpfnew;
	float Flpf, Qlpf;
	float Flpfh, Qlpfh;
	float Flpfsl, Qlpfsl;
	float Cutfreq, Oscfreq;
	float Qdown;
	float cf;
	float fftable[2048+2048+2];
	bool DoNothing;

	float Envmod, Envmodphase, Envmodinc, Envmodsl, Envmodnew, EnvmodphaseY, EnvmodphaseZ;
	float Decay;
	float AccentDecay;  // Devil Fish: separate accent decay
	bool Accstate;

	float temp;

	float *p_Accphasel1;
	float *p_Accphasel2;
	float *p_Accphasel3;

	// ============================================
	// DEVIL FISH STATE VARIABLES
	// ============================================
	float vegDecayRate;      // VEG decay rate (samples)
	float vegSustainLevel;   // VEG sustain 0-1
	float softAttackTime;    // Attack time in samples
	float filterTrackingAmt; // Filter tracking 0-2 (0-200%)
	bool highResonanceMode;  // High Q mode
	float slideTimeSamples;  // Slide time in samples
	int mufflerMode;         // 0=off, 1=soft, 2=hard
	int sweepSpeedMode;      // 0=fast, 1=normal, 2=slow

	// VEG envelope state
	float vegPhase;          // Current VEG envelope phase (0-1)
	float vegAttackPhase;    // Attack phase counter
	bool inAttack;           // In attack phase

	// Accent sweep capacitor simulation
	float accentCharge;      // Capacitor charge level
	float lastAccentTime;    // Time since last accent

	// Reference frequency for filter tracking (C2 = 65.41 Hz)
	static constexpr float TRACKING_REF_FREQ = 65.41f;

	gvals gval;
	tvals tval;
};

mi::mi(){GlobalVals=&gval;TrackVals = &tval;}
mi::~mi(){}


#ifdef WIN32
#include <windows.h>

HINSTANCE dllInstance;
mi *g_mi;

BOOL WINAPI DllMain (HANDLE hModule, DWORD fwdreason, LPVOID lpReserved)
{
	switch (fwdreason)
	{
		case DLL_PROCESS_ATTACH:
			dllInstance = (HINSTANCE) hModule;
			break;
		case DLL_THREAD_ATTACH: break;
		case DLL_THREAD_DETACH: break;
		case DLL_PROCESS_DETACH: break;
	}
	return TRUE;
}

BOOL APIENTRY AboutDialog (HWND hDlg, UINT uMsg, WPARAM wParam, LPARAM lParam)
{
	switch (uMsg)
	{
		case WM_INITDIALOG: return 1;
		case WM_SHOWWINDOW: return 1;
		case WM_CLOSE: EndDialog (hDlg, TRUE); return 0;
		case WM_COMMAND:
			switch (LOWORD (wParam))
			{
				case IDOK: EndDialog(hDlg, TRUE); return 1;
				default: return 0;
			}
			break;
	}
	return 0;
}
#endif


// ============================================
// DEVIL FISH: Muffler (soft clipping)
// ============================================
inline float mi::applyMuffler(float sample)
{
	if (mufflerMode == 0) return sample;  // Bypass

	float threshold, amount;
	if (mufflerMode == 1) {
		// Soft mode
		threshold = 0.5f;
		amount = 2.0f;
	} else {
		// Hard mode
		threshold = 0.3f;
		amount = 4.0f;
	}

	float absVal = fabsf(sample);
	if (absVal < threshold) return sample;

	// Soft clipping using tanh
	float sign = (sample >= 0) ? 1.0f : -1.0f;
	float excess = absVal - threshold;
	float clipped = threshold + tanhf(excess * amount) * (1.0f - threshold);
	return sign * clipped;
}

// ============================================
// DEVIL FISH: Filter Tracking
// ============================================
inline float mi::calculateFilterTracking(float noteFreq)
{
	if (filterTrackingAmt <= 0.0f) return 0.0f;

	// Calculate voltage difference from C2 (1V/octave)
	// C2 at 2V is the zero point
	float noteVoltage = 2.0f + log2f(noteFreq / TRACKING_REF_FREQ);
	float voltageDiff = noteVoltage - 2.0f;

	// 2700 Hz per volt at 100% tracking
	float trackingHz = voltageDiff * 2700.0f * filterTrackingAmt;

	return trackingHz;
}


void mi::MDKInit(CMachineDataInput *const pi)
{
	int i, j;

	tunelv = 0;
	amlv = 0.0f;
	oscphase = 0.0;
	oscphaseinc = 0.0;
	osctype = false;
	slidestate = false;
	slidestateold = false;
	pitchcounter = PITCHRESOLUTION-1;
	Envmodinc = 0.0;
	Accphase1 = 600;
	Accphase2 = 600;
	Accphase3 = 600;
	Accphasel1 = 12200;
	Accphasel2 = 12200;
	Accphasel3 = 12200;
	p_Accphasel1 = accl + 12200 - 1;
	p_Accphasel2 = accl + 12200 - 1;
	p_Accphasel3 = accl + 12200 - 1;
	vcaphase = 1600;

	Flpfold = (float)pow((gval.cutoff / 240.0f) , 2.0f) * 0.8775f + 0.1225f;
	Qlpf = (float)pow((gval.resonance / 128.0f),0.5f);
	Envmod = (float)gval.envmod / 128.0f;

	// Devil Fish defaults
	vegDecayRate = 0.0001f;
	vegSustainLevel = 0.0f;
	softAttackTime = 0.0003f * pMasterInfo->SamplesPerSec;  // 0.3ms
	filterTrackingAmt = 0.0f;
	highResonanceMode = false;
	slideTimeSamples = 0.06f * pMasterInfo->SamplesPerSec;  // 60ms
	mufflerMode = 0;
	sweepSpeedMode = 1;  // Normal
	vegPhase = 0.0f;
	vegAttackPhase = 0.0f;
	inAttack = false;
	accentCharge = 0.0f;
	lastAccentTime = 0.0f;
	AccentDecay = Decay;  // Initialize to same as normal decay

	// VCA table
	for (i = 0; i < 200; i++ ) vca[i] = 1.0f - (float)pow(((200 - i) / 200.0f),2.0f);
	for (i = 200; i < 1200; i++ ) vca[i] = (float)pow(((1200 - i) / 1000.0f),2.0f) * 0.25f + 0.75f;
	for (i = 1200; i < 1600; i++) vca[i] = (float)pow(((1600 - i) / 400.0f),1.25f) * 0.75f;
	vca[1600] = 0.0f;

	// VCA accent table
	for (i = 0; i < 200; i++ ) accl[i] = (1.0f - (float)pow(((200 - i) / 200.0f),2.0f)) * 1.5f;
	for (i = 200; i < 12200; i++ ) accl[i] = (float)pow(((12200 - i) / 12000.0f),1.0f) * 1.5f;
	accl[12200] = 0.0f;

	// Accent table
	for (i = 0; i < 60; i++ ) acc[i] = 1.0f - (float)pow(((60 - i) / 60.0f),2.0f);
	for (i = 60; i < 600; i++) acc[i] = (float)pow(((600 - i) / 540.0f),4.0f);
	acc[600] = 0.0f;

	// Oscillator pitch table
	i=0;
	do
	{
		oscpitch[i] = 2048.0f*(440.0f / pMasterInfo->SamplesPerSec) * (float)(pow(2.0,((((i+1)/100.0)-69)/12.0)));
		i++;
	} while (i!=120*100);

	// Saw oscillator table
	for (j=0; j<40; j++)
	{
		for (i=0; i< 4096; i++) fftable[i]=0;
		for (i=1; i< 900/(float)pow(2.0,((j/4.0))); i+=1)
		{
			fftable[i*2]=0;
			fftable[i*2+1]=1.0f/float(i);
		}
		IFFT(fftable, 2048, 1);
		for (i=0; i< 2048; i++)
		{
			oscsaw[i+2048*j] = fftable[i*2];
		}
	}

	// Square oscillator table
	for (j=0; j<40; j++)
	{
		for (i=0; i< 4096; i++) fftable[i]=0;
		for (i=1; i< 900/(float)pow(2.0,((j/4.0))); i+=2)
		{
			fftable[i*2]=0;
			fftable[i*2+1]=1.0f/float(i);
		}
		IFFT(fftable, 2048, 1);
		for (i=0; i< 2048; i++)
		{
			oscsqa[i+2048*j] = 0.5f * oscsaw[i+2048*j] + fftable[i*2];
		}
	}
}


inline int mi::f2i(double d)
{
	const double magic = 6755399441055744.0;
	union { unsigned long ui; double d; } double_as_bits;
	double_as_bits.d = (d-0.5) + magic;
	return int(double_as_bits.ui);
}

inline int mi::ilog2(float x)
{
	union { unsigned int ui; float d; } float_as_bits;
	float_as_bits.d = x;
	unsigned int exp = (float_as_bits.ui >> 23) & 0xFF;
	return int(exp) - 127;
}

inline float mi::fscale(float x)
{
	x = x / (pMasterInfo->SamplesPerSec / 44100.0f);
	float wynik = (((((-2.7528f * x) + 3.0429f) * x) + 1.718f) * x) - 0.9984f;
	return wynik;
}


void mi::MDKSave(CMachineDataOutput *const po){}


//////////// TICK ////////////

void mi::Tick()
{
	// Original oscillator type
	if (gval.osctype != SWITCH_NO)
	{
		osctype = (gval.osctype == SWITCH_ON);
	}

	// Cutoff
	if (gval.cutoff != 0xFF)
	{
		Flpfnew = (float)gval.cutoff * 0.004166666666f;
		Flpfnew	= Flpfnew * Flpfnew * 0.8775f + 0.1225f;
		Flpfsl = (Flpfnew - Flpfold) / pMasterInfo->SamplesPerTick * 1.0f * PITCHRESOLUTION;
	}

	// Resonance
	if (gval.resonance != 0xFF)
	{
		Qlpfnew = (float)pow((gval.resonance * 0.0078125f) , 0.5f);

		// DEVIL FISH: High resonance mode - allow higher Q values
		if (highResonanceMode)
		{
			// Extend Q range for self-oscillation (multiply by 1.5)
			Qlpfnew = Qlpfnew * 1.5f;
		}

		Qlpfsl = (Qlpfnew - Qlpf) / pMasterInfo->SamplesPerTick * 1.0f * PITCHRESOLUTION;
	}

	// Envelope mod
	if (gval.envmod != 0xFF)
	{
		Envmodnew = (float)gval.envmod * 0.0078125f;
		Envmodsl = (Envmodnew - Envmod) / pMasterInfo->SamplesPerTick * 1.0f * PITCHRESOLUTION;
	}

	// Normal Decay
	if (gval.decay != 0xFF)
	{
		Decay = (float)pow((gval.decay * 0.0078125f) , 0.1f) * 0.992f;
	}

	// DEVIL FISH: Accent Decay (separate from normal decay)
	if (gval.accentDecay != 0xFF)
	{
		AccentDecay = (float)pow((gval.accentDecay * 0.0078125f) , 0.1f) * 0.992f;
	}

	// DEVIL FISH: VEG Decay - map 0-128 to 16ms-3000ms decay rate
	if (gval.vegDecay != 0xFF)
	{
		float vegDecayMs = 16.0f + (gval.vegDecay / 128.0f) * 2984.0f;
		vegDecayRate = 1.0f / (vegDecayMs * 0.001f * pMasterInfo->SamplesPerSec);
	}

	// DEVIL FISH: VEG Sustain - map 0-100 to 0-1
	if (gval.vegSustain != 0xFF)
	{
		vegSustainLevel = gval.vegSustain / 100.0f;
	}

	// DEVIL FISH: Soft Attack - map 0-100 to 0.3ms-30ms
	if (gval.softAttack != 0xFF)
	{
		float attackMs = 0.3f + (gval.softAttack / 100.0f) * 29.7f;
		softAttackTime = attackMs * 0.001f * pMasterInfo->SamplesPerSec;
	}

	// DEVIL FISH: Filter Tracking - map 0-200 to 0-2 (0-200%)
	if (gval.filterTracking != 0xFF)
	{
		filterTrackingAmt = gval.filterTracking / 100.0f;
	}

	// DEVIL FISH: High Resonance mode
	if (gval.highResonance != SWITCH_NO)
	{
		highResonanceMode = (gval.highResonance == SWITCH_ON);
	}

	// DEVIL FISH: Slide Time - map 0-100 to 10ms-500ms
	if (gval.slideTime != 0xFF)
	{
		float slideMs = 10.0f + (gval.slideTime / 100.0f) * 490.0f;
		slideTimeSamples = slideMs * 0.001f * pMasterInfo->SamplesPerSec;
	}

	// DEVIL FISH: Muffler mode
	if (gval.muffler != 0xFF)
	{
		mufflerMode = gval.muffler;
	}

	// DEVIL FISH: Sweep Speed mode
	if (gval.sweepSpeed != 0xFF)
	{
		sweepSpeedMode = gval.sweepSpeed;
	}

	// Accent level
	if (gval.acclevel != 0xFF)
	{
		Acclevel = ((float)gval.acclevel / 64.0f);
	}

	// Finetune
	if (gval.finetune != 0xFF)
	{
		tunelv = gval.finetune - 100;
	}

	// Volume
	if (gval.volume != 0xFF)
	{
		amlv = (float)gval.volume * 81.92f;
	}

	slidestateold = slidestate;
	slidestate = (tval.slide == SWITCH_ON);

	if ((tval.note != NOTE_NO ) && (tval.note != NOTE_OFF))
	{
		if( (tval.note >= NOTE_MIN + 1 ) && (tval.note <= NOTE_MAX - 1))
		{
			newnote = (float)(((tval.note>>4)*12+(tval.note&0x0f)-1)*100.0) + tunelv;

			if (slidestateold == true)
			{
				// DEVIL FISH: Use configurable slide time
				float slideRate = slideTimeSamples / PITCHRESOLUTION;
				if (slideRate < 1.0f) slideRate = 1.0f;
				slidenote = (newnote - oldnote) / slideRate;
			}
			else
			{
				slidenote = newnote - oldnote;
				vcaphase = 0;
				DoNothing = false;
				Envmodinc = 0.0f;
				Accstate = false;

				// DEVIL FISH: Reset VEG envelope with soft attack
				if (tval.accent != SWITCH_ON && softAttackTime > 0)
				{
					inAttack = true;
					vegAttackPhase = softAttackTime;
				}
				else
				{
					inAttack = false;
					vegAttackPhase = 0;
				}
				vegPhase = 1.0f;  // Start at full

				if (tval.accent == SWITCH_ON)
				{
					Accstate = true;

					// DEVIL FISH: Accent sweep - update capacitor charge
					float dischargeRate, chargeRate, maxCharge;
					switch (sweepSpeedMode)
					{
						case 0:  // Fast
							dischargeRate = 0.8f;
							chargeRate = 0.3f;
							maxCharge = 1.2f;
							break;
						case 2:  // Slow
							dischargeRate = 0.2f;
							chargeRate = 0.6f;
							maxCharge = 2.0f;
							break;
						default: // Normal
							dischargeRate = 0.5f;
							chargeRate = 0.5f;
							maxCharge = 1.5f;
							break;
					}

					// Discharge based on time
					accentCharge *= expf(-dischargeRate * lastAccentTime);
					// Charge up
					accentCharge = fminf(accentCharge + chargeRate, maxCharge);
					lastAccentTime = 0;

					if (Accphaseid > 2) Accphaseid = 0;
					Accphaseid ++;
					switch (Accphaseid)
					{
						case 1: Accphase1 = Accphasel1 = 0; p_Accphasel1 = accl; break;
						case 2: Accphase2 = Accphasel2 = 0; p_Accphasel2 = accl; break;
						case 3: Accphase3 = Accphasel3 = 0; p_Accphasel3 = accl; break;
					}
				}
			}
		}
	}

	// Track time since last accent for sweep
	lastAccentTime += pMasterInfo->SamplesPerTick / (float)pMasterInfo->SamplesPerSec;
}


//////////// WORK ////////////

bool mi::MDKWork(float *psamples, int numsamples, int const mode)
{
	if (DoNothing == false)
	{
		DoNothing = true;
		do
		{
			if (pitchcounter == PITCHRESOLUTION-1)
			{
				// Note slide computation
				oldnote += slidenote;
				if (slidenote > 0 && oldnote > newnote)
				{
					oldnote = newnote; slidenote = 0;
				}
				else if (slidenote < 0 && oldnote < newnote)
				{
					oldnote = newnote; slidenote = 0;
				}

				oscphaseinc = oscpitch[f2i(oldnote)];

				// Table Level computation
				osclevel = 0;
				osclevel = ilog2(oscphaseinc*oscphaseinc*oscphaseinc*oscphaseinc);
				if (osclevel < 0) osclevel = 0;

				// Cutoff slide computation
				Flpfold += Flpfsl;
				if (Flpfsl > 0 && Flpfold > Flpfnew)
				{
					Flpfold = Flpfnew; Flpfsl = 0;
				}
				else if (Flpfsl < 0 && Flpfold < Flpfnew)
				{
					Flpfold = Flpfnew; Flpfsl = 0;
				}

				// Q slide computation
				Qlpf += Qlpfsl;
				if (Qlpfsl > 0 && Qlpf > Qlpfnew)
				{
					Qlpf = Qlpfnew; Qlpfsl = 0;
				}
				else if (Qlpfsl < 0 && Qlpf < Qlpfnew)
				{
					Qlpf = Qlpfnew; Qlpfsl = 0;
				}

				// Envmod slide computation
				Envmod += Envmodsl;
				if (Envmodsl > 0 && Envmod > Envmodnew)
				{
					Envmod = Envmodnew; Envmodsl = 0;
				}
				else if (Envmodsl < 0 && Envmod < Envmodnew)
				{
					Envmod = Envmodnew; Envmodsl = 0;
				}

				// DEVIL FISH: Use different decay for accented vs normal notes
				float currentDecay = Accstate ? AccentDecay : Decay;

				// Cutoff scale computation with Devil Fish accent sweep
				if (Accstate == true)
				{
					// Apply accent sweep capacitor boost
					float accentBoost = 1.0f + accentCharge * 0.5f;
					Envmodinc += (0.125f * accentBoost);
				}
				else
				{
					Envmodinc += (0.125f * (1 - currentDecay));
				}

				Envmodphase = (1.0f / (1 + Envmodinc));
				Envmodphase = (Envmodphase * 0.965f + 0.035f) * Envmod + (Envmodphase * 0.05f + 0.1f) * (1.0f - Envmod);

				EnvmodphaseY = ((Envmodphase - EnvmodphaseZ) * 0.2f) + EnvmodphaseZ;
				EnvmodphaseZ = EnvmodphaseY;

				Cutfreq = EnvmodphaseY * (((acc[Accphase1] + acc[Accphase2] + acc[Accphase3]) * Acclevel) + 1.0f);

				// DEVIL FISH: Apply filter tracking
				if (filterTrackingAmt > 0.0f)
				{
					float noteFreq = oscphaseinc * pMasterInfo->SamplesPerSec / 2048.0f;
					float trackingOffset = calculateFilterTracking(noteFreq);
					// Convert Hz offset to normalized cutoff offset
					float normalizedOffset = trackingOffset / (pMasterInfo->SamplesPerSec * 0.5f);
					Cutfreq += normalizedOffset;
				}

				Cutfreq = Cutfreq * Flpfold;
				if (Cutfreq > 0.87f) Cutfreq = 0.87f;
				Cutfreq = Cutfreq * (pMasterInfo->SamplesPerSec * 0.5f);

				if (Accphase1 < 600) Accphase1 ++;
				if (Accphase2 < 600) Accphase2 ++;
				if (Accphase3 < 600) Accphase3 ++;

				Oscfreq = oscphaseinc * pMasterInfo->SamplesPerSec / 2048.0f;

				if (Cutfreq < Oscfreq) Cutfreq = Oscfreq;

				Flpf = Cutfreq / (pMasterInfo->SamplesPerSec * 0.5f);

				Flpf = fscale(Flpf);
				if (Flpf > 1) Flpf = 1.0f;

				Qdown = 1.0f - (float)pow(0.75f, Cutfreq / Oscfreq);

				// Q scale computation
				cf = (Flpf * 1.00f) + 1;
				Qlpfh = 5.9039f - 7.0114f * cf;
				cf *= (Flpf + 1);
				Qlpfh = Qlpfh - 0.416f * cf;
				cf *= (Flpf + 1);
				Qlpfh = Qlpfh + 10.655f * cf;
				cf *= (Flpf + 1);
				Qlpfh = Qlpfh - 11.753f * cf;
				cf *= (Flpf + 1);
				Qlpfh = Qlpfh + 5.398f * cf;
				cf *= (Flpf + 1);
				Qlpfh = Qlpfh - 0.9308f * cf;
				Qlpfh = Qlpfh * Qlpf;
				Qlpfh *= Qdown;

				pitchcounter = 0;
			}
			else { pitchcounter ++; }

			// Waveform generation
			oscphase += oscphaseinc;
			if (oscphase >= 2048.0f) oscphase -= 2048.0f;
			oscphaseint0 = f2i((float)oscphase);
			oscphaseint1 = oscphaseint0 + 1;
			if (oscphaseint1 >= 2048) oscphaseint1 = 0;

			if (osctype == false)
			{
				out = oscsaw[oscphaseint0+2048*osclevel] * (1-(oscphase-oscphaseint0))
					+ oscsaw[oscphaseint1+2048*osclevel] * (oscphase-oscphaseint0);
			}
			else
			{
				out = oscsqa[oscphaseint0+2048*osclevel] * (1-(oscphase-oscphaseint0))
					+ oscsqa[oscphaseint1+2048*osclevel] * (oscphase-oscphaseint0);
			}

			// VCA envelope phase
			if (vcaphase < 1200) vcaphase++;
			if ((pMasterInfo->PosInTick > pMasterInfo->SamplesPerTick / 2) && (vcaphase < 1600) && (slidestate == false)) vcaphase++;

			// DEVIL FISH: Apply VEG envelope with sustain
			float vegLevel;
			if (inAttack && vegAttackPhase > 0)
			{
				// Soft attack phase
				vegLevel = 1.0f - (vegAttackPhase / softAttackTime);
				vegAttackPhase -= 1.0f;
				if (vegAttackPhase <= 0) inAttack = false;
			}
			else
			{
				// Decay/sustain phase
				vegPhase -= vegDecayRate;
				if (vegPhase < vegSustainLevel) vegPhase = vegSustainLevel;
				vegLevel = vegPhase;
			}

			// Apply VEG level to the VCA table lookup
			temp = vca[vcaphase] * vegLevel;
			temp += *p_Accphasel1;
			temp += *p_Accphasel2;
			temp += *p_Accphasel3;
			out = out * temp;

			// Accent level tracking
			if (Accphasel1 < 12200) { Accphasel1 ++; p_Accphasel1++; }
			if (Accphasel2 < 12200) { Accphasel2 ++; p_Accphasel2++; }
			if (Accphasel3 < 12200) { Accphasel3 ++; p_Accphasel3++; }

			// 3p Lowpass Resonant VCF
			out = out * (Qlpfh + 1);
			out = out * amlv;
			out = out - Yc * Qlpfh;

			Flpfh = (Flpf + 1) * 0.5f;
			Xaz = Xa;
			Xa = out;
			Yaz = Ya;
			Ya = ((Xa + Xaz) * Flpfh) - (Flpf * Yaz);
			out = Ya;

			Xbz = Xb;
			Xb = out;
			Ybz = Yb;
			Yb = ((Xb + Xbz) * Flpfh) - (Flpf * Ybz);
			out = Yb;

			Xcz = Xc;
			Xc = out;
			Ycz = Yc;
			Yc = ((Xc + Xcz) * Flpfh) - (Flpf * Ycz);
			out = Yc;

			// Allpass shifter
			hFh = -0.998f;
			hXa = out;
			hYa = hXa * hFh + hYaz;
			hYaz = hXa - hFh * hYa;
			out = hYa;

			// Clipper
			if (out < -14.0f * 8192.0f) out = -14.0f * 8192.0f;
			if (out > 14.0f * 8192.0f) out = 14.0f * 8192.0f;

			hXb = out;
			hYb = hXb * hFh + hYbz;
			hYbz = hXb - hFh * hYb;
			out = hYb;

			// DEVIL FISH: Apply muffler (soft clipping)
			out = applyMuffler(out);

			*psamples = out;
			if (!(*psamples < 1 && *psamples > -1 && vcaphase == 1600)) DoNothing = false;
			psamples ++;
		}
		while (--numsamples);
		return true;
	}
	else
	{
		// Idle processing - still update parameter slides
		do
		{
			Flpfold += Flpfsl;
			if (Flpfsl > 0 && Flpfold > Flpfnew) { Flpfold = Flpfnew; Flpfsl = 0; }
			else if (Flpfsl < 0 && Flpfold < Flpfnew) { Flpfold = Flpfnew; Flpfsl = 0; }

			Qlpf += Qlpfsl;
			if (Qlpfsl > 0 && Qlpf > Qlpfnew) { Qlpf = Qlpfnew; Qlpfsl = 0; }
			else if (Qlpfsl < 0 && Qlpf < Qlpfnew) { Qlpf = Qlpfnew; Qlpfsl = 0; }

			Envmod += Envmodsl;
			if (Envmodsl > 0 && Envmod > Envmodnew) { Envmod = Envmodnew; Envmodsl = 0; }
			else if (Envmodsl < 0 && Envmod < Envmodnew) { Envmod = Envmodnew; Envmodsl = 0; }
		} while (--numsamples);
		return false;
	}
}


bool mi::MDKWorkStereo(float *psamples, int numsamples, int const mode)
{
	return false;
}


void mi::Command(int const i)
{
	switch(i)
	{
	case 0:
#ifdef WIN32
		MessageBox (NULL,
			"Oomek Aggressor 3o3 Devil Fish\n"
			"Version: 2.0\n\n"
			"Original by Radoslaw Dutkiewicz\n"
			"Devil Fish Mods added for DEViLBOX\n\n"
			"New features:\n"
			"- Normal/Accent Decay\n"
			"- VEG Decay & Sustain\n"
			"- Soft Attack\n"
			"- Filter Tracking\n"
			"- High Resonance Mode\n"
			"- Slide Time Control\n"
			"- Muffler (Soft Clipping)\n"
			"- Accent Sweep Speed",
			"About Aggressor 3o3 DF", MB_OK|MB_SYSTEMMODAL);
#endif
		break;
	default:
		break;
	}
}


char const *mi::DescribeValue(int const param, int const value)
{
	static char txt[32];
	switch(param)
	{
	case 0:  // Osc Type
		return (value == 0) ? "Saw" : "Square";

	case 1: case 2: case 3: case 4: case 5:
		return NULL;

	case 6:  // Finetune
		sprintf(txt, "%i ct", value - 100);
		return txt;

	case 7:  // Volume
		sprintf(txt, "%i%%", value);
		return txt;

	// Devil Fish parameters
	case 8:  // Accent Decay
		return NULL;

	case 9:  // VEG Decay
		{
			float ms = 16.0f + (value / 128.0f) * 2984.0f;
			sprintf(txt, "%.0f ms", ms);
			return txt;
		}

	case 10: // VEG Sustain
		sprintf(txt, "%i%%", value);
		return txt;

	case 11: // Soft Attack
		{
			float ms = 0.3f + (value / 100.0f) * 29.7f;
			sprintf(txt, "%.1f ms", ms);
			return txt;
		}

	case 12: // Filter Tracking
		sprintf(txt, "%i%%", value);
		return txt;

	case 13: // High Resonance
		return (value == 0) ? "Off" : "On";

	case 14: // Slide Time
		{
			float ms = 10.0f + (value / 100.0f) * 490.0f;
			sprintf(txt, "%.0f ms", ms);
			return txt;
		}

	case 15: // Muffler
		switch(value)
		{
			case 0: return "Off";
			case 1: return "Soft";
			case 2: return "Hard";
		}
		return NULL;

	case 16: // Sweep Speed
		switch(value)
		{
			case 0: return "Fast";
			case 1: return "Normal";
			case 2: return "Slow";
		}
		return NULL;

	default:
		return NULL;
	}
}


#pragma optimize("",on)

DLL_EXPORTS
