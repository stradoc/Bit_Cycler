// Pure beat math, kept free of browser APIs so it can be unit-tested in Node.

export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Fractional beat position at `time`; negative before the song starts. */
export function beatAtTime(time: number, startTime: number, bpm: number): number {
  return (time - startTime) / secondsPerBeat(bpm);
}

/** Audio-clock time (seconds) at which `beat` lands. */
export function timeOfBeat(beat: number, startTime: number, bpm: number): number {
  return startTime + beat * secondsPerBeat(bpm);
}
