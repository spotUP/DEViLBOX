/**
 * MDK (Machine Development Kit) Wrapper for WebAssembly
 *
 * Provides simplified implementations of CMDKMachineInterface and related classes
 * for compiling Buzz machines that use MDK to WebAssembly.
 */

#include <cmath>
#include <cstring>
#include <cstdlib>
#include <list>
#include <string>

// Prevent Windows-specific includes
#define EMSCRIPTEN 1

// Include the common headers
#include "MachineInterface.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Work modes
#define WM_NOIO      0
#define WM_READ      1
#define WM_WRITE     2
#define WM_READWRITE 3

#define BW_SETTLE_TIME 256
#define QUIET 0.1f
#define MDK_VERSION 2

// ============================================================================
// DSPLib Implementation
// ============================================================================

static int g_sampleRate = 44100;

extern "C" {

void DSP_Init(int const samplerate) {
    g_sampleRate = samplerate;
}

void DSP_Zero(float *pout, unsigned long const n) {
    for (unsigned long i = 0; i < n; i++)
        pout[i] = 0.f;
}

void DSP_Copy(float *pout, float const *pin, unsigned long const n) {
    for (unsigned long i = 0; i < n; i++)
        pout[i] = pin[i];
}

void DSP_Copy_Amp(float *pout, float const *pin, unsigned long const n, float const a) {
    for (unsigned long i = 0; i < n; i++)
        pout[i] = pin[i] * a;
}

void DSP_Add(float *pout, float const *pin, unsigned long const n) {
    for (unsigned long i = 0; i < n; i++)
        pout[i] += pin[i];
}

void DSP_Add_Amp(float *pout, float const *pin, unsigned long const n, float const a) {
    for (unsigned long i = 0; i < n; i++)
        pout[i] += pin[i] * a;
}

void DSP_CopyM2S(float *pout, float const *pin, unsigned long const n) {
    for (unsigned long i = 0; i < n; i++)
        pout[2 * i] = pout[2 * i + 1] = pin[i];
}

void DSP_AddM2S(float *pout, float const *pin, unsigned long const n) {
    for (unsigned long i = 0; i < n; i++) {
        pout[2 * i] += pin[i];
        pout[2 * i + 1] += pin[i];
    }
}

void DSP_AddM2S_Amp(float *pout, float const *pin, unsigned long const n, float const a) {
    for (unsigned long i = 0; i < n; i++) {
        float ia = pin[i] * a;
        pout[2 * i] += ia;
        pout[2 * i + 1] += ia;
    }
}

void DSP_Amp(float *ps, unsigned long const n, float const a) {
    for (unsigned long i = 0; i < n; i++)
        ps[i] *= a;
}

} // extern "C"

// CBWState - Butterworth filter state
class CBWState {
public:
    float a[5];     // coefficients
    float i[2];     // past inputs
    float o[2];     // past outputs
    float ri[2];    // past right inputs (for stereo mode)
    float ro[2];    // past right outputs
    int IdleCount;
};

void DSP_BW_Reset(CBWState &s) {
    s.i[0] = 0.0f;
    s.i[1] = 0.0f;
    s.o[0] = 0.0f;
    s.o[1] = 0.0f;
    s.ri[0] = 0.0f;
    s.ri[1] = 0.0f;
    s.ro[0] = 0.0f;
    s.ro[1] = 0.0f;
    s.IdleCount = 0;
}

void DSP_BW_InitLowpass(CBWState &s, float const f) {
    float w0 = 2.0f * M_PI * f / (float)g_sampleRate;
    float alpha = sinf(w0) / (2.0f * 1.0f / sqrtf(2.0f));

    float b0 = (1.0f - cosf(w0)) / 2.0f;
    float b1 =  1.0f - cosf(w0);
    float b2 = (1.0f - cosf(w0)) / 2.0f;

    float a0 =  1.0f + alpha;
    float a1 = -2.0f * cosf(w0);
    float a2 =  1.0f - alpha;

    b0 /= a0;
    b1 /= a0;
    b2 /= a0;
    a1 /= a0;
    a2 /= a0;

    s.a[0] = b0;
    s.a[1] = b1;
    s.a[2] = b2;
    s.a[3] = a1;
    s.a[4] = a2;
}

