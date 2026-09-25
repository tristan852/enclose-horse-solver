import clingo from "clingo-wasm";

const DIRECTIONS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

const MIN_SCORE = -2147483648;

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
  return Object.hasOwn(TILE_BY_CHAR, char)
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
  if (type == null) return "DEFAULT";

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

export function parsePuzzle(level, isBonus = false) {
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
    width,
    height,
    wallBudget: Number(level.budget ?? 0),
    optimalScore:
      level.optimalScore == null ? null : Number(level.optimalScore),
    type: puzzleType(isBonus ? level.bonusType : null),
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
      return character == null ? [] : portals.get(character) ?? [];
    },
  };
}

function modeAtom(type) {
  switch (type) {
    case "COSTLY_WALLS":
      return "costly_walls";
    case "LOVEBIRDS":
      return "lovebirds";
    case "LOVERS_QUARREL":
      return "lovers_quarrel";
    default:
      return "normal";
  }
}

function fact(name, ...args) {
  return name + "(" + args.join(",") + ").";
}

function calculateStaticReachability(puzzle, animalType) {
  const reachable = makeGrid(
    puzzle.width,
    puzzle.height,
    false
  );
  const pending = [];
  let foundAnimal = false;

  for (let x = 0; x < puzzle.width; x++) {
    for (let y = 0; y < puzzle.height; y++) {
      if (puzzle.tileType(x, y) === animalType) {
        pending.push([x, y]);
        foundAnimal = true;
        break;
      }
    }
    
    if(foundAnimal) break;
  }

  while (pending.length > 0) {
    const [x, y] = pending.pop();

    if (
      x < 0 ||
      x >= puzzle.width ||
      y < 0 ||
      y >= puzzle.height ||
      reachable[x][y] ||
      isWater(puzzle.tileType(x, y))
    ) {
      continue;
    }

    reachable[x][y] = true;

    for (const [dx, dy] of DIRECTIONS) {
      pending.push([x + dx, y + dy]);
    }

    if (isPortal(puzzle.tileType(x, y))) {
      const matching = puzzle.matchingPortals(x, y);
      const target = matching.find(
        ([nx, ny]) => nx !== x || ny !== y
      );

      if (target) pending.push(target);
    }
  }

  return reachable;
}

function generateFacts(puzzle) {
  const facts = [
    "% Generated instance facts for " + puzzle.width + "x" + puzzle.height + ".",
    fact("mode", modeAtom(puzzle.type)),
    fact("budget", puzzle.wallBudget),
  ];

  if (puzzle.optimalScore != null) {
    facts.push(fact("optimal_score", puzzle.optimalScore));
  }

  const horseStaticReachability =
    calculateStaticReachability(puzzle, TILE.HORSE);
  const unicornStaticReachability =
    calculateStaticReachability(puzzle, TILE.UNICORN);

  for (let x = 0; x < puzzle.width; x++) {
    for (let y = 0; y < puzzle.height; y++) {
      const type = puzzle.tileType(x, y);

      if (is(type, TILE.GRASS)) facts.push(fact("grass", x, y));
      if (is(type, TILE.HORSE)) facts.push(fact("horse", x, y));
      if (is(type, TILE.UNICORN)) facts.push(fact("unicorn", x, y));

      const boundary =
        x === 0 ||
        x === puzzle.width - 1 ||
        y === 0 ||
        y === puzzle.height - 1;

      if (boundary) facts.push(fact("boundary", x, y));
      facts.push(fact("tile_score", x, y, tileScore(type)));

      if (!horseStaticReachability[x][y]) {
        facts.push(`:- reach(horse,${x},${y}).`);
      }

      if (!unicornStaticReachability[x][y]) {
        facts.push(`:- reach(unicorn,${x},${y}).`);
      }

      if (
        is(type, TILE.GRASS) &&
        !horseStaticReachability[x][y] &&
        !unicornStaticReachability[x][y]
      ) {
        facts.push(`:- wall(${x},${y}).`);
      }
    }
  }

  for (let x = 0; x < puzzle.width; x++) {
    for (let y = 0; y < puzzle.height; y++) {
      if (isWater(puzzle.tileType(x, y))) continue;

      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;

        if (
          nx < 0 ||
          nx >= puzzle.width ||
          ny < 0 ||
          ny >= puzzle.height ||
          isWater(puzzle.tileType(nx, ny))
        ) {
          continue;
        }

        facts.push(fact("adj", x, y, nx, ny));
      }
    }
  }

  for (const cells of puzzle.portals.values()) {
    if (cells.length < 2) continue;

    const [first, second] = cells;
    facts.push(fact("portal_edge", first[0], first[1], second[0], second[1]));
    facts.push(fact("portal_edge", second[0], second[1], first[0], first[1]));
  }

  return facts.join("\n") + "\n";
}

