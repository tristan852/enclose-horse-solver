import { CpModel, CpSolver } from "or-tools-wasm/cp-sat";

const DIRECTIONS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

const MIN_SCORE = Number.MIN_SAFE_INTEGER;
const NEG_INF = -1_000_000_000;
const POS_INF = 1_000_000_000;
const SOLVE_TIME_SECONDS = 120;

const TILE = Object.freeze({
  GRASS: "GRASS",
  WATER: "WATER",
  HORSE: "HORSE",
  UNICORN: "UNICORN",
  CHERRIES: "CHERRIES",
  GOLDEN_APPLE: "GOLDEN_APPLE",
  BEE_SWARM: "BEE_SWARM",
  PORTAL: "PORTAL",
});

const TILE_BY_CHAR = Object.freeze({
  ".": TILE.GRASS,
  "~": TILE.WATER,
  H: TILE.HORSE,
  U: TILE.UNICORN,
  C: TILE.CHERRIES,
  G: TILE.GOLDEN_APPLE,
  S: TILE.BEE_SWARM,
});

function makeGrid(width, height, value = null) {
  return Array.from({ length: width }, () =>
    Array.from({ length: height }, () => value)
  );
}

function addConstraint(model, expression, lb, ub) {
  if (expression == null) {
    throw new Error("Cannot add a constraint for an empty expression.");
  }
  model.addLinearConstraint(expression, lb, ub);
}

function equal(model, expression, value) {
  addConstraint(model, expression, value, value);
}

function atMostOne(model, a, b) {
  if (a == null || b == null) {
    throw new Error("atMostOne requires two expressions.");
  }
  addConstraint(model, a.plus(b), NEG_INF, 1);
}

function plus(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return a.plus(b);
}

function minus(a, b) {
  if (b == null) return a;
  if (a == null) return b.times(-1);
  return a.plus(b.times(-1));
}

function times(expression, coefficient) {
  return expression == null ? null : expression.times(coefficient);
}

function sum(expressions) {
  let result = null;
  for (const expression of expressions) {
    result = plus(result, expression);
  }
  return result;
}

function valueOf(solver, variable) {
  return solver.value(variable) >= 0.5;
}

function decodeBase64Json(encoded) {
  // URL query parameters occasionally contain base64url rather than plain base64.
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function tileType(char) {
  return Object.hasOwn(TILE_BY_CHAR, char) ? TILE_BY_CHAR[char] : TILE.PORTAL;
}

function is(type, expected) {
  return type === expected;
}

function isWater(type) {
  return is(type, TILE.WATER);
}

function isPortal(type) {
  return is(type, TILE.PORTAL);
}

function tileScore(type) {
  switch (type) {
    case TILE.GRASS:
    case TILE.HORSE:
    case TILE.UNICORN:
    case TILE.PORTAL:
      return 1;
    case TILE.CHERRIES:
      return 4;
    case TILE.GOLDEN_APPLE:
      return 11;
    case TILE.BEE_SWARM:
      return -4;
    case TILE.WATER:
    default:
      return 0;
  }
}

function puzzleType(level, bonus) {
  const raw = String(
    level?.bonusType ?? bonus?.type ?? level?.bonus?.type ?? "default"
  ).toLowerCase();

  switch (raw) {
    case "costlywalls":
    case "costly_walls":
    case "costly-walls":
      return "COSTLY_WALLS";
    case "lovebirds":
    case "love_birds":
    case "love-birds":
      return "LOVEBIRDS";
    case "loversquarrel":
    case "lovers_quarrel":
    case "lovers-quarrel":
      return "LOVERS_QUARREL";
    default:
      return "DEFAULT";
  }
}

function parsePuzzle(level, bonus = null) {
  if (!level || typeof level.map !== "string") {
    throw new Error("Invalid puzzle: missing map.");
  }

  const rows = level.map.replace(/\r/g, "").split("\n");
  if (rows.length === 0 || rows[0].length === 0) {
    throw new Error("Invalid puzzle: empty map.");
  }

  const width = rows[0].length;
  const height = rows.length;

  if (!rows.every(row => row.length === width)) {
    throw new Error("Invalid puzzle: map rows have different widths.");
  }

  const tiles = makeGrid(width, height);
  const portals = new Map();

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const char = rows[y][x];
      const type = tileType(char);

      const tile = {
        x,
        y,
        char,
        type,
        portalCharacter: isPortal(type) ? char : null,
      };

      tiles[x][y] = tile;

      if (tile.portalCharacter != null) {
        const cells = portals.get(tile.portalCharacter) ?? [];
        cells.push([x, y]);
        portals.set(tile.portalCharacter, cells);
      }
    }
  }

  return {
    level,
    bonus,
    width,
    height,
    wallBudget: Number(level.budget ?? 0),
    optimalScore:
      level.optimalScore == null
        ? null
        : Number(level.optimalScore),
    type: puzzleType(level, bonus),
    tiles,
    portals,

    tile(x, y) {
      return tiles[x][y];
    },

    tileType(x, y) {
      return tiles[x][y].type;
    },

    portalCharacter(x, y) {
      return tiles[x][y].portalCharacter;
    },

    matchingPortals(x, y) {
      const character = tiles[x][y].portalCharacter;
      return character == null
        ? []
        : portals.get(character) ?? [];
    },
  };
}

