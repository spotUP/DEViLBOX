#include "dmfSampleRepair.h"
#include "dmfInflate.h"

#include <cstdlib>
#include <cstring>
#include <algorithm>
#include <unordered_map>
#include <unordered_set>
#include <limits>

std::vector<unsigned char> g_dmfDeflateStream;

namespace {

// Total bytes the framing search may assume missing across the block.
const size_t MAX_MISSING=64;
// Missing bytes one sample may be realigned for.
const int MAX_MISSING_PER_SAMPLE=16;

struct Header {
  size_t headerLen;
  size_t dataBytes;
  bool words; // data is 16-bit words, so a lost byte breaks the pairing
};

// A header as it would read with `drop` bytes of `fill` put back at offset
// `at`. drop=0 reads the file as it is.
struct HeaderView {
  const unsigned char* b;
  size_t pos, end;
  size_t at;
  size_t drop;
  unsigned char fill;
  // bytes available from `pos`
  size_t size() const { return end-pos+drop; }
  unsigned char operator[](size_t i) const {
    if (i<at) return b[pos+i];
    if (i<at+drop) return fill;
    return b[pos+i-drop];
  }
};

int readI32(const HeaderView& v, size_t i) {
  return (int)((uint32_t)v[i]|((uint32_t)v[i+1]<<8)|((uint32_t)v[i+2]<<16)|((uint32_t)v[i+3]<<24));
}

// Mirrors the header reads in DivEngine::loadDMF()'s sample loop. `strict`
// adds the value checks that tell a real header from sample data; the
// as-written framing check runs without them, so a file upstream reads is
// never second-guessed here.
// `looseFields`: with `strict`, still check the length and the name, but let
// rate, pitch, amp, bits and cuts be anything — upstream clamps those itself.
bool parseHeaderView(const HeaderView& v, int ver, bool strict, Header& h, bool looseFields=false) {
  size_t p=0, end=v.size();
  if (p+4>end) return false;
  int length=readI32(v,p);
  p+=4;
  if (length<0 || length>(strict?(1<<24):(1<<29))) return false;
  if (ver>0x16) {
    if (p+1>end) return false;
    size_t nameLen=v[p++];
    if (p+nameLen>end) return false;
    if (strict) {
      for (size_t i=0; i<nameLen; i++) {
        unsigned char c=v[p+i];
        if (c<0x20 || c==0x7f) return false;
      }
    }
    p+=nameLen;
  }
  if (ver>=0x0b) {
    if (p+3>end) return false;
    if (strict && !looseFields && (v[p]>5 || v[p+1]>10 || v[p+2]>100)) return false;
    p+=3;
  }
  if (ver>0x15) {
    if (p+1>end) return false;
    if (strict && !looseFields && v[p]!=8 && v[p]!=16) return false;
    p++;
  }
  if (ver>=0x1b) {
    if (p+8>end) return false;
    if (strict && !looseFields) {
      int cutStart=readI32(v,p);
      int cutEnd=readI32(v,p+4);
      if (cutStart<0 || cutEnd<0 || cutStart>length || cutEnd>length) return false;
    }
    p+=8;
  }
  h.headerLen=p;
  if (ver>0x08) {
    h.words=(ver>=0x0b);
    h.dataBytes=h.words?(size_t)length*2:(size_t)length;
  } else {
    h.words=false;
    h.dataBytes=(size_t)length;
  }
  return true;
}

bool parseHeader(const unsigned char* b, size_t pos, size_t end, int ver, bool strict, Header& h) {
  if (pos>end) return false;
  return parseHeaderView({b,pos,end,0,0,0},ver,strict,h);
}

struct Record {
  size_t start;
  Header h;
  size_t available; // data bytes actually present
  // The header as it should read. Differs from the file's bytes when the
  // header itself lost bytes; `consumed` is how many header bytes the file has.
  std::vector<unsigned char> header;
  size_t consumed;
  // Where the header lost its bytes (offset from `start`) and what stands in.
  size_t dropAt=0;
  unsigned char fill=0;
};

// Upstream's reading: every record at its declared size, inside the file.
// Bytes after the last record are allowed; upstream only warns about them, and
// checksum-clean files carry them.
bool framesAsWritten(const unsigned char* b, size_t end, int ver, int count) {
  size_t pos=0;
  for (int i=0; i<count; i++) {
    Header h;
    if (!parseHeader(b,pos,end,ver,false,h)) return false;
    pos+=h.headerLen+h.dataBytes;
    if (pos>end) return false;
  }
  return true;
}

// Bytes a header may have lost, tried at every position inside it.
const int MAX_HEADER_DROP=2;
// Longest possible header: length, name length, 255-byte name, 4 fields, cuts.
const size_t MAX_HEADER=4+1+255+4+8;

// Every reading of the header at `pos` that passes the strict checks: as
// written first, then with 1..MAX_HEADER_DROP bytes put back at each offset.
// A byte put back in the length field is a zero (the field's high bytes are
// zero for any real sample); anywhere else it is '_', which stands in for a
// lost name character. A wrong guess does not survive framing: the chain to
// the end of the file decides.
std::vector<Record> headerCandidates(const unsigned char* b, size_t pos, size_t end, int ver) {
  std::vector<Record> out;
  if (pos>end) return out;
  Header h;
  if (parseHeader(b,pos,end,ver,true,h)) {
    out.push_back({pos,h,0,std::vector<unsigned char>(b+pos,b+pos+h.headerLen),h.headerLen});
  }
  size_t avail=std::min(end-pos,MAX_HEADER);
  for (size_t d=1; d<=(size_t)MAX_HEADER_DROP; d++) {
    for (size_t q=0; q<avail; q++) {
      if (q==4 && ver>0x16) continue; // the name length byte cannot be guessed
      HeaderView v={b,pos,end,q,d,(unsigned char)(q<4?0x00:'_')};
      Header th;
      if (!parseHeaderView(v,ver,true,th)) continue;
      if (q>=th.headerLen) continue; // the bytes must go inside the header
      std::vector<unsigned char> hdr(th.headerLen);
      for (size_t i=0; i<th.headerLen; i++) hdr[i]=v[i];
      bool dup=false;
      for (const Record& r: out) {
        if (r.header==hdr && r.consumed==th.headerLen-d) { dup=true; break; }
      }
      if (!dup) out.push_back({pos,th,0,hdr,th.headerLen-d,q,v.fill});
    }
  }
  return out;
}

// Depth-first search for the record chain, preferring the fewest missing bytes
// at each record. `failed` remembers (record, position, budget) states that
// lead nowhere.
struct FrameMemo {
  std::unordered_set<uint64_t> failed; // (record, position, budget)
  std::unordered_map<size_t,std::vector<Record>> candidates; // by position
  const std::vector<Record>& at(const unsigned char* b, size_t pos, size_t end, int ver) {
    auto it=candidates.find(pos);
    if (it!=candidates.end()) return it->second;
    return candidates.emplace(pos,headerCandidates(b,pos,end,ver)).first->second;
  }
};

bool frame(const unsigned char* b, size_t end, int ver, int i, int count, size_t pos, size_t budget,
           std::vector<Record>& recs, FrameMemo& memo) {
  uint64_t key=((uint64_t)i<<48)|((uint64_t)pos<<8)|budget;
  if (memo.failed.count(key)) return false;
  for (Record c: memo.at(b,pos,end,ver)) {
    size_t headerDrop=c.h.headerLen-c.consumed;
    if (headerDrop>budget) continue;
    size_t left=budget-headerDrop;
    size_t dataStart=pos+c.consumed;
    if (dataStart>end) continue;
    size_t nominal=dataStart+c.h.dataBytes;
    if (i==count-1) {
      // the last record: its data runs to the end of the file, or stops short
      // of bytes that trail it
      if (nominal<=end) {
        c.available=c.h.dataBytes;
      } else if (nominal-end<=left) {
        c.available=end-dataStart;
      } else {
        continue;
      }
      recs.push_back(c);
      return true;
    }
    for (size_t k=0; k<=left && k<=c.h.dataBytes; k++) {
      size_t next=nominal-k;
      if (next>end) continue;
      c.available=c.h.dataBytes-k;
      recs.push_back(c);
      if (frame(b,end,ver,i+1,count,next,left-k,recs,memo)) return true;
      recs.pop_back();
    }
  }
  memo.failed.insert(key);
  return false;
}

// Upstream's reading, stopped at the first record whose header does not look
// like one (a misplaced read lands in sample data, where a length such as
// 419430552 would otherwise pass). A header whose length and name read but
// whose fields are damaged is kept: its sound is real, and upstream clamps
// the fields. The record the data runs out in is kept with what it has.
void keepReadable(const unsigned char* b, size_t end, int ver, int count, std::vector<Record>& recs) {
  size_t pos=0;
  for (int i=0; i<count; i++) {
    Header h;
    if (pos>end || !parseHeaderView({b,pos,end,0,0,0},ver,true,h,true)) return;
    size_t dataStart=pos+h.headerLen;
    if (dataStart>end) return;
    size_t available=h.dataBytes;
    if (dataStart+available>end) available=end-dataStart;
    recs.push_back({pos,h,available,std::vector<unsigned char>(),h.headerLen});
    if (available<h.dataBytes) return;
    pos=dataStart+available;
  }
}

inline int wordAt(const unsigned char* a, size_t at) {
  return (int)(int16_t)(uint16_t)(a[at]|(a[at+1]<<8));
}

// Rebuild `n` 16-bit words from `a` (2n-s bytes, s bytes lost at unknown
// places). A lost byte shifts the pairing of everything after it; the path
// that keeps the signal smoothest says where each loss was. Dynamic
// programming over (word, bytes lost so far, previous word was the damaged
// one); a damaged word is bridged over and filled in afterwards.
bool realignWords(const unsigned char* a, size_t avail, size_t n, int s, unsigned char* out, std::vector<DmfInsert>* inserts=NULL) {
  if (s<=0 || s>MAX_MISSING_PER_SAMPLE || avail+s!=2*n || n<2) return false;
  const int E=s+1;
  // back-pointers are n*E*2 bytes; past this the sample keeps a held tail instead
  if ((uint64_t)n*E*2>((uint64_t)64<<20)) return false;
  const int64_t INF=std::numeric_limits<int64_t>::max()/4;
  // state index: e*2+f, f=1 when word k is the damaged one
  std::vector<int64_t> cur(E*2,INF), nxt(E*2,INF);
  std::vector<unsigned char> back(n*E*2,0xff);
  auto valid=[&](size_t k, int e, int f) -> bool {
    long long at=(long long)(2*k)-e;
    if (at<0) return false;
    return f ? (size_t)at<avail : (size_t)at+1<avail;
  };
  // word 0
  if (valid(0,0,0)) cur[0]=0;
  if (s>=1 && valid(0,0,1)) cur[1*2+1]=0; // lost byte inside word 0 -> state e=1
  for (size_t k=1; k<n; k++) {
    std::fill(nxt.begin(),nxt.end(),INF);
    for (int e=0; e<E; e++) {
      // intact word k in state e
      if (valid(k,e,0)) {
        int w=wordAt(a,2*k-e);
        // previous word intact, same state
        if (cur[e*2]<INF) {
          int64_t c=cur[e*2]+std::abs(w-wordAt(a,2*(k-1)-e));
          if (c<nxt[e*2]) { nxt[e*2]=c; back[(k*E+e)*2]=(unsigned char)(e*2); }
        }
        // previous word damaged (state e-1 -> e); bridge to word k-2
        if (e>0 && cur[e*2+1]<INF) {
          int64_t c=cur[e*2+1];
          if (k>=2) c+=std::abs(w-wordAt(a,2*(k-2)-(e-1)));
          if (c<nxt[e*2]) { nxt[e*2]=c; back[(k*E+e)*2]=(unsigned char)(e*2+1); }
        }
      }
      // word k damaged: arrives from intact word k-1 in state e-1
      if (e>0 && valid(k,e-1,1) && cur[(e-1)*2]<INF) {
        int64_t c=cur[(e-1)*2];
        if (c<nxt[e*2+1]) { nxt[e*2+1]=c; back[(k*E+e)*2+1]=(unsigned char)((e-1)*2); }
      }
    }
    cur.swap(nxt);
  }
  int endState=-1;
  if (cur[s*2]<INF) endState=s*2;
  if (cur[s*2+1]<INF && (endState<0 || cur[s*2+1]<cur[s*2])) endState=s*2+1;
  if (endState<0) return false;

  // walk back: state[k] for every word
  std::vector<unsigned char> state(n);
  int st=endState;
  for (size_t k=n-1; ; k--) {
    state[k]=(unsigned char)st;
    if (k==0) break;
    unsigned char b=back[(k*E+(st>>1))*2+(st&1)];
    if (b==0xff) return false;
    st=b;
  }
  // word 0's own state: e=0 intact, or damaged arriving at e=1
  if (!(state[0]==0 || state[0]==3)) return false;

  for (size_t k=0; k<n; k++) {
    int e=state[k]>>1, f=state[k]&1;
    if (!f) {
      size_t at=2*k-e;
      out[2*k]=a[at];
      out[2*k+1]=a[at+1];
      continue;
    }
    // damaged word: one of its bytes survived at a[2k-(e-1)]
    unsigned char known=a[2*k-(e-1)];
    int prev=(k>0)?(int)(int16_t)(uint16_t)(out[2*k-2]|(out[2*k-1]<<8)):0;
    bool hasNext=(k+1<n);
    int next=hasNext?wordAt(a,2*(k+1)-e):0;
    int64_t best=INF;
    unsigned char lo=0, hi=0;
    bool lowLost=false; // the surviving byte is the high one
    for (int v=0; v<256; v++) {
      for (int knownIsHigh=0; knownIsHigh<2; knownIsHigh++) {
        unsigned char l=knownIsHigh?(unsigned char)v:known;
        unsigned char h=knownIsHigh?known:(unsigned char)v;
        int w=(int)(int16_t)(uint16_t)(l|(h<<8));
        int64_t c=(k>0?std::abs(w-prev):0)+(hasNext?std::abs(next-w):0);
        if (c<best) { best=c; lo=l; hi=h; lowLost=knownIsHigh; }
      }
    }
    out[2*k]=lo;
    out[2*k+1]=hi;
    if (inserts) {
      // position in `a`, before any insertion: the lost byte sat before the
      // surviving one when it was the low byte, after it when the high one
      size_t knownAt=2*k-(e-1);
      if (lowLost) inserts->push_back({knownAt,lo});
      else inserts->push_back({knownAt+1,hi});
    }
  }
  return true;
}

// How far the records read as written: the index of the first record that
// does not (count when all do), and where it starts.
struct Progress {
  int record;
  bool headerBad; // that record's own header does not read
  size_t start;
  Header h;
};

Progress readAsWritten(const unsigned char* b, size_t end, int ver, int count) {
  size_t pos=0;
  for (int i=0; i<count; i++) {
    Header h;
    if (!parseHeader(b,pos,end,ver,true,h)) return {i,true,pos,h};
    size_t nominal=pos+h.headerLen+h.dataBytes;
    if (i==count-1) {
      if (nominal<=end) return {count,false,pos,h};
      return {i,false,pos,h};
    }
    Header nh;
    if (nominal>end || !parseHeader(b,nominal,end,ver,true,nh)) return {i,false,pos,h};
    pos=nominal;
  }
  return {count,false,pos,Header()};
}

// Offsets into a header a lost byte is tried at: the length field, the name
// length byte is skipped (it cannot be guessed), then the name and fields.
const size_t MAX_HEADER_TRY=48;

// What this record may have lost, most likely first. Each candidate is a set of
// insertions (positions before insertion):
//  - the sample's own data, short by k bytes, where k is how far before its
//    nominal end the next header reads; the smoothest path places all k;
//  - the same with k=1, for when the next header is itself garbled;
//  - one byte at each offset into the header that should follow (or into
//    this record's own header, when that is what does not read).
std::vector<std::vector<DmfInsert>> candidatesFor(const unsigned char* b, size_t end, int ver, const Progress& at) {
  std::vector<std::vector<DmfInsert>> c;
  size_t headerAt=at.start;
  if (!at.headerBad) {
    size_t dataStart=at.start+at.h.headerLen;
    size_t nominal=dataStart+at.h.dataBytes;
    int k=0;
    for (size_t t=1; t<=MAX_MISSING && t<=at.h.dataBytes; t++) {
      Header nh;
      if (nominal-t<=end && parseHeader(b,nominal-t,end,ver,true,nh)) { k=(int)t; break; }
    }
    if (k==0 && nominal>end && nominal-end<=MAX_MISSING) k=(int)(nominal-end); // last record
    auto viaSound=[&](int drops) {
      if (!at.h.words || drops<=0 || at.h.dataBytes<4 || dataStart+at.h.dataBytes-drops>end) return;
      std::vector<unsigned char> scratch(at.h.dataBytes);
      std::vector<DmfInsert> local;
      if (!realignWords(b+dataStart,at.h.dataBytes-drops,at.h.dataBytes/2,drops,scratch.data(),&local)) return;
      std::vector<DmfInsert> set;
      for (const DmfInsert& d: local) set.push_back({dataStart+d.at,d.value});
      c.push_back(set);
    };
    viaSound(k);
    if (k!=1) viaSound(1);
    headerAt=nominal;
  }
  for (size_t q=0; q<MAX_HEADER_TRY && headerAt+q<=end; q++) {
    if (q==4 && ver>0x16) continue;
    c.push_back({{headerAt+q,(unsigned char)(q<4?0x00:'_')}});
  }
  return c;
}

// Inflate g_dmfDeflateStream with `ins` (output positions, sorted), stopping
// after `stopAt` bytes when non-zero. With `from`, the output before that
// block start is taken from `prefix` and inflation resumes there. `marks`, when
// given, receives the block starts of this run.
bool reinflate(const std::vector<DmfInsert>& ins, size_t capacity, size_t stopAt,
               const dmf_block_mark* from, const std::vector<unsigned char>* prefix,
               std::vector<unsigned char>& out, std::vector<dmf_block_mark>* marks) {
  std::vector<unsigned long> at;
  std::vector<unsigned char> val;
  for (const DmfInsert& d: ins) { at.push_back((unsigned long)d.at); val.push_back(d.value); }
  out.resize(capacity);
  if (from) memcpy(out.data(),prefix->data(),from->outcnt);
  unsigned long outLen=(unsigned long)capacity;
  unsigned long srcLen=(unsigned long)g_dmfDeflateStream.size();
  unsigned long markCount=0;
  if (marks) marks->resize(4096);
  int err=dmf_inflate_insert(out.data(),&outLen,g_dmfDeflateStream.data(),&srcLen,
    at.empty()?NULL:at.data(),val.empty()?NULL:val.data(),(unsigned long)at.size(),(unsigned long)stopAt,
    from,marks?marks->data():NIL_MARKS,marks?(unsigned long)marks->size():0,&markCount);
  if (marks) marks->resize(markCount);
  // 2 = the stream ran out before its end-of-block: what was inflated stands
  if (err!=0 && err!=2) return false;
  out.resize(outLen);
  return true;
}

// Most bytes put back in one file before giving up on the stream route.
const int MAX_RESTORED=64;

} // namespace