void DSP_BW_InitHighpass(CBWState &s, float const f) {
    float w0 = 2.0f * M_PI * f / (float)g_sampleRate;
    float alpha = sinf(w0) / (2.0f * 1.0f / sqrtf(2.0f));

    float b0 =  (1.0f + cosf(w0)) / 2.0f;
    float b1 = -(1.0f + cosf(w0));
    float b2 =  (1.0f + cosf(w0)) / 2.0f;

    float a0 =  1.0f + alpha;
    float a1 = -2.0f * cosf(w0);
    float a2 =  1.0f - alpha;

    b0 /= a0;
    b1 /= a0;
    b2 /= a0;
    a1 /= a0;
    a2 /= a0;

    s.a[0] = b0;
    s.a[1] = b1;
    s.a[2] = b2;
    s.a[3] = a1;
    s.a[4] = a2;
}

bool DSP_BW_Work(CBWState &s, float *ps, unsigned long const n, int const mode) {
    for (unsigned long i = 0; i < n; i++) {
        float in;

        if (mode & WM_READ)
            in = *ps;
        else
            in = 0;

        if (fabsf(in) > QUIET) {
            s.IdleCount = 0;
        } else {
            if (s.IdleCount >= BW_SETTLE_TIME) {
                if (mode & WM_WRITE) {
                    *ps = 0;
                    ps++;
                    continue;
                }
            } else {
                s.IdleCount++;
            }
        }

        float y = in * s.a[0] + s.i[0] * s.a[1] + s.i[1] * s.a[2] -
            s.o[0] * s.a[3] - s.o[1] * s.a[4];
        s.i[1] = s.i[0];
        s.i[0] = in;
        s.o[1] = s.o[0];
        s.o[0] = y;

        if (mode & WM_WRITE)
            *ps = y;

        ps++;
    }
    return true;
}

bool DSP_BW_WorkStereo(CBWState &s, float *ps, unsigned long const n, int const mode) {
    for (unsigned long i = 0; i < n; i++) {
        float in, inr;

        if (mode & WM_READ) {
            in = *ps;
            inr = *(ps+1);
        } else {
            in = 0;
            inr = 0;
        }

        if ((fabsf(in) > QUIET) || (fabsf(inr) > QUIET)) {
            s.IdleCount = 0;
        } else {
            if (s.IdleCount >= BW_SETTLE_TIME) {
                if (mode & WM_WRITE) {
                    *ps = 0;
                    *(ps+1) = 0;
                    ps += 2;
                    continue;
                }
            } else {
                s.IdleCount++;
            }
        }

        float y = in * s.a[0] + s.i[0] * s.a[1] + s.i[1] * s.a[2] -
            s.o[0] * s.a[3] - s.o[1] * s.a[4];
        s.i[1] = s.i[0];
        s.i[0] = in;
        s.o[1] = s.o[0];
        s.o[0] = y;

        float yr = inr * s.a[0] + s.ri[0] * s.a[1] + s.ri[1] * s.a[2] -
            s.ro[0] * s.a[3] - s.ro[1] * s.a[4];
        s.ri[1] = s.ri[0];
        s.ri[0] = inr;
        s.ro[1] = s.ro[0];
        s.ro[0] = yr;

        if (mode & WM_WRITE) {
            *ps = y;
            *(ps+1) = yr;
        }

        ps += 2;
    }
    return true;
}

// ============================================================================
// MDK Implementation
// ============================================================================

class CMDKMachineInterface;
class CMDKMachineInterfaceEx;

// Input tracking for MDK
class CInput {
public:
    CInput(char const *n, bool st) : Name(n), Stereo(st) {}
    std::string Name;
    bool Stereo;
};

typedef std::list<CInput> InputList;

