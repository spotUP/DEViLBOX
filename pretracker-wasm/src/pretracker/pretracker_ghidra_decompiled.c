/* Decompiled from pretracker.bin (19300 bytes, 68000) by Ghidra 12.0 */
/* Full jump table resolved from binary header */

/* --- songInit_dispatch @ 0x60 --- */

void songInit_dispatch(void)

{
  (*pcRam0000001c)();
  return;
}



/* --- playerInit_dispatch @ 0x7e --- */

void playerInit_dispatch(void)

{
  (*pcRam00000020)();
  return;
}



/* --- playerTick_dispatch @ 0x9c --- */

void playerTick_dispatch(void)

{
  (*pcRam00000024)();
  return;
}



/* --- startSong_dispatch @ 0xac --- */

void startSong_dispatch(void)

{
  (*pcRam00000028)();
  return;
}



/* --- stop_dispatch @ 0xbe --- */

void stop_dispatch(void)

{
  (*pcRam0000002c)();
  return;
}



/* --- stopChannels_dispatch @ 0xe0 --- */

void stopChannels_dispatch(void)

{
  (*pcRam00000030)();
  return;
}



/* --- setVolume_dispatch @ 0xf0 --- */

void setVolume_dispatch(void)

{
  (*pcRam00000034)();
  return;
}



/* --- prt_initChannel @ 0x102 --- */

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void prt_initChannel(undefined4 *param_1)

{
  undefined4 uVar1;
  
  *(undefined1 *)((int)param_1 + 0xa02) = 0;
  *(undefined2 *)((int)param_1 + 0x9fa) = 0xffff;
  uVar1 = param_1[0x299];
  *(undefined4 *)((int)param_1 + 0x36) = 0;
  *(undefined2 *)((int)param_1 + 0x26) = 1;
  *(undefined2 *)(param_1 + 0xd) = 0xffff;
  *(undefined1 *)((int)param_1 + 6) = 0;
  *(undefined1 *)(param_1 + 0x1e) = 0;
  *(undefined4 *)((int)param_1 + 0x6e) = uVar1;
  *(undefined2 *)((int)param_1 + 0x72) = 2;
  *(undefined2 *)((int)param_1 + 0x76) = 0x7b;
  *param_1 = 0;
  param_1[0x17] = 0;
  *(undefined4 *)((int)param_1 + 0x42) = 3;
  param_1[0xad] = 0;
  *(undefined2 *)(param_1 + 0xa9) = 1;
  *(undefined2 *)((int)param_1 + 0x2b2) = 0xffff;
  *(undefined1 *)(param_1 + 0xa1) = 0;
  *(undefined2 *)((int)param_1 + 0x2f6) = 1;
  param_1[0xbb] = uVar1;
  *(undefined2 *)(param_1 + 0xbc) = 2;
  *(undefined2 *)(param_1 + 0xbd) = 0x7b;
  *(undefined4 *)((int)param_1 + 0x27e) = 0;
  *(undefined4 *)((int)param_1 + 0x2da) = 0;
  param_1[0xb0] = 3;
  *(undefined4 *)((int)param_1 + 0x532) = 0;
  *(undefined2 *)((int)param_1 + 0x522) = 1;
  *(undefined2 *)(param_1 + 0x14c) = 0xffff;
  *(undefined1 *)((int)param_1 + 0x502) = 0;
  *(undefined2 *)(param_1 + 0x15d) = 1;
  *(undefined4 *)((int)param_1 + 0x56a) = uVar1;
  *(undefined2 *)((int)param_1 + 0x56e) = 2;
  *(undefined2 *)((int)param_1 + 0x572) = 0x7b;
  param_1[0x13f] = 0;
  param_1[0x156] = 0;
  *(undefined4 *)((int)param_1 + 0x53e) = 3;
  param_1[0x1ec] = 0;
  *(undefined2 *)(param_1 + 0x1e8) = 1;
  *(undefined2 *)((int)param_1 + 0x7ae) = 0xffff;
  *(undefined1 *)(param_1 + 0x1e0) = 0;
  *(undefined2 *)((int)param_1 + 0x7f2) = 1;
  param_1[0x1fa] = uVar1;
  *(undefined2 *)(param_1 + 0x1fb) = 2;
  *(undefined2 *)(param_1 + 0x1fc) = 0x7b;
  *(undefined4 *)((int)param_1 + 0x77a) = 0;
  *(undefined4 *)((int)param_1 + 0x7d6) = 0;
  param_1[0x1ef] = 3;
  _DAT_00dff096 = 1;
  _DAT_00dff0a0 = *(undefined4 *)((int)param_1 + 0x6e);
  _DAT_00dff0a4 = *(ushort *)((int)param_1 + 0x72) >> 1;
  _DAT_00dff0a8 = 0;
  *(undefined1 *)((int)param_1 + 0x79) = 0;
  _DAT_00dff0a6 = 0x71;
  if (*(char *)((int)param_1 + 0x2f7) == '\0') {
    _DAT_00dff0b8 = (ushort)*(byte *)((int)param_1 + 0x2f6);
    _DAT_00dff0b6 = *(undefined2 *)(param_1 + 0xbd);
  }
  else {
    _DAT_00dff096 = 2;
    _DAT_00dff0b0 = param_1[0xbb];
    _DAT_00dff0b4 = *(ushort *)(param_1 + 0xbc) >> 1;
    _DAT_00dff0b8 = 0;
    *(undefined1 *)((int)param_1 + 0x2f7) = 0;
    _DAT_00dff0b6 = 0x71;
  }
  if (*(char *)((int)param_1 + 0x575) == '\0') {
    _DAT_00dff0c8 = (ushort)*(byte *)(param_1 + 0x15d);
    _DAT_00dff0c6 = *(undefined2 *)((int)param_1 + 0x572);
  }
  else {
    _DAT_00dff096 = 4;
    _DAT_00dff0c0 = *(undefined4 *)((int)param_1 + 0x56a);
    _DAT_00dff0c4 = *(ushort *)((int)param_1 + 0x56e) >> 1;
    _DAT_00dff0c8 = 0;
    *(undefined1 *)((int)param_1 + 0x575) = 0;
    _DAT_00dff0c6 = 0x71;
  }
  if (*(char *)((int)param_1 + 0x7f3) != '\0') {
    _DAT_00dff096 = 8;
    _DAT_00dff0d0 = param_1[0x1fa];
    _DAT_00dff0d4 = *(ushort *)(param_1 + 0x1fb) >> 1;
    _DAT_00dff0d8 = 0;
    *(undefined1 *)((int)param_1 + 0x7f3) = 0;
    _DAT_00dff0d6 = 0x71;
    return;
  }
  _DAT_00dff0d8 = (ushort)*(byte *)((int)param_1 + 0x7f2);
  _DAT_00dff0d6 = *(undefined2 *)(param_1 + 0x1fc);
  return;
}



/* --- prt_stop @ 0x308 --- */

void prt_stop(int param_1,int param_2,char param_3,undefined1 param_4,undefined1 param_5)

{
  int iVar1;
  int iVar2;
  byte bVar3;
  
  iVar1 = param_1 + param_2 * 0x27e;
  iVar2 = *(int *)(param_1 + 0x9fe);
  bVar3 = param_3 + 0x20;
  *(undefined2 *)(iVar1 + 0x14) = 0;
  *(undefined2 *)(iVar1 + 0x12) = 0;
  *(undefined1 *)(iVar1 + 0xd) = 0;
  *(undefined1 *)(iVar1 + 9) = 0;
  *(undefined2 *)(param_1 + 10 + param_2 * 0x27e) = 0;
  *(undefined1 *)(iVar1 + 0x17) = 0xff;
  *(undefined2 *)(iVar1 + 0x20) = 0x40;
  *(undefined2 *)(iVar1 + 0x1a) = 0x40;
  *(undefined2 *)(iVar1 + 0x1e) = 0xff;
  *(undefined2 *)(iVar1 + 0x22) = 0;
  *(undefined2 *)(iVar1 + 0x24) = 0xffff;
  *(undefined1 *)(iVar1 + 0x28) = 0;
  *(undefined2 *)(iVar1 + 0x2a) = 0;
  *(undefined2 *)(iVar1 + 0x2e) = 0;
  *(undefined2 *)(iVar1 + 0x30) = 0;
  *(undefined2 *)(iVar1 + 0x32) = 0;
  *(undefined2 *)(iVar1 + 0x2c) = 0x10;
  *(undefined1 *)(iVar1 + 0x6a) = 0;
  *(undefined1 *)(iVar1 + 0x6c) = 0;
  *(undefined1 *)(iVar1 + 0x6b) = 1;
  *(uint *)(iVar1 + 0x3a) = *(int *)(iVar2 + 0x11c) + (bVar3 + 0x1fffffff) * 8;
  *(ushort *)(iVar1 + 0x1c) = (ushort)bVar3;
  *(byte *)(iVar1 + 0xc) = bVar3;
  *(undefined1 *)(iVar1 + 0xe) = param_4;
  *(undefined1 *)(iVar1 + 6) = param_5;
  return;
}



/* --- prt_setVolume @ 0x3bc --- */

void prt_setVolume(int param_1,undefined1 param_2)

{
  *(undefined1 *)(param_1 + 0x9f9) = param_2;
  return;
}



/* --- prt_playerTick @ 0x3c8 --- DECOMPILE FAILED */

/* --- prt_setupSong @ 0x1f36 --- */

void prt_setupSong(undefined4 *param_1,byte param_2)

