import {
  initMPSolver,
  MPSolver,
} from "or-tools-wasm/mp-solver";

const DIRECTIONS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

const MIN_SCORE = -2147483648;
const NEG_INF = -1_000_000_000;
const POS_INF = 1_000_000_000;

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
  return Array.from(
    { length: width },
    () => Array.from({ length: height }, () => value)
  );
}

function addConstraint(
  solver,
  terms,
  lb,
  ub,
  name = ""
) {
  const constraint =
    solver.Constraint(lb, ub, name);

  for (const [variable, coefficient] of terms) {
    if (coefficient !== 0) {
      constraint.SetCoefficient(
        variable,
        coefficient
      );
    }
  }

  return constraint;
}

function equal(
  solver,
  terms,
  value,
  name = ""
) {
  return addConstraint(
    solver,
    terms,
    value,
    value,
    name
  );
}

function atMostOne(
  solver,
  a,
  b,
  name = ""
) {
  return addConstraint(
    solver,
    [
      [a, 1],
      [b, 1],
    ],
    NEG_INF,
    1,
    name
  );
}

function sumVariables(variables) {
  return variables.map(variable => [
    variable,
    1,
  ]);
}

function valueOf(variable) {
  return (
    variable.solution_value() >= 0.5
  );
}

function decodeBase64Json(encoded) {
  const normalized = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized.padEnd(
    Math.ceil(normalized.length / 4) * 4,
    "="
  );

  const binary = atob(padded);

  const bytes = Uint8Array.from(
    binary,
    char => char.charCodeAt(0)
  );

  return JSON.parse(
    new TextDecoder().decode(bytes)
  );
}

function tileType(char) {
  return Object.hasOwn(
    TILE_BY_CHAR,
    char
  )
    ? TILE_BY_CHAR[char]
    : TILE.PORTAL;
}

function is(type, expected) {
  return type === expected;
}

function isWater(type) {
  return type === TILE.WATER;
}

function isPortal(type) {
  return type === TILE.PORTAL;
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

function puzzleType(type) {
  if(type == null) return "default";
  
  switch (type) {
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

function parsePuzzle(
  level,
  isBonus = false
) {
  if (
    !level ||
    typeof level.map !== "string"
  ) {
    throw new Error(
      "Invalid puzzle: missing map."
    );
  }

  const rows = level.map
    .replace(/\r/g, "")
    .split("\n");

  if (
    rows.length === 0 ||
    rows[0].length === 0
  ) {
    throw new Error(
      "Invalid puzzle: empty map."
    );
  }

  const width = rows[0].length;
  const height = rows.length;

  if (
    !rows.every(
      row => row.length === width
    )
  ) {
    throw new Error(
      "Invalid puzzle: map rows have different widths."
    );
  }

  const tiles = makeGrid(
    width,
    height
  );

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
        portalCharacter:
          isPortal(type)
            ? char
            : null,
      };

      tiles[x][y] = tile;

      if (
        tile.portalCharacter != null
      ) {
        const cells =
          portals.get(
            tile.portalCharacter
          ) ?? [];

        cells.push([x, y]);

        portals.set(
          tile.portalCharacter,
          cells
        );
      }
    }
  }

  return {
    level,
    
    width,
    height,

    wallBudget: Number(
      level.budget ?? 0
    ),

    optimalScore:
      level.optimalScore == null
        ? null
        : Number(level.optimalScore),

    type: puzzleType(
      isBonus ? level.bonusType : null
    ),

    tiles,
    portals,

    tile(x, y) {
      return tiles[x][y];
    },

    tileType(x, y) {
      return tiles[x][y].type;
    },

    portalCharacter(x, y) {
      return tiles[x][y]
        .portalCharacter;
    },

    matchingPortals(x, y) {
      const character =
        tiles[x][y]
          .portalCharacter;

      return character == null
        ? []
        : portals.get(character) ?? [];
    },
  };
}

/*
 * Intentionally follows PuzzleSolver.java's
 * portal traversal:
 *
 * after finding the first matching portal,
 * traversal stops.
 */