// MDK Implementation class
class CMDKImplementation {
    friend class CMDKMachineInterface;
    friend class CMDKMachineInterfaceEx;
public:
    virtual ~CMDKImplementation() {}

    virtual void AddInput(char const *macname, bool stereo) {
        if (macname == nullptr) return;
        Inputs.push_back(CInput(macname, stereo));
        SetMode();
    }

    virtual void DeleteInput(char const *macname) {
        for (auto i = Inputs.begin(); i != Inputs.end(); i++) {
            if ((*i).Name.compare(macname) == 0) {
                Inputs.erase(i);
                SetMode();
                return;
            }
        }
    }

    virtual void RenameInput(char const *macoldname, char const *macnewname) {
        for (auto i = Inputs.begin(); i != Inputs.end(); i++) {
            if ((*i).Name.compare(macoldname) == 0) {
                (*i).Name = macnewname;
                return;
            }
        }
    }

    virtual void SetInputChannels(char const *macname, bool stereo) {
        for (auto i = Inputs.begin(); i != Inputs.end(); i++) {
            if ((*i).Name.compare(macname) == 0) {
                (*i).Stereo = stereo;
                SetMode();
                return;
            }
        }
    }

    virtual void Input(float *psamples, int numsamples, float amp) {
        if (psamples == nullptr) {
            if (InputIterator != Inputs.end()) InputIterator++;
            return;
        }

        if (numChannels == 1) {
            if (HaveInput == 0) {
                if (InputIterator != Inputs.end() && (*InputIterator).Stereo) {
                    // CopyStereoToMono
                    for (int i = 0; i < numsamples; i++) {
                        Buffer[i] = (psamples[i*2] + psamples[i*2+1]) * amp;
                    }
                } else {
                    DSP_Copy_Amp(Buffer, psamples, numsamples, amp);
                }
            } else {
                if (InputIterator != Inputs.end() && (*InputIterator).Stereo) {
                    // AddStereoToMono
                    for (int i = 0; i < numsamples; i++) {
                        Buffer[i] += (psamples[i*2] + psamples[i*2+1]) * amp;
                    }
                } else {
                    DSP_Add_Amp(Buffer, psamples, numsamples, amp);
                }
            }
        } else {
            if (HaveInput == 0) {
                if (InputIterator != Inputs.end() && (*InputIterator).Stereo) {
                    DSP_Copy_Amp(Buffer, psamples, numsamples * 2, amp);
                } else {
                    // CopyM2S
                    for (int i = 0; i < numsamples; i++) {
                        float s = psamples[i] * amp;
                        Buffer[i*2] = s;
                        Buffer[i*2+1] = s;
                    }
                }
            } else {
                if (InputIterator != Inputs.end() && (*InputIterator).Stereo) {
                    DSP_Add_Amp(Buffer, psamples, numsamples * 2, amp);
                } else {
                    DSP_AddM2S_Amp(Buffer, psamples, numsamples, amp);
                }
            }
        }

        HaveInput++;
        if (InputIterator != Inputs.end()) InputIterator++;
    }

    virtual bool Work(float *psamples, int numsamples, int const mode);
    virtual bool WorkMonoToStereo(float *pin, float *pout, int numsamples, int const mode);
    virtual void Init(CMachineDataInput * const pi);
    virtual void Save(CMachineDataOutput * const po);
    virtual void SetOutputMode(bool stereo);

protected:
    void SetMode() {
        InputIterator = Inputs.begin();
        HaveInput = 0;

        if (MachineWantsChannels > 1) {
            numChannels = MachineWantsChannels;
            return;
        }

        for (auto i = Inputs.begin(); i != Inputs.end(); i++) {
            if ((*i).Stereo) {
                numChannels = 2;
                return;
            }
        }

        numChannels = 1;
    }

public:
    CMDKMachineInterface *pmi;

    InputList Inputs;
    InputList::iterator InputIterator;

    int HaveInput;
    int numChannels;
    int MachineWantsChannels;

    void *ThisMachine;

    float Buffer[2 * MAX_BUFFER_LENGTH];
};

