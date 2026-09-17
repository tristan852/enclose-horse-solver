# enclose.horse solver

A static Java-to-WebAssembly solver for [enclose.horse](https://enclose.horse/).

## Use

Open the GitHub Pages site, drag **Solve this enclose.horse puzzle** to the bookmarks bar, then open any `enclose.horse/play/...` puzzle and activate the bookmark. The bookmarklet reads the main puzzle from the current page, requests bonus data using the main puzzle ID, and opens the solver with both puzzles.

All solving happens locally in `solver.wasm`. The page does not need a backend or a CORS proxy.

## Publish

Create a repository under [tristan852](https://github.com/tristan852/)—for example, `enclose-horse-solver`—and publish the contents of this folder to its `main` branch. The included GitHub Actions workflow deploys the repository root to GitHub Pages automatically.

If GitHub asks for a Pages source, choose **GitHub Actions**. After the first successful workflow run, the site will be available at:

`https://tristan852.github.io/enclose-horse-solver/`

The WASM runtime requires HTTP(S); do not open `index.html` directly from the local filesystem.