{
  int iVar1;
  undefined4 uVar2;
  byte bVar3;
  int iVar4;
  int iVar5;
  byte *pbVar6;
  int *piVar7;
  int *piVar8;
  
  *(undefined2 *)(param_1 + 0x27f) = 0x60f;
  iVar1 = *(int *)((int)param_1 + 0x9fe);
  *(undefined1 *)(param_1 + 0x27e) = 0;
  if (param_2 == 0) {
    *(ushort *)(iVar1 + 0x110) = (ushort)*(byte *)(iVar1 + 0x53f);
    *(undefined4 *)(iVar1 + 0x114) = *(undefined4 *)(iVar1 + 0x118);
    *(undefined2 *)(iVar1 + 0x10e) = 0;
    *(ushort *)(iVar1 + 0x112) = (ushort)*(byte *)(iVar1 + 0x53c);
    bVar3 = *(byte *)(iVar1 + 0x53e);
    *(byte *)(iVar1 + 1) = bVar3;
    *(ushort *)(iVar1 + 4) = (ushort)bVar3;
    iVar4 = *(int *)(iVar1 + 0x540) + *(int *)(iVar1 + 10);
    *(int *)(iVar1 + 6) = iVar4;
    iVar5 = (uint)bVar3 * 3;
    piVar7 = (int *)(iVar1 + 0x124);
  }
  else {
    pbVar6 = (byte *)(iVar1 + 0x53f);
    iVar4 = 0;
    do {
      iVar4 = (uint)*pbVar6 * 8 + iVar4;
      pbVar6 = pbVar6 + 8;
    } while ((byte *)(iVar1 + 0x547 + (uint)(ushort)(param_2 - 1) * 8) != pbVar6);
    iVar5 = iVar1 + (uint)param_2 * 8;
    bVar3 = *(byte *)(iVar5 + 0x53c);
    *(ushort *)(iVar1 + 0x110) = (ushort)*(byte *)(iVar5 + 0x53f);
    *(int *)(iVar1 + 0x114) = *(int *)(iVar1 + 0x118) + iVar4;
    *(undefined2 *)(iVar1 + 0x10e) = 0;
    *(ushort *)(iVar1 + 0x112) = (ushort)bVar3;
    bVar3 = *(byte *)(iVar5 + 0x53e);
    *(byte *)(iVar1 + 1) = bVar3;
    *(ushort *)(iVar1 + 4) = (ushort)bVar3;
    iVar4 = *(int *)(iVar1 + (param_2 + 0xa8) * 8) + *(int *)(iVar1 + 10);
    *(int *)(iVar1 + 6) = iVar4;
    iVar5 = (uint)bVar3 * 3;
    piVar7 = (int *)(iVar1 + 0x124);
  }
  do {
    piVar8 = piVar7 + 1;
    *piVar7 = iVar4;
    iVar4 = iVar5 + iVar4;
    piVar7 = piVar8;
  } while ((int *)(iVar1 + 0x520) != piVar8);
  *(undefined1 *)((int)param_1 + 0x9f9) = 0x40;
  uVar2 = param_1[0x299];
  *(undefined4 *)((int)param_1 + 0x6e) = uVar2;
  *(undefined2 *)((int)param_1 + 0x72) = 2;
  *(undefined1 *)(param_1 + 0x1e) = 0;
  *(undefined2 *)((int)param_1 + 0x76) = 0x7b;
  *(undefined1 *)((int)param_1 + 6) = 0x40;
  *(undefined1 *)((int)param_1 + 9) = 0;
  *(undefined2 *)((int)param_1 + 10) = 0;
  *(undefined2 *)(param_1 + 3) = 0;
  *(undefined1 *)((int)param_1 + 0xe) = 0;
  *param_1 = 0;
  param_1[0x17] = 0;
  *(undefined4 *)((int)param_1 + 0x42) = 3;
  *(undefined2 *)((int)param_1 + 0x12) = 0;
  *(undefined2 *)(param_1 + 5) = 0;
  *(undefined2 *)((int)param_1 + 0x16) = 0xff;
  *(undefined1 *)(param_1 + 4) = 0;
  param_1[0xbb] = uVar2;
  *(undefined2 *)(param_1 + 0xbc) = 2;
  *(undefined1 *)((int)param_1 + 0x2f6) = 0;
  *(undefined2 *)(param_1 + 0xbd) = 0x7b;
  *(undefined1 *)(param_1 + 0xa1) = 0x40;
  *(undefined1 *)((int)param_1 + 0x287) = 0;
  *(undefined2 *)(param_1 + 0xa2) = 0;
  *(undefined2 *)((int)param_1 + 0x28a) = 0;
  *(undefined1 *)(param_1 + 0xa3) = 0;
  *(undefined4 *)((int)param_1 + 0x27e) = 0;
  *(undefined4 *)((int)param_1 + 0x2da) = 0;
  param_1[0xb0] = 3;
  *(undefined2 *)(param_1 + 0xa4) = 0;
  *(undefined2 *)((int)param_1 + 0x292) = 0;
  *(undefined2 *)(param_1 + 0xa5) = 0xff;
  *(undefined1 *)((int)param_1 + 0x28e) = 0;
  *(undefined4 *)((int)param_1 + 0x56a) = uVar2;
  *(undefined2 *)((int)param_1 + 0x56e) = 2;
  *(undefined1 *)(param_1 + 0x15d) = 0;
  *(undefined2 *)((int)param_1 + 0x572) = 0x7b;
  *(undefined1 *)((int)param_1 + 0x502) = 0x40;
  *(undefined1 *)((int)param_1 + 0x505) = 0;
  *(undefined2 *)((int)param_1 + 0x506) = 0;
  *(undefined2 *)(param_1 + 0x142) = 0;
  *(undefined1 *)((int)param_1 + 0x50a) = 0;
  param_1[0x13f] = 0;
  param_1[0x156] = 0;
  *(undefined4 *)((int)param_1 + 0x53e) = 3;
  *(undefined2 *)((int)param_1 + 0x50e) = 0;
  *(undefined2 *)(param_1 + 0x144) = 0;
  *(undefined2 *)((int)param_1 + 0x512) = 0xff;
  *(undefined1 *)(param_1 + 0x143) = 0;
  param_1[0x1fa] = uVar2;
  *(undefined2 *)(param_1 + 0x1fb) = 2;
  *(undefined1 *)((int)param_1 + 0x7f2) = 0;
  *(undefined2 *)(param_1 + 0x1fc) = 0x7b;
  *(undefined2 *)((int)param_1 + 0x78e) = 0;
  *(undefined1 *)(param_1 + 0x1e0) = 0x40;
  *(undefined2 *)(param_1 + 0x1e3) = 0;
  *(undefined1 *)((int)param_1 + 0x785) = 0;
  *(undefined1 *)((int)param_1 + 0x783) = 0;
  *(undefined1 *)(param_1 + 0x1e1) = 0;
  *(undefined2 *)((int)param_1 + 0x786) = 0;
  *(undefined1 *)(param_1 + 0x1e2) = 0;
  *(undefined4 *)((int)param_1 + 0x77a) = 0;
  *(undefined4 *)((int)param_1 + 0x7d6) = 0;
  param_1[0x1ef] = 3;
  *(undefined2 *)(param_1 + 0x1e4) = 0xff;
  *(undefined1 *)((int)param_1 + 0x78a) = 0;
  *(undefined1 *)((int)param_1 + 0xa02) = 1;
  return;
}



/* --- prt_startSong @ 0x219e --- */

void prt_startSong(undefined4 *param_1,byte param_2)

{
  int iVar1;
  undefined4 uVar2;
  byte bVar3;
  int iVar4;
  int iVar5;
  byte *pbVar6;
  int *piVar7;
  int *piVar8;
  
  *(undefined2 *)(param_1 + 0x27f) = 0x60f;
  iVar1 = *(int *)((int)param_1 + 0x9fe);
  *(undefined1 *)(param_1 + 0x27e) = 0;
  if (param_2 == 0) {
    *(ushort *)(iVar1 + 0x110) = (ushort)*(byte *)(iVar1 + 0x53f);
    *(undefined4 *)(iVar1 + 0x114) = *(undefined4 *)(iVar1 + 0x118);
    *(undefined2 *)(iVar1 + 0x10e) = 0;
    *(ushort *)(iVar1 + 0x112) = (ushort)*(byte *)(iVar1 + 0x53c);
    bVar3 = *(byte *)(iVar1 + 0x53e);
    *(byte *)(iVar1 + 1) = bVar3;
    *(ushort *)(iVar1 + 4) = (ushort)bVar3;
    iVar4 = *(int *)(iVar1 + 0x540) + *(int *)(iVar1 + 10);
    *(int *)(iVar1 + 6) = iVar4;
    iVar5 = (uint)bVar3 * 3;
    piVar7 = (int *)(iVar1 + 0x124);
  }
  else {
    pbVar6 = (byte *)(iVar1 + 0x53f);
    iVar4 = 0;
    do {
      iVar4 = (uint)*pbVar6 * 8 + iVar4;
      pbVar6 = pbVar6 + 8;
    } while ((byte *)(iVar1 + 0x547 + (uint)(ushort)(param_2 - 1) * 8) != pbVar6);
    iVar5 = iVar1 + (uint)param_2 * 8;
    bVar3 = *(byte *)(iVar5 + 0x53c);
    *(ushort *)(iVar1 + 0x110) = (ushort)*(byte *)(iVar5 + 0x53f);
    *(int *)(iVar1 + 0x114) = *(int *)(iVar1 + 0x118) + iVar4;
    *(undefined2 *)(iVar1 + 0x10e) = 0;
    *(ushort *)(iVar1 + 0x112) = (ushort)bVar3;
    bVar3 = *(byte *)(iVar5 + 0x53e);
    *(byte *)(iVar1 + 1) = bVar3;
    *(ushort *)(iVar1 + 4) = (ushort)bVar3;
    iVar4 = *(int *)(iVar1 + (param_2 + 0xa8) * 8) + *(int *)(iVar1 + 10);
    *(int *)(iVar1 + 6) = iVar4;
    iVar5 = (uint)bVar3 * 3;
    piVar7 = (int *)(iVar1 + 0x124);
  }
  do {
    piVar8 = piVar7 + 1;
    *piVar7 = iVar4;
    iVar4 = iVar5 + iVar4;
    piVar7 = piVar8;
  } while ((int *)(iVar1 + 0x520) != piVar8);
  *(undefined1 *)((int)param_1 + 0x9f9) = 0x40;
  uVar2 = param_1[0x299];
  *(undefined4 *)((int)param_1 + 0x6e) = uVar2;
  *(undefined2 *)((int)param_1 + 0x72) = 2;
  *(undefined1 *)(param_1 + 0x1e) = 0;
  *(undefined2 *)((int)param_1 + 0x76) = 0x7b;
  *(undefined1 *)((int)param_1 + 6) = 0x40;
  *(undefined1 *)((int)param_1 + 9) = 0;
  *(undefined2 *)((int)param_1 + 10) = 0;
  *(undefined2 *)(param_1 + 3) = 0;
  *(undefined1 *)((int)param_1 + 0xe) = 0;
  *param_1 = 0;
  param_1[0x17] = 0;
  *(undefined4 *)((int)param_1 + 0x42) = 3;
  *(undefined2 *)((int)param_1 + 0x12) = 0;
  *(undefined2 *)(param_1 + 5) = 0;
  *(undefined2 *)((int)param_1 + 0x16) = 0xff;
  *(undefined1 *)(param_1 + 4) = 0;
  param_1[0xbb] = uVar2;
  *(undefined2 *)(param_1 + 0xbc) = 2;
  *(undefined1 *)((int)param_1 + 0x2f6) = 0;
  *(undefined2 *)(param_1 + 0xbd) = 0x7b;
  *(undefined1 *)(param_1 + 0xa1) = 0x40;
  *(undefined1 *)((int)param_1 + 0x287) = 0;
  *(undefined2 *)(param_1 + 0xa2) = 0;
  *(undefined2 *)((int)param_1 + 0x28a) = 0;
  *(undefined1 *)(param_1 + 0xa3) = 0;
  *(undefined4 *)((int)param_1 + 0x27e) = 0;
  *(undefined4 *)((int)param_1 + 0x2da) = 0;
  param_1[0xb0] = 3;
  *(undefined2 *)(param_1 + 0xa4) = 0;
  *(undefined2 *)((int)param_1 + 0x292) = 0;
  *(undefined2 *)(param_1 + 0xa5) = 0xff;
  *(undefined1 *)((int)param_1 + 0x28e) = 0;
  *(undefined4 *)((int)param_1 + 0x56a) = uVar2;
  *(undefined2 *)((int)param_1 + 0x56e) = 2;
  *(undefined1 *)(param_1 + 0x15d) = 0;
  *(undefined2 *)((int)param_1 + 0x572) = 0x7b;
  *(undefined1 *)((int)param_1 + 0x502) = 0x40;
  *(undefined1 *)((int)param_1 + 0x505) = 0;
  *(undefined2 *)((int)param_1 + 0x506) = 0;
  *(undefined2 *)(param_1 + 0x142) = 0;
  *(undefined1 *)((int)param_1 + 0x50a) = 0;
  param_1[0x13f] = 0;
  param_1[0x156] = 0;
  *(undefined4 *)((int)param_1 + 0x53e) = 3;
  *(undefined2 *)((int)param_1 + 0x50e) = 0;
  *(undefined2 *)(param_1 + 0x144) = 0;
  *(undefined2 *)((int)param_1 + 0x512) = 0xff;
  *(undefined1 *)(param_1 + 0x143) = 0;
  param_1[0x1fa] = uVar2;
  *(undefined2 *)(param_1 + 0x1fb) = 2;
  *(undefined1 *)((int)param_1 + 0x7f2) = 0;
  *(undefined2 *)(param_1 + 0x1fc) = 0x7b;
  *(undefined2 *)((int)param_1 + 0x78e) = 0;
  *(undefined1 *)(param_1 + 0x1e0) = 0x40;
  *(undefined2 *)(param_1 + 0x1e3) = 0;
  *(undefined1 *)((int)param_1 + 0x785) = 0;
  *(undefined1 *)((int)param_1 + 0x783) = 0;
  *(undefined1 *)(param_1 + 0x1e1) = 0;
  *(undefined2 *)((int)param_1 + 0x786) = 0;
  *(undefined1 *)(param_1 + 0x1e2) = 0;
  *(undefined4 *)((int)param_1 + 0x77a) = 0;
  *(undefined4 *)((int)param_1 + 0x7d6) = 0;
  param_1[0x1ef] = 3;
  *(undefined2 *)(param_1 + 0x1e4) = 0xff;
  *(undefined1 *)((int)param_1 + 0x78a) = 0;
  *(undefined1 *)((int)param_1 + 0xa02) = 1;
  return;
}