// Forward declaration
class CMDKMachineInterfaceEx : public CMachineInterfaceEx {
public:
    friend class CMDKMachineInterface;

    virtual void AddInput(char const *macname, bool stereo) { if (pImp) pImp->AddInput(macname, stereo); }
    virtual void DeleteInput(char const *macename) { if (pImp) pImp->DeleteInput(macename); }
    virtual void RenameInput(char const *macoldname, char const *macnewname) { if (pImp) pImp->RenameInput(macoldname, macnewname); }
    virtual void Input(float *psamples, int numsamples, float amp) { if (pImp) pImp->Input(psamples, numsamples, amp); }
    virtual void SetInputChannels(char const *macname, bool stereo) { if (pImp) pImp->SetInputChannels(macname, stereo); }

    CMDKImplementation *pImp = nullptr;
};

class CMDKMachineInterface : public CMachineInterface {
public:
    virtual ~CMDKMachineInterface() {
        delete pImp;
    }

    virtual void Init(CMachineDataInput * const pi) {
        pImp = new CMDKImplementation();
        pImp->pmi = this;
        pImp->numChannels = 1;
        pImp->HaveInput = 0;
        pImp->MachineWantsChannels = 1;
        pImp->InputIterator = pImp->Inputs.begin();

        CMDKMachineInterfaceEx *pex = GetEx();
        if (pex) pex->pImp = pImp;

        pImp->Init(pi);
    }

    virtual bool Work(float *psamples, int numsamples, int const mode) {
        return pImp ? pImp->Work(psamples, numsamples, mode) : false;
    }

    virtual bool WorkMonoToStereo(float *pin, float *pout, int numsamples, int const mode) {
        return pImp ? pImp->WorkMonoToStereo(pin, pout, numsamples, mode) : false;
    }

    virtual void Save(CMachineDataOutput * const po) {
        if (pImp) pImp->Save(po);
    }

    void SetOutputMode(bool stereo) {
        if (pImp) pImp->SetOutputMode(stereo);
    }

public:
    virtual CMDKMachineInterfaceEx *GetEx() = 0;
    virtual void OutputModeChanged(bool stereo) = 0;

    virtual bool MDKWork(float *psamples, int numsamples, int const mode) = 0;
    virtual bool MDKWorkStereo(float *psamples, int numsamples, int const mode) = 0;

    virtual void MDKInit(CMachineDataInput * const pi) = 0;
    virtual void MDKSave(CMachineDataOutput * const po) = 0;

private:
    CMDKImplementation *pImp = nullptr;
};

// MDKImplementation method definitions
bool CMDKImplementation::Work(float *psamples, int numsamples, int const mode) {
    if ((mode & WM_READ) && HaveInput)
        DSP_Copy(psamples, Buffer, numsamples);

    bool ret = pmi->MDKWork(psamples, numsamples, mode);

    InputIterator = Inputs.begin();
    HaveInput = 0;

    return ret;
}

bool CMDKImplementation::WorkMonoToStereo(float *pin, float *pout, int numsamples, int const mode) {
    if ((mode & WM_READ) && HaveInput)
        DSP_Copy(pout, Buffer, 2 * numsamples);

    bool ret = pmi->MDKWorkStereo(pout, numsamples, mode);

    InputIterator = Inputs.begin();
    HaveInput = 0;

    return ret;
}

void CMDKImplementation::Init(CMachineDataInput * const pi) {
    ThisMachine = nullptr;
    numChannels = 1;
    InputIterator = Inputs.begin();
    HaveInput = 0;
    MachineWantsChannels = 1;

    if (pi != nullptr) {
        unsigned char ver;
        pi->Read(ver);
    }

    pmi->MDKInit(pi);
}

void CMDKImplementation::Save(CMachineDataOutput * const po) {
    po->Write((unsigned char)MDK_VERSION);
    pmi->MDKSave(po);
}

void CMDKImplementation::SetOutputMode(bool stereo) {
    numChannels = stereo ? 2 : 1;
    MachineWantsChannels = numChannels;
    pmi->OutputModeChanged(stereo);
}
