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

const TILE = Object.freeze({
  GRASS: "GRASS",
  WATER: "WATER",
  HORSE: "HORSE",
  UNICORN: "UNICORN",
  PORTAL: "PORTAL",
});

function decodeBase64Json(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
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
    throw new Error("Invalid puzzle: missing map.");
  }

  const rows = level.map.replace(/\r/g, "").split("\n");

  if (!rows.length || !rows[0].length) {
    throw new Error("Invalid puzzle: empty map.");
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

    wallBudget: Number(level.budget ?? 0),

    optimalScore:
      level.optimalScore == null
        ? null
        : Number(level.optimalScore),

    type: puzzleTypeFromLevel(level, bonus),

    tiles,

    tileType(x, y) {
      return tiles[x][y].type;
    },

    tile(x, y) {
      return tiles[x][y];
    },
  };
}

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
 * or-tools-wasm's LinearExpression API uses:
 *
 *   expr.plus(other)
 *   expr.times(coefficient)
 *
 * rather than:
 *
 *   expr.add(other)
 *   expr.mul(coefficient)
 *   expr.sub(other)
 *
 * Keep all arithmetic going through these helpers so the rest of the
 * solver cannot accidentally use the wrong API.
 */

function expressionPlus(a, b) {
  return a.plus(b);
}

function expressionMinus(a, b) {
  return a.plus(b.times(-1));
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
    result = expressionPlus(result, expressions[i]);
  }

  return result;
}

function sumOrConstant(expressions, constant = 0) {
  if (!expressions.length) {
    return constant;
  }

  return sumExpressions(expressions);
}

function boolValue(solver, variable) {
  return solver.value(variable) >= 0.5;
}

function addAtMostOne(model, a, b) {
  model.addLessOrEqual(
    expressionPlus(a, b),
    1
  );
}

/*
 * --------------------------------------------------------------------------
 * Reachability
 * --------------------------------------------------------------------------
 */

function explore(puzzle, x, y, reachable) {
  if (reachable[x][y]) {
    return;
  }

  reachable[x][y] = true;

  const { width, height } = puzzle;

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

    if (isWater(puzzle.tileType(x2, y2))) {
      continue;
    }

    explore(puzzle, x2, y2, reachable);
  }

  if (!isPortal(puzzle.tileType(x, y))) {
    return;
  }

  let found = false;

  for (let x2 = 0; x2 < width; x2++) {
    for (let y2 = 0; y2 < height; y2++) {
      if (!isPortal(puzzle.tileType(x2, y2))) {
        continue;
      }

      if (x2 === x && y2 === y) {
        continue;
      }

      explore(puzzle, x2, y2, reachable);

      found = true;
      break;
    }

    if (found) {
      break;
    }
  }
}

