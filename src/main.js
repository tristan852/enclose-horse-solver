import { CpModel, CpSolver } from "or-tools-wasm/cp-sat";

/*
 * --------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------
 */

const NEIGHBOUR_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const MIN_SCORE = Number.MIN_SAFE_INTEGER;

/*
 * These correspond to the fixed tile types from PuzzleTileType.java.
 *
 * Portals are NOT a single tile type here. A portal is represented by its
 * actual character, because only portals with matching characters connect.
 */
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

/*
 * CP-SAT integer domains are finite.
 */
const CONSTRAINT_MIN = -1_000_000_000;
const CONSTRAINT_MAX = 1_000_000_000;


/*
 * --------------------------------------------------------------------------
 * CP-SAT constraint helpers
 * --------------------------------------------------------------------------
 */

function addLessOrEqual(model, expression, upperBound) {
  if (expression == null) {
    throw new Error(
      "Attempted to add <= constraint with a null expression."
    );
  }

  model.addLinearConstraint(
    expression,
    CONSTRAINT_MIN,
    upperBound
  );
}

function addGreaterOrEqual(model, expression, lowerBound) {
  if (expression == null) {
    throw new Error(
      "Attempted to add >= constraint with a null expression."
    );
  }

  model.addLinearConstraint(
    expression,
    lowerBound,
    CONSTRAINT_MAX
  );
}

function addEquality(model, expression, value) {
  if (expression == null) {
    throw new Error(
      "Attempted to add equality constraint with a null expression."
    );
  }

  model.addLinearConstraint(
    expression,
    value,
    value
  );
}


/*
 * --------------------------------------------------------------------------
 * Linear-expression helpers
 * --------------------------------------------------------------------------
 *
 * null represents mathematical zero.
 * --------------------------------------------------------------------------
 */

function expressionPlus(a, b) {
  if (a == null) {
    return b;
  }

  if (b == null) {
    return a;
  }

  return a.plus(b);
}

function expressionMinus(a, b) {
  if (b == null) {
    return a;
  }

  if (a == null) {
    return b.times(-1);
  }

  return a.plus(b.times(-1));
}

function expressionTimes(a, coefficient) {
  if (a == null) {
    return null;
  }

  return a.times(coefficient);
}