/* --- prt_applyFilter @ 0x21ae --- */

void prt_applyFilter(byte *param_1,int param_2,ushort param_3)

{
  byte bVar1;
  byte bVar2;
  int iVar3;
  uint uVar4;
  uint uVar5;
  int iVar6;
  ushort *puVar7;
  short sVar8;
  
  bVar1 = *param_1;
  bVar2 = param_1[3];
  if ((bVar2 & 7) != 0) {
    uVar4 = 0;
    puVar7 = &DAT_00004258;
    do {
      while( true ) {
        if ((bVar2 & 0x20) == 0) {
          iVar3 = ((uint)*puVar7 * (uint)param_1[1] >> 2) + (uint)param_1[2] * 0x40;
        }
        else {
          iVar3 = (uint)*puVar7 * (uint)param_1[1] + (uint)param_1[2] * 0x100;
        }
        if (param_3 != 0) break;
LAB_00002294:
        uVar4 = uVar4 + 1;
        puVar7 = puVar7 + 1;
        if ((bVar2 & 7) <= (ushort)uVar4) {
          return;
        }
      }
      iVar6 = 0;
      uVar5 = 0;
      if ((uVar4 & 1) == 0) {
        do {
          while( true ) {
            uVar5 = uVar4 + 8 + uVar5;
            sVar8 = (short)iVar6 -
                    (short)(iVar3 + (uint)*(ushort *)(&DAT_00004218 + (uVar5 >> 0xb & 0x1f) * 2) *
                                    0x20 >> 6);
            if (-1 < sVar8) break;
            sVar8 = (short)*(char *)(param_2 + iVar6);
            if (0x7f < sVar8) goto LAB_000022b4;
LAB_0000227e:
            if (sVar8 < -0x80) {
              sVar8 = -0x80;
            }
            *(char *)(param_2 + iVar6) = (char)sVar8;
            iVar6 = iVar6 + 1;
            if (param_3 <= (ushort)iVar6) goto LAB_00002294;
          }
          sVar8 = (short)((uint)((int)(short)*(char *)(param_2 + sVar8) * (int)(short)(ushort)bVar1)
                         >> 8) + (short)*(char *)(param_2 + iVar6);
          if (sVar8 < 0x80) goto LAB_0000227e;
LAB_000022b4:
          *(undefined1 *)(param_2 + iVar6) = 0x7f;
          iVar6 = iVar6 + 1;
        } while ((ushort)iVar6 < param_3);
        goto LAB_00002294;
      }
      do {
        while( true ) {
          uVar5 = uVar4 + 8 + uVar5;
          sVar8 = (short)iVar6 -
                  (short)(iVar3 + (uint)*(ushort *)(&DAT_00004218 + (uVar5 >> 0xb & 0x1f) * 2) *
                                  0x20 >> 6);
          if (sVar8 < 0) {
            sVar8 = 0;
          }
          else {
            sVar8 = (short)*(char *)(param_2 + sVar8);
          }
          sVar8 = (short)((uint)((int)-sVar8 * (int)(short)(ushort)bVar1) >> 8) +
                  (short)*(char *)(param_2 + iVar6);
          if (sVar8 < 0x80) break;
          sVar8 = 0x7f;
LAB_00002312:
          *(char *)(param_2 + iVar6) = (char)sVar8;
          iVar6 = iVar6 + 1;
          if (param_3 <= (ushort)iVar6) goto LAB_0000231c;
        }
        if (-0x81 < sVar8) goto LAB_00002312;
        *(undefined1 *)(param_2 + iVar6) = 0x80;
        iVar6 = iVar6 + 1;
      } while ((ushort)iVar6 < param_3);
LAB_0000231c:
      uVar4 = uVar4 + 1;
      puVar7 = puVar7 + 1;
    } while ((ushort)uVar4 < (bVar2 & 7));
  }
  return;
}



/* --- prt_memcpy @ 0x2344 --- */

void prt_memcpy(undefined4 *param_1,undefined4 *param_2,uint param_3)

{
  undefined1 *puVar1;
  uint uVar2;
  uint uVar3;
  int iVar4;
  undefined4 *puVar5;
  undefined1 *puVar7;
  undefined4 *puVar8;
  undefined4 *puVar6;
  
  uVar3 = param_3 - 1;
  if (param_3 != 0) {
    iVar4 = (int)param_2 + 1;
    if ((uVar3 < 7 || (uint)((int)param_1 - iVar4) < 3) ||
       ((((uint)param_2 | (uint)param_1) & 3) != 0)) {
      while( true ) {
        *(undefined1 *)param_1 = *(undefined1 *)(iVar4 + -1);
        if (iVar4 == param_3 + (int)param_2) break;
        iVar4 = iVar4 + 1;
        param_1 = (undefined4 *)((int)param_1 + 1);
      }
    }
    else {
      puVar5 = param_2;
      puVar8 = param_1;
      do {
        puVar6 = puVar5 + 1;
        *puVar8 = *puVar5;
        puVar5 = puVar6;
        puVar8 = puVar8 + 1;
      } while ((undefined4 *)((int)param_2 + (param_3 & 0xfffffffc)) != puVar6);
      uVar2 = param_3 & 0xfffffffc;
      puVar7 = (undefined1 *)(uVar2 + (int)param_1);
      puVar1 = (undefined1 *)(uVar2 + (int)param_2);
      if (((uVar2 != param_3) && (*puVar7 = *puVar1, uVar3 != uVar2)) &&
         (puVar7[1] = puVar1[1], uVar3 - uVar2 != 1)) {
        puVar7[2] = puVar1[2];
      }
    }
  }
  return;
}



/* --- prt_songInit @ 0x23d0 --- */

int prt_songInit(undefined4 param_1,byte *param_2,char *param_3)

{
  byte bVar1;
  byte bVar2;
  byte bVar3;
  char *pcVar4;
  char *pcVar5;
  int iVar6;
  byte bVar7;
  uint uVar8;
  int iVar9;
  byte *pbVar10;
  byte *pbVar11;
  byte *pbVar12;
  byte *pbVar13;
  char *pcVar15;
  char *pcVar16;
  byte local_6;
  byte local_5;
  int local_4;
  byte *pbVar14;
  
  if ((((*param_3 != 'P') || (param_3[1] != 'R')) || (param_3[2] != 'T')) ||
     (bVar1 = param_3[3], 0x1e < bVar1)) {
    return 0;
  }
  iVar6 = CONCAT31((uint3)(((uint)*(ushort *)(param_3 + 4) << 0x10) >> 8) | (uint3)(byte)param_3[6],
                   param_3[7]);
  pbVar10 = (byte *)(param_3 + iVar6);
  bVar2 = param_3[0x41];
  if (bVar1 < 0x1d) {
    param_2[2] = 1;
    local_5 = param_3[0x3c];
    param_2[0x53c] = local_5;
    bVar7 = param_3[0x3f];
    param_2[0x53e] = bVar7;
    param_2[0x53d] = param_3[0x3d];
    local_6 = param_3[0x3e];
    param_2[0x53f] = local_6;
    param_2[0x540] = 0;
    param_2[0x541] = 0;
    param_2[0x542] = 0;
    param_2[0x543] = 0;
    *param_2 = bVar2;
    *(byte **)(param_2 + 0x118) = pbVar10;
    pcVar5 = param_3 + CONCAT31((uint3)(((uint)*(ushort *)(param_3 + 8) << 0x10) >> 8) |
                                (uint3)(byte)param_3[10],param_3[0xb]);
    *(char **)(param_2 + 10) = pcVar5;
    pbVar12 = (byte *)(param_3 +
                      CONCAT31((uint3)(((uint)*(ushort *)(param_3 + 0xc) << 0x10) >> 8) |
                               (uint3)(byte)param_3[0xe],param_3[0xf]));
    local_4 = 0;
    iVar9 = 0x20;
    *(byte **)(param_2 + 0x520) = pbVar12;
    iVar6 = 0;
  }
  else {
    bVar7 = param_3[0x5a];
    param_2[2] = bVar7;
    uVar8 = 0;
    if (bVar7 != 0) {
      pbVar12 = param_2 + 0x53c;
      uVar8 = (uint)bVar7;
      pbVar14 = pbVar10 + (uint)bVar7 * 8;
      do {
        *pbVar12 = *pbVar10;
        pbVar12[1] = pbVar10[1];
        pbVar12[2] = pbVar10[2];
        pbVar12[3] = pbVar10[3];
        pbVar12[4] = pbVar10[4];
        pbVar12[5] = pbVar10[5];
        pbVar12[6] = pbVar10[6];
        pbVar12[7] = pbVar10[7];
        pbVar10 = pbVar10 + 8;
        pbVar12 = pbVar12 + 8;
      } while (pbVar14 != pbVar10);
    }
    *param_2 = bVar2;
    pbVar10 = (byte *)(param_3 + iVar6 + uVar8 * 8);
    local_5 = param_2[0x53c];
    local_6 = param_2[0x53f];
    bVar7 = param_2[0x53e];
    local_4 = *(int *)(param_2 + 0x540);
    *(byte **)(param_2 + 0x118) = pbVar10;
    pcVar5 = param_3 + CONCAT31((uint3)(((uint)*(ushort *)(param_3 + 8) << 0x10) >> 8) |
                                (uint3)(byte)param_3[10],param_3[0xb]);
    *(char **)(param_2 + 10) = pcVar5;
    pbVar12 = (byte *)(param_3 +
                      CONCAT31((uint3)(((uint)*(ushort *)(param_3 + 0xc) << 0x10) >> 8) |
                               (uint3)(byte)param_3[0xe],param_3[0xf]));
    if (bVar1 == 0x1e) {
      iVar9 = 0x40;
      *(byte **)(param_2 + 0x520) = pbVar12;
      iVar6 = 0;
    }
    else {
      iVar9 = 0x20;
      *(byte **)(param_2 + 0x520) = pbVar12;
      iVar6 = 0;
    }
  }
  do {
    pbVar14 = pbVar12 + 0x17;
    do {
      pbVar11 = pbVar12;
      pbVar12 = pbVar11 + 1;
      if (*pbVar11 == 0) break;
    } while (pbVar14 != pbVar12);
    iVar6 = iVar6 + 1;
  } while (iVar9 != iVar6);
  *(byte **)(param_2 + 0x11c) = pbVar12;
  bVar3 = param_3[0x40];
  pbVar12 = pbVar12 + (uint)bVar3 * 8;
  if (bVar3 != 0) {
    pbVar14 = param_2 + 0xe;
    do {
      pbVar11 = pbVar11 + 8;
      pbVar13 = pbVar14 + 4;
      *(byte **)pbVar14 = pbVar12;
      pbVar12 = pbVar12 + (uint)*pbVar11 * 3;
      pbVar14 = pbVar13;
    } while (param_2 + 0xe + (uint)bVar3 * 4 != pbVar13);
  }
  pcVar16 = param_3 + CONCAT31((uint3)(((uint)*(ushort *)(param_3 + 0x10) << 0x10) >> 8) |
                               (uint3)(byte)param_3[0x12],param_3[0x13]);
  iVar6 = 0x18;
  do {
    pcVar4 = pcVar16 + 0x17;
    do {
      pcVar15 = pcVar16;
      pcVar16 = pcVar15 + 1;
      if (*pcVar15 == '\0') break;
    } while (pcVar4 != pcVar16);
    iVar6 = iVar6 + -1;
    if (iVar6 == 0) {
      if (((uint)pcVar16 & 1) != 0) {
        pcVar16 = pcVar15 + 2;
      }
      *(char **)(param_2 + 0x120) = pcVar16;
      if (bVar1 < 0x1a) {
        iVar6 = 0;
        do {
          param_2[iVar6 + 0x524] = (byte)iVar6;
          iVar6 = iVar6 + 1;
        } while (iVar6 != 0x18);
        *(ushort *)(param_2 + 0x110) = (ushort)local_6;
        *(byte **)(param_2 + 0x114) = pbVar10;
        param_2[0x10e] = 0;
        param_2[0x10f] = 0;
        *(ushort *)(param_2 + 0x112) = (ushort)local_5;
        param_2[1] = bVar7;
        *(ushort *)(param_2 + 4) = (ushort)bVar7;
        pcVar5 = pcVar5 + local_4;
        *(char **)(param_2 + 6) = pcVar5;
        iVar6 = (uint)bVar7 * 3;
        pbVar10 = param_2 + 0x124;
      }
      else {
        prt_memcpy(param_2 + 0x524,param_3 + 0x42,0x18);
        *(ushort *)(param_2 + 0x110) = (ushort)local_6;
        *(byte **)(param_2 + 0x114) = pbVar10;
        param_2[0x10e] = 0;
        param_2[0x10f] = 0;
        *(ushort *)(param_2 + 0x112) = (ushort)local_5;
        param_2[1] = bVar7;
        *(ushort *)(param_2 + 4) = (ushort)bVar7;
        pcVar5 = pcVar5 + local_4;
        *(char **)(param_2 + 6) = pcVar5;
        iVar6 = (uint)bVar7 * 3;
        pbVar10 = param_2 + 0x124;
      }
      do {
        pbVar12 = pbVar10 + 4;
        *(char **)pbVar10 = pcVar5;
        pcVar5 = pcVar5 + iVar6;
        pbVar10 = pbVar12;
      } while (pbVar12 != param_2 + 0x520);
      if (bVar2 != 0) {
        pbVar10 = (byte *)(pcVar16 + 0x14);
        iVar6 = 2;
        do {
          bVar1 = pbVar10[5];
          bVar7 = *pbVar10;
          while (uVar8 = (bVar1 + 1) * 0x80, (bVar7 & 4) != 0) {
            iVar6 = uVar8 + (uVar8 >> 1) + (uVar8 >> 2) + (uVar8 >> 3) + iVar6;
            pbVar12 = pbVar10 + 0x2a;
            if (pbVar12 == (byte *)(pcVar16 + (uint)bVar2 * 0x2a + 0x14)) {
              return iVar6;
            }
            bVar1 = pbVar10[0x2f];
            pbVar10 = pbVar12;
            bVar7 = *pbVar12;
          }
          iVar6 = uVar8 + iVar6;
          pbVar10 = pbVar10 + 0x2a;
        } while (pbVar10 != (byte *)(pcVar16 + (uint)bVar2 * 0x2a + 0x14));
        return iVar6;
      }
      return 2;
    }
  } while( true );
}