function parseAtomCoordinates(atoms, predicate) {
  const coordinates = [];
  const pattern = new RegExp("^" + predicate + "\\((-?\\d+),(-?\\d+)\\)$");

  for (const atom of atoms) {
    const match = pattern.exec(atom);
    if (match) coordinates.push([Number(match[1]), Number(match[2])]);
  }

  return coordinates;
}

function parseReachCoordinates(atoms, animal) {
  const coordinates = [];
  const pattern = new RegExp(
    "^reach\\(" + animal + ",(-?\\d+),(-?\\d+)\\)$"
  );

  for (const atom of atoms) {
    const match = pattern.exec(atom);
    if (!match) continue;
    coordinates.push([Number(match[1]), Number(match[2])]);
  }

  return coordinates;
}

function coordinatesToGrid(width, height, coordinates) {
  const grid = makeGrid(width, height, false);

  for (const [x, y] of coordinates) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[x][y] = true;
    }
  }

  return grid;
}

function compareCosts(a, b) {
  if (a == null) return 1;
  if (b == null) return -1;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;

    if (av !== bv) return av < bv ? -1 : 1;
  }

  return 0;
}

function compareWallCoordinates([x1, y1], [x2, y2]) {
  return y1 - y2 || x1 - x2;
}

function canonicalWallKey(coordinates) {
  return coordinates
    .slice()
    .sort(compareWallCoordinates)
    .map(([x, y]) => x + "," + y)
    .join(";");
}

function compareWallSets(left, right) {
  const leftWalls = left.wallCoordinates;
  const rightWalls = right.wallCoordinates;

  if (leftWalls.length !== rightWalls.length) {
    return leftWalls.length - rightWalls.length;
  }

  for (let index = 0; index < leftWalls.length; index++) {
    const comparison = compareWallCoordinates(
      leftWalls[index],
      rightWalls[index]
    );

    if (comparison !== 0) return comparison;
  }

  return 0;
}

export class PuzzleSolver {
  constructor(puzzle, staticModel) {
    this.puzzle = puzzle;
    this.staticModel = staticModel;
    this.solutions = [];
    this.hasMore = false;
  }

  async solve(limit = 30) {
    const program = this.staticModel + "\n" + generateFacts(this.puzzle);
    const foundSolutions = [];
    const seenWallKeys = new Set();
    
    const N = limit;
    
    const options = ["--opt-mode=optN", "--project"];
    
    if (clingo.supportsThreads()) {
      options.push("-t", "1");
    }

    const result = await clingo.run(
      program,
      N + 1,
      options,
      answerSet => {
        const walls = parseAtomCoordinates(answerSet.Value, "wall");
        const wallKey = canonicalWallKey(walls);

        if (seenWallKeys.has(wallKey)) return;
        seenWallKeys.add(wallKey);
        
        foundSolutions.push({
          values: [...answerSet.Value],
          costs: answerSet.Costs ? [...answerSet.Costs] : null,
        });
      }
    );
    
    if (result && result.Error) throw new Error(result.Error);
    if (!result || result.Result !== "OPTIMUM FOUND") return;
    
    const optimalCosts = foundSolutions
      .map(s => s.costs)
      .filter(Boolean)
      .reduce((best, costs) =>
        best == null || compareCosts(costs, best) < 0
          ? costs
          : best,
        null
      );
    
    const optimalSolutions = foundSolutions.filter(
      s => compareCosts(s.costs, optimalCosts) === 0
    );

    this.hasMore = optimalSolutions.length > N;

    for (const foundSolution of optimalSolutions.slice(0, N)) {

      this.solutions.push(this.makeSolution(foundSolution.values));
    }

    this.solutions.sort(compareWallSets);
    return {
      solutions: this.solutions,
      hasMore: this.hasMore,
    };
  }