int dmfRestoreStream(const unsigned char* file, size_t len, size_t blockStart, int version, int count, std::vector<unsigned char>& out) {
  out.clear();
  if (g_dmfDeflateStream.empty()) return 0;
  std::vector<DmfInsert> all; // output positions in the current file
  std::vector<unsigned char> cur;
  std::vector<dmf_block_mark> marks; // block starts of `cur`
  // puff must read the stream as zlib did, or none of this applies
  if (!reinflate(all,len,0,NULL,NULL,cur,&marks) || cur.size()!=len || memcmp(cur.data(),file,len)!=0) return 0;
  while ((int)all.size()<MAX_RESTORED) {
    const unsigned char* blk=cur.data()+blockStart;
    size_t blkLen=cur.size()-blockStart;
    Progress now=readAsWritten(blk,blkLen,version,count);
    if (now.record>=count) break;
    bool advanced=false;
    for (std::vector<DmfInsert> cand: candidatesFor(blk,blkLen,version,now)) {
      if (cand.empty() || (int)(all.size()+cand.size())>MAX_RESTORED) continue;
      std::sort(cand.begin(),cand.end(),[](const DmfInsert& x, const DmfInsert& y){ return x.at<y.at; });
      // positions are in the current file, before these insertions; an
      // earlier insertion at or after one of them moves up past it
      std::vector<DmfInsert> merged;
      for (DmfInsert d: all) {
        size_t shift=0;
        for (const DmfInsert& n: cand) if (blockStart+n.at<=d.at) shift++;
        d.at+=shift;
        merged.push_back(d);
      }
      for (size_t j=0; j<cand.size(); j++) merged.push_back({blockStart+cand[j].at+j,cand[j].value});
      std::sort(merged.begin(),merged.end(),[](const DmfInsert& x, const DmfInsert& y){ return x.at<y.at; });
      // resume from the last block that starts before the first new byte:
      // everything before it inflates exactly as in `cur`
      size_t firstNew=blockStart+cand[0].at;
      const dmf_block_mark* from=NULL;
      for (const dmf_block_mark& m: marks) {
        if (m.outcnt<=firstNew) from=&m;
        else break;
      }
      // judging needs only the output up to past the header after this
      // record; the whole file is inflated once a candidate is taken
      size_t judgeTo=blockStart+now.start+(now.headerBad?0:now.h.headerLen+now.h.dataBytes)+2*MAX_HEADER+cand.size();
      std::vector<unsigned char> next;
      if (!reinflate(merged,cur.size()+cand.size(),judgeTo,from,&cur,next,NULL)) continue;
      // everything before the sample block must read exactly as before
      if (next.size()<blockStart || memcmp(next.data(),cur.data(),blockStart)!=0) continue;
      // cut short, the record after the next one looks unfinished, which
      // still counts as the next one reading
      Progress then=readAsWritten(next.data()+blockStart,next.size()-blockStart,version,count);
      bool better=then.record>now.record || (then.record==now.record && now.headerBad && !then.headerBad);
      if (!better) continue;
      std::vector<dmf_block_mark> nextMarks;
      if (!reinflate(merged,cur.size()+cand.size(),0,NULL,NULL,next,&nextMarks)) continue;
      all.swap(merged);
      cur.swap(next);
      marks.swap(nextMarks);
      advanced=true;
      break;
    }
    if (!advanced) break;
  }
  if (all.empty()) return 0;
  out.swap(cur);
  return (int)all.size();
}