/* --- prt_memset @ 0x2798 --- */

void prt_memset(byte *param_1,byte param_2,int param_3)

{
  uint uVar1;
  uint uVar2;
  uint uVar3;
  byte *pbVar4;
  byte *pbVar6;
  byte *pbVar5;
  
  uVar3 = param_3 - 1;
  if (param_3 != 0) {
    uVar1 = -(int)param_1 & 3;
    if (5 < uVar3) {
      pbVar6 = param_1;
      if (uVar1 != 0) {
        pbVar6 = param_1 + 1;
        *param_1 = param_2;
        uVar3 = param_3 - 2;
        if (uVar1 != 1) {
          pbVar6 = param_1 + 2;
          param_1[1] = param_2;
          uVar3 = param_3 - 3;
          if (uVar1 == 3) {
            pbVar6 = param_1 + 3;
            param_1[2] = param_2;
            uVar3 = param_3 - 4;
          }
        }
      }
      uVar2 = param_3 - uVar1;
      pbVar5 = param_1 + uVar1;
      do {
        pbVar4 = pbVar5 + 4;
        *(uint *)pbVar5 =
             CONCAT31((uint3)param_2 | (uint3)(((uint)CONCAT11(param_2,param_2) << 0x10) >> 8),
                      param_2);
        pbVar5 = pbVar4;
      } while (param_1 + uVar1 + (uVar2 & 0xfffffffc) != pbVar4);
      uVar1 = uVar2 & 0xfffffffc;
      param_1 = pbVar6 + uVar1;
      uVar3 = uVar3 - uVar1;
      if (uVar1 == uVar2) {
        return;
      }
    }
    *param_1 = param_2;
    if ((((uVar3 != 0) && (param_1[1] = param_2, uVar3 != 1)) && (param_1[2] = param_2, uVar3 != 2))
       && ((param_1[3] = param_2, uVar3 != 3 && (param_1[4] = param_2, uVar3 != 4)))) {
      param_1[5] = param_2;
    }
  }
  return;
}



/* --- prt_playerInit @ 0x2866 --- */

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void prt_playerInit(undefined4 *param_1,undefined1 *param_2,byte *param_3)

{
  byte bVar1;
  byte bVar2;
  bool bVar3;
  uint uVar4;
  short sVar12;
  uint uVar5;
  char cVar18;
  undefined1 uVar19;
  char *pcVar6;
  byte bVar20;
  int iVar7;
  int iVar8;
  undefined4 uVar9;
  int iVar10;
  int iVar11;
  ushort uVar13;
  short sVar14;
  undefined2 uVar15;
  ushort uVar16;
  short sVar17;
  byte bVar22;
  ushort uVar21;
  uint uVar23;
  uint uVar24;
  int iVar25;
  byte bVar26;
  short sVar27;
  int iVar28;
  ushort uVar29;
  uint uVar30;
  int iVar31;
  ushort uVar32;
  short *psVar33;
  byte *pbVar35;
  int iVar36;
  byte *pbVar37;
  undefined2 *puVar38;
  short sVar42;
  int *piVar39;
  int *piVar40;
  char *pcVar41;
  short sVar43;
  char cVar46;
  char *pcVar44;
  char *pcVar45;
  char *pcVar47;
  char *pcVar48;
  int iVar49;
  ushort *puVar50;
  undefined4 *local_6a;
  undefined2 *local_66;
  ushort local_62;
  ushort local_5e;
  byte local_4d;
  byte local_44;
  uint local_32;
  char local_4 [4];
  short *psVar34;
  
  prt_memset(param_1,0,0x1c76);
  if (DAT_000044e2 == 0) {
    puVar38 = &DAT_000044e2;
    uVar21 = DAT_000044e0;
    do {
      uVar13 = puVar38[0xf];
      iVar36 = (int)((uint)uVar13 * 0x10000 + (uint)uVar21 * -0x10000) >> 4;
      iVar49 = iVar36 + (uint)uVar21 * 0x10000;
      *puVar38 = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[1] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[2] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[3] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[4] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[5] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[6] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[7] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[8] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[9] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[10] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0xb] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0xc] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0xd] = (short)((uint)iVar49 >> 0x10);
      puVar38[0xe] = (short)((uint)(iVar49 + iVar36) >> 0x10);
      if (puVar38 + 0x10 == (undefined2 *)&DAT_00004962) break;
      uVar21 = puVar38[0x1f];
      iVar36 = (int)((uint)uVar21 * 0x10000 + (uint)uVar13 * -0x10000) >> 4;
      iVar49 = iVar36 + (uint)uVar13 * 0x10000;
      puVar38[0x10] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x11] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x12] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x13] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x14] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x15] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x16] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x17] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x18] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x19] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x1a] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x1b] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x1c] = (short)((uint)iVar49 >> 0x10);
      iVar49 = iVar36 + iVar49;
      puVar38[0x1d] = (short)((uint)iVar49 >> 0x10);
      puVar38[0x1e] = (short)((uint)(iVar49 + iVar36) >> 0x10);
      puVar38 = puVar38 + 0x20;
    } while (puVar38 != (undefined2 *)&DAT_00004962);
  }
  sVar17 = 0;
  psVar33 = &DAT_00004964;
  do {
    psVar34 = psVar33 + 1;
    *psVar33 = sVar17;
    sVar17 = sVar17 + 3;
    psVar33 = psVar34;
  } while (psVar34 != (short *)&DAT_00004b62);
  uVar21 = *(ushort *)(param_3 + 4);
  iVar49 = *(int *)(param_3 + 6);
  pbVar37 = param_3 + 0x124;
  do {
    pbVar35 = pbVar37 + 4;
    *(int *)pbVar37 = iVar49;
    iVar49 = ((uint)uVar21 * 3 & 0xffff) + iVar49;
    pbVar37 = pbVar35;
  } while (param_3 + 0x520 != pbVar35);
  *(undefined1 *)((int)param_1 + 0xa02) = 0;
  *(byte **)((int)param_1 + 0x9fe) = param_3;
  *(undefined1 *)(param_1 + 0x27e) = 0;
  *(undefined2 *)((int)param_1 + 0x9fa) = 0xffff;
  *(undefined2 *)(param_1 + 0x27f) = 0x600;
  *(undefined1 *)(param_1 + 0x71d) = 0;
  uVar9 = *(undefined4 *)(param_3 + 0x120);
  *(undefined1 *)((int)param_1 + 6) = 0x40;
  *(undefined2 *)((int)param_1 + 0x12) = 0;
  *(undefined2 *)(param_1 + 5) = 0;
  *(undefined2 *)((int)param_1 + 0x16) = 0xff;
  *(undefined1 *)(param_1 + 6) = 0;
  *(undefined2 *)(param_1 + 2) = 0;
  *(undefined2 *)((int)param_1 + 10) = 0;
  *(undefined2 *)(param_1 + 3) = 0;
  *(undefined1 *)((int)param_1 + 0xe) = 0;
  *param_1 = 0;
  param_1[0x17] = 0;
  *(undefined4 *)((int)param_1 + 0x42) = 3;
  *(undefined4 *)((int)param_1 + 0x3e) = uVar9;
  *(undefined1 *)(param_1 + 0xa1) = 0x40;
  *(undefined2 *)(param_1 + 0xa4) = 0;
  *(undefined2 *)((int)param_1 + 0x292) = 0;
  *(undefined2 *)(param_1 + 0xa5) = 0xff;
  *(undefined1 *)((int)param_1 + 0x296) = 0;
  *(undefined2 *)((int)param_1 + 0x286) = 0;
  *(undefined2 *)(param_1 + 0xa2) = 0;
  *(undefined2 *)((int)param_1 + 0x28a) = 0;
  *(undefined1 *)(param_1 + 0xa3) = 0;
  *(undefined4 *)((int)param_1 + 0x27e) = 0;
  *(undefined4 *)((int)param_1 + 0x2da) = 0;
  param_1[0xb0] = 3;
  param_1[0xaf] = uVar9;
  *(undefined1 *)((int)param_1 + 0x502) = 0x40;
  *(undefined2 *)((int)param_1 + 0x50e) = 0;
  *(undefined2 *)(param_1 + 0x144) = 0;
  *(undefined2 *)((int)param_1 + 0x512) = 0xff;
  *(undefined1 *)(param_1 + 0x145) = 0;
  *(undefined2 *)(param_1 + 0x141) = 0;
  *(undefined2 *)((int)param_1 + 0x506) = 0;
  *(undefined2 *)(param_1 + 0x142) = 0;
  *(undefined1 *)((int)param_1 + 0x50a) = 0;
  param_1[0x13f] = 0;
  param_1[0x156] = 0;
  *(undefined4 *)((int)param_1 + 0x53e) = 3;
  *(undefined4 *)((int)param_1 + 0x53a) = uVar9;
  *(undefined1 *)(param_1 + 0x1e0) = 0x40;
  *(undefined2 *)(param_1 + 0x1e3) = 0;
  *(undefined2 *)((int)param_1 + 0x78e) = 0;
  *(undefined2 *)(param_1 + 0x1e4) = 0xff;
  *(undefined1 *)((int)param_1 + 0x792) = 0;
  *(undefined2 *)((int)param_1 + 0x782) = 0;
  *(undefined2 *)(param_1 + 0x1e1) = 0;
  *(undefined2 *)((int)param_1 + 0x786) = 0;
  *(undefined1 *)(param_1 + 0x1e2) = 0;
  *(undefined4 *)((int)param_1 + 0x77a) = 0;
  *(undefined4 *)((int)param_1 + 0x7d6) = 0;
  param_1[0x1ef] = 3;
  param_1[0x1ee] = uVar9;
  local_66 = &DAT_000043a8;
  local_6a = param_1 + 0x2fa;
  iVar49 = 0;
  do {
    uVar4 = prt_divs32(0x400000,*local_66);
    *(char *)local_6a = (char)uVar4;
    sVar12 = prt_divu32(0xff00,uVar4);
    uVar5 = uVar4 >> 1;
    sVar17 = -(short)(uVar4 >> 2);
    uVar30 = 0;
    uVar21 = 0;
    sVar42 = 0;
    do {
      while( true ) {
        cVar18 = (char)((ushort)sVar42 >> 8);
        if (-1 < sVar17) break;
        iVar36 = (int)(short)((short)uVar4 + sVar17);
        if (uVar30 <= uVar5) goto LAB_00002cec;
LAB_00002a70:
        cVar46 = cVar18 * -2 + '\x7f';
        uVar19 = 0x80;
LAB_00002a78:
        iVar28 = uVar30 + iVar49 * 0x181;
        *(char *)((int)param_1 + iVar28 + 0xa68) = '\x7f' - cVar18;
        *(char *)((int)param_1 + iVar36 + iVar49 * 0x181 + 0xb68) = cVar46;
        *(undefined1 *)((int)param_1 + iVar28 + 0xae8) = uVar19;
        sVar42 = sVar12 + sVar42;
        uVar21 = uVar21 + 1;
        uVar30 = (uint)uVar21;
        sVar17 = sVar17 + 1;
        if (uVar4 <= uVar30) goto LAB_00002a9c;
      }
      iVar36 = (int)sVar17;
      if (uVar5 < uVar30) goto LAB_00002a70;
LAB_00002cec:
      cVar46 = cVar18 * '\x02' + -0x80;
      uVar19 = 0x7f;
      if (uVar5 != uVar30) goto LAB_00002a78;
      iVar28 = uVar30 + iVar49 * 0x181;
      *(char *)((int)param_1 + iVar28 + 0xa68) = '\x7f' - cVar18;
      *(char *)((int)param_1 + iVar36 + iVar49 * 0x181 + 0xb68) = cVar46;
      *(undefined1 *)((int)param_1 + iVar28 + 0xae8) = 0x80;
      sVar42 = sVar12 + sVar42;
      uVar21 = uVar21 + 1;
      uVar30 = (uint)uVar21;
      sVar17 = sVar17 + 1;
    } while (uVar30 < uVar4);
LAB_00002a9c:
    iVar49 = iVar49 + 1;
    local_6a = (undefined4 *)((int)local_6a + 0x181);
    local_66 = local_66 + 1;
  } while (iVar49 != 0xc);
  if (param_2 != (undefined1 *)0x0) {
    param_1[0x299] = param_2;
    *param_2 = 0;
    *(undefined1 *)(param_1[0x299] + 1) = 0;
    bVar1 = *param_3;
    if (bVar1 != 0) {
      iVar49 = param_1[0x299];
      pbVar37 = (byte *)(*(int *)(param_3 + 0x120) + 0x14);
      iVar36 = 2;
      piVar39 = param_1 + 0x281;
      do {
        while( true ) {
          piVar40 = piVar39 + 1;
          *piVar39 = iVar36 + iVar49;
          uVar4 = (pbVar37[5] + 1) * 0x80;
          piVar39 = piVar40;
          if ((*pbVar37 & 4) == 0) break;
          iVar36 = uVar4 + (uVar4 >> 2) + (uVar4 >> 1) + (uVar4 >> 3) + iVar36;
          pbVar37 = pbVar37 + 0x2a;
          if (param_1 + bVar1 + 0x281 == piVar40) goto LAB_00002b3a;
        }
        iVar36 = uVar4 + iVar36;
        pbVar37 = pbVar37 + 0x2a;
      } while (param_1 + bVar1 + 0x281 != piVar40);
      if ((_DAT_00dff004 >> 8 & 0x1ff) == 200) goto LAB_00002b60;
    }
  }
