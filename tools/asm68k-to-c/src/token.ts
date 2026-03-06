export type TokenKind =
  | 'LABEL'        // "PlayMusic:" or bare "PlayMusic" at line start
  | 'MNEMONIC'     // "MOVE", "BSR", "DBRA", etc. (uppercased)
  | 'SIZE'         // ".B", ".W", ".L", ".S"
  | 'REGISTER'     // "d0"-"d7", "a0"-"a7", "sp", "pc"
  | 'IMMEDIATE'    // "#$1F", "#42", "#%1010"
  | 'ADDRESS'      // "(a0)", "(a0)+", "-(a0)"
  | 'DISP_REG'     // "4(a1)", "4(a1,d0.w)", "label(PC)"
  | 'ABS_ADDR'     // "$DFF096", "$BFE001"
  | 'IDENTIFIER'   // label reference, EQU name
  | 'NUMBER'       // standalone decimal/hex/binary/octal literal
  | 'STRING'       // "hello" string literal in DC.B
  | 'COMMA'
  | 'RANGE'        // "-" between registers in MOVEM register list
  | 'OPERATOR'     // "+", "-" in data expressions (e.g. dc.w target-table_base)
  | 'NEWLINE'
  | 'DIRECTIVE'    // "EQU", "DC", "DS", "SECTION", "INCLUDE", "MACRO", "ENDM", "XDEF", "XREF"
  | 'COMMENT'      // "; ..." or "* ..."
  | 'EOF';

export interface Token {
  kind: TokenKind;
  value: string;      // raw text
  line: number;
  col: number;
}
