/* dmfInflate.h — puff with insertions; see dmfInflate.c */
#ifndef DMF_INFLATE_H
#define DMF_INFLATE_H

#ifndef NIL
#  define NIL ((unsigned char *)0)      /* for no output option */
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Where a deflate block starts: input position and bit state, output count. */
typedef struct {
    unsigned long incnt;
    unsigned long outcnt;
    int bitbuf;
    int bitcnt;
} dmf_block_mark;

#define NIL_MARK ((const dmf_block_mark *)0)
#define NIL_MARKS ((dmf_block_mark *)0)

/*
 * Inflate a raw deflate stream into `dest` (capacity *destlen), writing
 * insVal[i] at output position insAt[i] (sorted ascending, positions in the
 * output that includes the insertions). A non-zero `stopAt` ends inflation
 * once that many bytes are out.
 *
 * `resume`, when given, starts at a block start recorded by an earlier call
 * (dest must already hold the output before it, and the insertions before it
 * must be the same). `marks` receives every block start passed, up to
 * `maxMarks`, the number written going to *markCount.
 *
 * Returns 0 on success, puff's error codes otherwise; *destlen receives the
 * output size.
 */
int dmf_inflate_insert(unsigned char *dest, unsigned long *destlen,
                       const unsigned char *source, unsigned long *sourcelen,
                       const unsigned long *insAt, const unsigned char *insVal,
                       unsigned long insCount, unsigned long stopAt,
                       const dmf_block_mark *resume,
                       dmf_block_mark *marks, unsigned long maxMarks,
                       unsigned long *markCount);

#ifdef __cplusplus
}
#endif

#endif
