# Kestrel Ridge Run

[![Make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/Tiiashtf/makefun-best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/Tiiashtf/makefun-best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A 3D bush-plane flight game for the [make.fun "Make the best flight game" bounty](https://make.fun/c/best-flight-game-20261126-0057).

You are **Kestrel-7**, the valley courier. Three sorties, one flight: thread the
**8 valley rings**, slip the **6 canyon gates** low and fast, then bring her home
for a **touch-and-go on Runway 18** at Kestrel Field. Throttle and turn discipline
win the day — firewalling everywhere burns the fuel dry, and a steep bank at
low speed stalls the wing.

## Play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and fly with keyboard and mouse. No network requests,
no build step — the game runs from its own files.

- **W / S** throttle · **↑ / ↓** pitch · **← / →** bank · **A / D** rudder
- **Drag the mouse** to steer · **G** gear · **F** flaps · **C** camera · **P** pause · **M** sound

Chase and cockpit cameras, a lit HUD (airspeed, altitude AGL, heading,
artificial horizon, compass tape, fuel, damage, throttle), a procedural
valley with a river, runway, hangars and farmsteads, and synthesized
WebAudio engine and wind sound.

## Layout

- `game/` — the playable game (three.js vendored under `game/vendor/`)
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`
- `screenshots/` — real renders of the game
- `shots.json` — the four staged screenshot scenes