/*
 * This intentionally follows PuzzleSolver.java's portal traversal: once a
 * matching portal is found, only that first match is traversed. PuzzleTileType
 * equality in the Java solver therefore maps to equality of the portal char.
 */
function explore(puzzle, x, y, reachable) {
  if (reachable[x][y]) return;

  reachable[x][y] = true;

  for (const [dx, dy] of DIRECTIONS) {
    const nx = x + dx;
    const ny = y + dy;

    if (
      nx < 0 ||
      nx >= puzzle.width ||
      ny < 0 ||
      ny >= puzzle.height
    ) {
      continue;
    }

    if (isWater(puzzle.tileType(nx, ny))) {
      continue;
    }

    explore(puzzle, nx, ny, reachable);
  }

  if (!isPortal(puzzle.tileType(x, y))) {
    return;
  }

  for (const [nx, ny] of puzzle.matchingPortals(x, y)) {
    if (nx === x && ny === y) {
      continue;
    }

    explore(puzzle, nx, ny, reachable);
    break;
  }
}

function calculateStaticReachability(puzzle) {
  const horse = makeGrid(
    puzzle.width,
    puzzle.height,
    false
  );

  const unicorn = makeGrid(
    puzzle.width,
    puzzle.height,
    false
  );

  for (let x = 0; x < puzzle.width; x++) {
    for (let y = 0; y < puzzle.height; y++) {
      const type = puzzle.tileType(x, y);

      if (is(type, TILE.HORSE)) {
        explore(puzzle, x, y, horse);
      } else if (is(type, TILE.UNICORN)) {
        explore(puzzle, x, y, unicorn);
      }
    }
  }

  return {
    horse,
    unicorn,
  };
}

class PuzzleSolver {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.model = new CpModel();

    const {
      width,
      height,
    } = puzzle;

    this.wall = makeGrid(width, height);
    this.horse = makeGrid(width, height);
    this.unicorn = makeGrid(width, height);

    this.horseReachable = null;
    this.unicornReachable = null;

    this.horseFlowBalance = makeGrid(width, height);
    this.unicornFlowBalance = makeGrid(width, height);

    this.optimalScoreExpression = null;
    this.nextObjectiveBound = null;
    this.lastObjective = null;