LAB_00002b3a:
  do {
  } while ((_DAT_00dff004 >> 8 & 0x1ff) != 200);
LAB_00002b60:
  do {
  } while ((_DAT_00dff004 >> 8 & 0x1ff) != 199);
  _DAT_00dff09a = 0x780;
  _DAT_00dff09c = 0x780;
  DAT_00bfe001 = DAT_00bfe001 | 2;
  do {
  } while ((_DAT_00dff004 >> 8 & 0x1ff) != 200);
  do {
  } while ((_DAT_00dff004 >> 8 & 0x1ff) != 199);
  _DAT_00dff0a0 = 0;
  _DAT_00dff0a4 = 2;
  _DAT_00dff0a8 = 0;
  _DAT_00dff0a6 = 0;
  _DAT_00dff0b0 = 0;
  _DAT_00dff0b4 = 2;
  _DAT_00dff0b8 = 0;
  _DAT_00dff0b6 = 0;
  _DAT_00dff0c0 = 0;
  _DAT_00dff0c4 = 2;
  _DAT_00dff0c8 = 0;
  _DAT_00dff0c6 = 0;
  _DAT_00dff0d0 = 0;
  _DAT_00dff0d4 = 2;
  _DAT_00dff0d8 = 0;
  _DAT_00dff0d6 = 0;
  _DAT_00dff096 = 0x820f;
  do {
  } while ((_DAT_00dff004 >> 8 & 0x1ff) != 200);
  do {
  } while ((_DAT_00dff004 >> 8 & 0x1ff) != 199);
  if (*param_3 == 0) {
    return;
  }
  local_32 = 0;
