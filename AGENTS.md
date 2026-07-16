# BLOCKFORGE: KINGDOMS

A stylized 3D voxel action-survival game (mobile-first, third-person). This
repository currently contains a **playable vertical slice**, not the full
commercial game described in the design brief.

Tech stack: **Vite + TypeScript + Three.js** (no framework). Everything renders
to a single WebGL canvas; the HUD/touch controls are plain DOM over the canvas.

## Project layout

- `src/main.ts` — entry point.
- `src/core/Game.ts` — main loop, renderer, lighting, day/night, spawning, combat glue, quest/rift wiring.
- `src/core/GameState.ts` — resources, health, day/night clock, quest counters.
- `src/core/lore.ts` — narrative source of truth (world/kingdoms/factions/relics/Shadow King lines/intro).
- `src/core/Quests.ts` — linear early-game objective chain + `QuestSystem`.
- `src/entities/ShadowRift.ts` — the Blight rift (Hollow nest) the player seals.
- `src/entities/VoxelCharacter.ts` — the articulated, rigged voxel humanoid + procedural animations (idle/walk/run/jump/attack/gather). Reused by hero and enemies.
- `src/entities/Hero.ts` / `Enemy.ts` — player and corrupted-creature entities.
- `src/world/World.ts` — terrain, trees/rocks (gatherables), water, settlement, colliders, per-frame world animation (`update`).
- `src/rendering/` — realism/world systems: `env.ts` (gradient sky dome + procedural ground textures), `terrain.ts` (rolling heightfield + `terrainHeight` sampler used by movement/placement), `vegetation.ts` (instanced wind-animated grass/flowers/mushrooms), `atmosphere.ts` (stars/moon/clouds + `SmokeEmitter`).
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
- **Day/night is time-driven** (`GameState.timeOfDay`, `dayLength ≈ 48s`). Night
  (and enemy waves) begins around `timeOfDay > 0.72`; from the default start
  (`0.35`) that is ~18s of real time. To exercise night combat or the story
  chain quickly during testing, temporarily raise the initial `timeOfDay` (e.g.
  `0.66`) and/or shorten `dayLength`, then revert — do not commit those changes.
- **Story mode flow:** the game starts paused behind a narrative intro overlay
  (`HUD.showIntro`); gameplay begins on "BEGIN". A linear `QuestSystem` drives
  the arc: salvage → fortify → survive the night → seal the Shadow Rift. The
  rift is revealed only after the first night is survived, erupts near the camp,
  spawns Hollow, and is destroyed by attacking near it (large forgiving strike
  radius, no facing requirement) — sealing it triggers the victory overlay.
- **Objectives track *lifetime* gathered wood/stone** (`lifetimeWood`/`Stone`),
  not current inventory, since inventory is spent on building. Starter resource
  nodes are clustered at the spawn so the opening objective is reachable without
  hunting.
- **Gathering auto-targets** the nearest resource node within range (facing only
  boosts priority), so it is forgiving on touch; a few starter trees/rocks are
  placed right next to the spawn point for immediate testing.
- Desktop test controls: WASD move, drag to look, `E` gather, `B` build,
  `J`/`F` attack, `Space` jump, `Shift` run.
- **Rendering pipeline:** ACES tone mapping + sRGB, gradient sky dome synced to
  the sun, `RoomEnvironment` IBL scaled by daylight, PBR (`MeshStandardMaterial`)
  everywhere, and a half-res `UnrealBloom` pass for emissive glows. All tuned to
  stay smooth under software WebGL — if you raise pixel ratio, shadow-map size,
  or bloom resolution, re-check framerate.
- **Ground height is authoritative:** anything placed in the world (entities,
  props, gatherables, structures) must sit on `terrainHeight(x, z)` /
  `world.heightAt`. The settlement/spawn area is intentionally flattened; the
  pond sits in a carved basin.
- **Perf via instancing:** ground cover uses `InstancedMesh` with a wind vertex
  shader injected through `onBeforeCompile`; prefer instancing for any new
  high-count props rather than individual meshes.
- This is still a vertical slice, not the finished commercial game — treat the
  current art/systems as a milestone and keep replacing placeholders.