  makeSolution(atoms) {
    const { puzzle } = this;
    const walls = parseAtomCoordinates(atoms, "wall");
    const canonicalWalls = walls.slice().sort(compareWallCoordinates);
    const horseReach = parseReachCoordinates(atoms, "horse");
    const unicornReach = parseReachCoordinates(atoms, "unicorn");
    const covered = [
      ...horseReach,
      ...(puzzle.type === "LOVERS_QUARREL" ? unicornReach : []),
    ];

    const isWall = coordinatesToGrid(puzzle.width, puzzle.height, walls);
    const reachable = [...horseReach, ...unicornReach];
    const uniqueReachable = [
      ...new Map(
        reachable.map(([x, y]) => [x + "," + y, [x, y]])
      ).values(),
    ];
    const isEnclosed = coordinatesToGrid(
      puzzle.width,
      puzzle.height,
      uniqueReachable
    );

    const canReach = makeGrid(puzzle.width, puzzle.height, false);

    for (const [x, y] of covered) {
      canReach[x][y] = true;

      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;

        if (
          nx >= 0 &&
          nx < puzzle.width &&
          ny >= 0 &&
          ny < puzzle.height &&
          isWall[nx][ny]
        ) {
          canReach[nx][ny] = true;
        }
      }
    }

    let score = covered.reduce(
      (sum, [x, y]) => sum + tileScore(puzzle.tileType(x, y)),
      0
    );

    if (puzzle.type === "COSTLY_WALLS") score -= 6 * walls.length;

    return {
      puzzle,
      score,
      objectiveValue: score,
      isWall,
      isEnclosed,
      canReach,
      wallsUsed: walls.length,
      wallCoordinates: canonicalWalls,
      status: "OPTIMAL",
      horseReach,
      unicornReach,
    };
  }
}

export async function cancelSolver() {
  await clingo.restart();
}

function formatBoard(puzzle, solution) {
  if (!solution) return puzzle.map;

  puzzle = solution.puzzle;

  return Array.from(
    { length: puzzle.height },
    (_, y) =>
      Array.from(
        { length: puzzle.width },
        (_, x) =>
          solution.isWall[x][y]
            ? "W"
            : puzzle.tile(x, y).char
      ).join("")
  ).join("\n");
}

// RENDERING

const results = document.getElementById("results");
const install = document.getElementById("install");
const editorLinkSection = document.getElementById("editor-link-section");
const puzzleViews = [];

