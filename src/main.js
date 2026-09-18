const bookmarklet = `javascript:(function(){var l=window.__LEVEL__;if(!l){alert('Open an enclose.horse puzzle first.');return}var w=window.open('about:blank','_blank');var d=(window.__DAILY_LEVELS__||[]).filter(function(x){return String(x.dayNumber)===String(l.dayNumber)||x.id===l.id})[0]||{};var bid=l.bonusId||d.bonusId||(l.bonus&&l.bonus.id);var enc=function(o){var a=new TextEncoder().encode(JSON.stringify(o)),s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)};var done=function(b){var u="https://tristan852.github.io/enclose-horse-solver/"+'?level=%27+encodeURIComponent(enc(l))+(b?%27&bonus=%27+encodeURIComponent(enc(b)):%27%27);if(w&&!w.closed)w.location=u;else location.href=u};if(bid){fetch(%27/api/daily/bonus/%27+encodeURIComponent(l.id)).then(function(r){if(!r.ok)throw Error(%27Bonus request failed (%27+r.status+%27)%27);return r.json()}).then(function(b){b.type=l.bonusType||d.bonusType||(l.bonus&&l.bonus.type)||%27default%27;var names={costlywalls:%27Costly Walls%27,lovebirds:%27Lovebirds%27,loversquarrel:%27Lovers Quarrel%27};b.name=%27Bonus round: %27+(names[String(b.type).toLowerCase()]||String(b.type).replace(/[-_]+/g,%27 %27));done(b)}).catch(function(e){if(w&&!w.closed)w.close();alert(%27Could not prepare this puzzle: %27+e.message)})}else done(null)})()`

document.getElementById("bookmark").href = bookmarklet;

import * as ortools from "or-tools-wasm/cp-sat";
console.log(ortools);

import { CpModel, CpSolver } from "or-tools-wasm/cp-sat";

const NEIGHBOUR_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const MIN_SCORE = Number.MIN_SAFE_INTEGER;

/*
 * --------------------------------------------------------------------------
 * Puzzle parsing
 * --------------------------------------------------------------------------
 *
 * The bookmarklet passes the complete enclose.horse level as:
 *
 *   ?level=<base64-json>
 *
 * The map is a newline-separated character grid.
 *
 * Known characters from the supplied puzzle:
 *
 *   . = grass
 *   ~ = water
 *   H = horse
 *   C = portal/tile type used by this puzzle
 *
 * The solver keeps the raw character on every tile so additional tile types
 * can be added without changing the parser.
 */

