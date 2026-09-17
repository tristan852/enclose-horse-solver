# enclose.horse Solver

This project is a standalone, static solver companion for [enclose.horse](https://enclose.horse/). It brings the puzzle-solving experience into a lightweight GitHub Pages site while keeping the solver itself in the browser.

## Highlights

- Java solver compiled to WebAssembly with TeaVM’s WebAssembly GC backend.
- Exact optimal-score constraints when a level provides its known optimum.
- Up to 10 optimal solutions with previous/next navigation and a `10+` indicator when more are available.
- Correct handling of grass, water, walls, creatures, collectible tiles, and linked portals.
- Solution rendering that highlights walls and enclosed non-water cells.
- Separate visual treatment for bonus rounds, including formatted bonus types.
- Web Worker execution so long-running solves do not block the page interface.
- Bookmarklet integration that reads the active `enclose.horse` puzzle and retrieves bonus data using the main puzzle ID.

## Project structure

The site is intentionally backend-free. `index.html` provides the interface, `app.js` coordinates the bookmarklet and presentation, `solver-worker.js` runs the WebAssembly solver off the main thread, and `solver.wasm` contains the compiled Java solver. `solver.wasm-runtime.js` is the TeaVM runtime required to load the module.

The site is deployable as-is to any static host, including GitHub Pages. The included workflow publishes the repository root whenever the `main` branch changes.

## Puzzle display

Map dimensions scale to the available screen while preserving cell and grid-gap proportions. Water is rendered with restrained decoration (`🌊` and occasional `⛵`), while each portal uses `🌀`; portal colors are derived from their ASCII symbols so matching portals remain visually identifiable.

## License

This repository contains the enclose.horse solver website and its browser-targeted solver implementation.