function bonusName(type = "bonus") {
  return {
    costlywalls: "Costly Walls",
    lovebirds: "Lovebirds",
    loversquarrel: "Lovers Quarrel"
  }[type] || type.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function editorPuzzleType(type = "bonus") {
  return {
    costlywalls: "costly-walls",
    lovebirds: "lovebirds",
    loversquarrel: "lovers-quarrel"
  }[type] || type.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function portalColor(value) {
    const code = String(value).charCodeAt(0);
    const portalId = code >= 97 ? code - 87 : code - 48;

    const hue = (198 + portalId * 37) % 360;
    return `hsl(${hue}, 49%, 48%)`;
}

export function waterGetsBoat(x, y, width) {
  const index = y * width + x;
  const w = Math.sin(49380 + index * 67890) * 1e4;
  const v = w - Math.floor(w);
  
  return v < 0.006;
}

export function waterGetsWave(x, y, width) {
    const index = y * width + x;
    const w = Math.sin(24690 + index * 67890) * 1e4;
    const v = w - Math.floor(w);

    return v < 0.7;
}

function resizeBoard(card, width, height) {
  const available = Math.min(
    520,
    Math.max(0, Math.min(window.innerWidth, 960) - 88)
  );

  card.style.setProperty(
    "--cell",
    `${Math.max(8, available / Math.max(width, height))}px`
  );
}

function renderSolution(view, solution) {
  const card = view.card;
  const board = card.querySelector(".board");
  
  view.solution = solution;
  
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
        ? "#3b1f2b"
        : puzzle.type === "loversquarrel"
          ? "#3b1518"
          : "#3b2919"
    );
  }

  const title = isBonus
    ? `Bonus round: ${bonusName(puzzle.type)}`
    : puzzle.name || "Enclose.horse level";

  card.innerHTML = `
    <h2>${title}</h2>
    <button
      class="control-button open-puzzle"
      type="button"
      aria-label="Open in puzzle editor"
      title="Open in puzzle editor"
    >
      <i data-lucide="external-link"></i>
    </button>
    <button
      class="control-button copy-puzzle"
      type="button"
      aria-label="Copy puzzle and solution"
      title="Copy puzzle and solution"
    >
      <i data-lucide="copy"></i>
    </button>
    <div class="meta">
      Puzzle ${puzzle.id || ""} · ${width} x ${height} · wall budget: ${puzzle.budget}
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
        ![".", "#", "W", "~"].includes(symbol);

      cell.className =
        "cell" +
        (symbol === "~" ? " water" : "") +
        (isPortal ? " portal" : "");

      if (symbol === "~") {
        
        cell.textContent =
          waterGetsBoat(x, y, width) ? "⛵" :
          waterGetsWave(x, y, width) ? "🌊" :
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
        <i data-lucide="arrow-left"></i> Previous
      </button>

      <button type="button" disabled
        aria-label="Next optimal solution">
        Next <i data-lucide="arrow-right"></i>
      </button>
    </div>
  `;

  card.append(status);

  const view = {
    card,
    board,
    status,
    width,
    height
  };
  
  const otherButton = card.querySelector(".open-puzzle");
  otherButton.addEventListener("click", async () => {
    
    try {
      
      const mode = isBonus ? editorPuzzleType(puzzle.type) : "default";
      const session = {
        mode: mode,
        width: width,
        height: height,
        budget: puzzle.budget,
        tool: "water",
        brush: 1,
        map: formatBoard(puzzle, view.solution)
      };
      
      const encoded = btoa(JSON.stringify(session));
      const url = `${import.meta.env.BASE_URL}edit/?session=${encodeURIComponent(encoded)}`;
      
      window.open(url, "_blank");
      
    } catch (err) {
      copying = false;
      console.error("Failed to open puzzle in editor:", err);
    }
  });
  
  let copying = false;
  
  const button = card.querySelector(".copy-puzzle");
  button.addEventListener("click", async () => {
  
    try {
      const data = {
        map: formatBoard(puzzle, view.solution),
        budget: puzzle.budget
      };
      
      const encoded = btoa(JSON.stringify(data));
      await navigator.clipboard.writeText(encoded);
      
      if(copying) return;
      copying = true;
      
      button.innerHTML = `<i data-lucide="check"></i>`;
      lucide.createIcons({ root: button });
      
      setTimeout(() => {
        
        button.innerHTML = `<i data-lucide="copy"></i>`;
        lucide.createIcons({ root: button });
        
        copying = false;
      }, 2000);
  
    } catch (err) {
      copying = false;
      console.error("Failed to copy puzzle:", err);
    }
  });

  return view;
}

function showPuzzle(puzzle) {
  const view = createPuzzleCard(puzzle.level);
  
  setWorking(view.status, "waiting for main round to be solved…");

  results.append(view.card);

  window.addEventListener(
    "resize",
    () => resizeBoard(view.card, view.width, view.height),
    { passive: true }
  );

  puzzleViews.push(view);
  
  return view;
}

function visiblePuzzleView() {
  const views = puzzleViews.filter(view => view.card.isConnected);

  if (views.length <= 1) return views[0] ?? null;

  const viewportHeight = window.innerHeight;
  const viewportCenter = viewportHeight / 2;

  return views.reduce((best, view) => {
    const rect = view.card.getBoundingClientRect();
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
    );
    const bestRect = best.card.getBoundingClientRect();
    const bestVisibleHeight = Math.max(
      0,
      Math.min(bestRect.bottom, viewportHeight) - Math.max(bestRect.top, 0)
    );

    if (visibleHeight !== bestVisibleHeight) {
      return visibleHeight > bestVisibleHeight ? view : best;
    }

    const distance = Math.abs(
      (rect.top + rect.bottom) / 2 - viewportCenter
    );
    const bestDistance = Math.abs(
      (bestRect.top + bestRect.bottom) / 2 - viewportCenter
    );

    return distance < bestDistance ? view : best;
  });
}

