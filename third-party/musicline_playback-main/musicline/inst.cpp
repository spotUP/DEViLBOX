#include "structs.h"

u32 Smpl::DeltaDePacker(u8* source, s8 command, r32* dest, u32 size) {
    s8 delta;
    u8 crunch;
    u16 count;
    u32 length;

    length = 0;

    while (size != 0) {
        length++;

        delta = (char)*source++;

        if (delta != command) {
            if (size != 0) {
                size--;
            } else {
                break;
            }

            *dest++ = float(delta) / 128;
        } else {
            // command

            length++;

            delta = (char)*source++;

            length++;

            count = *source++;

            length++;

            count = (count << 8) | *source++;

            if (size != 0) {
                size--;
            } else {
                break;
            }

            *dest++ = float(delta) / 128;

            while (count != 0) {
                // decrunch1

                length++;

                crunch = *source++;

                delta += ((crunch >> 4) & 0x07) - ((crunch >> 4) & 0x08);

                if (size != 0) {
                    size--;
                } else {
                    break;
                }

                *dest++ = float(delta) / 128;

                count--;

                if (count == 0) {
                    break;
                }

                // decrunch2

                delta += (crunch & 0x07) - (crunch & 0x08);

                if (size != 0) {
                    size--;
                } else {
                    break;
                }

                *dest++ = float(delta) / 128;

                count--;
            }
        }
    }

    return (length);
}

/*void Smpl::FixWaveLength( MLModule *data, C *chan, float *samp)
{
    chan->WsPointer = samp;
    chan->WsRepPointer = samp;
    chan->WsRepPtrOrg = samp;
    chan->WsLength = Length;
    chan->WsRepLength = Length;
}
*/
