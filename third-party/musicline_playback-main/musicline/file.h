#pragma once

#include <stdio.h>
#ifndef MAX_PATH
#define MAX_PATH (256)
#endif
class File {
  public:
    static bool Exists(char* filename);
    File(char* filename);
    File(char* filename, char* flags);
    File(wchar_t* filename);
    File(wchar_t* filename, wchar_t* flags);
    virtual ~File();
    bool Read(void* buf, int length);            // takes a byte count
    bool Write(void* buf, int length);           // takes a byte count
    bool Read(void* buf, int type, int length);  // takes a type and a type count
    bool Write(void* buf, int type, int length); // takes a type and a type count
    bool SeekStart(int offset);
    bool SeekCurrent(int offset);
    bool SeekEnd(int offset);
    int GetPosition(void);
    bool FileError;
    int total_length;
    char FileName[MAX_PATH];
    wchar_t FileNameW[MAX_PATH];
    static bool GlobalErrorFlag();
    bool ErrorFlag();
    static bool GlobalFileError;

  private:
    FILE* stream;
    char str[4096];
    wchar_t wstr[4096];
};
