#include "file.h"
#include <errno.h>
#include <string.h>
#ifdef _WIN32
#include <Windows.h>
#endif

bool File::GlobalFileError = false;

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

File::File(char* name, char* flags) {
    FileError = true;
    strcpy(FileName, name);
    if (!(stream = fopen(name, flags))) {
        sprintf(str, " Could not open file %s! \r\n", FileName);
        //		mydebug(str);
        GlobalFileError = true;
    } else
        FileError = false;
    total_length = 0;
}

File::File(char* name) {
    FileError = true;
    strcpy(FileName, name);
    if (!(stream = fopen(name, "rb"))) {
        sprintf(str, " Could not open file %s! \r\n", FileName);
        //		mydebug(str);
        GlobalFileError = true;
    } else
        FileError = false;
    total_length = 0;
}
File::File(wchar_t* name, wchar_t* flags) {
    FileError = true;
#ifdef _WIN32
    wcscpy(FileNameW, name);
    if (!(stream = _wfopen(name, flags))) {
        swprintf(wstr, sizeof(wstr) / sizeof(wstr[0]), L" Could not open file %s! \r\n", FileNameW);
        //		mydebug(str);
        GlobalFileError = true;
    } else
        FileError = false;
#endif
    total_length = 0;
}

File::File(wchar_t* name) {
    FileError = true;
#ifdef _WIN32
    wcscpy(FileNameW, name);
    if (!(stream = _wfopen(name, L"rb"))) {
        swprintf(wstr, sizeof(wstr) / sizeof(wstr[0]), L" Could not open file %s! \r\n", FileNameW);
        //		mydebug(str);
        GlobalFileError = true;
    } else
        FileError = false;
#endif
    total_length = 0;
}
File::~File() {
    if (!FileError) {
        fclose(stream);
    }
}

bool File::Read(void* buf, int length) {
    if (!FileError) {
        if ((int)fread(buf, sizeof(char), length, stream) != length) {
            sprintf(str, " Error reading file %s (%s)! ", FileName, strerror(errno));
            //			mydebug(str);
            FileError = true;
            GlobalFileError = true;
            return false;
        }
    } else {
        //		mydebug(" No valid file! ");
        return false;
    }
    total_length += length;
    return true;
}

bool File::Read(void* buf, int type, int length) {
    length *= type;
    return Read(buf, length);
}

bool File::Write(void* buf, int length) {
    if (!FileError) {
        if ((int)fwrite(buf, 1, length, stream) != length) {
            sprintf(str, " Error writing file %s! ", FileName);
            //			mydebug(str);
            FileError = true;
            GlobalFileError = true;
            return false;
        }
    } else {
        //		mydebug(" No valid file! ");
        return false;
    }
    total_length += length;
    return true;
}

bool File::Write(void* buf, int type, int length) {
    length *= type;
    return Write(buf, length);
}

bool File::SeekStart(int offset) {
    if (!FileError) {
        if (fseek(stream, offset, SEEK_SET)) {
            sprintf(str, " Error seeking in file %s! ", FileName);
            //			mydebug(str);
            FileError = true;
            GlobalFileError = true;
            return false;
        }
    } else {
        //		mydebug(" No valid file! ");
        return false;
    }
    return true;
}

bool File::SeekCurrent(int offset) {
    if (!FileError) {
        if (fseek(stream, offset, SEEK_CUR)) {
            sprintf(str, " Error seeking in file %s! ", FileName);
            //			mydebug(str);
            FileError = true;
            GlobalFileError = true;
            return false;
        }
    } else {
        //		mydebug(" No valid file! ");
        return false;
    }
    return true;
}

bool File::SeekEnd(int offset) {
    if (!FileError) {
        if (fseek(stream, offset, SEEK_END)) {
            sprintf(str, " Error seeking in file %s! ", FileName);
            //			mydebug(str);
            FileError = true;
            GlobalFileError = true;
            return false;
        }
    } else {
        //		mydebug(" No valid file! ");
        return false;
    }
    return true;
}

int File::GetPosition() {
    int pos = -1;
    if (!FileError) {
        if ((pos = ftell(stream)) == -1) {
            sprintf(str, " Could not return current file position in file %s! ", FileName);
            //			mydebug(str);
            FileError = true;
            GlobalFileError = true;
            return -1;
        }
    } else {
        //		mydebug(" No valid file! ");
        return -1;
    }
    return pos;
}

bool File::GlobalErrorFlag() {
    if (GlobalFileError == true) {
        GlobalFileError = false; // Reset flag if it has been read
        return true;
    }
    return false;
}

bool File::ErrorFlag() {
    if (FileError == true) {
        FileError = false; // Reset flag if it has been read
        return true;
    }
    return false;
}

bool File::Exists(char* filename) {
    FILE* f;

    if (!(f = fopen(filename, "rb")))
        return false;

    fclose(f);
    return true;
}