function calculateStaticReachability(puzzle) {
  const horseReachable = Array.from(
    { length: puzzle.width },
    () => Array(puzzle.height).fill(false)
  );

  const unicornReachable = Array.from(
    { length: puzzle.width },
    () => Array(puzzle.height).fill(false)
  );

  for (let x = 0; x < puzzle.width; x++) {
    for (let y = 0; y < puzzle.height; y++) {
      const type = puzzle.tileType(x, y);

      if (isHorse(type)) {
        explore(puzzle, x, y, horseReachable);
      } else if (isUnicorn(type)) {
        explore(puzzle, x, y, unicornReachable);
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

    this.wallVariables = Array.from(
      { length: puzzle.width },
      () => Array(puzzle.height)
    );

    this.horseReachableVariables = Array.from(
      { length: puzzle.width },
      () => Array(puzzle.height)
    );

    this.unicornReachableVariables = Array.from(
      { length: puzzle.width },
      () => Array(puzzle.height)
    );

    this.horseReachable = null;
    this.unicornReachable = null;

    this.flowPreservationExpressions = Array.from(
      { length: puzzle.width },
      () => Array(puzzle.height)
    );

    this.flow2PreservationExpressions = Array.from(
      { length: puzzle.width },
      () => Array(puzzle.height)
    );

    this.initialize();
  }

  initialize() {
    const { puzzle, model } = this;
    const { width, height, wallBudget } = puzzle;

    const allWalls = [];

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

        this.wallVariables[x][y] = wall;
        this.horseReachableVariables[x][y] = horse;
        this.unicornReachableVariables[x][y] = unicorn;

        allWalls.push(wall);
      }
    }

    /*
     * Do not seed reduce() with allWalls[0].
     *
     * The old code effectively started with the first variable and then
     * added the first variable again.
     */
    model.addLessOrEqual(
      sumExpressions(allWalls),
      wallBudget
    );

    const staticReachability =
      calculateStaticReachability(puzzle);

    this.horseReachable =
      staticReachability.horseReachable;

    this.unicornReachable =
      staticReachability.unicornReachable;

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        this.initializeCell(x, y);
      }
    }

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (!this.horseReachable[x][y]) {
          model.addEquality(
            this.horseReachableVariables[x][y],
            0
          );
        }

        if (!this.unicornReachable[x][y]) {
          model.addEquality(
            this.unicornReachableVariables[x][y],
            0
          );
        }

        if (
          !this.horseReachable[x][y] &&
          !this.unicornReachable[x][y]
        ) {
          model.addEquality(
            this.wallVariables[x][y],
            0
          );
        }
      }
    }

    const maxFlow = Math.max(
      0,
      this.horseReachable
        .flat()
        .filter(Boolean)
        .length - 1
    );

    const maxFlow2 = Math.max(
      0,
      this.unicornReachable
        .flat()
        .filter(Boolean)
        .length - 1
    );

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        this.initializeFlow(
          x,
          y,
          maxFlow,
          maxFlow2
        );
      }
    }

    const objectiveTerms = [];

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const score = tileScore(
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

        if (puzzle.type === "COSTLY_WALLS") {
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
      sumExpressions(objectiveTerms)
    );
  }

  initializeCell(x, y) {
    const { puzzle, model } = this;

    const type = puzzle.tileType(x, y);

    const wall = this.wallVariables[x][y];
    const horse =
      this.horseReachableVariables[x][y];
    const unicorn =
      this.unicornReachableVariables[x][y];

    if (puzzle.type === "LOVEBIRDS") {
      model.addEquality(horse, unicorn);
    } else if (
      puzzle.type === "LOVERS_QUARREL"
    ) {
      model.addLessOrEqual(
        expressionPlus(horse, unicorn),
        1
      );
    } else {
      model.addEquality(unicorn, 0);
    }

    addAtMostOne(model, wall, horse);
    addAtMostOne(model, wall, unicorn);

    if (isHorse(type)) {
      model.addEquality(horse, 1);
    }

    if (isUnicorn(type)) {
      model.addEquality(unicorn, 1);
    }

    if (!isGrass(type)) {
      model.addEquality(wall, 0);
    }

    const isOnEdge =
      x === 0 ||
      x === puzzle.width - 1 ||
      y === 0 ||
      y === puzzle.height - 1;

    if (isWater(type) || isOnEdge) {
      model.addEquality(horse, 0);
      model.addEquality(unicorn, 0);
    }
  }

  initializeFlow(x, y, maxFlow, maxFlow2) {
    const { puzzle, model } = this;

    const type = puzzle.tileType(x, y);

    const horse =
      this.horseReachableVariables[x][y];

    const unicorn =
      this.unicornReachableVariables[x][y];

    const horseTerms = [];
    const unicornTerms = [];

    /*
     * Source flow expression.
     */
    if (isHorse(type)) {
      for (let x2 = 0; x2 < puzzle.width; x2++) {
        for (let y2 = 0; y2 < puzzle.height; y2++) {
          horseTerms.push(
            this.horseReachableVariables[x2][y2]
          );
        }
      }
    } else {
      horseTerms.push(
        expressionTimes(horse, -1)
      );
    }

    if (isUnicorn(type)) {
      for (let x2 = 0; x2 < puzzle.width; x2++) {
        for (let y2 = 0; y2 < puzzle.height; y2++) {
          unicornTerms.push(
            this.unicornReachableVariables[x2][y2]
          );
        }
      }
    } else {
      unicornTerms.push(
        expressionTimes(unicorn, -1)
      );
    }

    this.flowPreservationExpressions[x][y] =
      sumExpressions(horseTerms);

    this.flow2PreservationExpressions[x][y] =
      sumExpressions(unicornTerms);

    if (isWater(type)) {
      return;
    }

    const hr = this.horseReachable[x][y];
    const ur = this.unicornReachable[x][y];

    if (!hr && !ur) {
      return;
    }

    for (const [dx, dy] of NEIGHBOUR_DIRECTIONS) {
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

      if (hr) {
        /*
         * horse[x,y] - wall[x2,y2] - horse[x2,y2] <= 0
         */
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

        model.addLessOrEqual(
          sumExpressions(neighbourTerms),
          0
        );

        const flow = model.newIntVar(
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
        model.addLessOrEqual(
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
        model.addLessOrEqual(
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

        model.addLessOrEqual(
          sumExpressions(neighbourTerms),
          0
        );

        const flow = model.newIntVar(
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

        model.addLessOrEqual(
          expressionPlus(
            flow,
            expressionTimes(
              neighbourWall,
              maxFlow2
            )
          ),
          maxFlow2
        );

        model.addLessOrEqual(
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

      for (let x2 = 0; x2 < puzzle.width; x2++) {
        for (let y2 = 0; y2 < puzzle.height; y2++) {
          if (
            puzzle.tileType(x2, y2) !== type
          ) {
            continue;
          }

          if (x2 === x && y2 === y) {
            continue;
          }

          const distance =
            Math.abs(x2 - x) +
            Math.abs(y2 - y);

          if (distance > 1) {
            if (hr) {
              model.addLessOrEqual(
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

            if (ur) {
              model.addLessOrEqual(
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

    model.addEquality(
      this.flowPreservationExpressions[x][y],
      isHorse(type) ? 1 : 0
    );

    model.addEquality(
      this.flow2PreservationExpressions[x][y],
      isUnicorn(type) ? 1 : 0
    );
  }

  blacklistSolution(solution) {
    const { puzzle, model } = this;

    let wallsUsed = 0;
    const terms = [];

    for (let x = 0; x < puzzle.width; x++) {
      for (let y = 0; y < puzzle.height; y++) {
        const wall =
          solution.isWall[x][y];

        if (wall) {
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

    model.addGreaterOrEqual(
      sumExpressions(terms),
      1 - wallsUsed
    );
  }

  buildScoreExpression() {
    const { puzzle } = this;
    const terms = [];

    for (let x = 0; x < puzzle.width; x++) {
      for (let y = 0; y < puzzle.height; y++) {
        const score = tileScore(
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
          puzzle.type === "COSTLY_WALLS"
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

    return sumExpressions(terms);
  }

  async solve(minScore = MIN_SCORE) {
    const { puzzle, model } = this;

    const solver = new CpSolver();

    /*
     * Add the score lower bound only when requested.
     *
     * This is done before solve(), because CP-SAT constraints cannot be
     * modified after solving.
     */
    if (minScore !== MIN_SCORE) {
      const trueMinScore =
        puzzle.type === "LOVEBIRDS"
          ? minScore * 2
          : minScore;

      model.addGreaterOrEqual(
        this.buildScoreExpression(),
        trueMinScore
      );
    }

    const status = await solver.solve(
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

    const isWall = Array.from(
      { length: puzzle.width },
      () => Array(puzzle.height).fill(false)
    );

    const isEnclosed = Array.from(
      { length: puzzle.width },
      () => Array(puzzle.height).fill(false)
    );

    let wallCount = 0;
    let score = 0;

    for (let x = 0; x < puzzle.width; x++) {
      for (let y = 0; y < puzzle.height; y++) {
        const wall = boolValue(
          solver,
          this.wallVariables[x][y]
        );

        const horse = boolValue(
          solver,
          this.horseReachableVariables[x][y]
        );

        const unicorn = boolValue(
          solver,
          this.unicornReachableVariables[x][y]
        );

        isWall[x][y] = wall;
        isEnclosed[x][y] =
          horse || unicorn;

        if (wall) {
          wallCount++;
        }

        if (isEnclosed[x][y]) {
          score += tileScore(
            puzzle.tileType(x, y)
          );
        }
      }
    }

    if (
      puzzle.type === "COSTLY_WALLS"
    ) {
      score -= 6 * wallCount;
    }

    let objectiveValue =
      solver.objectiveValue();

    if (
      puzzle.type === "LOVEBIRDS"
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
      decodeBase64Json(levelEncoded);

    const bonusEncoded =
      params.get("bonus");

    if (bonusEncoded) {
      bonus =
        decodeBase64Json(bonusEncoded);
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
    parsePuzzle(level, bonus);

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

  const solver =
    new PuzzleSolver(puzzle);

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
      { length: puzzle.height },
      (_, y) =>
        Array.from(
          { length: puzzle.width },
          (_, x) => {
            if (
              solution.isWall[x][y]
            ) {
              return "#";
            }

            return puzzle.tile(
              x,
              y
            ).char;
          }
        ).join("")
    )
  );
}

main().catch(error => {
  console.error(error);
});
