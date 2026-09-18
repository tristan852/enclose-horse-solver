const bookmarklet = `javascript:(function(){var l=window.__LEVEL__;if(!l){alert('Open an enclose.horse puzzle first.');return}var w=window.open('about:blank','_blank');var d=(window.__DAILY_LEVELS__||[]).filter(function(x){return String(x.dayNumber)===String(l.dayNumber)||x.id===l.id})[0]||{};var bid=l.bonusId||d.bonusId||(l.bonus&&l.bonus.id);var enc=function(o){var a=new TextEncoder().encode(JSON.stringify(o)),s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)};var done=function(b){var u="https://tristan852.github.io/enclose-horse-solver/"+'?level=%27+encodeURIComponent(enc(l))+(b?%27&bonus=%27+encodeURIComponent(enc(b)):%27%27);if(w&&!w.closed)w.location=u;else location.href=u};if(bid){fetch(%27/api/daily/bonus/%27+encodeURIComponent(l.id)).then(function(r){if(!r.ok)throw Error(%27Bonus request failed (%27+r.status+%27)%27);return r.json()}).then(function(b){b.type=l.bonusType||d.bonusType||(l.bonus&&l.bonus.type)||%27default%27;var names={costlywalls:%27Costly Walls%27,lovebirds:%27Lovebirds%27,loversquarrel:%27Lovers Quarrel%27};b.name=%27Bonus round: %27+(names[String(b.type).toLowerCase()]||String(b.type).replace(/[-_]+/g,%27 %27));done(b)}).catch(function(e){if(w&&!w.closed)w.close();alert(%27Could not prepare this puzzle: %27+e.message)})}else done(null)})()`

document.getElementById("bookmark").href = bookmarklet;

import { CpModel, CpSolver } from "or-tools-wasm/cp-sat";

const NEIGHBOUR_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const MIN_SCORE = Number.MIN_SAFE_INTEGER;

/*
 * or-tools-wasm exposes generic linear constraints as:
 *
 *   model.addLinearConstraint(expression, lowerBound, upperBound)
 *
 * Keep all constraints going through these helpers. This avoids relying on
 * addLessOrEqual/addGreaterOrEqual/addEquality methods that are not exposed
 * by the installed WASM wrapper.
 *
 * All variables in this model are small:
 *
 *   BoolVar: 0..1
 *   flow:    0..number of reachable cells
 *
 * Therefore these finite bounds are more than sufficient.
 */
const CONSTRAINT_MIN = -1_000_000_000;
const CONSTRAINT_MAX = 1_000_000_000;

function addLessOrEqual(model, expression, upperBound) {
  model.addLinearConstraint(
    expression,
    CONSTRAINT_MIN,
    upperBound
  );
}

function addGreaterOrEqual(model, expression, lowerBound) {
  model.addLinearConstraint(
    expression,
    lowerBound,
    CONSTRAINT_MAX
  );
}

function addEquality(model, expression, value) {
  model.addLinearConstraint(
    expression,
    value,
    value
  );
}

/*
 * --------------------------------------------------------------------------
 * Puzzle parsing
 * --------------------------------------------------------------------------
 */

const TILE = Object.freeze({
  GRASS: "GRASS",
  WATER: "WATER",
  HORSE: "HORSE",
  UNICORN: "UNICORN",
  PORTAL: "PORTAL",
});

function decodeBase64Json(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(
    binary,
    c => c.charCodeAt(0)
  );

  return JSON.parse(
    new TextDecoder().decode(bytes)
  );
}

function tileTypeFromChar(char) {
  switch (char) {
    case ".":
      return TILE.GRASS;

    case "~":
      return TILE.WATER;

    case "H":
      return TILE.HORSE;

    case "U":
      return TILE.UNICORN;

    case "C":
      return TILE.PORTAL;

    default:
      console.warn(
        `Unknown puzzle tile '${char}', treating as grass.`
      );

      return TILE.GRASS;
  }
}