document.addEventListener("keydown", event => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.matches("input, textarea, select") ||
      activeElement.isContentEditable)
  ) {
    return;
  }

  const view = visiblePuzzleView();
  if (!view) return;

  const [previous, next] = view.status.querySelectorAll("button");
  const button = event.key === "ArrowLeft" ? previous : next;

  if (button?.disabled) return;

  event.preventDefault();
  button.click();
});

async function initiallySolvePuzzle(puzzle, view, staticModel) {
  let solutionIndex = 0;
  const puzzleSolver = new PuzzleSolver(puzzle, staticModel);

  async function requestSolutions() {
    const startedAt = performance.now();
    const result = await puzzleSolver.solve(100);
    const elapsedMs = performance.now() - startedAt;
    const elapsed = `${elapsedMs.toFixed(1)} ms`;
  
    console.info(
      `Clingo: elapsed=${elapsed}, solution_count=${result.solutions.length}, has_more=${result.hasMore}`
    );
  
    return result;
  }

  setWorking(view.status, "finding optimal solutions…");

  const {solutions, hasMore} = await requestSolutions();

  if (!solutions || solutions.length == 0) {
    view.status.querySelector("small").textContent =
      "No legal solution found";
    return;
  }

  function update() {
    renderSolution(view, solutions[solutionIndex]);

    view.status.querySelector("small").textContent =
      "solution " + (solutionIndex + 1) + "/" + solutions.length +
      (hasMore ? "+" : "") + " · " +
      solutions[solutionIndex].wallsUsed + "/" +
      solutions[solutionIndex].puzzle.wallBudget + " walls used";

    const [previous, next] =
      view.status.querySelectorAll("button");

    previous.disabled = solutionIndex === 0;
    next.disabled = solutionIndex + 1 >= solutions.length;
  }

  const [previous, next] = view.status.querySelectorAll("button");

  previous.onclick = () => {
    if (solutionIndex > 0) {
      solutionIndex--;
      update();
    }
  };

  next.onclick = async () => {
    if (solutionIndex + 1 < solutions.length) {
      solutionIndex++;
      update();
    }
  };

  update();
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const levelEncoded = params.get("level");

  if (!levelEncoded) {
    console.log(
      "No puzzle supplied. Open an enclose.horse puzzle and use the \"solve\" bookmarklet."
    );
    return;
  }

  let level;
  let bonus = null;

  try {
    level = decodeBase64Json(levelEncoded);

    const bonusEncoded = params.get("bonus");
    if (bonusEncoded) bonus = decodeBase64Json(bonusEncoded);
  } catch (error) {
    console.error("Failed to decode puzzle data:", error);
    throw new Error("Could not decode puzzle data.", { cause: error });
  }

  const puzzle = parsePuzzle(level, false);
  const bonusPuzzle = bonus === null ? null : parsePuzzle(bonus, true);

  const modelResponse =
    await fetch(import.meta.env.BASE_URL + "enclose_horse.lp");

  if (!modelResponse.ok) {
    throw new Error(
      "Could not load static Clingo model (" +
      modelResponse.status +
      ")."
    );
  }

  const staticModel = await modelResponse.text();

  if (install) install.hidden = true;
  if (editorLinkSection) editorLinkSection.hidden = true;

  if (!results) {
    console.error("Missing #results element");
    return;
  }

  results.hidden = false;

  const view1 = showPuzzle(puzzle);
  const view2 = bonusPuzzle === null ? null : showPuzzle(bonusPuzzle);

  lucide.createIcons();

  try {
    
    await initiallySolvePuzzle(puzzle, view1, staticModel);
    
    if (bonusPuzzle !== null) {
      await initiallySolvePuzzle(bonusPuzzle, view2, staticModel);
    }
    
  } catch (error) {
    results.hidden = false;
    results.innerHTML =
      '<div class="error">' + error.message + "</div>";
  }
}

main().catch(error => {
  console.error("Solver failed:", error);
});
