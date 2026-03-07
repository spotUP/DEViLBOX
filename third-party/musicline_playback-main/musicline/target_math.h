#pragma once

#include <math.h>
#include <stdlib.h>
// #include "../std.h"

#define SineLength (360)
#define ASineLength (1024)
#define PI 3.1415926535

class CMath {
  public:
    static void Init();

    static float Sin(int nAngle) {
        return _SineTable[nAngle % SineLength];
    }
    static float Sin(int nAngle, short nExpander) {
        return _SineTable[nAngle % SineLength] * nExpander;
    }
    static float Cos(int nAngle) {
        return _SineTable[(nAngle % SineLength) + 90];
    }
    static float Cos(int nAngle, short nExpander) {
        return _SineTable[(nAngle % SineLength) + 90] * nExpander;
    }
    static float Asin(float fDeri);
    static int Rand(int val) {
        if (val != 0)
            return (rand() % val);
        return 0;
    }
    static int Rand1(int val) {
        if (val != 0)
            return ((rand() % val) + 1);
        return 0;
    }
    static float IntToFloat(int val) {
        return (float)val;
    }
    static int FloatToInt(float val) {
        return (int)val;
    }
    static void Calc2DRotation(int* xut, int* yut, int x, int y, short angle, int addx, int addy);

  private:
    static float _SineTable[SineLength + SineLength / 4];
    static float _ASineTable[ASineLength];
};