    this.initialize();
  }

  initialize() {
    const {
      puzzle,
      model,
    } = this;

    const {
      width,
      height,
    } = puzzle;

    const allWalls = [];

    /*
     * ----------------------------------------------------------------------
     * Variables and all constraints that do not depend on graph edges.
     * ----------------------------------------------------------------------
     */
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const wall = model.newBoolVar(
          `tileHasWall${x},${y}`
        );

        const horse = model.newBoolVar(
          `tileIsHorseReachable${x},${y}`
        );

        const unicorn = model.newBoolVar(
          `tileIsUnicornReachable${x},${y}`
        );

        this.wall[x][y] = wall;
        this.horse[x][y] = horse;
        this.unicorn[x][y] = unicorn;

        allWalls.push(wall);

        switch (puzzle.type) {
          case "LOVEBIRDS":
            equal(
              model,
              horse.plus(unicorn.times(-1)),
              0
            );
            break;

          case "LOVERS_QUARREL":
            atMostOne(
              model,
              horse,
              unicorn
            );
            break;

          default:
            equal(
              model,
              unicorn,
              0
            );
            break;
        }

        /*
         * A wall cannot coexist with a reachable animal.
         */
        atMostOne(
          model,
          wall,
          horse
        );

        atMostOne(
          model,
          wall,
          unicorn
        );

        const type = puzzle.tileType(x, y);

        /*
         * Starting cells are always reachable.
         */
        if (is(type, TILE.HORSE)) {
          equal(
            model,
            horse,
            1
          );
        }

        if (is(type, TILE.UNICORN)) {
          equal(
            model,
            unicorn,
            1
          );
        }

        /*
         * Only GRASS can become a wall.
         */
        if (!is(type, TILE.GRASS)) {
          equal(
            model,
            wall,
            0
          );
        }

        /*
         * Edge and water cells cannot be animal-reachable.
         */
        const edge =
          x === 0 ||
          x === width - 1 ||
          y === 0 ||
          y === height - 1;

        if (
          isWater(type) ||
          edge
        ) {
          equal(
            model,
            horse,
            0
          );

          equal(
            model,
            unicorn,
            0
          );
        }
      }
    }

    /*
     * Wall budget.
     */
    addConstraint(
      model,
      sum(allWalls),
      0,
      puzzle.wallBudget
    );

    /*
     * Static reachability.
     */
    const reachable =
      calculateStaticReachability(puzzle);

    this.horseReachable =
      reachable.horse;

    this.unicornReachable =
      reachable.unicorn;

    /*
     * Cells which are statically unreachable cannot be reachable in the
     * final solution. If neither animal can ever reach a cell, it cannot
     * be useful as a wall either.
     */
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (!this.horseReachable[x][y]) {
          equal(
            model,
            this.horse[x][y],
            0
          );
        }

        if (!this.unicornReachable[x][y]) {
          equal(
            model,
            this.unicorn[x][y],
            0
          );
        }

        if (
          !this.horseReachable[x][y] &&
          !this.unicornReachable[x][y]
        ) {
          equal(
            model,
            this.wall[x][y],
            0
          );
        }
      }
    }

    /*
     * Java starts these at -1 and increments once for each statically
     * reachable cell.
     */
    const maxFlow =
      this.countReachable(
        this.horseReachable
      ) - 1;

    const maxFlow2 =
      this.countReachable(
        this.unicornReachable
      ) - 1;

    this.initializeFlowBalances();

    this.initializeFlowEdges(
      maxFlow,
      maxFlow2
    );

    this.finalizeFlowBalances();

    this.buildObjective();
  }

  countReachable(grid) {
    let count = 0;

    for (const column of grid) {
      for (const reachable of column) {
        if (reachable) {
          count++;
        }
      }
    }

    return count;
  }

  initializeFlowBalances() {
    const { puzzle } = this;

    for (let x = 0; x < puzzle.width; x++) {
      for (let y = 0; y < puzzle.height; y++) {
        const type =
          puzzle.tileType(x, y);

        const horseTerms = [];
        const unicornTerms = [];

        /*
         * Horse source.
         *
         * Java's source cell initially receives every horse reachable
         * variable as positive flow balance.
         */
        if (is(type, TILE.HORSE)) {
          for (
            let x2 = 0;
            x2 < puzzle.width;
            x2++
          ) {
            for (
              let y2 = 0;
              y2 < puzzle.height;
              y2++
            ) {
              horseTerms.push(
                this.horse[x2][y2]
              );
            }
          }
        } else {
          horseTerms.push(
            times(
              this.horse[x][y],
              -1
            )
          );
        }

        /*
         * Unicorn source.
         */
        if (is(type, TILE.UNICORN)) {
          for (
            let x2 = 0;
            x2 < puzzle.width;
            x2++
          ) {
            for (
              let y2 = 0;
              y2 < puzzle.height;
              y2++
            ) {
              unicornTerms.push(
                this.unicorn[x2][y2]
              );
            }
          }
        } else {
          unicornTerms.push(
            times(
              this.unicorn[x][y],
              -1
            )
          );
        }

        this.horseFlowBalance[x][y] =
          sum(horseTerms);

        this.unicornFlowBalance[x][y] =
          sum(unicornTerms);
      }
    }
  }

  initializeFlowEdges(
    maxFlow,
    maxFlow2
  ) {
    const {
      puzzle,
    } = this;

    for (
      let x = 0;
      x < puzzle.width;
      x++
    ) {
      for (
        let y = 0;
        y < puzzle.height;
        y++
      ) {
        const type =
          puzzle.tileType(x, y);

        if (isWater(type)) {
          continue;
        }

        const horseReachable =
          this.horseReachable[x][y];

        const unicornReachable =
          this.unicornReachable[x][y];

        if (
          !horseReachable &&
          !unicornReachable
        ) {
          continue;
        }

        /*
         * --------------------------------------------------------------
         * Normal four-way edges.
         * --------------------------------------------------------------
         */
        for (const [dx, dy] of DIRECTIONS) {
          const nx = x + dx;
          const ny = y + dy;

          if (
            nx < 0 ||
            nx >= puzzle.width ||
            ny < 0 ||
            ny >= puzzle.height
          ) {
            continue;
          }

          if (
            isWater(
              puzzle.tileType(nx, ny)
            )
          ) {
            continue;
          }

          const ownWall =
            this.wall[x][y];

          const neighbourWall =
            this.wall[nx][ny];

          if (horseReachable) {
            this.addAnimalEdge(
              "horse",
              x,
              y,
              nx,
              ny,
              ownWall,
              neighbourWall,
              this.horse,
              this.horseFlowBalance,
              maxFlow,
              `flow${x},${y},${nx},${ny}`
            );
          }

          if (unicornReachable) {
            this.addAnimalEdge(
              "unicorn",
              x,
              y,
              nx,
              ny,
              ownWall,
              neighbourWall,
              this.unicorn,
              this.unicornFlowBalance,
              maxFlow2,
              `flow2${x},${y},${nx},${ny}`
            );
          }
        }

        /*
         * --------------------------------------------------------------
         * Portal edge.
         * --------------------------------------------------------------
         *
         * This preserves PuzzleSolver.java's first-match behavior.
         */
        if (isPortal(type)) {
          const match =
            this.firstPortalMatch(
              puzzle,
              x,
              y
            );

          if (match) {
            const [nx, ny] = match;

            const distance =
              Math.abs(nx - x) +
              Math.abs(ny - y);

            if (distance > 1) {
              if (horseReachable) {
                this.addPortalEdge(
                  "horse",
                  x,
                  y,
                  nx,
                  ny,
                  this.horse,
                  this.horseFlowBalance,
                  maxFlow,
                  `portalFlow${x},${y},${nx},${ny}`
                );
              }

              if (unicornReachable) {
                this.addPortalEdge(
                  "unicorn",
                  x,
                  y,
                  nx,
                  ny,
                  this.unicorn,
                  this.unicornFlowBalance,
                  maxFlow2,
                  `portalFlow2${x},${y},${nx},${ny}`
                );
              }
            }
          }
        }
      }
    }
  }

  firstPortalMatch(
    puzzle,
    x,
    y
  ) {
    for (
      const [nx, ny]
      of puzzle.matchingPortals(x, y)
    ) {
      if (
        nx === x &&
        ny === y
      ) {
        continue;
      }

      return [
        nx,
        ny,
      ];
    }

    return null;
  }

  addAnimalEdge(
    kind,
    x,
    y,
    nx,
    ny,
    ownWall,
    neighbourWall,
    reachable,
    balance,
    maxFlow,
    name
  ) {
    const {
      model,
    } = this;

    const source =
      reachable[x][y];

    const target =
      reachable[nx][ny];

    /*
     * source - neighbourWall - target <= 0
     *
     * This is the Java reachability implication:
     *
     * reachable(source) =>
     *   reachable(target) && !wall(target)
     */
    addConstraint(
      model,
      sum([
        source,
        times(
          neighbourWall,
          -1
        ),
        times(
          target,
          -1
        ),
      ]),
      NEG_INF,
      0
    );

    const flow =
      model.newIntVar(
        0,
        maxFlow,
        name
      );

    balance[x][y] =
      minus(
        balance[x][y],
        flow
      );

    balance[nx][ny] =
      plus(
        balance[nx][ny],
        flow
      );

    /*
     * Flow is disabled by a wall on either endpoint.
     */
    addConstraint(
      model,
      plus(
        flow,
        times(
          neighbourWall,
          maxFlow
        )
      ),
      0,
      maxFlow
    );

    addConstraint(
      model,
      plus(
        flow,
        times(
          ownWall,
          maxFlow
        )
      ),
      0,
      maxFlow
    );
  }

  addPortalEdge(
    kind,
    x,
    y,
    nx,
    ny,
    reachable,
    balance,
    maxFlow,
    name
  ) {
    const {
      model,
    } = this;

    const source =
      reachable[x][y];

    const target =
      reachable[nx][ny];

    /*
     * source - target <= 0
     */
    addConstraint(
      model,
      sum([
        source,
        times(
          target,
          -1
        ),
      ]),
      NEG_INF,
      0
    );

    const flow =
      model.newIntVar(
        0,
        maxFlow,
        name
      );

    balance[x][y] =
      minus(
        balance[x][y],
        flow
      );

    balance[nx][ny] =
      plus(
        balance[nx][ny],
        flow
      );
  }

  finalizeFlowBalances() {
    const {
      puzzle,
      model,
    } = this;

    for (
      let x = 0;
      x < puzzle.width;
      x++
    ) {
      for (
        let y = 0;
        y < puzzle.height;
        y++
      ) {
        const type =
          puzzle.tileType(x, y);

        equal(
          model,
          this.horseFlowBalance[x][y],
          is(type, TILE.HORSE)
            ? 1
            : 0
        );

        equal(
          model,
          this.unicornFlowBalance[x][y],
          is(type, TILE.UNICORN)
            ? 1
            : 0
        );
      }
    }
  }

  buildObjective() {
    const {
      puzzle,
      model,
    } = this;

    const terms = [];

    for (
      let x = 0;
      x < puzzle.width;
      x++
    ) {
      for (
        let y = 0;
        y < puzzle.height;
        y++
      ) {
        const score =
          tileScore(
            puzzle.tileType(x, y)
          );

        if (score !== 0) {
          terms.push(
            times(
              this.horse[x][y],
              score
            )
          );

          terms.push(
            times(
              this.unicorn[x][y],
              score
            )
          );
        }

        if (
          puzzle.type ===
          "COSTLY_WALLS"
        ) {
          terms.push(
            times(
              this.wall[x][y],
              -6
            )
          );
        }
      }
    }

    this.optimalScoreExpression =
      sum(terms);

    if (
      this.optimalScoreExpression ==
      null
    ) {
      throw new Error(
        "Could not construct objective expression."
      );
    }

    model.maximize(
      this.optimalScoreExpression
    );
  }

  blacklistSolution(solution) {
    const {
      puzzle,
      model,
    } = this;

    let wallsUsed = 0;
    const terms = [];

    for (
      let x = 0;
      x < puzzle.width;
      x++
    ) {
      for (
        let y = 0;
        y < puzzle.height;
        y++
      ) {
        if (
          solution.isWall[x][y]
        ) {
          wallsUsed++;

          terms.push(
            times(
              this.wall[x][y],
              -1
            )
          );
        } else {
          terms.push(
            this.wall[x][y]
          );
        }
      }
    }

    addConstraint(
      model,
      sum(terms),
      1 - wallsUsed,
      POS_INF
    );
  }

  addMinimumScore(minScore) {
    if (
      minScore !== MIN_SCORE
    ) {
      const trueMinScore =
        this.puzzle.type ===
        "LOVEBIRDS"
          ? minScore * 2
          : minScore;

      addConstraint(
        this.model,
        this.optimalScoreExpression,
        trueMinScore,
        POS_INF
      );
    }

    /*
     * The Java implementation fixes the objective after a solve when
     * searching for subsequent solutions. CP-SAT's JS wrapper does not
     * expose the same mutable constraint API, so retain the equivalent
     * objective bound and add it before subsequent solves.
     */
    if (this.nextObjectiveBound) {
      addConstraint(
        this.model,
        this.optimalScoreExpression,
        this.nextObjectiveBound.lower,
        this.nextObjectiveBound.upper
      );
    }
  }

  async solve(
    minScore = MIN_SCORE
  ) {
    this.addMinimumScore(
      minScore
    );

    const solver =
      new CpSolver();

    console.log(
      "Starting CP-SAT solve..."
    );

    const status =
      await solver.solve(
        this.model,
        {
          maxTimeInSeconds:
            SOLVE_TIME_SECONDS,
          numSearchWorkers: 1,
        }
      );

    const statusName =
      solver.statusName(
        status
      );

    console.log(
      "Solver status:",
      statusName
    );

    if (
      statusName !== "OPTIMAL" &&
      statusName !== "FEASIBLE"
    ) {
      return null;
    }

    const {
      puzzle,
    } = this;

    const isWall =
      makeGrid(
        puzzle.width,
        puzzle.height,
        false
      );

    const isEnclosed =
      makeGrid(
        puzzle.width,
        puzzle.height,
        false
      );

    let wallCount = 0;
    let score = 0;

    for (
      let x = 0;
      x < puzzle.width;
      x++
    ) {
      for (
        let y = 0;
        y < puzzle.height;
        y++
      ) {
        isWall[x][y] =
          valueOf(
            solver,
            this.wall[x][y]
          );

        isEnclosed[x][y] =
          valueOf(
            solver,
            this.horse[x][y]
          ) ||
          valueOf(
            solver,
            this.unicorn[x][y]
          );

        if (
          isWall[x][y]
        ) {
          wallCount++;
        }

        if (
          isEnclosed[x][y]
        ) {
          score +=
            tileScore(
              puzzle.tileType(
                x,
                y
              )
            );
        }
      }
    }

    if (
      puzzle.type ===
      "COSTLY_WALLS"
    ) {
      score -=
        6 * wallCount;
    }

    let objectiveValue =
      solver.objectiveValue();

    if (
      puzzle.type ===
      "LOVEBIRDS"
    ) {
      objectiveValue *= 0.5;
    }

    console.log(
      "Computed score:",
      score
    );

    console.log(
      "Objective:",
      objectiveValue
    );

    console.log(
      "Walls:",
      wallCount
    );

    if (
      Math.abs(
        score -
        objectiveValue
      ) >= 1e-4
    ) {
      console.warn(
        `Computed score (${score}) differs from CP-SAT objective (${objectiveValue}).`
      );
    }

    /*
     * Java tightens optimalScoreConstraint after every solve.
     *
     * For an OPTIMAL result, require exactly the objective found.
     * For a FEASIBLE result, retain the objective as a lower bound.
     */
    const roundedObjective =
      Math.round(
        solver.objectiveValue()
      );

    this.lastObjective =
      roundedObjective;

    if (
      statusName === "OPTIMAL"
    ) {
      this.nextObjectiveBound = {
        lower: roundedObjective,
        upper: roundedObjective,
      };
    } else {
      this.nextObjectiveBound = {
        lower: roundedObjective,
        upper: POS_INF,
      };
    }

    return {
      puzzle,
      score,
      objectiveValue,
      isWall,
      isEnclosed,
      wallsUsed: wallCount,
      status: statusName,
    };
  }
}

