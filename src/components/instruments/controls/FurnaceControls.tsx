/**
 * FurnaceControls - Control panel for Furnace chip emulation instruments
 *
 * Re-exports FurnaceEditor as FurnaceControls for use in the unified editor.
 * The FurnaceEditor already has a clean component structure that works as controls.
 */

export { FurnaceEditor as FurnaceControls } from '../editors/FurnaceEditor';
export { FurnaceEditor as default } from '../editors/FurnaceEditor';
