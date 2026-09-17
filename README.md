# enclose.horse Solver

The enclose.horse Solver is a standalone browser solver for [enclose.horse](https://enclose.horse/). It runs locally in the browser and supports the main puzzles and all bonus puzzle types.

The site translates an enclose.horse puzzle into an integer linear programming (ILP) model and solves it with Google OR-Tools compiled to WebAssembly through [`or-tools-wasm`](https://github.com/Axelwickm/or-tools-wasm). Puzzle data and solving stay in the browser; no solver backend is required.

The static files in this repository can be served directly by GitHub Pages. The included GitHub Actions workflow publishes the repository contents whenever `main` is updated.

## License

This project is available under the [GPL-3.0 license](https://github.com/tristan852/enclose-horse-solver/tree/main?tab=GPL-3.0-1-ov-file#).