function puzzleTypeFromLevel(level, bonus) {
  const type = String(
    level?.bonusType ??
      bonus?.type ??
      level?.bonus?.type ??
      "default"
  ).toLowerCase();

  switch (type) {
    case "costlywalls":
      return "COSTLY_WALLS";

    case "lovebirds":
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
    throw new Error(
      "Invalid puzzle: missing map."
    );
  }

  const rows = level.map
    .replace(/\r/g, "")
    .split("\n");

  if (!rows.length || !rows[0].length) {
    throw new Error(
      "Invalid puzzle: empty map."
    );
  }

  const width = rows[0].length;
  const height = rows.length;

  if (!rows.every(row => row.length === width)) {
    throw new Error(
      "Invalid puzzle: map rows have different widths."
    );
  }

  const tiles = Array.from(
    { length: width },
    (_, x) =>
      Array.from(
        { length: height },
        (_, y) => {
          const char = rows[y][x];

          return {
            x,
            y,
            char,
            type: tileTypeFromChar(char),
          };
        }
      )
  );

  return {
    level,
    bonus,

    width,
    height,

    wallBudget: Number(
      level.budget ?? 0
    ),

    optimalScore:
      level.optimalScore == null
        ? null
        : Number(level.optimalScore),

    type: puzzleTypeFromLevel(
      level,
      bonus
    ),

    tiles,

    tileType(x, y) {
      return tiles[x][y].type;
    },

    tile(x, y) {
      return tiles[x][y];
    },
  };
}

/*
 * --------------------------------------------------------------------------
 * Tile helpers
 * --------------------------------------------------------------------------
 */

function isPortal(type) {
  return type === TILE.PORTAL;
}

function isWater(type) {
  return type === TILE.WATER;
}

function isHorse(type) {
  return type === TILE.HORSE;
}

function isUnicorn(type) {
  return type === TILE.UNICORN;
}

function isGrass(type) {
  return type === TILE.GRASS;
}

function tileScore(type) {
  switch (type) {
    case TILE.GRASS:
    case TILE.HORSE:
    case TILE.UNICORN:
    case TILE.PORTAL:
      return 1;

    case TILE.WATER:
    default:
      return 0;
  }
}

/*
 * --------------------------------------------------------------------------
 * Linear expression helpers
 * --------------------------------------------------------------------------
 *
 * or-tools-wasm uses:
 *
 *   expr.plus(other)
 *   expr.times(coefficient)
 */

function expressionPlus(a, b) {
  return a.plus(b);
}

function expressionMinus(a, b) {
  return a.plus(
    b.times(-1)
  );
}

function expressionTimes(a, coefficient) {
  return a.times(coefficient);
}

function sumExpressions(expressions) {
  if (!expressions.length) {
    return null;
  }

  let result = expressions[0];

  for (let i = 1; i < expressions.length; i++) {
    result = expressionPlus(
      result,
      expressions[i]
    );
  }

  return result;
}

function boolValue(solver, variable) {
  return solver.value(variable) >= 0.5;
}

function addAtMostOne(model, a, b) {
  addLessOrEqual(
    model,
    expressionPlus(a, b),
    1
  );
}

/*
 * --------------------------------------------------------------------------
 * Reachability
 * --------------------------------------------------------------------------
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

  const {
    width,
    height,
  } = puzzle;

  /*
   * Normal four-way movement.
   */
  for (const [dx, dy] of NEIGHBOUR_DIRECTIONS) {
    const x2 = x + dx;
    const y2 = y + dy;

    if (
      x2 < 0 ||
      x2 >= width ||
      y2 < 0 ||
      y2 >= height
    ) {
      continue;
    }

    if (
      isWater(
        puzzle.tileType(x2, y2)
      )
    ) {
      continue;
    }

    explore(
      puzzle,
      x2,
      y2,
      reachable
    );
  }

  /*
   * Portals connect to another portal.
   */
  if (
    !isPortal(
      puzzle.tileType(x, y)
    )
  ) {
    return;
  }

  for (let x2 = 0; x2 < width; x2++) {
    for (let y2 = 0; y2 < height; y2++) {
      if (
        !isPortal(
          puzzle.tileType(x2, y2)
        )
      ) {
        continue;
      }

      if (
        x2 === x &&
        y2 === y
      ) {
        continue;
      }

      explore(
        puzzle,
        x2,
        y2,
        reachable
      );

      return;
    }
  }
}