LAB_00002d7e:
  bVar1 = param_3[local_32 + 0x524];
  puVar50 = (ushort *)((uint)bVar1 * 0x2a + *(int *)(*(int *)((int)param_1 + 0x9fe) + 0x120));
  pcVar48 = (char *)param_1[bVar1 + 0x281];
  iVar49 = *(byte *)((int)puVar50 + 0x19) + 1;
  pcVar6 = (char *)(iVar49 * 0x80);
  prt_memset(pcVar48,0,pcVar6);
  cVar18 = *(char *)((int)puVar50 + 0x17);
  local_4[0] = cVar18;
  local_4[1] = cVar18 + *(char *)(puVar50 + 7);
  local_4[2] = cVar18 + *(char *)((int)puVar50 + 0xf);
  local_4[3] = cVar18 + *(char *)(puVar50 + 8);
  bVar20 = *(byte *)((int)puVar50 + 0x29) >> 3;
  bVar3 = false;
  uVar4 = (uint)(*(char *)(puVar50 + 8) == '\0' &&
                (*(char *)((int)puVar50 + 0xf) == '\0' && *(char *)(puVar50 + 7) == '\0'));
  pcVar47 = pcVar48 + (int)pcVar6;
  local_6a = (undefined4 *)0x0;
  pcVar45 = (char *)0x0;
  do {
    do {
      cVar46 = local_4[(int)local_6a];
      if ((local_6a == (undefined4 *)0x0) || (pcVar44 = pcVar45, cVar46 != cVar18)) {
        iVar36 = (int)(short)cVar46;
        if (cVar46 < 0xc) {
          if (-1 < iVar36) {
            sVar17 = 0;
            iVar28 = iVar36;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0xc) {
            sVar17 = -1;
            iVar28 = iVar36 + 0xc;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x18) {
            sVar17 = -2;
            iVar28 = iVar36 + 0x18;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x24) {
            sVar17 = -3;
            iVar28 = iVar36 + 0x24;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x30) {
            sVar17 = -4;
            iVar28 = iVar36 + 0x30;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x3c) {
            sVar17 = -5;
            iVar28 = iVar36 + 0x3c;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x48) {
            sVar17 = -6;
            iVar28 = iVar36 + 0x48;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x54) {
            sVar17 = -7;
            iVar28 = iVar36 + 0x54;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x60) {
            sVar17 = -8;
            iVar28 = iVar36 + 0x60;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x6c) {
            sVar17 = -9;
            iVar28 = iVar36 + 0x6c;
            goto LAB_00002eec;
          }
          if (-1 < iVar36 + 0x78) {
            sVar17 = -10;
            iVar28 = iVar36 + 0x78;
            goto LAB_00002eec;
          }
          sVar17 = -0xb;
          pcVar41 = (char *)((int)param_1 + (iVar36 + 0x84) * 0x181 + 0xa68);
          local_62._0_1_ = *(byte *)(puVar50 + 10);
          bVar22 = local_62._0_1_ & 3;
          pcVar44 = pcVar41;
          if (bVar22 != 0) goto LAB_000035a8;
LAB_00002f0e:
          uVar5 = (uint)sVar17;
          if (sVar17 < 1) goto LAB_000035be;
LAB_00002f18:
          uVar30 = 0x8000 << (uVar5 & 0x3f);
LAB_00002f22:
          local_4d = *(byte *)((int)puVar50 + 0x15);
          local_44 = *(byte *)((int)puVar50 + 0x11);
          uVar23 = (uint)(byte)pcVar41[0x180];
          cVar46 = *(char *)((int)puVar50 + 0x21);
          sVar12 = (short)cVar46;
          if ((local_62._0_1_ & 0x10) != 0) goto LAB_00003602;
LAB_00002f52:
          local_62._0_1_ = local_62._0_1_ & 0x10;
          iVar28 = (int)sVar12;
          if ('\0' < cVar46) {
            iVar28 = (int)sVar12 * (int)sVar12;
          }
        }
        else {
          if (iVar36 + -0xc < 0xc) {
            sVar17 = 1;
            iVar28 = iVar36 + -0xc;
          }
          else if (iVar36 + -0x18 < 0xc) {
            sVar17 = 2;
            iVar28 = iVar36 + -0x18;
          }
          else if (iVar36 + -0x24 < 0xc) {
            sVar17 = 3;
            iVar28 = iVar36 + -0x24;
          }
          else if (iVar36 + -0x30 < 0xc) {
            sVar17 = 4;
            iVar28 = iVar36 + -0x30;
          }
          else if (iVar36 + -0x3c < 0xc) {
            sVar17 = 5;
            iVar28 = iVar36 + -0x3c;
          }
          else if (iVar36 + -0x48 < 0xc) {
            sVar17 = 6;
            iVar28 = iVar36 + -0x48;
          }
          else if (iVar36 + -0x54 < 0xc) {
            sVar17 = 7;
            iVar28 = iVar36 + -0x54;
          }
          else if (iVar36 + -0x60 < 0xc) {
            sVar17 = 8;
            iVar28 = iVar36 + -0x60;
          }
          else if (iVar36 + -0x6c < 0xc) {
            sVar17 = 9;
            iVar28 = iVar36 + -0x6c;
          }
          else {
            sVar17 = 10;
            iVar28 = iVar36 + -0x78;
          }
LAB_00002eec:
          pcVar41 = (char *)((int)param_1 + iVar28 * 0x181 + 0xa68);
          local_62._0_1_ = *(byte *)(puVar50 + 10);
          bVar22 = local_62._0_1_ & 3;
          pcVar44 = pcVar41;
          if (bVar22 == 0) goto LAB_00002f0e;
LAB_000035a8:
          if (bVar22 != 1) {
            pcVar44 = pcVar45;
            if (bVar22 == 2) {
              pcVar44 = pcVar41 + 0x80;
            }
            goto LAB_00002f0e;
          }
          pcVar44 = pcVar41 + 0x100;
          uVar5 = (uint)sVar17;
          if (0 < sVar17) goto LAB_00002f18;
LAB_000035be:
          if (sVar17 == 0) {
            uVar30 = 0x8000;
            goto LAB_00002f22;
          }
          uVar30 = 0x8000 >> (-uVar5 & 0x3f);
          local_4d = *(byte *)((int)puVar50 + 0x15);
          local_44 = *(byte *)((int)puVar50 + 0x11);
          uVar23 = (uint)(byte)pcVar41[0x180];
          cVar46 = *(char *)((int)puVar50 + 0x21);
          sVar12 = (short)cVar46;
          if ((local_62._0_1_ & 0x10) == 0) goto LAB_00002f52;
LAB_00003602:
          if (cVar46 < '\x01') {
            iVar28 = (int)sVar12 * (int)(short)(2 << (uVar5 & 0x3f));
            local_62._0_1_ = 1;
          }
          else {
            local_62._0_1_ = 1;
            iVar28 = (int)sVar12 * (int)sVar12;
          }
        }
        iVar28 = iVar28 << 10;
        bVar22 = *(byte *)(puVar50 + 0xc);
        uVar24 = uVar23 * 0x8000;
        iVar7 = (0xf - uVar5) * 8;
        bVar26 = *(byte *)((int)puVar50 + 0x13);
        iVar31 = (uint)bVar26 * 0x800;
        uVar5 = (uint)local_4d;
        bVar2 = *(byte *)(puVar50 + 0xb);
        iVar8 = prt_mulu32(uVar5 << 0xe,iVar7);
        iVar8 = iVar8 >> 8;
        iVar7 = prt_mulu32((uint)bVar2 << 0xe,iVar7);
        iVar7 = iVar7 >> 8;
        if (iVar7 < iVar8) {
          iVar31 = (uint)bVar26 * -0x800;
          uVar9 = prt_mulu32(local_44,uVar30);
          iVar10 = prt_mulu32((int)local_6a + uVar4,uVar9);
          iVar11 = prt_mulu32(uVar5,uVar30);
          iVar11 = iVar11 + iVar10;
          iVar10 = iVar7;
          iVar7 = iVar8;
        }
        else {
          uVar9 = prt_mulu32(local_44,uVar30);
          iVar10 = prt_mulu32((int)local_6a + uVar4,uVar9);
          iVar11 = prt_mulu32(uVar5,uVar30);
          iVar11 = iVar11 + iVar10;
          iVar10 = iVar8;
        }
        for (; (int)uVar24 < iVar11; iVar11 = iVar11 + uVar23 * -0x8000) {
        }
        if (pcVar44 == (char *)0x0) {
          iVar8 = 0x8000;
          if (sVar17 < 0) {
            iVar36 = -iVar36;
            sVar17 = prt_divs32(iVar36,0xc);
            if (sVar17 == -1) {
              uVar5 = prt_mods32(iVar36,0xc);
              iVar8 = prt_mulu32(0xc - (uVar5 & 0xffff),0xaaa);
              iVar8 = iVar8 + 0x8000;
            }
            else {
              do {
                iVar8 = iVar8 >> 1;
                sVar17 = sVar17 + -1;
              } while (sVar17 != -1);
              uVar15 = prt_divs32(iVar8,0xc);
              uVar5 = prt_mods32(iVar36,0xc);
              iVar36 = prt_mulu32(0xc - (uVar5 & 0xffff),uVar15);
              iVar8 = iVar36 + iVar8;
            }
          }
          if (iVar49 != 0) {
            uVar21 = (ushort)local_44 + (ushort)local_4d + 1;
            iVar7 = 0;
            iVar36 = 0x8000;
            pcVar45 = pcVar48;
            iVar31 = iVar8;
            do {
              uVar21 = uVar21 ^ uVar21 << 0xd;
              uVar21 = uVar21 >> 9 ^ uVar21;
              uVar21 = uVar21 ^ uVar21 << 7;
              if (iVar36 != 0x8000) {
                iVar36 = (iVar36 + -0x8000) - (iVar36 - 0x8001U & 0xffff8000);
              }
              local_5e = (ushort)bVar22;
              iVar11 = (int)(short)(char)uVar21 * (int)(short)local_5e >> 7;
              if ((short)iVar11 < 0x80) {
                if (-0x81 < (short)iVar11) goto LAB_00003892;
                cVar46 = *pcVar45 + -0x80;
              }
              else {
                iVar11 = 0x7f;
LAB_00003892:
                cVar46 = *pcVar45 + (char)iVar11;
              }
              do {
                pcVar41 = pcVar45 + 1;
                *pcVar45 = cVar46;
                iVar36 = iVar31 + iVar36;
                if (iVar28 != 0) {
                  iVar7 = iVar28 + iVar7;
                  iVar31 = iVar8 + (iVar7 >> 10);
                  if (local_62._0_1_ != 0) {
                    iVar28 = iVar28 - (iVar28 >> 7);
                  }
                  if (iVar31 < 0x200) {
                    iVar28 = 0;
                    iVar36 = 0;
                    iVar31 = 0x200;
                  }
                }
                if (pcVar41 == pcVar47) goto LAB_000030c4;
                pcVar45 = pcVar41;
              } while (iVar36 < 0x8000);
            } while( true );
          }
        }
        else {
          uVar5 = uVar30;
          if (bVar3) {
            uVar5 = uVar30 + ((int)uVar30 >> (9 - (bVar20 & 3) & 0x3f));
          }
          if (iVar49 != 0) {
            if (local_62._0_1_ != 0) {
              iVar36 = 0;
              iVar25 = iVar11 - iVar8;
              local_62 = (ushort)bVar22;
              pcVar45 = pcVar48;
              if (iVar25 < 0) goto LAB_000036f2;
LAB_00003688:
              sVar17 = (short)((int)(short)pcVar44[iVar25 >> 0xf] * (int)(short)local_62 >> 7) +
                       (short)*pcVar45;
              if (sVar17 < 0x80) goto LAB_0000370a;
              do {
                sVar17 = 0x7f;
                pcVar41 = pcVar45;
                while( true ) {
                  pcVar45 = pcVar41 + 1;
                  *pcVar41 = (char)sVar17;
                  iVar11 = uVar5 + iVar11;
                  if ((int)uVar24 <= iVar11) {
                    iVar11 = iVar11 + uVar23 * -0x8000;
                    iVar25 = iVar31 + iVar8;
                    if (iVar7 <= iVar31 + iVar8) {
                      iVar31 = -iVar31;
                      iVar25 = iVar7;
                    }
                    iVar8 = iVar25;
                    if (iVar25 <= iVar10) {
                      iVar31 = -iVar31;
                      iVar8 = iVar10;
                    }
                  }
                  if (iVar28 != 0) {
                    iVar36 = iVar28 + iVar36;
                    uVar5 = uVar30 + (iVar36 >> 10);
                    iVar28 = iVar28 - (iVar28 >> 7);
                    if (uVar24 <= uVar5) {
                      iVar28 = 0;
                      uVar5 = 0;
                    }
                  }
                  if (pcVar45 == pcVar47) goto LAB_000030c4;
                  iVar25 = iVar11 - iVar8;
                  if (-1 < iVar25) goto LAB_00003688;
LAB_000036f2:
                  sVar17 = (short)((int)(short)*pcVar44 * (int)(short)local_62 >> 7) +
                           (short)*pcVar45;
                  if (0x7f < sVar17) break;
LAB_0000370a:
                  pcVar41 = pcVar45;
                  if (sVar17 < -0x80) {
                    sVar17 = -0x80;
                  }
                }
              } while( true );
            }
            iVar36 = 0;
            pcVar45 = pcVar48;
            do {
              if (iVar11 - iVar8 < 0) {
                cVar46 = *pcVar44;
              }
              else {
                cVar46 = pcVar44[iVar11 - iVar8 >> 0xf];
              }
              local_62 = (ushort)bVar22;
              sVar17 = (short)((int)(short)cVar46 * (int)(short)local_62 >> 7) + (short)*pcVar45;
              if (sVar17 < 0x80) {
                if (sVar17 < -0x80) {
                  sVar17 = -0x80;
                }
              }
              else {
                sVar17 = 0x7f;
              }
              pcVar41 = pcVar45 + 1;
              *pcVar45 = (char)sVar17;
              iVar11 = uVar5 + iVar11;
              if ((int)uVar24 <= iVar11) {
                iVar11 = iVar11 + uVar23 * -0x8000;
                iVar25 = iVar31 + iVar8;
                if (iVar7 <= iVar31 + iVar8) {
                  iVar31 = -iVar31;
                  iVar25 = iVar7;
                }
                iVar8 = iVar25;
                if (iVar25 <= iVar10) {
                  iVar31 = -iVar31;
                  iVar8 = iVar10;
                }
              }
              if (iVar28 != 0) {
                iVar36 = iVar28 + iVar36;
                uVar5 = uVar30 + (iVar36 >> 10);
                if (uVar24 <= uVar5) {
                  iVar28 = 0;
                  uVar5 = 0;
                }
              }
              pcVar45 = pcVar41;
            } while (pcVar41 != pcVar47);
          }
        }
      }
LAB_000030c4:
      local_6a = (undefined4 *)((int)local_6a + 1);
      pcVar45 = pcVar44;
    } while (local_6a != (undefined4 *)0x4);
    if ((((bVar20 & 3) == 0) || (pcVar44 == (char *)0x0)) || (bVar3)) break;
    bVar3 = true;
    local_6a = (undefined4 *)0x0;
  } while( true );
  cVar18 = *(char *)((int)puVar50 + 0x1f);
  if (cVar18 != '\0') {
    local_66 = (undefined2 *)((short)*(char *)((int)puVar50 + 0x25) * 0x80);
    iVar36 = (uint)*(byte *)(puVar50 + 0x11) * 0x100;
    iVar28 = (uint)*(byte *)((int)puVar50 + 0x23) << 8;
    iVar8 = (uint)*(byte *)(puVar50 + 0x12) << 8;
    if (iVar49 != 0) {
      pcVar47 = pcVar48 + 0x40;
      bVar20 = ~*(byte *)((int)puVar50 + 0x23);
      bVar22 = ~*(byte *)(puVar50 + 0x12);
      sVar27 = 0;
      sVar42 = 0;
      sVar12 = 0;
      sVar17 = 0;
      iVar49 = iVar36 + (int)local_66;
      if ((int)local_66 < 1) goto LAB_0000329c;
LAB_0000317e:
      if (iVar8 < iVar36) {
        if (0xff00 < iVar36) goto LAB_0000390a;
      }
      else if (iVar8 <= iVar49) {
        uVar21 = (ushort)bVar22;
        if (iVar28 == iVar8) {
          uVar13 = (ushort)bVar22;
          iVar36 = iVar28;
        }
        else {
          local_66 = (undefined2 *)-(int)local_66;
          uVar13 = (ushort)bVar22;
          iVar36 = iVar8;
        }
        goto LAB_000031aa;
      }
      if (iVar49 < 0xff00) goto LAB_0000390a;
      local_66 = (undefined2 *)-(int)local_66;
      uVar21 = 0;
      uVar13 = 0;
      iVar36 = 0xff00;
LAB_000031aa:
      bVar26 = *(byte *)(puVar50 + 0x10);
      pcVar45 = pcVar47 + -0x40;
      uVar16 = uVar13;
      if (cVar18 == '\x02') goto LAB_000032d8;
LAB_000031bc:
      uVar13 = uVar16;
      if (cVar18 == '\x04') goto LAB_000032d8;
      do {
        uVar13 = uVar21;
        if (bVar26 != 0) {
          sVar43 = (ushort)bVar26 * -2 + 0xb6;
          if (sVar43 < 0x36) {
            sVar43 = 0x36;
          }
          uVar13 = prt_divs32((int)(short)uVar21 << 8,(int)sVar43);
        }
        sVar43 = uVar13 + uVar21;
        if (cVar18 == '\x01') {
          pcVar44 = pcVar45 + 1;
          sVar17 = (short)((uint)((int)(short)((short)*pcVar45 +
                                              ((short)((uint)((int)sVar43 *
                                                             (int)(short)(sVar17 - sVar12)) >> 8) -
                                              sVar17)) * (int)(short)uVar21) >> 8) + sVar17;
          sVar12 = (short)((uint)((int)(short)(sVar17 - sVar12) * (int)(short)uVar21) >> 8) + sVar12
          ;
          sVar42 = (short)((uint)((int)(short)(sVar12 - sVar42) * (int)(short)uVar21) >> 8) + sVar42
          ;
          sVar27 = (short)((uint)((int)(short)(sVar42 - sVar27) * (int)(short)uVar21) >> 8) + sVar27
          ;
          if (-0x81 < sVar27) goto LAB_000037b0;
LAB_0000375e:
          sVar14 = -0x80;
          while (pcVar44[-1] = (char)sVar14, pcVar45 = pcVar44, pcVar47 != pcVar44) {
            while( true ) {
              pcVar44 = pcVar45 + 1;
              sVar17 = (short)((uint)((int)(short)((short)*pcVar45 +
                                                  ((short)((uint)((int)sVar43 *
                                                                 (int)(short)(sVar17 - sVar12)) >> 8
                                                          ) - sVar17)) * (int)(short)uVar21) >> 8) +
                       sVar17;
              sVar12 = (short)((uint)((int)(short)(sVar17 - sVar12) * (int)(short)uVar21) >> 8) +
                       sVar12;
              sVar42 = (short)((uint)((int)(short)(sVar12 - sVar42) * (int)(short)uVar21) >> 8) +
                       sVar42;
              sVar27 = (short)((uint)((int)(short)(sVar42 - sVar27) * (int)(short)uVar21) >> 8) +
                       sVar27;
              if (sVar27 < -0x80) goto LAB_0000375e;
LAB_000037b0:
              sVar14 = sVar27;
              if (sVar27 < 0x80) break;
              pcVar44[-1] = '\x7f';
              pcVar45 = pcVar44;
              if (pcVar47 == pcVar44) goto LAB_00003274;
            }
          }
        }
        else {
          do {
            while( true ) {
              pcVar44 = pcVar45 + 1;
              sVar17 = (short)((uint)((int)(short)((short)*pcVar45 +
                                                  ((short)((uint)((int)sVar43 *
                                                                 (int)(short)(sVar17 - sVar12)) >> 8
                                                          ) - sVar17)) * (int)(short)uVar21) >> 8) +
                       sVar17;
              sVar12 = (short)((uint)((int)(short)(sVar17 - sVar12) * (int)(short)uVar21) >> 8) +
                       sVar12;
              sVar42 = (short)((uint)((int)(short)(sVar12 - sVar42) * (int)(short)uVar21) >> 8) +
                       sVar42;
              sVar27 = (short)((uint)((int)(short)(sVar42 - sVar27) * (int)(short)uVar21) >> 8) +
                       sVar27;
              if (cVar18 != '\x02') break;
              uVar4 = (uint)(ushort)(sVar27 - *pcVar45);
LAB_00003262:
              if ((short)uVar4 < -0x80) {
                uVar4 = 0xffffff80;
LAB_0000326c:
                *pcVar45 = (char)uVar4;
              }
              else {
                if ((short)uVar4 < 0x80) goto LAB_0000326c;
                *pcVar45 = '\x7f';
              }
              pcVar45 = pcVar44;
              if (pcVar47 == pcVar44) goto LAB_00003274;
            }
            if (cVar18 == '\x03') {
              uVar4 = (((int)sVar27 - (int)sVar42) - (int)sVar12) - (int)sVar17 >> 1;
              goto LAB_00003262;
            }
            if (cVar18 == '\x04') {
              uVar4 = (uint)(ushort)(sVar17 - sVar27);
              goto LAB_00003262;
            }
            *pcVar45 = '\0';
            pcVar45 = pcVar44;
          } while (pcVar47 != pcVar44);
        }
LAB_00003274:
        pcVar47 = pcVar47 + 0x40;
        if (pcVar6 <= pcVar47 + (-0x40 - (int)pcVar48)) break;
        cVar18 = *(char *)((int)puVar50 + 0x1f);
        iVar49 = iVar36 + (int)local_66;
        if (0 < (int)local_66) goto LAB_0000317e;
LAB_0000329c:
        if (iVar36 < iVar28) {
          if (iVar36 < 0) goto LAB_0000390a;
LAB_00003d70:
          if (iVar49 < 1) {
            local_66 = (undefined2 *)-(int)local_66;
            uVar13 = 0xff;
            iVar36 = 0;
            uVar21 = 0xff;
          }
          else {
LAB_0000390a:
            bVar26 = ~(byte)((uint)iVar49 >> 8);
            uVar13 = (ushort)bVar26;
            iVar36 = iVar49;
            uVar21 = (ushort)bVar26;
          }
          goto LAB_000031aa;
        }
        if (iVar28 < iVar49) goto LAB_00003d70;
        uVar21 = (ushort)bVar20;
        if (iVar28 == iVar8) {
          uVar13 = (ushort)bVar20;
          iVar36 = iVar28;
          goto LAB_000031aa;
        }
        local_66 = (undefined2 *)-(int)local_66;
        uVar13 = (ushort)bVar20;
        bVar26 = *(byte *)(puVar50 + 0x10);
        pcVar45 = pcVar47 + -0x40;
        iVar36 = iVar28;
        uVar16 = (ushort)bVar20;
        if (cVar18 != '\x02') goto LAB_000031bc;
LAB_000032d8:
        uVar21 = 0xff - uVar13;
      } while( true );
    }
  }
  bVar20 = *(byte *)((int)puVar50 + 0x29);
  sVar17 = (short)pcVar6;
  if (((bVar20 & 0x20) == 0) && (*(char *)(puVar50 + 0x13) != '\0')) {
    prt_applyFilter(puVar50 + 0x13,pcVar48,sVar17);
  }
  if (*(char *)((int)puVar50 + 0x1b) != '\0') {
    bVar22 = *(byte *)(puVar50 + 10);
    bVar26 = *(byte *)(puVar50 + 10);
    iVar36 = prt_divs32(0x20000,*(char *)((int)puVar50 + 0x1b));
    iVar49 = 0;
LAB_00003980:
    bVar26 = bVar26 & 8;
    if ((bVar22 & 0x20) != 0) {
      iVar36 = iVar36 << 4;
    }
    pcVar47 = pcVar48;
    if (sVar17 == 0) {
      iVar36 = iVar49 >> 8;
      sVar17 = (short)((uint)iVar49 >> 0x10);
      uVar21 = (ushort)*(byte *)(puVar50 + 0xe) * -0x10;
      uVar13 = 0;
      goto joined_r0x000039fa;
    }
    uVar13 = sVar17 - 1;
    iVar49 = iVar49 + iVar36;
    if (iVar49 < 0x1000000) {
      if (bVar26 == 0) {
        do {
          pcVar45 = pcVar47;
          sVar17 = (short)((uint)iVar49 >> 0x10);
          pcVar47 = pcVar45 + 1;
          *pcVar45 = (char)((uint)((int)(short)*pcVar45 * (int)sVar17) >> 8);
          if (uVar13 == 0) goto LAB_00003b4a;
          uVar13 = uVar13 - 1;
          iVar49 = iVar36 + iVar49;
        } while (iVar49 < 0x1000000);
        pcVar45 = pcVar45 + 2;
        iVar49 = (short)*pcVar47 * 0xff >> 8;
        goto LAB_000039e2;
      }
      do {
        pcVar45 = pcVar47;
        sVar17 = (short)((uint)iVar49 >> 0x10);
        pcVar47 = pcVar45 + 1;
        iVar28 = (int)(short)*pcVar45 * (int)sVar17 >> 6;
        if ((short)iVar28 < 0x80) {
          if ((short)iVar28 < -0x80) {
            iVar28 = -0x80;
          }
          *pcVar45 = (char)iVar28;
        }
        else {
          *pcVar45 = '\x7f';
        }
        if (uVar13 == 0) goto LAB_00003b4a;
        uVar13 = uVar13 - 1;
        iVar49 = iVar36 + iVar49;
      } while (iVar49 < 0x1000000);
      sVar17 = (short)*pcVar47;
      pcVar45 = pcVar45 + 2;
LAB_00003eb4:
      iVar49 = sVar17 * 0xff >> 6;
      if ((short)iVar49 < 0x80) {
        if (-0x81 < (short)iVar49) goto LAB_000039e2;
        *pcVar47 = -0x80;
      }
      else {
        *pcVar47 = '\x7f';
      }
    }
    else {
      pcVar45 = pcVar48 + 1;
      sVar17 = (short)*pcVar48;
      if (bVar26 != 0) goto LAB_00003eb4;
      iVar49 = sVar17 * 0xff >> 8;
LAB_000039e2:
      *pcVar47 = (char)iVar49;
    }
    sVar17 = 0xff;
    iVar36 = 0xffff;
    uVar21 = uVar13 + (ushort)*(byte *)(puVar50 + 0xe) * -0x10;
    pcVar47 = pcVar45;
    goto joined_r0x000039fa;
  }
  if (*(char *)(puVar50 + 0xf) != -1) {
    bVar22 = *(byte *)(puVar50 + 10);
    bVar26 = *(byte *)(puVar50 + 10);
    iVar36 = 0x20000;
    iVar49 = 0x1000000;
    goto LAB_00003980;
  }
