# enclose.horse Solver

The enclose.horse Solver is a standalone browser application for solving
[enclose.horse](https://enclose.horse/) puzzles. It supports the normal game
and all three bonus modes:

- Costly Walls
- Lovebirds
- Lovers Quarrel

All puzzle parsing and solving happens locally in the browser. No puzzle data
or solver requests are sent to a backend.

## How it works

The solver uses [Clingo WASM](https://github.com/domoritz/clingo-wasm) for
Answer Set Programming and optimization.

For each puzzle, the browser:

1. Parses the puzzle map.
2. Generates Clingo facts for the board, including grass, animals, boundaries,
   four-neighbour movement, portals, tile scores, mode, and wall budget.
3. Combines those facts with the reusable model in
   [public/enclose_horse.lp](public/enclose_horse.lp).
4. Uses Clingo to find and enumerate optimal wall configurations.
5. Converts the answer sets into the displayed board solutions.

The ASP model handles wall placement, reachability, enclosure, portal travel,
mode-specific constraints, useful-wall validation, scoring, and costly-wall
penalties.

## Local development

Requirements:

- Node.js 22 or newer
- npm

Install dependencies and start the development server:

```sh
npm ci
npm run dev
```

The development server uses Vite. Open the URL it prints, then use the solver
bookmarklet from an enclose.horse puzzle page.

## Production build

Create the deployable site with:

```sh
npm run build
```

The generated files are written to `dist/`. A local production preview can be
started with:

```sh
npm run preview
```

The Clingo worker and WebAssembly assets are bundled automatically by Vite.
The static ASP model is copied from `public/enclose_horse.lp` into the build
output and loaded by the browser at runtime.

## Deployment

The included GitHub Actions workflow builds and deploys `dist/` to GitHub
Pages whenever `main` is updated, or when the workflow is started manually.

## License

This project is available under the
[GPL-3.0 license](https://github.com/tristan852/enclose-horse-solver/tree/main?tab=GPL-3.0-1-ov-file#).