function explore(
  puzzle,
  x,
  y,
  reachable
) {
  if (reachable[x][y]) {
    return;
  }

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

    if (
      isWater(
        puzzle.tileType(nx, ny)
      )
    ) {
      continue;
    }

    explore(
      puzzle,
      nx,
      ny,
      reachable
    );
  }

  if (
    !isPortal(
      puzzle.tileType(x, y)
    )
  ) {
    return;
  }

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

    explore(
      puzzle,
      nx,
      ny,
      reachable
    );

    break;
  }
}

function calculateStaticReachability(
  puzzle
) {
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

      if (
        is(type, TILE.HORSE)
      ) {
        explore(
          puzzle,
          x,
          y,
          horse
        );
      } else if (
        is(type, TILE.UNICORN)
      ) {
        explore(
          puzzle,
          x,
          y,
          unicorn
        );
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

    this.model =
      MPSolver.CreateSolver(
        "SCIP"
      );

    if (!this.model) {
      throw new Error(
        "SCIP MPSolver backend is unavailable."
      );
    }

    /*
     * or-tools-wasm exposes SetNumThreads().
     *
     * This is optional because the package defaults
     * to one thread, but explicitly setting it keeps
     * the intended behavior.
     */
    const threadsSet =
      this.model.SetNumThreads(1);

    if (threadsSet === false) {
      console.warn(
        "SCIP did not accept SetNumThreads(1)."
      );
    }

    this.wall = makeGrid(
      puzzle.width,
      puzzle.height
    );

    this.horse = makeGrid(
      puzzle.width,
      puzzle.height
    );

    this.unicorn = makeGrid(
      puzzle.width,
      puzzle.height
    );

    this.horseReachable = null;
    this.unicornReachable = null;

    this.horseFlowBalance =
      makeGrid(
        puzzle.width,
        puzzle.height
      );

    this.unicornFlowBalance =
      makeGrid(
        puzzle.width,
        puzzle.height
      );

    this.optimalScoreExpression = [];
    this.optimalScoreConstraint = null;

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
     * Variables and static constraints.
     */
    for (
      let x = 0;
      x < width;
      x++
    ) {
      for (
        let y = 0;
        y < height;
        y++
      ) {
        const wall =
          model.BoolVar(
            `tileHasWall${x},${y}`
          );

        const horse =
          model.BoolVar(
            `tileIsHorseReachable${x},${y}`
          );

        const unicorn =
          model.BoolVar(
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
              [
                [horse, 1],
                [unicorn, -1],
              ],
              0,
              `lovebirds${x},${y}`
            );
            break;

          case "LOVERS_QUARREL":
            atMostOne(
              model,
              horse,
              unicorn,
              `loversQuarrel${x},${y}`
            );
            break;

          default:
            equal(
              model,
              [[unicorn, 1]],
              0,
              `noUnicorn${x},${y}`
            );
            break;
        }

        atMostOne(
          model,
          wall,
          horse,
          `wallHorse${x},${y}`
        );

        atMostOne(
          model,
          wall,
          unicorn,
          `wallUnicorn${x},${y}`
        );

        const type =
          puzzle.tileType(x, y);

        if (
          is(type, TILE.HORSE)
        ) {
          equal(
            model,
            [[horse, 1]],
            1,
            `horseStart${x},${y}`
          );
        }

        if (
          is(type, TILE.UNICORN)
        ) {
          equal(
            model,
            [[unicorn, 1]],
            1,
            `unicornStart${x},${y}`
          );
        }

        /*
         * Only GRASS can become a wall.
         */
        if (
          !is(type, TILE.GRASS)
        ) {
          equal(
            model,
            [[wall, 1]],
            0,
            `nonGrassWall${x},${y}`
          );
        }

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
            [[horse, 1]],
            0,
            `horseEdge${x},${y}`
          );

          equal(
            model,
            [[unicorn, 1]],
            0,
            `unicornEdge${x},${y}`
          );
        }
      }
    }

    /*
     * Wall budget.
     */
    addConstraint(
      model,
      sumVariables(allWalls),
      0,
      puzzle.wallBudget,
      "wallBudget"
    );

    /*
     * Static reachability.
     */
    const reachable =
      calculateStaticReachability(
        puzzle
      );

    this.horseReachable =
      reachable.horse;

    this.unicornReachable =
      reachable.unicorn;

    for (
      let x = 0;
      x < width;
      x++
    ) {
      for (
        let y = 0;
        y < height;
        y++
      ) {
        if (
          !this.horseReachable[x][y]
        ) {
          equal(
            model,
            [[this.horse[x][y], 1]],
            0,
            `horseStatic${x},${y}`
          );
        }

        if (
          !this.unicornReachable[x][y]
        ) {
          equal(
            model,
            [[this.unicorn[x][y], 1]],
            0,
            `unicornStatic${x},${y}`
          );
        }

        if (
          !this.horseReachable[x][y] &&
          !this.unicornReachable[x][y]
        ) {
          equal(
            model,
            [[this.wall[x][y], 1]],
            0,
            `wallStatic${x},${y}`
          );
        }
      }
    }

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

    for (
      const column of grid
    ) {
      for (
        const reachable of column
      ) {
        if (reachable) {
          count++;
        }
      }
    }

    return count;
  }

  initializeFlowBalances() {
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

        const horseTerms = [];
        const unicornTerms = [];

        if (
          is(type, TILE.HORSE)
        ) {
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
              horseTerms.push([
                this.horse[x2][y2],
                1,
              ]);
            }
          }
        } else {
          horseTerms.push([
            this.horse[x][y],
            -1,
          ]);
        }

        if (
          is(type, TILE.UNICORN)
        ) {
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
              unicornTerms.push([
                this.unicorn[x2][y2],
                1,
              ]);
            }
          }
        } else {
          unicornTerms.push([
            this.unicorn[x][y],
            -1,
          ]);
        }

        this.horseFlowBalance[x][y] =
          horseTerms;

        this.unicornFlowBalance[x][y] =
          unicornTerms;
      }
    }
  }

  addFlowToBalance(
    balance,
    x,
    y,
    variable,
    coefficient
  ) {
    balance[x][y].push([
      variable,
      coefficient,
    ]);
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

        for (
          const [dx, dy]
          of DIRECTIONS
        ) {
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
              puzzle.tileType(
                nx,
                ny
              )
            )
          ) {
            continue;
          }

          const ownWall =
            this.wall[x][y];

          const neighbourWall =
            this.wall[nx][ny];

          if (
            horseReachable
          ) {
            this.addAnimalEdge(
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

          if (
            unicornReachable
          ) {
            this.addAnimalEdge(
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

        if (isPortal(type)) {
          const match =
            this.firstPortalMatch(
              puzzle,
              x,
              y
            );

          if (match) {
            const [nx, ny] =
              match;

            const distance =
              Math.abs(nx - x) +
              Math.abs(ny - y);

            if (distance > 1) {
              if (
                horseReachable
              ) {
                this.addPortalEdge(
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

              if (
                unicornReachable
              ) {
                this.addPortalEdge(
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

      return [nx, ny];
    }

    return null;
  }

  addAnimalEdge(
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
    const source =
      reachable[x][y];

    const target =
      reachable[nx][ny];

    /*
     * source - neighbourWall - target <= 0
     */
    addConstraint(
      this.model,
      [
        [source, 1],
        [neighbourWall, -1],
        [target, -1],
      ],
      NEG_INF,
      0,
      `${name}_reachable`
    );

    const flow =
      this.model.NumVar(
        0,
        maxFlow,
        name
      );

    balance[x][y].push([
      flow,
      -1,
    ]);

    balance[nx][ny].push([
      flow,
      1,
    ]);

    /*
     * flow + maxFlow * neighbourWall <= maxFlow
     */
    addConstraint(
      this.model,
      [
        [flow, 1],
        [neighbourWall, maxFlow],
      ],
      0,
      maxFlow,
      `${name}_target_wall`
    );

    /*
     * flow + maxFlow * ownWall <= maxFlow
     */
    addConstraint(
      this.model,
      [
        [flow, 1],
        [ownWall, maxFlow],
      ],
      0,
      maxFlow,
      `${name}_source_wall`
    );
  }

  addPortalEdge(
    x,
    y,
    nx,
    ny,
    reachable,
    balance,
    maxFlow,
    name
  ) {
    const source =
      reachable[x][y];

    const target =
      reachable[nx][ny];

    /*
     * source - target <= 0
     */
    addConstraint(
      this.model,
      [
        [source, 1],
        [target, -1],
      ],
      NEG_INF,
      0,
      `${name}_reachable`
    );

    const flow =
      this.model.NumVar(
        0,
        maxFlow,
        name
      );

    balance[x][y].push([
      flow,
      -1,
    ]);

    balance[nx][ny].push([
      flow,
      1,
    ]);
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
            : 0,
          `horseBalance${x},${y}`
        );

        equal(
          model,
          this.unicornFlowBalance[x][y],
          is(type, TILE.UNICORN)
            ? 1
            : 0,
          `unicornBalance${x},${y}`
        );
      }
    }
  }

  buildObjective() {
    const {
      puzzle,
      model,
    } = this;

    const objective =
      model.Objective();

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
          objective.SetCoefficient(
            this.horse[x][y],
            score
          );

          objective.SetCoefficient(
            this.unicorn[x][y],
            score
          );
        }

        if (
          puzzle.type ===
          "COSTLY_WALLS"
        ) {
          objective.SetCoefficient(
            this.wall[x][y],
            -6
          );
        }
      }
    }

    objective.SetMaximization();

    this.optimalScoreExpression =
      [];

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
          this.optimalScoreExpression.push([
            this.horse[x][y],
            score,
          ]);

          this.optimalScoreExpression.push([
            this.unicorn[x][y],
            score,
          ]);
        }

        if (
          puzzle.type ===
          "COSTLY_WALLS"
        ) {
          this.optimalScoreExpression.push([
            this.wall[x][y],
            -6,
          ]);
        }
      }
    }

    /*
     * Initially this constraint has no
     * useful lower or upper bound.
     */
    this.optimalScoreConstraint =
      addConstraint(
        model,
        this.optimalScoreExpression,
        NEG_INF,
        POS_INF,
        "optimalScoreConstraint"
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

          terms.push([
            this.wall[x][y],
            -1,
          ]);
        } else {
          terms.push([
            this.wall[x][y],
            1,
          ]);
        }
      }
    }

    addConstraint(
      model,
      terms,
      1 - wallsUsed,
      POS_INF,
      "blacklist"
    );
  }

  addOptimalScore(optimalScore) {
    if (
      optimalScore === MIN_SCORE
    ) {
      return;
    }

    const trueOptimalScore =
      this.puzzle.type ===
      "LOVEBIRDS"
        ? optimalScore * 2
        : optimalScore;

    this.optimalScoreConstraint.SetLb(trueOptimalScore);
    this.optimalScoreConstraint.SetUb(trueOptimalScore);
  }

  async solve(
    optimalScore = MIN_SCORE
  ) {
    this.addOptimalScore(
      optimalScore
    );

    const solver =
      this.model;

    console.log("Starting SCIP solve...");
    console.log(`  Variables:    ${solver.NumVariables()}`);
    console.log(`  Constraints:  ${solver.NumConstraints()}`);

    /*
     * or-tools-wasm Solve() returns a Promise.
     */
    const status = await solver.Solve();

    const statusName =
      status === MPSolver.OPTIMAL
        ? "OPTIMAL"
        : status === MPSolver.FEASIBLE
          ? "FEASIBLE"
          : status === MPSolver.INFEASIBLE
            ? "INFEASIBLE"
            : status === MPSolver.UNBOUNDED
              ? "UNBOUNDED"
              : status === MPSolver.ABNORMAL
                ? "ABNORMAL"
                : status === MPSolver.MODEL_INVALID
                  ? "MODEL_INVALID"
                  : "NOT_SOLVED";

    console.log(
      "Solver status:",
      statusName
    );

    if (
      status !== MPSolver.OPTIMAL
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
    
    const canReach =
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
            this.wall[x][y]
          );

        isEnclosed[x][y] =
          valueOf(
            this.horse[x][y]
          ) ||
          valueOf(
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
        if(isEnclosed[x][y]) {
          canReach[x][y] = true;
          
          for (const [dx, dy] of DIRECTIONS) {
            const x2 = x + dx;
            const y2 = y + dy;
            if(x2 < 0 || y2 < 0 || x2 >= puzzle.width || y2 >= puzzle.height) continue;
            
            if(isWall[x2][y2]) canReach[x2][y2] = true;
          }
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
      solver
        .Objective()
        .Value();

    if (
      puzzle.type ===
      "LOVEBIRDS"
    ) {
      objectiveValue *= 0.5;
    }

    if (
      Math.abs(
        score -
        objectiveValue
      ) >= 1e-4
    ) {
      console.warn(
        `Computed score (${score}) differs from SCIP objective (${objectiveValue}).`
      );
    }

    /*
     * Match Java's post-solve tightening.
     *
     * For an optimal solution, the objective
     * is fixed.
     *
     * For a merely feasible solution, it becomes
     * a lower bound.
     */
    const roundedObjective =
      Math.round(
        solver
          .Objective()
          .Value()
      );

    this.optimalScoreConstraint.SetLb(roundedObjective);
    this.optimalScoreConstraint.SetUb(roundedObjective);

    return {
      puzzle,
      score,
      objectiveValue,
      isWall,
      isEnclosed,
      canReach,
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
        ([character, cells]) => [
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

// RENDERING

const results = document.getElementById("results");
const install = document.getElementById("install");

function bonusName(type = "bonus") {
  return {
    costlywalls: "Costly Walls",
    lovebirds: "Lovebirds",
    loversquarrel: "Lovers Quarrel"
  }[type] || type.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function portalColor(value) {
  const colors = [
    "#7254a8", "#65afd0", "#5eaa72", "#d34d9a", "#c85f72",
    "#c4a447", "#8b78c7", "#4d9c9c", "#b56b55", "#7d8fc4"
  ];

  let index = String(value).charCodeAt(0) % colors.length;
  return colors[index];
}

function resizeBoard(card, width, height) {
  const available = Math.min(
    620,
    Math.max(0, Math.min(window.innerWidth, 960) - 88)
  );

  card.style.setProperty(
    "--cell",
    `${Math.max(8, available / Math.max(width, height))}px`
  );
}

function renderSolution(card, solution) {
  const board = card.querySelector(".board");
  
  function interleaveArrays(arrays) {
    if (arrays.length === 0) return [];
  
    return arrays[0]
      .map((_, i) => arrays.map(array => array[i]))
      .flat();
  }
  
  const a1 = interleaveArrays(solution.isWall || []);
  const a2 = interleaveArrays(solution.isEnclosed || []);
  const a3 = interleaveArrays(solution.canReach || []);
  
  const walls = new Set();
  const enclosed = new Set();
  const reachableCells = new Set();
  
  a1.forEach((value, index) => {
    if (value) {
      walls.add(index);
    }
  });
  
  a2.forEach((value, index) => {
    if (value) {
      enclosed.add(index);
    }
  });
  
  a3.forEach((value, index) => {
    if (value) {
      reachableCells.add(index);
    }
  });
  
  const isCostlyWalls = solution.puzzle.type === "COSTLY_WALLS";

  [...board.children].forEach((cell, index) => {
    
    if(cell.classList.contains("wall")) cell.removeAttribute("title");
    
    cell.classList.toggle("wall", walls.has(index));
    cell.classList.toggle("solution", walls.has(index) && reachableCells.has(index));
    cell.classList.toggle("unused-solution", walls.has(index) && (!reachableCells.has(index)));
    cell.classList.toggle(
      "enclosed",
      enclosed.has(index) && !walls.has(index)
    );
    
    if(cell.classList.contains("wall")) cell.title = isCostlyWalls ? "Wall -6" : "Wall";
  });

  card.querySelector("strong").textContent = solution.score;
  card.querySelector("small").textContent =
    `${walls.size} walls used`;
}

function setWorking(status, message) {
  status.querySelector("small").innerHTML =
    `<span class="working"><span class="spinner"></span>${message}</span>`;

  status.querySelectorAll("button").forEach(button => {
    button.disabled = true;
  });
}

function createPuzzleCard(puzzle) {
  const rows = puzzle.map.trim().replace(/\r/g, "").split("\n");
  const height = rows.length;
  const width = rows[0].length;

  const card = document.createElement("article");
  const isBonus = puzzle.type && puzzle.type !== "default";

  card.className = `level${isBonus ? " bonus" : ""}`;

  if (isBonus) {
    card.style.setProperty(
      "--bonus-bg",
      puzzle.type === "lovebirds"
        ? "#182b2b"
        : puzzle.type === "loversquarrel"
          ? "#2d2025"
          : "#302719"
    );
  }

  const title = isBonus
    ? `Bonus round: ${bonusName(puzzle.type)}`
    : puzzle.name || "Enclose.horse level";

  card.innerHTML = `
    <h2>${title}</h2>
    <div class="meta">
      Puzzle ${puzzle.id || ""} · ${width} x ${height} · wall budget ${puzzle.budget}
    </div>
  `;

  const board = document.createElement("div");
  board.className = "board";
  board.style.gridTemplateColumns =
    `repeat(${width}, var(--cell))`;

  const symbols = {
    H: "🐴",
    U: "🦄",
    C: "🍒",
    G: "🍎",
    S: "🐝"
  };
  
  const titles = {
    H: "Neighthan",
    U: "Unicorn",
    C: "Cherry +3",
    G: "Golden Apple +10",
    S: "Bee Swarm -5"
  };

  rows.forEach((row, y) => {
    [...row].forEach((symbol, x) => {
      const cell = document.createElement("div");

      const isPortal =
        !symbols[symbol] &&
        ![".", "#", "~"].includes(symbol);

      cell.className =
        "cell" +
        (symbol === "~" ? " water" : "") +
        (isPortal ? " portal" : "");

      if (symbol === "~") {
        const n = (x * 31 + y * 17 + 7) % 29;
        cell.textContent =
          n === 0 ? "⛵" :
          n < 5 ? "🌊" :
          "";
      } else if (isPortal) {
        cell.textContent = "🌀";
        cell.style.backgroundColor = portalColor(symbol);
        cell.title = `Portal ${symbol}`;
      } else {
        cell.textContent = symbols[symbol] || "";
        
        if(titles[symbol]) cell.title = titles[symbol];
      }

      board.append(cell);
    });
  });

  resizeBoard(card, width, height);

  const boardWrap = document.createElement("div");
  boardWrap.className = "board-wrap";
  boardWrap.append(board);
  card.append(boardWrap);

  const status = document.createElement("div");
  status.className = "status";
  status.innerHTML = `
    <div class="score">
      Optimal score:
      <strong>…</strong>
      <small>waiting for main round to be solved…</small>
    </div>

    <div class="controls">
      <button type="button" disabled
        aria-label="Previous optimal solution">
        ← Previous
      </button>

      <button type="button" disabled
        aria-label="Next optimal solution">
        Next →
      </button>
    </div>
  `;

  card.append(status);

  return {
    card,
    board,
    status,
    width,
    height
  };
}

function showPuzzle(puzzle) {
  const view = createPuzzleCard(puzzle.level);

  results.append(view.card);

  window.addEventListener(
    "resize",
    () => resizeBoard(view.card, view.width, view.height),
    { passive: true }
  );
  
  return view;
}

async function initiallySolvePuzzle(puzzle, view) {
  let solutions = [];
  let solutionIndex = 0;
  let exhausted = false;

  const puzzleSolver =
    new PuzzleSolver(
      puzzle
    );

  setWorking(
    view.status,
    "finding optimal solution…"
  );
  
  let optimalScore = puzzle.optimalScore ? puzzle.optimalScore : MIN_SCORE;
  let solution = await puzzleSolver.solve(optimalScore);

  if (!solution) {
    view.status.querySelector("small").textContent =
      "No legal solution found";
    return;
  }
  
  optimalScore = solution.score;
  
  puzzleSolver.blacklistSolution(solution);
  solutions.push(solution);
  renderSolution(view.card, solution);
  
  setWorking(
    view.status,
    "finding next optimal solutions…"
  );
  
  for(let i = 0; i < 9; i++) {
    
    solution = await puzzleSolver.solve(optimalScore);
    if(!solution) {
      
      exhausted = true;
      break;
    }
    
    puzzleSolver.blacklistSolution(solution);
    solutions.push(solution);
  }

  function update() {
    renderSolution(view.card, solutions[solutionIndex]);

    view.status.querySelector("small").textContent =
      `solution ${solutionIndex + 1}/${solutions.length}${exhausted ? "" : "+"}`;

    const [previous, next] =
      view.status.querySelectorAll("button");

    previous.disabled = solutionIndex === 0;
    next.disabled = solutionIndex + 1 >= solutions.length ? exhausted : false;
  }

  const [previous, next] =
    view.status.querySelectorAll("button");

  previous.onclick = () => {
    if (solutionIndex > 0) {
      solutionIndex--;
      // Display stored solution...
      update();
    }
  };

  next.onclick = async () => {
    solutionIndex++;
    
    if(solutionIndex >= solutions.length) {
    
      if(exhausted) {
      
        solutionIndex--;
        return;
      }
      
      setWorking(
        view.status,
        "finding next optimal solutions…"
      );
      
      let solution = await puzzleSolver.solve(optimalScore);
      if(solution) {
        
        puzzleSolver.blacklistSolution(solution);
        solutions.push(solution);
        
        renderSolution(view.card, solution);
        
        setWorking(
          view.status,
          "finding next optimal solutions…"
        );
        
        for(let i = 0; i < 9; i++) {
          
          solution = await puzzleSolver.solve(optimalScore);
          if(!solution) {
            
            exhausted = true;
            break;
          }
          
          puzzleSolver.blacklistSolution(solution);
          solutions.push(solution);
        }
        
        update();
        
      } else {
        
        solutionIndex--;
        exhausted = true;
        update();
      }
      
    } else {
    
      update();
    }
  };

  update();
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
  
  /*
   * The current or-tools-wasm MPSolver API requires
   * initialization before creating the solver.
   */
  await initMPSolver();

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

  // console.log("Level:", level);
  // console.log("Bonus:", bonus);

  const puzzle =
    parsePuzzle(
      level,
      false
    );
  
  const bonusPuzzle =
    bonus === null ? null : parsePuzzle(
      bonus,
      true
    );

  // logPuzzle(puzzle)
  // logPuzzle(bonusPuzzle);

  /*
   * Verify SCIP is actually linked into the WASM build.
   */
  const probe =
    MPSolver.CreateSolver(
      "SCIP"
    );

  if (!probe) {
    throw new Error(
      "This or-tools-wasm build does not expose the SCIP MPSolver backend."
    );
  }

  /*
   * We only need the probe to test backend
   * availability. Release it immediately.
   */
  probe.delete();
  
  // RENDERING:
  
  if (install) install.hidden = true;
  
  if (!results) {
    console.error("Missing #results element");
    return;
  }
  
  results.hidden = false;
  
  const view1 = showPuzzle(puzzle);
  const view2 = bonusPuzzle === null ? null : showPuzzle(bonusPuzzle);
  
  try {
    await initiallySolvePuzzle(puzzle, view1);
    if(bonusPuzzle !== null) await initiallySolvePuzzle(bonusPuzzle, view2);
  } catch (error) {
    results.hidden = false;
    results.innerHTML =
      `<div class="error">${error.message}</div>`;
  }
}

main().catch(
  error => {
    console.error(
      "Solver failed:",
      error
    );
  }
);