LAB_00003b8a:
  if (((bVar20 & 0x20) == 0) || (*(char *)(puVar50 + 0x13) == '\0')) {
    bVar20 = *(byte *)(puVar50 + 10);
  }
  else {
    prt_applyFilter(puVar50 + 0x13,pcVar48,pcVar6);
    bVar20 = *(byte *)(puVar50 + 10);
  }
  if ((bVar20 & 0x40) != 0) {
    uVar4 = (uint)*puVar50;
    iVar49 = puVar50[1] - uVar4;
    if ((iVar49 <= (int)(uint)(puVar50[5] >> 1)) && (iVar49 != 0)) {
      sVar17 = prt_divs32(0xffff,iVar49);
      if (0 < iVar49) {
        uVar21 = 0;
        pcVar47 = pcVar48 + uVar4;
        pcVar45 = pcVar48 + (uVar4 - iVar49);
        do {
          pcVar6 = pcVar45 + 1;
          *pcVar47 = (char)((uint)((int)(short)((short)*pcVar45 - (short)*pcVar47) *
                                  (int)(short)(uVar21 >> 8)) >> 8) + *pcVar47;
          uVar21 = sVar17 + uVar21;
          pcVar47 = pcVar47 + 1;
          pcVar45 = pcVar6;
        } while (pcVar6 != pcVar48 + uVar4);
        bVar20 = *(byte *)(puVar50 + 10);
      }
    }
  }
  if ((*(char *)(puVar50 + 0xd) == '\0') || (bVar22 = *(char *)(puVar50 + 0xd) - 1, bVar22 == bVar1)
     ) goto LAB_00003c5a;
  iVar49 = (uint)bVar22 * 0x2a + *(int *)(*(int *)((int)param_1 + 0x9fe) + 0x120);
  pcVar47 = (char *)param_1[bVar22 + 0x281];
  uVar4 = (*(byte *)(iVar49 + 0x19) + 1) * 0x80;
  uVar5 = (*(byte *)((int)puVar50 + 0x19) + 1) * 0x80;
  pcVar45 = pcVar48;
  if (uVar5 < uVar4) {
    uVar30 = uVar5;
    if ((*(byte *)(iVar49 + 0x14) & 4) == 0) goto LAB_00003f22;
LAB_00003c06:
    local_6a = (undefined4 *)0x4;
    if ((bVar20 & 4) == 0) {
      local_6a = (undefined4 *)0x1;
    }
    iVar49 = 0;
  }
  else {
    uVar30 = uVar4;
    if ((*(byte *)(iVar49 + 0x14) & 4) != 0) goto LAB_00003c06;
LAB_00003f22:
    iVar49 = 0;
    local_6a = (undefined4 *)0x1;
  }
  do {
    if (uVar30 != 0) {
      uVar21 = 0;
      pcVar6 = pcVar45;
      pcVar44 = pcVar47;
      do {
        while( true ) {
          sVar17 = (short)*pcVar44 + (short)*pcVar6;
          if (sVar17 < 0x80) break;
          sVar17 = 0x7f;
LAB_00003c3a:
          *pcVar6 = (char)sVar17;
          uVar21 = uVar21 + 1;
          pcVar6 = pcVar6 + 1;
          pcVar44 = pcVar44 + 1;
          if (uVar30 <= uVar21) goto LAB_00003c46;
        }
        if (-0x81 < sVar17) goto LAB_00003c3a;
        *pcVar6 = -0x80;
        uVar21 = uVar21 + 1;
        pcVar6 = pcVar6 + 1;
        pcVar44 = pcVar44 + 1;
      } while (uVar21 < uVar30);
    }
LAB_00003c46:
    uVar30 = uVar30 >> 1;
    pcVar47 = pcVar47 + uVar4;
    pcVar45 = pcVar45 + uVar5;
    uVar4 = uVar4 >> 1;
    uVar5 = uVar5 >> 1;
    iVar49 = iVar49 + 1;
  } while (local_6a != (undefined4 *)iVar49);
  bVar20 = *(byte *)(puVar50 + 10);