function calculateStaticReachability(puzzle) {
  const horseReachable =
    Array.from(
      { length: puzzle.width },
      () =>
        Array(
          puzzle.height
        ).fill(false)
    );

  const unicornReachable =
    Array.from(
      { length: puzzle.width },
      () =>
        Array(
          puzzle.height
        ).fill(false)
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

      if (isHorse(type)) {
        explore(
          puzzle,
          x,
          y,
          horseReachable
        );
      } else if (
        isUnicorn(type)
      ) {
        explore(
          puzzle,
          x,
          y,
          unicornReachable
        );
      }
    }
  }

  return {
    horseReachable,
    unicornReachable,
  };
}

/*
 * --------------------------------------------------------------------------
 * Solver
 * --------------------------------------------------------------------------
 */

class PuzzleSolver {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.model = new CpModel();

    this.wallVariables =
      Array.from(
        { length: puzzle.width },
        () =>
          Array(puzzle.height)
    );

    this.horseReachableVariables =
      Array.from(
        { length: puzzle.width },
        () =>
          Array(puzzle.height)
      );

    this.unicornReachableVariables =
      Array.from(
        { length: puzzle.width },
        () =>
          Array(puzzle.height)
      );

    this.horseReachable = null;
    this.unicornReachable = null;

    this.flowPreservationExpressions =
      Array.from(
        { length: puzzle.width },
        () =>
          Array(puzzle.height)
      );