function decodeBase64Json(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
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

  const tiles = Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, y) => {
      const char = rows[y][x];

      return {
        x,
        y,
        char,
        type: tileTypeFromChar(char),
      };
    })
  );

  const puzzleType = puzzleTypeFromLevel(level, bonus);

  return {
    level,
    bonus,

    width,
    height,
    wallBudget: Number(level.budget ?? 0),
    optimalScore:
      level.optimalScore == null ? null : Number(level.optimalScore),

    type: puzzleType,

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
 * IMPORTANT:
 *
 * Keep these names independent from the actual map characters. That lets us
 * add the remaining enclose.horse tile types once they are observed.
 */
const TILE = Object.freeze({
  GRASS: "GRASS",
  WATER: "WATER",
  HORSE: "HORSE",
  UNICORN: "UNICORN",
  PORTAL: "PORTAL",
});

function tileTypeFromChar(char) {
  switch (char) {
    case ".":
      return TILE.GRASS;

    case "~":
      return TILE.WATER;

    case "H":
      return TILE.HORSE;

    /*
     * This is intentionally kept as a portal placeholder because the
     * supplied map contains two C tiles and the Java solver treats portals
     * as a tile type having another matching tile.
     *
     * If C has a different meaning in enclose.horse, change this mapping
     * once that tile type is confirmed.
     */
    case "C":
      return TILE.PORTAL;

    default:
      /*
       * Unknown cells are preserved but treated as ordinary grass for now.
       * This makes the parser useful while we identify the remaining
       * enclose.horse tile characters.
       */
      console.warn(`Unknown puzzle tile '${char}', treating as grass.`);
      return TILE.GRASS;
  }
}

function puzzleTypeFromLevel(level, bonus) {
  const type = String(
    level.bonusType ??
      bonus?.type ??
      level.bonus?.type ??
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

function isPortal(tileType) {
  return tileType === TILE.PORTAL;
}

function isWater(tileType) {
  return tileType === TILE.WATER;
}

function isHorse(tileType) {
  return tileType === TILE.HORSE;
}

function isUnicorn(tileType) {
  return tileType === TILE.UNICORN;
}

function isGrass(tileType) {
  return tileType === TILE.GRASS;
}

/*
 * --------------------------------------------------------------------------
 * Scores
 * --------------------------------------------------------------------------
 *
 * This corresponds to PuzzleTileType.getScore() in the Java implementation.
 *
 * The exact values for all enclose.horse tile types should be filled in once
 * their PuzzleTileType definitions are known.
 */
function tileScore(tileType) {
  switch (tileType) {
    case TILE.GRASS:
      return 1;

    case TILE.HORSE:
      return 1;

    case TILE.UNICORN:
      return 1;

    case TILE.PORTAL:
      return 1;

    case TILE.WATER:
      return 0;

    default:
      return 0;
  }
}

/*
 * --------------------------------------------------------------------------
 * Utility helpers for CP-SAT
 * --------------------------------------------------------------------------
 */

function boolValue(solver, variable) {
  return solver.value(variable) >= 0.5;
}

/*
 * Adds:
 *
 *   variable <= other
 *
 * which is the CP-SAT equivalent of the Java linear constraint:
 *
 *   variable - other <= 0
 */
function addLessOrEqual(model, variable, other) {
  model.addLessOrEqual(variable, other);
}

/*
 * Adds:
 *
 *   a + b <= 1
 */
function addAtMostOne(model, a, b) {
  model.addLessOrEqual(a.add(b), 1);
}

/*
 * --------------------------------------------------------------------------
 * Reachability preprocessing
 * --------------------------------------------------------------------------
 *
 * This is the direct equivalent of:
 *
 *   private void explore(int x, int y, boolean[][] reachable)
 *
 * in the Java solver.
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

  const tileType = puzzle.tileType(x, y);

  if (isPortal(tileType)) {
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
      const tileType = puzzle.tileType(x, y);

      if (isHorse(tileType)) {
        explore(puzzle, x, y, horseReachable);
      } else if (isUnicorn(tileType)) {
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
 * PuzzleSolver
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

    this.blacklistConstraints = [];

    this.initialize();
  }

  initialize() {
    const {
      puzzle,
      model,
      wallVariables,
      horseReachableVariables,
      unicornReachableVariables,
    } = this;

    const { width, height, wallBudget } = puzzle;

    /*
     * Java:
     *
     * MPConstraint wallBudgetConstraint = solver.makeConstraint(0, wallBudget);
     *
     * CP-SAT equivalent:
     *
     * sum(wallVariables) <= wallBudget
     */
    const allWalls = [];

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const wall = model.newBoolVar(`tileHasWall${x},${y}`);

        const horse = model.newBoolVar(
          `tileIsHorseReachable${x},${y}`
        );

        const unicorn = model.newBoolVar(
          `tileIsUnicornReachable${x},${y}`
        );

        wallVariables[x][y] = wall;
        horseReachableVariables[x][y] = horse;
        unicornReachableVariables[x][y] = unicorn;

        allWalls.push(wall);
      }
    }

    model.addLessOrEqual(
      allWalls.reduce(
        (expr, variable) => expr.add(variable),
        allWalls[0]
      ),
      wallBudget
    );

    /*
     * Static graph reachability, exactly as in the Java solver.
     */
    const staticReachability =
      calculateStaticReachability(puzzle);

    this.horseReachable = staticReachability.horseReachable;
    this.unicornReachable = staticReachability.unicornReachable;

    /*
     * Create the per-cell constraints.
     */
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        this.initializeCell(x, y);
      }
    }

    /*
     * Disable variables that are statically unreachable.
     */
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (!this.horseReachable[x][y]) {
          model.addEquality(
            horseReachableVariables[x][y],
            0
          );
        }

        if (!this.unicornReachable[x][y]) {
          model.addEquality(
            unicornReachableVariables[x][y],
            0
          );
        }

        if (
          !this.horseReachable[x][y] &&
          !this.unicornReachable[x][y]
        ) {
          model.addEquality(wallVariables[x][y], 0);
        }
      }
    }

    /*
     * maxFlow / maxFlow2 are exactly the number of statically reachable
     * cells minus one, matching the Java implementation.
     */
    const maxFlow =
      this.horseReachable.flat().filter(Boolean).length - 1;

    const maxFlow2 =
      this.unicornReachable.flat().filter(Boolean).length - 1;

    /*
     * Add the actual flow-preservation and adjacency constraints.
     */
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

    /*
     * Objective.
     *
     * Java:
     *
     * objective.setMaximization();
     *
     * The CP-SAT API exposes maximize() directly. <span data-assistant-content-reference="" class="xeh6zmm xt0psk2 x1ghz6dp" data-assistant-grouped-webpages="" data-content-reference-type="grouped_webpages"><span aria-label="Quellen" class="xt0psk2 x1j9pc4w x11njtxf" data-assistant-grouped-webpages-list="" role="group"><span class="x1lziwak xayvhss" data-assistant-grouped-webpages-item=""><button aria-controls="assistant-sources-dialog" aria-haspopup="dialog" aria-label="GitHub" class="xd82pcb xdj9scp xomzcpc x1cpjm7i xt81g8a xm4btww x1vt6bfd xrd0f8c x1hmns74 xy5mcqj x6s0dn4 xjyslct xjbqb8w x12hms15 xc342km x1pk238y x101hxm1 xe6aan1 x1ypdohk x3nfvp2 xjb2p0i x1ivwg07 xk50ysn x13vifvy xc8icb0 xtu1cor x1scn00m x1lvh1i4 xlm6wrl xk2swo9 xt970qd xqfkjy8 x1znate x1n2onr6 xkrqix3 xxymvpz" data-assistant-sources-trigger="" data-assistant-sources-payload="[{&quot;attribution&quot;:&quot;GitHub&quot;,&quot;sourceIndex&quot;:0,&quot;title&quot;:&quot;or-tools-wasm/README.md at stable · Axelwickm/or-tools-wasm · GitHub&quot;,&quot;url&quot;:&quot;https://github.com/Axelwickm/or-tools-wasm/blob/stable/README.md?utm_source=chatgpt.com&quot;}]" data-assistant-grouped-webpages-trigger="" type="button"><span aria-hidden="true" class="x1eya9vm xvle69y x1r7ld26 x16rqkct x1y0btm7 xmkeg23 xmfxnzj x1pk238y xe6aan1 xwz0xwf xdl72j9 x1c4vz4f x2lah0s x6phcfz x1s688f x1jw3ynk xo5v014 xowauwy xb3r6kr x1ku5rj1 x1n2onr6" data-assistant-source-icon="">G<img alt="" class="x-default-marker x5yr21d xh8yej3 x10a8y8t xl1xv1r x10l6tqk" data-assistant-source-icon-image="" src="https://www.google.com/s2/favicons?domain=https%3A%2F%2Fgithub.com&sz=128" ></span><span class="x1heor9g x1qlqyl8 x1pd3egz xeuugli x101abm8 xryxfnj x1b2iylo xwgcxoh xlyipyv xuxw1ft" data-assistant-reference-title="">GitHub</span></button></span></span></span>

     */
    const objectiveTerms = [];

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const score = tileScore(puzzle.tileType(x, y));

        if (score !== 0) {
          objectiveTerms.push(
            horseReachableVariables[x][y].mul(score)
          );

          objectiveTerms.push(
            unicornReachableVariables[x][y].mul(score)
          );
        }

        if (puzzle.type === "COSTLY_WALLS") {
          objectiveTerms.push(
            wallVariables[x][y].mul(-6)
          );
        }
      }
    }

    const objective = sumExpressions(objectiveTerms);

    model.maximize(objective);
  }

  initializeCell(x, y) {
    const {
      puzzle,
      model,
      wallVariables,
      horseReachableVariables,
      unicornReachableVariables,
    } = this;

    const tileType = puzzle.tileType(x, y);

    const wall = wallVariables[x][y];
    const horse = horseReachableVariables[x][y];
    const unicorn = unicornReachableVariables[x][y];

    /*
     * Puzzle type restrictions.
     *
     * Java:
     *
     * LOVEBIRDS:
     *   horse == unicorn
     *
     * LOVERS_QUARREL:
     *   horse + unicorn <= 1
     *
     * default:
     *   unicorn == 0
     */
    if (puzzle.type === "LOVEBIRDS") {
      model.addEquality(horse, unicorn);
    } else if (puzzle.type === "LOVERS_QUARREL") {
      model.addLessOrEqual(horse.add(unicorn), 1);
    } else {
      model.addEquality(unicorn, 0);
    }

    /*
     * Wall cannot coexist with reachable cells.
     *
     * wall + horse <= 1
     * wall + unicorn <= 1
     */
    addAtMostOne(model, wall, horse);
    addAtMostOne(model, wall, unicorn);

    /*
     * Horse and unicorn are mandatory on their own tiles.
     */
    if (isHorse(tileType)) {
      model.addEquality(horse, 1);
    }

    if (isUnicorn(tileType)) {
      model.addEquality(unicorn, 1);
    }

    /*
     * Only grass may receive a wall.
     */
    if (!isGrass(tileType)) {
      model.addEquality(wall, 0);
    }

    /*
     * Water and edge cells cannot be reachable.
     */
    const isOnEdge =
      x === 0 ||
      x === puzzle.width - 1 ||
      y === 0 ||
      y === puzzle.height - 1;

    if (isWater(tileType) || isOnEdge) {
      model.addEquality(horse, 0);
      model.addEquality(unicorn, 0);
    }
  }

  initializeFlow(x, y, maxFlow, maxFlow2) {
    const {
      puzzle,
      model,
      wallVariables,
      horseReachableVariables,
      unicornReachableVariables,
    } = this;

    const tileType = puzzle.tileType(x, y);

    const horse = horseReachableVariables[x][y];
    const unicorn = unicornReachableVariables[x][y];

    /*
     * We represent the Java flow-preservation constraint by constructing
     * the complete linear expression first, then adding its equality.
     *
     * Java's constraints are:
     *
     * horse tile:
     *     sum(horseReachable) == 1 + outgoing/incoming flow
     *
     * ordinary tile:
     *     -horse + incoming/outgoing flow == 0
     */
    const horseFlows = [];
    const unicornFlows = [];

    /*
     * Horse source.
     */
    if (isHorse(tileType)) {
      for (let x2 = 0; x2 < puzzle.width; x2++) {
        for (let y2 = 0; y2 < puzzle.height; y2++) {
          horseFlows.push(horseReachableVariables[x2][y2]);
        }
      }
    } else {
      horseFlows.push(horse.mul(-1));
    }

    /*
     * Unicorn source.
     */
    if (isUnicorn(tileType)) {
      for (let x2 = 0; x2 < puzzle.width; x2++) {
        for (let y2 = 0; y2 < puzzle.height; y2++) {
          unicornFlows.push(unicornReachableVariables[x2][y2]);
        }
      }
    } else {
      unicornFlows.push(unicorn.mul(-1));
    }

    /*
     * Store these expressions. The directed flow variables are added below.
     */
    this.flowPreservationExpressions[x][y] =
      sumExpressions(horseFlows);

    this.flow2PreservationExpressions[x][y] =
      sumExpressions(unicornFlows);

    /*
     * Java skips WATER here.
     */
    if (isWater(tileType)) {
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

      if (isWater(puzzle.tileType(x2, y2))) {
        continue;
      }

      const ownWall = wallVariables[x][y];
      const wall = wallVariables[x2][y2];

      /*
       * Horse flow.
       */
      if (hr) {
        /*
         * horse[x,y] - wall[x2,y2] - horse[x2,y2] <= 0
         */
        model.addLessOrEqual(
          horse.sub(wall).sub(
            horseReachableVariables[x2][y2]
          ),
          0
        );

        const flowOutgoing = model.newIntVar(
          0,
          Math.max(0, maxFlow),
          `flow${x},${y},${x2},${y2}`
        );

        this.flowPreservationExpressions[x][y] =
          this.flowPreservationExpressions[x][y]
            .sub(flowOutgoing);

        this.flowPreservationExpressions[x2][y2] =
          this.flowPreservationExpressions[x2][y2]
            .add(flowOutgoing);

        /*
         * flow <= maxFlow * (1 - wall)
         *
         * flow + maxFlow * wall <= maxFlow
         */
        model.addLessOrEqual(
          flowOutgoing.add(wall.mul(maxFlow)),
          maxFlow
        );

        /*
         * flow <= maxFlow * (1 - ownWall)
         */
        model.addLessOrEqual(
          flowOutgoing.add(ownWall.mul(maxFlow)),
          maxFlow
        );
      }

      /*
       * Unicorn flow.
       */
      if (ur) {
        model.addLessOrEqual(
          unicorn.sub(wall).sub(
            unicornReachableVariables[x2][y2]
          ),
          0
        );

        const flowOutgoing = model.newIntVar(
          0,
          Math.max(0, maxFlow2),
          `flow2${x},${y},${x2},${y2}`
        );

        this.flow2PreservationExpressions[x][y] =
          this.flow2PreservationExpressions[x][y]
            .sub(flowOutgoing);

        this.flow2PreservationExpressions[x2][y2] =
          this.flow2PreservationExpressions[x2][y2]
            .add(flowOutgoing);

        model.addLessOrEqual(
          flowOutgoing.add(wall.mul(maxFlow2)),
          maxFlow2
        );

        model.addLessOrEqual(
          flowOutgoing.add(ownWall.mul(maxFlow2)),
          maxFlow2
        );
      }
    }

    /*
     * Portal flow.
     *
     * This deliberately follows the Java implementation's unusual
     * "find the first matching portal" behavior.
     */
    if (isPortal(tileType)) {
      let found = false;

      for (let x2 = 0; x2 < puzzle.width; x2++) {
        for (let y2 = 0; y2 < puzzle.height; y2++) {
          if (puzzle.tileType(x2, y2) !== tileType) {
            continue;
          }

          if (x2 === x && y2 === y) {
            continue;
          }

          const distance =
            Math.abs(x2 - x) + Math.abs(y2 - y);

          if (distance > 1) {
            if (hr) {
              model.addLessOrEqual(
                horse.sub(
                  horseReachableVariables[x2][y2]
                ),
                0
              );

              const flowOutgoing = model.newIntVar(
                0,
                Math.max(0, maxFlow),
                `portalFlow${x},${y},${x2},${y2}`
              );

              this.flowPreservationExpressions[x][y] =
                this.flowPreservationExpressions[x][y]
                  .sub(flowOutgoing);

              this.flowPreservationExpressions[x2][y2] =
                this.flowPreservationExpressions[x2][y2]
                  .add(flowOutgoing);
            }

            if (ur) {
              model.addLessOrEqual(
                unicorn.sub(
                  unicornReachableVariables[x2][y2]
                ),
                0
              );

              const flowOutgoing = model.newIntVar(
                0,
                Math.max(0, maxFlow2),
                `portalFlow2${x},${y},${x2},${y2}`
              );

              this.flow2PreservationExpressions[x][y] =
                this.flow2PreservationExpressions[x][y]
                  .sub(flowOutgoing);

              this.flow2PreservationExpressions[x2][y2] =
                this.flow2PreservationExpressions[x2][y2]
                  .add(flowOutgoing);
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
     * Add the completed flow conservation constraints.
     */
    model.addEquality(
      this.flowPreservationExpressions[x][y],
      isHorse(tileType) ? 1 : 0
    );

    model.addEquality(
      this.flow2PreservationExpressions[x][y],
      isUnicorn(tileType) ? 1 : 0
    );
  }

  blacklistSolution(solution) {
    const {
      puzzle,
      model,
      wallVariables,
    } = this;

    let wallsUsed = 0;

    for (let x = 0; x < puzzle.width; x++) {
      for (let y = 0; y < puzzle.height; y++) {
        if (solution.isWall[x][y]) {
          wallsUsed++;
        }
      }
    }

    /*
     * Java:
     *
     * constraint = solver.makeConstraint(
     *     1 - wallsUsed,
     *     infinity
     * );
     *
     * wall solution:
     *     -wallVariable
     *
     * non-wall:
     *     +wallVariable
     *
     * This forbids exactly the same wall configuration.
     */
    const terms = [];

    for (let x = 0; x < puzzle.width; x++) {
      for (let y = 0; y < puzzle.height; y++) {
        if (solution.isWall[x][y]) {
          terms.push(wallVariables[x][y].mul(-1));
        } else {
          terms.push(wallVariables[x][y]);
        }
      }
    }

    model.addGreaterOrEqual(
      sumExpressions(terms),
      1 - wallsUsed
    );
  }

  async solve(minScore = MIN_SCORE) {
    const { puzzle, model } = this;

    /*
     * Java uses:
     *
     * solver.setTimeLimit(120_000);
     * solver.setNumThreads(1);
     *
     * or-tools-wasm's CP-SAT interface accepts solver parameters through
     * solve(). <span data-assistant-content-reference="" class="xeh6zmm xt0psk2 x1ghz6dp" data-assistant-grouped-webpages="" data-content-reference-type="grouped_webpages"><span aria-label="Quellen" class="xt0psk2 x1j9pc4w x11njtxf" data-assistant-grouped-webpages-list="" role="group"><span class="x1lziwak xayvhss" data-assistant-grouped-webpages-item=""><button aria-controls="assistant-sources-dialog" aria-haspopup="dialog" aria-label="GitHub" class="xd82pcb xdj9scp xomzcpc x1cpjm7i xt81g8a xm4btww x1vt6bfd xrd0f8c x1hmns74 xy5mcqj x6s0dn4 xjyslct xjbqb8w x12hms15 xc342km x1pk238y x101hxm1 xe6aan1 x1ypdohk x3nfvp2 xjb2p0i x1ivwg07 xk50ysn x13vifvy xc8icb0 xtu1cor x1scn00m x1lvh1i4 xlm6wrl xk2swo9 xt970qd xqfkjy8 x1znate x1n2onr6 xkrqix3 xxymvpz" data-assistant-sources-trigger="" data-assistant-sources-payload="[{&quot;attribution&quot;:&quot;GitHub&quot;,&quot;sourceIndex&quot;:0,&quot;title&quot;:&quot;or-tools-wasm/README.md at stable · Axelwickm/or-tools-wasm · GitHub&quot;,&quot;url&quot;:&quot;https://github.com/Axelwickm/or-tools-wasm/blob/stable/README.md?utm_source=chatgpt.com&quot;}]" data-assistant-grouped-webpages-trigger="" type="button"><span aria-hidden="true" class="x1eya9vm xvle69y x1r7ld26 x16rqkct x1y0btm7 xmkeg23 xmfxnzj x1pk238y xe6aan1 xwz0xwf xdl72j9 x1c4vz4f x2lah0s x6phcfz x1s688f x1jw3ynk xo5v014 xowauwy xb3r6kr x1ku5rj1 x1n2onr6" data-assistant-source-icon="">G<img alt="" class="x-default-marker x5yr21d xh8yej3 x10a8y8t xl1xv1r x10l6tqk" data-assistant-source-icon-image="" src="https://www.google.com/s2/favicons?domain=https%3A%2F%2Fgithub.com&sz=128" ></span><span class="x1heor9g x1qlqyl8 x1pd3egz xeuugli x101abm8 xryxfnj x1b2iylo xwgcxoh xlyipyv xuxw1ft" data-assistant-reference-title="">GitHub</span></button></span></span></span>

     */
    const solver = new CpSolver();

    /*
     * The Java implementation applies the minimum score after building
     * the objective. For Lovebirds the externally-visible score is half
     * the internal objective.
     */
    if (minScore !== MIN_SCORE) {
      const trueMinScore =
        puzzle.type === "LOVEBIRDS"
          ? minScore << 1
          : minScore;

      /*
       * CP-SAT doesn't mutate an existing linear constraint the way
       * MPSolver does. Reconstruct the equivalent score lower bound.
       */
      const scoreTerms = [];

      for (let x = 0; x < puzzle.width; x++) {
        for (let y = 0; y < puzzle.height; y++) {
          const score = tileScore(puzzle.tileType(x, y));

          if (score !== 0) {
            scoreTerms.push(
              this.horseReachableVariables[x][y].mul(score)
            );

            scoreTerms.push(
              this.unicornReachableVariables[x][y].mul(score)
            );
          }

          if (puzzle.type === "COSTLY_WALLS") {
            scoreTerms.push(
              this.wallVariables[x][y].mul(-6)
            );
          }
        }
      }

      model.addGreaterOrEqual(
        sumExpressions(scoreTerms),
        trueMinScore
      );
    }

    const status = await solver.solve(model, {
      maxTimeInSeconds: 120,
      numSearchWorkers: 1,
    });

    const statusName = solver.statusName(status);

    console.log("Solver status:", statusName);

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
        isEnclosed[x][y] = horse || unicorn;

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

    if (puzzle.type === "COSTLY_WALLS") {
      score -= 6 * wallCount;
    }

    /*
     * CP-SAT objectiveValue() corresponds to the objective used by the
     * model. For Lovebirds the Java solver divides the internal objective
     * by two.
     */
    let objectiveValue = solver.objectiveValue();

    if (puzzle.type === "LOVEBIRDS") {
      objectiveValue *= 0.5;
    }

    console.log("Computed score:", score);
    console.log("Objective:", objectiveValue);
    console.log("Walls:", wallCount);

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
 * Linear expression helper
 * --------------------------------------------------------------------------
 */

function sumExpressions(expressions) {
  if (expressions.length === 0) {
    throw new Error("Cannot sum an empty expression.");
  }

  let result = expressions[0];

  for (let i = 1; i < expressions.length; i++) {
    result = result.add(expressions[i]);
  }

  return result;
}

/*
 * --------------------------------------------------------------------------
 * Application entry point
 * --------------------------------------------------------------------------
 */

async function main() {
  const params = new URLSearchParams(
    window.location.search
  );

  const levelEncoded = params.get("level");

  if (!levelEncoded) {
    console.log(
      "No puzzle supplied. Open an enclose.horse puzzle and use the bookmarklet."
    );
    return;
  }

  let level;
  let bonus = null;

  try {
    level = decodeBase64Json(levelEncoded);

    const bonusEncoded = params.get("bonus");

    if (bonusEncoded) {
      bonus = decodeBase64Json(bonusEncoded);
    }
  } catch (error) {
    console.error("Failed to decode puzzle:", error);
    throw new Error("Could not decode puzzle data.");
  }

  console.log("Level:", level);
  console.log("Bonus:", bonus);

  const puzzle = parsePuzzle(level, bonus);

  console.log("Parsed puzzle:", puzzle);
  console.log(
    `Board: ${puzzle.width} × ${puzzle.height}`
  );
  console.log("Puzzle type:", puzzle.type);
  console.log("Wall budget:", puzzle.wallBudget);

  const solver = new PuzzleSolver(puzzle);

  const solution = await solver.solve();

  if (!solution) {
    console.log("No feasible solution found.");
    return;
  }

  console.log("Solution:", solution);

  /*
   * Temporary visual output.
   *
   * This gives us something immediately useful before wiring the result
   * into your existing board renderer.
   */
  console.table(
    Array.from(
      { length: puzzle.height },
      (_, y) =>
        Array.from(
          { length: puzzle.width },
          (_, x) => {
            if (solution.isWall[x][y]) {
              return "#";
            }

            if (solution.isEnclosed[x][y]) {
              return puzzle.tile(x, y).char;
            }

            return puzzle.tile(x, y).char;
          }
        ).join("")
    )
  );
}

main().catch(error => {
  console.error(error);
});
