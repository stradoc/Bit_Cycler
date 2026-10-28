# CLAUDE.md

**Bit Cycler**: CSC 3501 (Computer Organization) team project. A browser tycoon + rhythm game where each beat is one CPU clock cycle. Due by pull request on Nov 30, 2026.

Stack: Phaser 3.90, TypeScript compiled with plain `tsc` (no bundler), raw Web Audio API, `node:test`, npm for dev tools only. The shipped game lives in `game/`, which is copied to `games/bit-cycler/` in the course repo at submission.

Instruction set: RISC-V inspired, adapted so the CPU word size grows 8 → 16 → 32 → 64-bit across tiers. "8-bit/16-bit" in art discussions means the pixel-art style, which is separate from CPU word size.

Repo: https://github.com/stradoc/Bit_Cycler

## Start of every session
1. Read `RULES.md`. It is binding.
2. Read `CHANGELOG.md` (latest entry and the Decisions table) to see where things stand.
3. Read `ROADMAP.md` to find the next unchecked task.

## Rules in brief (full text in `RULES.md`)
- **Never touch files outside this directory.** Temporary files go in `.tmp/` here.
- **Never commit or push without approval.** First show a full list of changed files with what changed in each, then a summary.
- **Never adopt a technology without consulting the user.** Explain benefits and drawbacks in depth and recommend; then wait. Log decisions in `CHANGELOG.md`.
- **Update `CHANGELOG.md` and `ROADMAP.md`** at the end of each work session.

## References
- Design doc: https://claude.ai/artifact/8VttdcZGpm8e6upLo3wgzy
- Course repo: https://github.com/riseatlsu/CSC-3501-Fall-2026
- Assignment spec: https://docs.google.com/document/d/1at5jsBLU62t-u3HPodi3NxE4kLm13Ni8Rd-yDOTXDLU/edit