LAB_00003c5a:
  if ((bVar20 & 4) != 0) {
    uVar4 = (*(byte *)((int)puVar50 + 0x19) + 1) * 0x80;
    pcVar47 = pcVar48 + uVar4;
    uVar4 = uVar4 >> 1;
    sVar17 = 3;
    do {
      uVar21 = (ushort)uVar4;
      uVar5 = 0;
      if (uVar21 != 0) {
        pcVar45 = pcVar47;
        pcVar6 = pcVar48;
        do {
          pcVar44 = pcVar45 + 1;
          *pcVar45 = *pcVar6;
          pcVar6 = pcVar6 + 2;
          pcVar45 = pcVar44;
        } while (pcVar47 + (ushort)(uVar21 - 1) + 1 != pcVar44);
        pcVar48 = pcVar48 + uVar4 * 2;
        uVar5 = uVar4;
      }
      pcVar47 = pcVar48 + uVar5;
      uVar4 = (uint)(uVar21 >> 1);
      sVar17 = sVar17 + -1;
    } while (sVar17 != 0);
  }
  uVar4 = (uint)*param_3;
  if (uVar4 - 1 == local_32) {
    prt_setupSong(param_1,0);
    local_32 = uVar4;
    if (*param_3 <= uVar4) {
      return;
    }
  }
  else {
    local_32 = local_32 + 1;
    if ((int)uVar4 <= (int)local_32) {
      return;
    }
  }
  goto LAB_00002d7e;
LAB_00003b4a:
  iVar36 = iVar49 >> 8;
  uVar21 = (ushort)*(byte *)(puVar50 + 0xe) * -0x10;
  uVar13 = 0;
joined_r0x000039fa:
  do {
    while( true ) {
      uVar16 = uVar13;
      pcVar45 = pcVar47;
      if (uVar16 == 0) {
        bVar2 = *(byte *)((int)puVar50 + 0x1d);
        if (bVar2 == 0) goto LAB_00003b8a;
        uVar4 = (uint)bVar2;
        uVar21 = (short)(uVar4 * bVar2 >> 2) + (ushort)bVar2;
        uVar13 = 0;
        pcVar47 = pcVar45;
        goto joined_r0x00003a48;
      }
      uVar13 = uVar16 - 1;
      pcVar47 = pcVar45 + 1;
      if (bVar26 != 0) break;
      *pcVar45 = (char)((uint)((int)(short)*pcVar45 * (int)sVar17) >> 8);
joined_r0x00003ddc:
      if (uVar16 == uVar21) goto LAB_00003de0;
    }
    iVar49 = (int)(short)*pcVar45 * (int)sVar17 >> 6;
    if (0x7f < (short)iVar49) {
      iVar49 = 0x7f;
LAB_00003a1c:
      *pcVar45 = (char)iVar49;
      goto joined_r0x00003ddc;
    }
    if (-0x81 < (short)iVar49) goto LAB_00003a1c;
    *pcVar45 = -0x80;
  } while (uVar16 != uVar21);
LAB_00003de0:
  bVar2 = *(byte *)((int)puVar50 + 0x1d);
  if (bVar2 == 0) {
    if (uVar13 != 0) {
      uVar13 = uVar16 - 2;
      iVar49 = (uint)*(byte *)(puVar50 + 0xf) << 8;
      pcVar45 = pcVar45 + 2;
      iVar36 = (int)(short)*pcVar47 * (int)(short)(ushort)*(byte *)(puVar50 + 0xf);
      if (bVar26 == 0) {
        iVar36 = iVar36 >> 8;
LAB_00003b60:
        *pcVar47 = (char)iVar36;
      }
      else {
        iVar36 = iVar36 >> 6;
        if ((short)iVar36 < 0x80) {
          if (-0x81 < (short)iVar36) goto LAB_00003b60;
          *pcVar47 = -0x80;
        }
        else {
          *pcVar47 = '\x7f';
        }
      }
LAB_00003b62:
      if (uVar13 != 0) {
        pcVar47 = pcVar45 + uVar13;
        sVar17 = (short)((uint)iVar49 >> 8);
        if (bVar26 == 0) {
          do {
            pcVar44 = pcVar45 + 1;
            *pcVar45 = (char)((uint)((int)(short)*pcVar45 * (int)sVar17) >> 8);
            pcVar45 = pcVar44;
          } while (pcVar44 != pcVar47);
        }
        else {
          do {
            while( true ) {
              pcVar44 = pcVar45 + 1;
              iVar49 = (int)(short)*pcVar45 * (int)sVar17 >> 6;
              if ((short)iVar49 < 0x80) break;
              *pcVar45 = '\x7f';
              pcVar45 = pcVar44;
              if (pcVar47 == pcVar44) goto LAB_00003b8a;
            }
            if ((short)iVar49 < -0x80) {
              iVar49 = -0x80;
            }
            *pcVar45 = (char)iVar49;
            pcVar45 = pcVar44;
          } while (pcVar47 != pcVar44);
        }
      }
    }
  }
  else {
    uVar4 = (uint)bVar2;
    uVar21 = (short)(uVar4 * bVar2 >> 2) + (ushort)bVar2;
joined_r0x00003a48:
    if ((bVar22 & 0x20) == 0) {
      uVar5 = uVar4 << 0xc;
      uVar4 = uVar4 >> 4;
      uVar16 = (ushort)uVar4;
      sVar17 = *(short *)(&DAT_000043c0 + uVar4 * 2);
      sVar12 = *(short *)(&DAT_000043c0 + (uVar4 + 1) * 2);
    }
    else {
      sVar12 = 0x200;
      sVar17 = 0x400;
      uVar16 = 0;
      uVar5 = 0;
    }
    if (uVar13 != 0) {
      uVar32 = 0;
      do {
        uVar13 = uVar13 - 1;
        uVar5 = uVar21 + uVar5;
        if (uVar5 >> 0x10 < 0x8f) {
          uVar29 = (ushort)(uVar5 >> 0x10);
          if (uVar16 < uVar29) {
            uVar32 = sVar12 + (short)((uint)((int)(short)(*(short *)(&DAT_000043c0 +
                                                                    (uVar5 >> 0x10) * 2) - sVar12) *
                                            (int)(short)((ushort)uVar5 >> 8)) >> 8);
            uVar16 = uVar29;
            sVar17 = sVar12;
            sVar12 = *(short *)(&DAT_000043c0 + (uVar5 >> 0x10) * 2);
          }
          else {
            uVar32 = sVar17 + (short)((uint)((int)(short)(sVar12 - sVar17) *
                                            (int)(short)((ushort)uVar5 >> 8)) >> 8);
          }
        }
        iVar36 = iVar36 - (uint)uVar32;
        iVar49 = (uint)*(byte *)(puVar50 + 0xf) * 0x100;
        pcVar45 = pcVar47 + 1;
        if (iVar36 < iVar49) {
          iVar36 = (int)(short)*pcVar47 * (int)(short)(ushort)*(byte *)(puVar50 + 0xf);
          if (bVar26 == 0) {
            *pcVar47 = (char)((uint)iVar36 >> 8);
          }
          else {
            iVar36 = iVar36 >> 6;
            sVar17 = (short)iVar36;
            if (sVar17 < 0x80) {
              if (sVar17 < -0x80) {
                *pcVar47 = -0x80;
              }
              else {
                *pcVar47 = (char)iVar36;
              }
            }
            else {
              *pcVar47 = '\x7f';
            }
          }
          goto LAB_00003b62;
        }
        iVar49 = (int)(short)*pcVar47 * (int)(short)((uint)iVar36 >> 8);
        if (bVar26 == 0) {
          iVar49 = iVar49 >> 8;
        }
        else {
          iVar49 = iVar49 >> 6;
          if ((short)iVar49 < 0x80) {
            if ((short)iVar49 < -0x80) {
              iVar49 = -0x80;
            }
          }
          else {
            iVar49 = 0x7f;
          }
        }
        *pcVar47 = (char)iVar49;
        pcVar47 = pcVar45;
      } while (uVar13 != 0);
    }
  }
  goto LAB_00003b8a;
}



/* --- prt_mulu32 @ 0x410c --- */

int prt_mulu32(uint param_1,uint param_2)

{
  return (param_1 & 0xffff) * (param_2 & 0xffff) +
         (uint)(ushort)(param_1._2_2_ * param_2._0_2_ + param_1._0_2_ * param_2._2_2_) * 0x10000;
}



/* --- prt_divu32 @ 0x412e --- */

uint prt_divu32(uint param_1,uint param_2)

{
  uint uVar1;
  uint uVar2;
  uint uVar3;
  uint uVar4;
  
  uVar1 = param_1;
  uVar2 = param_2;
  if (param_2 < 0x10000) {
    uVar1 = CONCAT22((short)((param_1 >> 0x10) / (param_2 & 0xffff)),
                     (short)(CONCAT22((short)((param_1 >> 0x10) % (param_2 & 0xffff)),param_1._2_2_)
                            / (param_2 & 0xffff)));
  }
  else {
    do {
      uVar2 = uVar2 >> 1;
      uVar1 = uVar1 >> 1;
    } while (0xffff < uVar2);
    uVar1 = uVar1 / (uVar2 & 0xffff) & 0xffff;
    uVar2 = (param_2 & 0xffff) * uVar1;
    uVar3 = (param_2 >> 0x10) * uVar1;
    uVar4 = uVar3 * 0x10000 | uVar3 >> 0x10;
    if ((((short)(uVar3 >> 0x10) != 0) || (CARRY4(uVar4,uVar2))) || (param_1 < uVar4 + uVar2)) {
      uVar1 = uVar1 - 1;
    }
  }
  return uVar1;
}



/* --- prt_divs32 @ 0x418a --- */

int prt_divs32(int param_1,int param_2)

{
  int iVar1;
  char cVar2;
  
  cVar2 = '\x01';
  if (param_2 < 0) {
    param_2 = -param_2;
    cVar2 = -1;
  }
  if (param_1 < 0) {
    param_1 = -param_1;
    cVar2 = -cVar2;
  }
  iVar1 = prt_divu32(param_1,param_2);
  if (cVar2 < '\0') {
    iVar1 = -iVar1;
  }
  return iVar1;
}



/* --- prt_mods32 @ 0x41b4 --- */

int prt_mods32(int param_1,undefined4 param_2)

{
  undefined4 uVar1;
  int iVar2;
  
  uVar1 = prt_divs32(param_1,param_2);
  iVar2 = prt_mulu32(uVar1,param_2);
  return param_1 - iVar2;
}



/* --- prt_modu32 @ 0x41dc --- */

int prt_modu32(int param_1,undefined4 param_2)

{
  undefined4 uVar1;
  int iVar2;
  
  uVar1 = prt_divu32(param_1,param_2);
  iVar2 = prt_mulu32(uVar1,param_2);
  return param_1 - iVar2;
}



