// The game's sound, for screens to import from one place:
//
//   cue(scene, name)        every short sound, by name (audio/cues.ts)
//   startHum / stopHum      the computer's hum in the menus (audio/hum.ts)
//   powerOn / powerOff      the computer switching on and off, and its chime (audio/machine.ts)
//   loadSounds              the recordings (audio/samples.ts)
//   setVolume               the volume setting (audio/output.ts)
//
// Underneath: synthesis building blocks (audio/synth.ts), and the buses every
// sound plays into with their levels (audio/mix.ts). The song's music and
// beat clock are audio/music.ts and audio/conductor.ts.
export { cue, cueOn } from './cues.js';
export { startHum, stopHum, toggleHum } from './hum.js';
export { powerOff, powerOn, startupChime } from './machine.js';
export { audioOf } from './mix.js';
export { setVolume } from './output.js';
export { loadSounds } from './samples.js';
//# sourceMappingURL=sound.js.map