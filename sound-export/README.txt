Every sound Bit Cycler makes, as WAV files (16-bit, 44.1 kHz).

Made by `npm run export-sounds` from the game's own code (game/src/audio):
the game makes these sounds as it plays, so editing a file here does not
change the game. Levels are the game's own at 100% volume. Typing and the
drives are random in the game; each file is one take. The song's sounds and
music are at the first pipelined CPU's tempo (about 87 BPM); in the game the
tempo follows the clock.

  interface/  menu sounds          typing/  keys (recordings)
  computer/   boot, power, chime   song/    hits, stalls, mistakes, memory waits, metronome
  hum/        the menus' hum       music/   every song once through (all layers);
                                   music/layers/: the first song, 1 to 5 layers;
                                   music/reactions/: hold, skip, tape stop, memory wait, ending
  guide/      TICK's voice (one word, hello, goodbye)
