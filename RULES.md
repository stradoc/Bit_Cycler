# Project Rules

These rules apply to everyone working in this directory, including Claude. Read this file at the start of every work session.

## Working rules

### 1. Stay inside this directory
- Never create, edit, or delete files outside `CSC_3501_Project/`.
- Temporary files (scratch scripts, screenshots, test output) go in `.tmp/` inside this directory. Create it when needed and empty it when done.
- `.tmp/` is never part of the submitted game.

### 2. Consult before any commit or push
- Never run `git commit` or `git push` without explicit approval.
- Before asking, present:
  1. A **full list of changed files**, with what changed in each (added / modified / deleted, and why).
  2. A **summary** at the end of what the change does as a whole.
- Approval covers only that one commit or push. The next one needs a new approval.

### 3. No technology commitments without consulting
- Do not adopt a technology without discussing it first. This includes libraries, frameworks, game engines, build tools, test runners, package managers, languages or dialects (e.g. TypeScript), and hosting or CI services.
- For each decision, explain the **benefits and drawbacks in depth**, compare the realistic alternatives, and give a recommendation. Then wait for a decision.
- Record every decision, and the reason for it, in the Decisions section of `CHANGELOG.md`.

### 4. Keep the logs current
- Update `CHANGELOG.md` at the end of each work session with what changed.
- Tick off finished items in `ROADMAP.md`, and add new tasks there as they come up.

## Course project rules (CSC 3501, Fall 2026)

From the [project spec](https://docs.google.com/document/d/1at5jsBLU62t-u3HPodi3NxE4kLm13Ni8Rd-yDOTXDLU/edit):

- **Deadline:** submitted by pull request to [riseatlsu/CSC-3501-Fall-2026](https://github.com/riseatlsu/CSC-3501-Fall-2026) by **November 30, 2026**.
- **Team:** 5 students. Only members who actively contribute receive credit. All members get the same project grade.
- **Topic:** must address at least one Computer Organization and Design topic covered in class or approved by the instructor.
- **Mechanics must teach:** players must reason about the concept through gameplay. Quiz questions between unrelated gameplay do not meet the requirement.
- **Platform:** HTML5 game that runs in a modern browser with no extra installs. JS libraries such as Phaser, Three.js, or PixiJS are allowed.
- **Size:** the project folder, source and assets included, must be **35 MB or less**.
- **Required game qualities:** meaningful interaction and feedback, a clear objective or progression, clear play instructions, a visual representation of the concept, and **at least one measurable learning objective**.
- **Required files** in `/games/<project-name>/`:
  - `index.html` (entry point)
  - `README.md` (the project, its development, its educational purpose, how to play)
  - `thumbnail.png` or `thumbnail.jpg`
  - source files and assets
- **Must run correctly from GitHub Pages**, so use relative paths only.
- **Gallery entry:** one entry in `_data/games.yml` with `title`, `authors`, `topic`, `description`, `learning_objective`, `game_url`, `thumbnail`. Edit only our own entry.
- **Thumbnail:** 16:9 PNG, exactly 800×450 px, 500 KB or less.
- **Grading (40% of the course grade):** Educational Experience 40%, Technical Content 30%, Game Design and Implementation 30%.
- **Generative AI:** allowed for brainstorming, programming, debugging, assets, and UI. We are responsible for the accuracy of everything it produces and may be asked to explain or change any part of the implementation.

## Design rules

From the [design doc](https://claude.ai/artifact/8VttdcZGpm8e6upLo3wgzy):

- **No quiz questions.** Every concept is a decision the player makes in gameplay.
- **Accuracy first.** Every technical claim in the game or README is checked against the course textbook before it ships. Approximate figures are labeled as approximate.
- **Rhythm skill never blocks learning.** Missing a beat means the CPU takes the slow path, never a game over, and relaxed mode is always available.
