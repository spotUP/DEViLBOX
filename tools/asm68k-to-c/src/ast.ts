export type Size = 'B' | 'W' | 'L' | 'S' | null;

export type Operand =
  | { kind: 'register'; name: string }
  | { kind: 'immediate'; value: number; raw: string }
  | { kind: 'address'; mode: 'indirect' | 'post_inc' | 'pre_dec'; reg: string }
  | { kind: 'disp'; offset: number | string; base: string; index?: string }
  | { kind: 'abs_addr'; value: number; raw: string; tag?: 'paula' | 'dmacon' | 'cia' | 'other' }
  | { kind: 'label_ref'; name: string }
  | { kind: 'pc_rel'; label: string };

export interface InstructionNode {
  kind: 'instruction';
  mnemonic: string;
  size: Size;
  operands: Operand[];
  line: number;
  comment?: string;
}

export interface LabelNode {
  kind: 'label';
  name: string;
  line: number;
}

export interface EquNode {
  kind: 'equ';
  name: string;
  value: number | string;
  line: number;
}

export interface DataNode {
  kind: 'data';
  directive: 'DC' | 'DS';
  size: Size;
  values: (number | string)[];
  line: number;
  label?: string;
}

export interface SectionNode {
  kind: 'section';
  name: string;
  type?: string;
  line: number;
}

export interface XdefNode {
  kind: 'xdef';
  name: string;
  line: number;
}

export interface CommentNode {
  kind: 'comment';
  text: string;
  line: number;
}

export type AstNode =
  | InstructionNode
  | LabelNode
  | EquNode
  | DataNode
  | SectionNode
  | XdefNode
  | CommentNode;
