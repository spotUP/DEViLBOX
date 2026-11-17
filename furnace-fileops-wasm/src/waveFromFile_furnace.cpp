// Verbatim copy of DivEngine::waveFromFile (third-party/furnace-master/src/engine/engine.cpp:2882-3022).
// engine.cpp itself is not linked into this module; the function body is Furnace's own, unchanged.
#include "engine.h"
#include "../ta-log.h"
#include "fileutils.h"
#include <fmt/printf.h>

DivWavetable* DivEngine::waveFromFile(const char* path, bool addRaw) {
  FILE* f=ps_fopen(path,"rb");
  if (f==NULL) {
    lastError=fmt::sprintf("%s",strerror(errno));
    return NULL;
  }
  unsigned char* buf;
  ssize_t len;
  if (fseek(f,0,SEEK_END)!=0) {
    fclose(f);
    lastError=fmt::sprintf(_("could not seek to end: %s"),strerror(errno));
    return NULL;
  }
  len=ftell(f);
  if (len<0) {
    fclose(f);
    lastError=fmt::sprintf(_("could not determine file size: %s"),strerror(errno));
    return NULL;
  }
  if (len==(SIZE_MAX>>1)) {
    fclose(f);
    lastError=_("file size is invalid!");
    return NULL;
  }
  if (len==0) {
    fclose(f);
    lastError=_("file is empty");
    return NULL;
  }
  if (fseek(f,0,SEEK_SET)!=0) {
    fclose(f);
    lastError=fmt::sprintf(_("could not seek to beginning: %s"),strerror(errno));
    return NULL;
  }
  buf=new unsigned char[len];
  if (fread(buf,1,len,f)!=(size_t)len) {
    logW("did not read entire wavetable file buffer!");
    delete[] buf;
    lastError=fmt::sprintf(_("could not read entire file: %s"),strerror(errno));
    return NULL;
  }
  fclose(f);

  SafeReader reader=SafeReader(buf,len);

  unsigned char magic[16];
  bool isFurnaceTable=false;
  try {
    reader.read(magic,16);
    if (memcmp("-Furnace waveta-",magic,16)==0) {
      isFurnaceTable=true;
    }
  } catch (EndOfFileException& e) {
    reader.seek(0,SEEK_SET);
  }

  DivWavetable* wave=new DivWavetable;
  try {
    if (isFurnaceTable) {
      reader.seek(16,SEEK_SET);
      short version=reader.readS();
      reader.readS(); // reserved
      reader.seek(20,SEEK_SET);
      if (wave->readWaveData(reader,version)!=DIV_DATA_SUCCESS) {
        lastError=_("invalid wavetable header/data!");
        delete wave;
        delete[] buf;
        return NULL;
      }
    } else {
      try {
        // read as .dmw
        reader.seek(0,SEEK_SET);
        int len=reader.readI();
        logD("wave length %d",len);
        if (len<=0 || len>256) {
          throw EndOfFileException(&reader,reader.size());
        }
        wave->len=len;
        wave->max=(unsigned char)reader.readC();
        if (wave->max==255) { // new wavetable format
          unsigned char waveVersion=reader.readC();
          logI("reading modern .dmw...");
          logD("wave version %d",waveVersion);
          wave->max=(unsigned char)reader.readC();
          for (int i=0; i<len; i++) {
            wave->data[i]=reader.readI();
          }
        } else if (reader.size()==(size_t)(len+5)) {
          // read as .dmw
          logI("reading .dmw...");
          if (len>256) len=256;
          for (int i=0; i<len; i++) {
            wave->data[i]=(unsigned char)reader.readC();
          }
        } else {
          // read as binary
          if (addRaw) {
            logI("reading binary...");
            len=reader.size();
            if (len>256) len=256;
            reader.seek(0,SEEK_SET);
            for (int i=0; i<len; i++) {
              wave->data[i]=(unsigned char)reader.readC();
              if (wave->max<wave->data[i]) wave->max=wave->data[i];
            }
            wave->len=len;
          } else {
            delete wave;
            delete[] buf;
            return NULL;
          }
        }
      } catch (EndOfFileException& e) {
        // read as binary
        if (addRaw) {
          len=reader.size();
          logI("reading binary for being too small...");
          if (len>256) len=256;
          reader.seek(0,SEEK_SET);
          for (int i=0; i<len; i++) {
            wave->data[i]=(unsigned char)reader.readC();
            if (wave->max<wave->data[i]) wave->max=wave->data[i];
          }
          wave->len=len;
        } else {
          delete wave;
          delete[] buf;
          return NULL;
        }
      }
    }
  } catch (EndOfFileException& e) {
    delete wave;
    delete[] buf;
    lastError=_("premature end of file");
    return NULL;
  }
  
  return wave;
}
