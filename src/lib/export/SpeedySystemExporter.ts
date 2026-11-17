/**
 * SpeedySystemExporter.ts - save a Speedy System (.ss) song. Same scheme as Dave Lowe: the loaded module with each edited
 * pattern repacked over its slot, and a pattern that outgrew its slot appended at the file end with every pointer long to it
 * rewritten (value = address - marker, the layout's sectionRefs). The shared writer is DaveLoweExporter.
 */
export { exportDaveLowe as exportSpeedySystem } from './DaveLoweExporter';
