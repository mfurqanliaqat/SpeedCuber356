# SpeedCuber356

Speedcubing trainer for the GAN356 i Carry 2 (and other GAN smart cubes), as a macOS app.

The sidebar has three groups:

- **Practice**
  - **Reverse moves:** do a few moves, then undo them from memory; each success adds a move.
  - **Muscle training:** finger-trick drills (sexy move, sledgehammer, Sune…), 6 reps per set, timed with turns per second.
  - **Algorithm training:** the solver sets up a random 2-look OLL/PLL case on your cube, then times the algorithm; times are kept per case.
- **CFOP:** Full solve, Cross, F2L, OLL, PLL. Live 3D cube, guided scramble with arrows and a red glow on wrong turns, automatic splits, pause (Space) and restart (trace back or shortest way). F2L/OLL/PLL set up a random practice case from whatever state your cube is in.
- **Progress:** History (chart, +2/DNF, replay) and Learn (roadmap, 16 algorithms with demos).

Cube already scrambled? The app notices when you connect (or press **Solve as is**) and times your solve from its current state, saved under the mode you're in.

Without a cube connected, hold and release space to time like a normal timer.

## Run

```
npm install
npm run dev      # app with instant reload while editing
npm run dist     # builds release/mac-arm64/SpeedCuber356.app
npm test         # cube model + algorithm checks
```

If `npm install` skips Electron's download (install scripts disabled), run `node node_modules/electron/install.js`.

## Connecting the cube

Click **Connect cube** with the cube awake (turn it a bit). The app picks the first GAN cube it finds, with no device picker.
GAN encrypts its data with the cube's Bluetooth address. The app tries to read it from the cube's advertisement; if that fails it asks once and remembers it (find it in GAN Cube Station under the cube's info).
After the first connection it reconnects by itself when the app opens or the cube wakes up (Settings → auto-connect).

The cube reports white on top and green in front, so follow scrambles in that orientation. While solving, the 3D view turns yellow-on-top by default (Settings).

If the app and your real cube disagree, press **Sync** (reads the cube's state) or, with the real cube solved, **My cube is solved**.

## Code

- `src/cube.js`: 54-sticker cube model; moves are derived from geometry, phases (cross / first layer / F2L / OLL / solved) work for any face.
- `src/session.js`: scramble → inspection → solve flow, split detection, timing from the cube's clock (csTimer-style linear fit).
- `src/gan.js`: wrapper over [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth).
- `src/view3d.js`: three.js cube; `src/net.js`: flat net and case diagrams.
- `electron/main.cjs`: window, auto-selects the cube instead of Chrome's picker, grants the user gesture for auto-connect.

In dev, `__debug.fakeCube()` then `__debug.turns("R U R' U'")` in DevTools simulates a cube.

## License

MIT, see [LICENSE](LICENSE). Not affiliated with GAN; the GAN logo on the 3D cube belongs to its owner.