function formatBoard(
  puzzle,
  solution
) {
  return Array.from(
    {
      length:
        puzzle.height,
    },
    (_, y) =>
      Array.from(
        {
          length:
            puzzle.width,
        },
        (_, x) =>
          solution.isWall[x][y]
            ? "#"
            : puzzle.tile(x, y).char
      ).join("")
  );
}

function logPuzzle(puzzle) {
  const portals =
    Object.fromEntries(
      [
        ...puzzle.portals.entries(),
      ].map(
        ([character, cells]) =>
          [
            character,
            cells,
          ]
      )
    );

  console.log(
    "Board:",
    `${puzzle.width} × ${puzzle.height}`
  );

  console.log(
    "Puzzle type:",
    puzzle.type
  );

  console.log(
    "Wall budget:",
    puzzle.wallBudget
  );

  console.log(
    "Optimal score:",
    puzzle.optimalScore
  );

  console.log(
    "Portals:",
    portals
  );
}

async function main() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const levelEncoded =
    params.get("level");

  if (!levelEncoded) {
    console.log(
      "No puzzle supplied. Open an enclose.horse puzzle and use the bookmarklet."
    );

    return;
  }

  let level;
  let bonus = null;

  try {
    level =
      decodeBase64Json(
        levelEncoded
      );

    const bonusEncoded =
      params.get("bonus");

    if (bonusEncoded) {
      bonus =
        decodeBase64Json(
          bonusEncoded
        );
    }
  } catch (error) {
    console.error(
      "Failed to decode puzzle data:",
      error
    );

    throw new Error(
      "Could not decode puzzle data.",
      {
        cause: error,
      }
    );
  }

  console.log(
    "Level:",
    level
  );

  console.log(
    "Bonus:",
    bonus
  );

  const puzzle =
    parsePuzzle(
      level,
      bonus
    );

  logPuzzle(
    puzzle
  );

  /*
   * Verify that this or-tools-wasm build exposes the API used below.
   */
  const apiProbe =
    new CpModel();

  if (
    typeof apiProbe.addLinearConstraint !==
    "function"
  ) {
    throw new Error(
      "This or-tools-wasm version does not expose CpModel.addLinearConstraint()."
    );
  }

  const puzzleSolver =
    new PuzzleSolver(
      puzzle
    );

  const solution =
    await puzzleSolver.solve();

  if (!solution) {
    console.log(
      "No feasible solution found."
    );

    return;
  }

  console.log(
    "Solution:",
    solution
  );

  console.table(
    formatBoard(
      puzzle,
      solution
    )
  );
}

main().catch(
  error => {
    console.error(
      "Solver failed:",
      error
    );
  }
);
