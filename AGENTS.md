# BLOCKFORGE: KINGDOMS

A stylized 3D voxel action-survival game (mobile-first, third-person). This
repository currently contains a **playable vertical slice**, not the full
commercial game described in the design brief.

Tech stack: **Vite + TypeScript + Three.js** (no framework). Everything renders
to a single WebGL canvas; the HUD/touch controls are plain DOM over the canvas.

## Project layout

- `src/main.ts` — entry point.
- `src/core/Game.ts` — main loop, renderer, lighting, day/night, spawning, combat glue.
- `src/core/GameState.ts` — resources, health, day/night clock.
- `src/entities/VoxelCharacter.ts` — the articulated, rigged voxel humanoid + procedural animations (idle/walk/run/jump/attack/gather). Reused by hero and enemies.
- `src/entities/Hero.ts` / `Enemy.ts` — player and corrupted-creature entities.
- `src/world/World.ts` — terrain, trees/rocks (gatherables), water, settlement, colliders.
- `src/systems/Input.ts` — desktop (WASD/mouse) + mobile (joystick/buttons) input.
- `src/systems/CameraController.ts` — third-person orbit follow camera.
- `src/ui/HUD.ts` + `src/ui/hud.css` — HUD and on-screen touch controls.

## Commands

Standard scripts live in `package.json`:
- `pnpm dev` — Vite dev server (default port 5173).
- `pnpm build` — typecheck + production build.
- `pnpm lint` / `pnpm typecheck` — ESLint / `tsc --noEmit`.

Use `pnpm` (there is a `pnpm-lock.yaml`).

## Cursor Cloud specific instructions

- **No GPU in the cloud VM.** Chrome falls back to software WebGL (SwiftShader),
  which is fill-rate bound. Rendering cost is deliberately kept low
  (`renderer.setPixelRatio(1)`, 1024² shadow map). If you raise resolution,
  pixel ratio, or shadow map size, framerate can drop enough that the procedural
  walk cycle **temporally aliases and looks "static/frozen"** in screen
  recordings even though it is working. This is a capture artifact, not a bug.
- **Verifying character animation:** single screenshots and even full-motion
  video reviewers frequently misjudge the walk cycle as static because (a) the
  default camera sits directly behind the hero, so forward/back limb swings are
  foreshortened, and (b) the ~0.5s gait aliases at low sample rates. To prove
  animation objectively: orbit the camera to a **side view** and compare frames
  a few hundred ms apart (a filmstrip of ~5 frames shows the alternating
  stride), or drive `VoxelCharacter.update()` headlessly and confirm limb
  rotations oscillate.
- **Day/night is time-driven** (`GameState.timeOfDay`, `dayLength ≈ 70s`). Night
  (and enemy waves) begins around `timeOfDay > 0.72`; from the default start
  (`0.35`) that is ~26s of real time. To exercise night combat quickly during
  testing, temporarily raise the initial `timeOfDay` (e.g. `0.66`) and revert it
  afterward — do not commit that change.
- **Gathering auto-targets** the nearest resource node within range (facing only
  boosts priority), so it is forgiving on touch; a few starter trees/rocks are
  placed right next to the spawn point for immediate testing.
- Desktop test controls: WASD move, drag to look, `E` gather, `B` build,
  `J`/`F` attack, `Space` jump, `Shift` run.
