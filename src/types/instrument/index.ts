/**
 * Barrel re-export — every type, interface, const, and function
 * from all instrument sub-modules so that:
 *   import { X } from '@typedefs/instrument'
 * continues to work unchanged.
 */

export * from './base';
export * from './effects';
export * from './tonejs';
export * from './furnace';
export * from './exotic';
export * from './drums';
export * from './defaults';
