#include "target_math.h"

float CMath::_SineTable[SineLength + SineLength / 4];
float CMath::_ASineTable[ASineLength];

void CMath::Init() {
    int i;
    for (i = 0; i < SineLength + (SineLength / 4); i++) {
        _SineTable[i] = (float)sin(i * PI / 180 * 360 / SineLength);
    }
    for (i = 0; i < ASineLength; i++) {
        _ASineTable[i] = (float)asin((float)(i - ASineLength / 2) / (float)(ASineLength / 2));
    }
}
float CMath::Asin(float fDeri) {
    if (fDeri > -1 || fDeri < PI / 2) {
        int nDeri = (int)(fDeri * ASineLength);
        return _ASineTable[nDeri] * (float)PI / 2;
    }
    return 0.0f;
}

void CMath::Calc2DRotation(int* xut, int* yut, int x, int y, short angle, int addx, int addy) {
    *xut = (short)(Cos(angle, (short)x) - Sin(angle, (short)y) + addx);
    *yut = (short)(Sin(angle, (short)x) + Cos(angle, (short)y) + addy);
}