    this.flow2PreservationExpressions =
      Array.from(
        { length: puzzle.width },
        () =>
          Array(puzzle.height)
      );

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
      wallBudget,
    } = puzzle;

    const allWalls = [];

    /*
     * Variables.
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
          model.newBoolVar(
            `tileHasWall${x},${y}`
          );

        const horse =
          model.newBoolVar(
            `tileIsHorseReachable${x},${y}`
          );

        const unicorn =
          model.newBoolVar(
            `tileIsUnicornReachable${x},${y}`
          );

        this.wallVariables[x][y] =
          wall;

        this.horseReachableVariables[x][y] =
          horse;

        this.unicornReachableVariables[x][y] =
          unicorn;

        allWalls.push(wall);
      }
    }

    /*
     * Number of walls <= budget.
     */
    addLessOrEqual(
      model,
      sumExpressions(allWalls),
      wallBudget
    );

    /*
     * Static connectivity.
     */
    const staticReachability =
      calculateStaticReachability(
        puzzle
      );

    this.horseReachable =
      staticReachability.horseReachable;

    this.unicornReachable =
      staticReachability.unicornReachable;

    /*
     * Per-cell rules.
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
        this.initializeCell(
          x,
          y
        );
      }
    }

    /*
     * Cells that cannot possibly be reached
     * are forced to false.
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
        if (
          !this.horseReachable[x][y]
        ) {
          addEquality(
            model,
            this.horseReachableVariables[x][y],
            0
          );
        }

        if (
          !this.unicornReachable[x][y]
        ) {
          addEquality(
            model,
            this.unicornReachableVariables[x][y],
            0
          );
        }

        if (
          !this.horseReachable[x][y] &&
          !this.unicornReachable[x][y]
        ) {
          addEquality(
            model,
            this.wallVariables[x][y],
            0
          );
        }
      }
    }

    /*
     * Flow bounds.
     */
    const maxFlow =
      Math.max(
        0,
        this.horseReachable
          .flat()
          .filter(Boolean)
          .length - 1
      );

    const maxFlow2 =
      Math.max(
        0,
        this.unicornReachable
          .flat()
          .filter(Boolean)
          .length - 1
      );

    /*
     * Flow constraints.
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
        this.initializeFlow(
          x,
          y,
          maxFlow,
          maxFlow2
        );
      }
    }

    /*
     * Objective.
     */
    const objectiveTerms = [];

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
        const score =
          tileScore(
            puzzle.tileType(x, y)
          );

        if (score !== 0) {
          objectiveTerms.push(
            expressionTimes(
              this.horseReachableVariables[x][y],
              score
            )
          );

          objectiveTerms.push(
            expressionTimes(
              this.unicornReachableVariables[x][y],
              score
            )
          );
        }

        if (
          puzzle.type ===
          "COSTLY_WALLS"
        ) {
          objectiveTerms.push(
            expressionTimes(
              this.wallVariables[x][y],
              -6
            )
          );
        }
      }
    }

    model.maximize(
      sumExpressions(
        objectiveTerms
      )
    );
  }

  initializeCell(x, y) {
    const {
      puzzle,
      model,
    } = this;

    const type =
      puzzle.tileType(x, y);

    const wall =
      this.wallVariables[x][y];

    const horse =
      this.horseReachableVariables[x][y];

    const unicorn =
      this.unicornReachableVariables[x][y];

    /*
     * Bonus-mode rules.
     */
    if (
      puzzle.type ===
      "LOVEBIRDS"
    ) {
      addEquality(
        model,
        expressionMinus(
          horse,
          unicorn
        ),
        0
      );
    } else if (
      puzzle.type ===
      "LOVERS_QUARREL"
    ) {
      addLessOrEqual(
        model,
        expressionPlus(
          horse,
          unicorn
        ),
        1
      );
    } else {
      addEquality(
        model,
        unicorn,
        0
      );
    }

    /*
     * A cell cannot simultaneously be:
     *
     *   wall + horse
     *   wall + unicorn
     */
    addAtMostOne(
      model,
      wall,
      horse
    );

    addAtMostOne(
      model,
      wall,
      unicorn
    );

    /*
     * The animal's starting cell must be reachable.
     */
    if (isHorse(type)) {
      addEquality(
        model,
        horse,
        1
      );
    }

    if (isUnicorn(type)) {
      addEquality(
        model,
        unicorn,
        1
      );
    }

    /*
     * Only grass may become a wall.
     */
    if (!isGrass(type)) {
      addEquality(
        model,
        wall,
        0
      );
    }

    /*
     * Edge/water cells cannot contain reachable animals.
     */
    const isOnEdge =
      x === 0 ||
      x === puzzle.width - 1 ||
      y === 0 ||
      y === puzzle.height - 1;

    if (
      isWater(type) ||
      isOnEdge
    ) {
      addEquality(
        model,
        horse,
        0
      );

      addEquality(
        model,
        unicorn,
        0
      );
    }
  }

  initializeFlow(
    x,
    y,
    maxFlow,
    maxFlow2
  ) {
    const {
      puzzle,
      model,
    } = this;

    const type =
      puzzle.tileType(x, y);

    const horse =
      this.horseReachableVariables[x][y];

    const unicorn =
      this.unicornReachableVariables[x][y];

    const horseTerms = [];
    const unicornTerms = [];

    /*
     * Source flow expression.
     *
     * At the source:
     *
     *   sum(reachable) - outgoing flow = 1
     *
     * At every other reachable node:
     *
     *   -reachable - outgoing + incoming = 0
     */
    if (isHorse(type)) {
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
            this.horseReachableVariables[x2][y2]
          );
        }
      }
    } else {
      horseTerms.push(
        expressionTimes(
          horse,
          -1
        )
      );
    }

    if (isUnicorn(type)) {
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
            this.unicornReachableVariables[x2][y2]
          );
        }
      }
    } else {
      unicornTerms.push(
        expressionTimes(
          unicorn,
          -1
        )
      );
    }

    this.flowPreservationExpressions[x][y] =
      sumExpressions(
        horseTerms
      );

    this.flow2PreservationExpressions[x][y] =
      sumExpressions(
        unicornTerms
      );

    if (isWater(type)) {
      return;
    }

    const hr =
      this.horseReachable[x][y];

    const ur =
      this.unicornReachable[x][y];

    if (!hr && !ur) {
      return;
    }

    /*
     * Normal neighbour connections.
     */
    for (
      const [dx, dy]
      of NEIGHBOUR_DIRECTIONS
    ) {
      const x2 = x + dx;
      const y2 = y + dy;

      if (
        x2 < 0 ||
        x2 >= puzzle.width ||
        y2 < 0 ||
        y2 >= puzzle.height
      ) {
        continue;
      }

      if (
        isWater(
          puzzle.tileType(x2, y2)
        )
      ) {
        continue;
      }

      const ownWall =
        this.wallVariables[x][y];

      const neighbourWall =
        this.wallVariables[x2][y2];

      /*
       * Horse reachability:
       *
       * horse[x,y]
       *   - wall[x2,y2]
       *   - horse[x2,y2]
       * <= 0
       */
      if (hr) {
        const neighbourTerms = [
          horse,

          expressionTimes(
            neighbourWall,
            -1
          ),

          expressionTimes(
            this.horseReachableVariables[x2][y2],
            -1
          ),
        ];

        addLessOrEqual(
          model,
          sumExpressions(
            neighbourTerms
          ),
          0
        );

        const flow =
          model.newIntVar(
            0,
            maxFlow,
            `flow${x},${y},${x2},${y2}`
          );

        this.flowPreservationExpressions[x][y] =
          expressionMinus(
            this.flowPreservationExpressions[x][y],
            flow
          );

        this.flowPreservationExpressions[x2][y2] =
          expressionPlus(
            this.flowPreservationExpressions[x2][y2],
            flow
          );

        /*
         * flow + maxFlow * neighbourWall <= maxFlow
         */
        addLessOrEqual(
          model,
          expressionPlus(
            flow,
            expressionTimes(
              neighbourWall,
              maxFlow
            )
          ),
          maxFlow
        );

        /*
         * flow + maxFlow * ownWall <= maxFlow
         */
        addLessOrEqual(
          model,
          expressionPlus(
            flow,
            expressionTimes(
              ownWall,
              maxFlow
            )
          ),
          maxFlow
        );
      }

      /*
       * Unicorn reachability.
       */
      if (ur) {
        const neighbourTerms = [
          unicorn,

          expressionTimes(
            neighbourWall,
            -1
          ),

          expressionTimes(
            this.unicornReachableVariables[x2][y2],
            -1
          ),
        ];

        addLessOrEqual(
          model,
          sumExpressions(
            neighbourTerms
          ),
          0
        );

        const flow =
          model.newIntVar(
            0,
            maxFlow2,
            `flow2${x},${y},${x2},${y2}`
          );

        this.flow2PreservationExpressions[x][y] =
          expressionMinus(
            this.flow2PreservationExpressions[x][y],
            flow
          );

        this.flow2PreservationExpressions[x2][y2] =
          expressionPlus(
            this.flow2PreservationExpressions[x2][y2],
            flow
          );

        /*
         * flow + maxFlow2 * neighbourWall <= maxFlow2
         */
        addLessOrEqual(
          model,
          expressionPlus(
            flow,
            expressionTimes(
              neighbourWall,
              maxFlow2
            )
          ),
          maxFlow2
        );

        /*
         * flow + maxFlow2 * ownWall <= maxFlow2
         */
        addLessOrEqual(
          model,
          expressionPlus(
            flow,
            expressionTimes(
              ownWall,
              maxFlow2
            )
          ),
          maxFlow2
        );
      }
    }

    /*
     * Portal connection.
     */
    if (isPortal(type)) {
      let found = false;

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
          if (
            puzzle.tileType(x2, y2) !==
            type
          ) {
            continue;
          }

          if (
            x2 === x &&
            y2 === y
          ) {
            continue;
          }

          const distance =
            Math.abs(x2 - x) +
            Math.abs(y2 - y);

          if (distance > 1) {
            /*
             * Horse portal connection.
             */
            if (hr) {
              addLessOrEqual(
                model,
                sumExpressions([
                  horse,

                  expressionTimes(
                    this.horseReachableVariables[x2][y2],
                    -1
                  ),
                ]),
                0
              );

              const flow =
                model.newIntVar(
                  0,
                  maxFlow,
                  `portalFlow${x},${y},${x2},${y2}`
                );

              this.flowPreservationExpressions[x][y] =
                expressionMinus(
                  this.flowPreservationExpressions[x][y],
                  flow
                );

              this.flowPreservationExpressions[x2][y2] =
                expressionPlus(
                  this.flowPreservationExpressions[x2][y2],
                  flow
                );
            }

            /*
             * Unicorn portal connection.
             */
            if (ur) {
              addLessOrEqual(
                model,
                sumExpressions([
                  unicorn,

                  expressionTimes(
                    this.unicornReachableVariables[x2][y2],
                    -1
                  ),
                ]),
                0
              );

              const flow =
                model.newIntVar(
                  0,
                  maxFlow2,
                  `portalFlow2${x},${y},${x2},${y2}`
                );

              this.flow2PreservationExpressions[x][y] =
                expressionMinus(
                  this.flow2PreservationExpressions[x][y],
                  flow
                );

              this.flow2PreservationExpressions[x2][y2] =
                expressionPlus(
                  this.flow2PreservationExpressions[x2][y2],
                  flow
                );
            }
          }

          found = true;
          break;
        }

        if (found) {
          break;
        }
      }
    }

    /*
     * Flow conservation.
     */
    addEquality(
      model,
      this.flowPreservationExpressions[x][y],
      isHorse(type) ? 1 : 0
    );

    addEquality(
      model,
      this.flow2PreservationExpressions[x][y],
      isUnicorn(type) ? 1 : 0
    );
  }

  /*
   * Prevent the exact same wall configuration from being returned.
   */
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
        const wall =
          solution.isWall[x][y];

        if (wall) {
          wallsUsed++;

          /*
           * If this wall was true, contribute -1.
           */
          terms.push(
            expressionTimes(
              this.wallVariables[x][y],
              -1
            )
          );
        } else {
          /*
           * If this wall was false, contribute +1.
           */
          terms.push(
            this.wallVariables[x][y]
          );
        }
      }
    }

    /*
     * For the exact previous solution:
     *
     *   sum(terms) = -wallsUsed
     *
     * Requiring:
     *
     *   sum(terms) >= 1 - wallsUsed
     *
     * guarantees at least one wall variable changes.
     */
    addGreaterOrEqual(
      model,
      sumExpressions(terms),
      1 - wallsUsed
    );
  }

  buildScoreExpression() {
    const {
      puzzle,
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
            expressionTimes(
              this.horseReachableVariables[x][y],
              score
            )
          );

          terms.push(
            expressionTimes(
              this.unicornReachableVariables[x][y],
              score
            )
          );
        }

        if (
          puzzle.type ===
          "COSTLY_WALLS"
        ) {
          terms.push(
            expressionTimes(
              this.wallVariables[x][y],
              -6
            )
          );
        }
      }
    }

    return sumExpressions(
      terms
    );
  }

  async solve(
    minScore = MIN_SCORE
  ) {
    const {
      puzzle,
      model,
    } = this;

    const solver =
      new CpSolver();

    /*
     * Optional minimum score.
     */
    if (
      minScore !== MIN_SCORE
    ) {
      const trueMinScore =
        puzzle.type ===
        "LOVEBIRDS"
          ? minScore * 2
          : minScore;

      addGreaterOrEqual(
        model,
        this.buildScoreExpression(),
        trueMinScore
      );
    }

    console.log(
      "Starting CP-SAT solve..."
    );

    const status =
      await solver.solve(
        model,
        {
          maxTimeInSeconds: 120,
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
      statusName !==
        "OPTIMAL" &&
      statusName !==
        "FEASIBLE"
    ) {
      return null;
    }

    const isWall =
      Array.from(
        { length: puzzle.width },
        () =>
          Array(
            puzzle.height
          ).fill(false)
      );

    const isEnclosed =
      Array.from(
        { length: puzzle.width },
        () =>
          Array(
            puzzle.height
          ).fill(false)
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
        const wall =
          boolValue(
            solver,
            this.wallVariables[x][y]
          );

        const horse =
          boolValue(
            solver,
            this.horseReachableVariables[x][y]
          );

        const unicorn =
          boolValue(
            solver,
            this.unicornReachableVariables[x][y]
          );

        isWall[x][y] =
          wall;

        isEnclosed[x][y] =
          horse || unicorn;

        if (wall) {
          wallCount++;
        }

        if (
          isEnclosed[x][y]
        ) {
          score += tileScore(
            puzzle.tileType(x, y)
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

/*
 * --------------------------------------------------------------------------
 * Application
 * --------------------------------------------------------------------------
 */

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
      "Failed to decode puzzle:",
      error
    );

    throw new Error(
      "Could not decode puzzle data."
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

  console.log(
    "Parsed puzzle:",
    puzzle
  );

  console.log(
    `Board: ${puzzle.width} × ${puzzle.height}`
  );

  console.log(
    "Puzzle type:",
    puzzle.type
  );

  console.log(
    "Wall budget:",
    puzzle.wallBudget
  );

  /*
   * Useful API diagnostic. If this prints false, the package version is
   * still not the API this solver expects.
   */
  console.log(
    "CpModel.addLinearConstraint:",
    typeof new CpModel()
      .addLinearConstraint
  );

  const solver =
    new PuzzleSolver(
      puzzle
    );

  const solution =
    await solver.solve();

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
    Array.from(
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
          (_, x) => {
            if (
              solution.isWall[x][y]
            ) {
              return "#";
            }

            return puzzle
              .tile(x, y)
              .char;
          }
        ).join("")
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
