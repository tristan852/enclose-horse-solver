# enclose.horse Solver

A standalone browser-based solver for [enclose.horse](https://enclose.horse/), packaged as a static website for GitHub Pages.

It runs a Java solver locally in the browser through WebAssembly. The solver translates each enclose.horse puzzle into an integer linear programming (ILP) problem and solves it with an ILP solver. No puzzle data or solving work needs to be sent to a backend service.

All enclose.horse bonus puzzle types are supported, including Lovebirds, Lovers Quarrel, and Costly Walls.

The repository is designed to be served directly by GitHub Pages or another static host. Its GitHub Actions workflow publishes the site automatically when the `main` branch is updated.

Puzzle data is taken from the raw level payload supplied by enclose.horse. Solution wall characters are not used as puzzle input; walls are selected by the solver.

## License

This project is available under the [GPL-3.0 license](https://github.com/tristan852/enclose-horse-solver/tree/main?tab=GPL-3.0-1-ov-file#).