bool dmfSampleBlockReadsAsWritten(const unsigned char* buf, size_t len, int version, int count) {
  return count<=0 || framesAsWritten(buf,len,version,count);
}

void dmfRepairSampleBlock(const unsigned char* buf, size_t len, int version, int count, DmfSampleRepair& out) {
  out=DmfSampleRepair();
  if (count<=0) return;
  if (framesAsWritten(buf,len,version,count)) return;
  out.changed=true;

  std::vector<Record> recs;
  FrameMemo memo;
  if (!frame(buf,len,version,0,count,0,MAX_MISSING,recs,memo)) {
    recs.clear();
    keepReadable(buf,len,version,count,recs);
    out.samplesKept=(int)recs.size();
    if (recs.empty()) return;
    const Record& last=recs.back();
    out.lastCutShort=(last.available<last.h.dataBytes);
    // no bytes are "put back" here: the gap is not located, only held over
    for (const Record& r: recs) out.block.insert(out.block.end(),buf+r.start,buf+r.start+r.h.headerLen+r.available);
    if (out.lastCutShort) {
      unsigned char hold=last.available?buf[last.start+last.h.headerLen+last.available-1]:0;
      out.block.insert(out.block.end(),last.h.dataBytes-last.available,hold);
    }
    return;
  }
  out.samplesKept=count;

  for (const Record& r: recs) {
    out.block.insert(out.block.end(),r.header.begin(),r.header.end());
    size_t headerDrop=r.h.headerLen-r.consumed;
    if (headerDrop) {
      out.missingBytes+=(int)headerDrop;
      out.damagedSamples++;
    }
    const unsigned char* data=buf+r.start+r.consumed;
    if (r.available==r.h.dataBytes) {
      out.block.insert(out.block.end(),data,data+r.available);
      continue;
    }
    int missing=(int)(r.h.dataBytes-r.available);
    out.missingBytes+=missing;
    if (!headerDrop) out.damagedSamples++;
    size_t at=out.block.size();
    out.block.resize(at+r.h.dataBytes,0);
    bool realigned=r.h.words && realignWords(data,r.available,r.h.dataBytes/2,missing,&out.block[at]);
    if (!realigned) {
      // Byte-wide data has no pairing to recover: keep what is there and
      // hold the last value over the missing tail.
      memcpy(&out.block[at],data,r.available);
      unsigned char hold=r.available?data[r.available-1]:0;
      memset(&out.block[at+r.available],hold,r.h.dataBytes-r.available);
    }
  }
  if (out.missingBytes==0) {
    out=DmfSampleRepair();
    return;
  }
  // Anything after the last record.
  const Record& last=recs.back();
  size_t tail=last.start+last.consumed+last.available;
  if (tail<len) out.block.insert(out.block.end(),buf+tail,buf+len);
}
