#pragma once

enum EffectType {
    _Error_ = 0,
    _WaveEffect_,
    _DspEffect_,
};

class CWaveEffectBase {
  public:
    CInstBase();
    ~CInstBase();
    virtual void Update(float* pData);
    EffectType GetType() {
        return _WaveEffect_;
    }
    virtual int GetID() {
        return -1;
    }

  private:
    float fData[512];
};
class CDspEffectBase {
  public:
    CInstBase();
    ~CInstBase();
    virtual void Update(float* pData);
    EffectType GetType() {
        return _DspEffect_;
    }
    virtual int GetID() {
        return -1;
    }
};