function sumExpressions(expressions) {
  let result = null;

  for (const expression of expressions) {
    result = expressionPlus(
      result,
      expression
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
 * Puzzle decoding / parsing
 * --------------------------------------------------------------------------
 */

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


/*
 * --------------------------------------------------------------------------
 * Tile types
 * --------------------------------------------------------------------------
 *
 * This mirrors PuzzleTileType.type(char) from Java:
 *
 *   '.' -> GRASS
 *   '~' -> WATER
 *   'H' -> HORSE
 *   'U' -> UNICORN
 *   'C' -> CHERRIES
 *   'G' -> GOLDEN_APPLE
 *   'S' -> BEE_SWARM
 *
 * Every other character is a portal.
 *
 * Crucially, the portal character is retained:
 *
 *   A -> portal "A"
 *   A -> portal "A"
 *   B -> portal "B"
 *
 * Therefore A connects to A, but not B.
 * --------------------------------------------------------------------------
 */

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
      return TILE.CHERRIES;

    case "G":
      return TILE.GOLDEN_APPLE;

    case "S":
      return TILE.BEE_SWARM;

    default:
      return TILE.PORTAL;
  }
}

function isKnownTileCharacter(char) {
  switch (char) {
    case ".":
    case "~":
    case "H":
    case "U":
    case "C":
    case "G":
    case "S":
      return true;

    default:
      return false;
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

  if (
    !rows.length ||
    !rows[0].length
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

  const tiles = Array.from(
    { length: width },
    (_, x) =>
      Array.from(
        { length: height },
        (_, y) => {
          const char = rows[y][x];
          const type = tileTypeFromChar(char);

          return {
            x,
            y,
            char,
            type,

            /*
             * Java's PuzzleTileType does not expose a separate portal
             * character, but type(char) preserves the character in the
             * dynamically-created portal instance.
             *
             * null for non-portals.
             */
            portalCharacter:
              type === TILE.PORTAL
                ? char
                : null,
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

    /*
     * Return the portal character at a cell, or null if this isn't a
     * portal.
     */
    portalCharacter(x, y) {
      return tiles[x][y].portalCharacter;
    },

    /*
     * Two cells are matching portals iff both are portals and their
     * characters are equal.
     */
    areMatchingPortals(x1, y1, x2, y2) {
      const a = tiles[x1][y1];
      const b = tiles[x2][y2];

      return (
        a.type === TILE.PORTAL &&
        b.type === TILE.PORTAL &&
        a.portalCharacter === b.portalCharacter
      );
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
      return 1;

    case TILE.WATER:
      return 0;

    case TILE.HORSE:
      return 1;

    case TILE.UNICORN:
      return 1;

    case TILE.PORTAL:
      return 1;

    case TILE.CHERRIES:
      return 4;

    case TILE.GOLDEN_APPLE:
      return 11;

    case TILE.BEE_SWARM:
      return -4;

    default:
      return 0;
  }
}


/*
 * --------------------------------------------------------------------------
 * Static reachability
 * --------------------------------------------------------------------------
 *
 * Determines which cells are potentially reachable before walls are
 * considered.
 *
 * Normal movement:
 *   - four-way movement
 *   - water is impassable
 *
 * Portal movement:
 *   - a portal only connects to portals with the SAME character
 *
 * This mirrors the Java behavior where each dynamically-created portal
 * PuzzleTileType retains its character.
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
   * Normal movement.
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
   * Portal movement.
   *
   * Only portals with the same character are connected.
   */
  if (
    !isPortal(
      puzzle.tileType(x, y)
    )
  ) {
    return;
  }

  const portalCharacter =
    puzzle.portalCharacter(x, y);

  for (let x2 = 0; x2 < width; x2++) {
    for (let y2 = 0; y2 < height; y2++) {
      if (
        x2 === x &&
        y2 === y
      ) {
        continue;
      }

      if (
        puzzle.portalCharacter(x2, y2) !==
        portalCharacter
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
      }

      if (isUnicorn(type)) {
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
 * Puzzle solver
 * --------------------------------------------------------------------------
 */

class PuzzleSolver {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.model = new CpModel();

    const {
      width,
      height,
    } = puzzle;

    this.wallVariables =
      Array.from(
        { length: width },
        () =>
          Array(height)
      );

    this.horseReachableVariables =
      Array.from(
        { length: width },
        () =>
          Array(height)
      );

    this.unicornReachableVariables =
      Array.from(
        { length: width },
        () =>
          Array(height)
      );

    this.horseReachable = null;
    this.unicornReachable = null;

    /*
     * null represents mathematical zero.
     */
    this.flowPreservationExpressions =
      Array.from(
        { length: width },
        () =>
          Array(height).fill(null)
      );

    this.flow2PreservationExpressions =
      Array.from(
        { length: width },
        () =>
          Array(height).fill(null)
      );

    this.initialize();
  }


  /*
   * ------------------------------------------------------------------------
   * Main initialization
   * ------------------------------------------------------------------------
   */

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

    /*
     * --------------------------------------------------------------
     * 1. Create all variables.
     * --------------------------------------------------------------
     */

    const allWalls = [];

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
            `wall_${x}_${y}`
          );

        const horse =
          model.newBoolVar(
            `horse_${x}_${y}`
          );

        const unicorn =
          model.newBoolVar(
            `unicorn_${x}_${y}`
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
     * --------------------------------------------------------------
     * 2. Wall budget.
     * --------------------------------------------------------------
     */

    addLessOrEqual(
      model,
      sumExpressions(allWalls),
      wallBudget
    );

    /*
     * --------------------------------------------------------------
     * 3. Static reachability.
     * --------------------------------------------------------------
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
     * --------------------------------------------------------------
     * 4. Per-cell constraints.
     * --------------------------------------------------------------
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
     * --------------------------------------------------------------
     * 5. Remove cells that cannot possibly be reached.
     * --------------------------------------------------------------
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
     * --------------------------------------------------------------
     * 6. Safe flow bounds.
     * --------------------------------------------------------------
     */

    const maxFlow =
      Math.max(
        1,
        this.horseReachable
          .flat()
          .filter(Boolean)
          .length
      );

    const maxFlow2 =
      Math.max(
        1,
        this.unicornReachable
          .flat()
          .filter(Boolean)
          .length
      );

    /*
     * --------------------------------------------------------------
     * 7. Initialize EVERY flow expression first.
     * --------------------------------------------------------------
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
        this.initializeFlowExpression(
          x,
          y
        );
      }
    }

    /*
     * --------------------------------------------------------------
     * 8. Add all flow edges.
     * --------------------------------------------------------------
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
        this.initializeFlowEdges(
          x,
          y,
          maxFlow,
          maxFlow2
        );
      }
    }

    /*
     * --------------------------------------------------------------
     * 9. Flow conservation.
     * --------------------------------------------------------------
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
        const type =
          puzzle.tileType(x, y);

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
    }

    /*
     * --------------------------------------------------------------
     * 10. Objective.
     * --------------------------------------------------------------
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

        /*
         * Costly Walls:
         *
         * Every wall costs 6 points.
         */
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

    const objective =
      sumExpressions(
        objectiveTerms
      );

    if (objective == null) {
      throw new Error(
        "Could not construct objective expression."
      );
    }

    model.maximize(objective);
  }


  /*
   * ------------------------------------------------------------------------
   * Cell constraints
   * ------------------------------------------------------------------------
   */

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
     * Bonus modes.
     */

    if (
      puzzle.type ===
      "LOVEBIRDS"
    ) {
      /*
       * horse == unicorn
       */
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
      /*
       * horse + unicorn <= 1
       */
      addAtMostOne(
        model,
        horse,
        unicorn
      );
    } else {
      /*
       * Normal puzzle has no unicorn.
       */
      addEquality(
        model,
        unicorn,
        0
      );
    }

    /*
     * Wall cannot coexist with an animal.
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
     * Starting cells are always reachable.
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
     * Only grass can be turned into a wall.
     */
    if (!isGrass(type)) {
      addEquality(
        model,
        wall,
        0
      );
    }

    /*
     * Edge and water cells cannot be animal-reachable.
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


  /*
   * ------------------------------------------------------------------------
   * Flow: base expressions
   * ------------------------------------------------------------------------
   */

  initializeFlowExpression(x, y) {
    const {
      puzzle,
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
     * Horse source.
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

    /*
     * Unicorn source.
     */
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
  }


  /*
   * ------------------------------------------------------------------------
   * Flow: edge construction
   * ------------------------------------------------------------------------
   */

  initializeFlowEdges(
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

    const horse =
      this.horseReachableVariables[x][y];

    const unicorn =
      this.unicornReachableVariables[x][y];

    const ownWall =
      this.wallVariables[x][y];

    /*
     * --------------------------------------------------------------
     * Normal four-way edges.
     * --------------------------------------------------------------
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

      const neighbourWall =
        this.wallVariables[x2][y2];

      /*
       * ----------------------------------------------------------
       * Horse.
       * ----------------------------------------------------------
       */

      if (hr) {
        addLessOrEqual(
          model,
          sumExpressions([
            horse,

            expressionTimes(
              neighbourWall,
              -1
            ),

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
            `horseFlow_${x}_${y}_${x2}_${y2}`
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
       * ----------------------------------------------------------
       * Unicorn.
       * ----------------------------------------------------------
       */

      if (ur) {
        addLessOrEqual(
          model,
          sumExpressions([
            unicorn,

            expressionTimes(
              neighbourWall,
              -1
            ),

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
            `unicornFlow_${x}_${y}_${x2}_${y2}`
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
     * --------------------------------------------------------------
     * Matching portal edge.
     * --------------------------------------------------------------
     *
     * IMPORTANT:
     *
     * A portal is identified by its character.
     *
     *   A <-> A
     *   B <-> B
     *
     * but:
     *
     *   A -/-> B
     *
     * This is the direct equivalent of the Java implementation's
     * dynamically-created PuzzleTileType(character, true, 1).
     * --------------------------------------------------------------
     */

    if (isPortal(type)) {
      const portalCharacter =
        puzzle.portalCharacter(x, y);

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
            x2 === x &&
            y2 === y
          ) {
            continue;
          }

          /*
           * Only matching portal characters are connected.
           */
          if (
            puzzle.portalCharacter(x2, y2) !==
            portalCharacter
          ) {
            continue;
          }

          /*
           * Adjacent matching portals already have a normal
           * four-way edge.
           */
          const distance =
            Math.abs(x2 - x) +
            Math.abs(y2 - y);

          if (distance <= 1) {
            continue;
          }

          /*
           * --------------------------------------------------------
           * Horse portal edge.
           * --------------------------------------------------------
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
                `horsePortalFlow_${portalCharacter}_${x}_${y}_${x2}_${y2}`
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
           * --------------------------------------------------------
           * Unicorn portal edge.
           * --------------------------------------------------------
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
                `unicornPortalFlow_${portalCharacter}_${x}_${y}_${x2}_${y2}`
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
      }
    }
  }


  /*
   * ------------------------------------------------------------------------
   * Blacklist an existing wall solution
   * ------------------------------------------------------------------------
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
        if (
          solution.isWall[x][y]
        ) {
          wallsUsed++;

          terms.push(
            expressionTimes(
              this.wallVariables[x][y],
              -1
            )
          );
        } else {
          terms.push(
            this.wallVariables[x][y]
          );
        }
      }
    }

    addGreaterOrEqual(
      model,
      sumExpressions(terms),
      1 - wallsUsed
    );
  }


  /*
   * ------------------------------------------------------------------------
   * Score expression
   * ------------------------------------------------------------------------
   */

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


  /*
   * ------------------------------------------------------------------------
   * Solve
   * ------------------------------------------------------------------------
   */

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
      solver.statusName(status);

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
   * Show portal mapping for debugging.
   */
  const portals = {};

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
      const character =
        puzzle.portalCharacter(x, y);

      if (character == null) {
        continue;
      }

      if (!portals[character]) {
        portals[character] = [];
      }

      portals[character].push([x, y]);
    }
  }

  console.log(
    "Portals:",
    portals
  );

  /*
   * Verify the API before constructing the model.
   */
  const testModel =
    new CpModel();

  console.log(
    "CpModel.addLinearConstraint:",
    typeof testModel.addLinearConstraint
  );

  if (
    typeof testModel.addLinearConstraint !==
    "function"
  ) {
    throw new Error(
      "This or-tools-wasm version does not expose CpModel.addLinearConstraint()."
    );
  }

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
