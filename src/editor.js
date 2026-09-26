import { PuzzleSolver, cancelSolver, parsePuzzle, portalColor, waterGetsBoat, waterGetsWave } from "./solver.js";

const TILE_CHARS = {
  grass: ".",
  water: "~",
  wall: "W",
  horse: "H",
  unicorn: "U",
  cherry: "C",
  apple: "G",
  bee: "S"
};

const CHAR_TILES = Object.fromEntries(
  Object.entries(TILE_CHARS).map(([tile, character]) => [character, tile])
);

const PORTALS = "0123456789abcdefghijklmnopqrstuvwxyz".split("");

function editorMarkup() {
  return `
    <section class="editor" aria-label="Level editor">
      <div class="editor-head">
        <div>
          <h2>Level editor</h2>
          <p class="subtitle">Create a puzzle for the herd.</p>
        </div>
        <button
          class="control-button"
          id="copy-puzzle"
          title="Copy puzzle and solution"
          aria-label="Copy puzzle and solution"
        >
          <i data-lucide="copy"></i>
        </button>
      </div>

      <div class="workspace editor-workspace">
        <div class="board-wrap">
          <div class="board-container">
            <div class="board editor-board" id="board" aria-label="Level grid">
            </div>
          </div>
        </div>
        <p class="board-note">Click or drag across the grid to paint.</p>

        <div class="toolbar" aria-label="Editor toolbar">
          <div class="toolbar-top">
            <div class="tool-group">
              <span class="tool-label">Game mode</span>
              <select id="mode" aria-label="Game mode">
                <option value="default">Default</option>
                <option value="lovebirds">Lovebirds</option>
                <option value="lovers-quarrel">Lovers Quarrel</option>
                <option value="costly-walls">Costly Walls</option>
              </select>
            </div>
            <div class="tool-group">
              <span class="tool-label">Width</span>
              <input id="width" type="number" min="8" max="30" value="12" aria-label="Width">
            </div>
            <div class="tool-group">
              <span class="tool-label">Height</span>
              <input id="height" type="number" min="8" max="30" value="12" aria-label="Height">
            </div>
            <div class="tool-group">
              <span class="tool-label">Wall budget</span>
              <input id="budget" type="number" min="1" max="99" value="12" aria-label="Wall budget">
            </div>
          </div>

          <div class="toolbar-divider">
      </div>

          <div class="tool-row placement-row">
            <div class="tool-group">
              <span class="tool-label">Place</span>
              <button class="tool icon-tool active" data-tool="grass" aria-label="Grass" title="Grass">
                <span class="terrain-swatch grass">
                </span>
              </button>
              <button class="tool icon-tool" data-tool="water" aria-label="Water" title="Water">
                <span class="terrain-swatch water">
                </span>
              </button>
              <button class="tool icon-tool" data-tool="wall" aria-label="Wall" title="Wall">
                <span class="terrain-swatch wall">
                </span>
              </button>
              <button class="tool icon-tool" data-tool="horse" aria-label="Horse" title="Horse">🐴</button>
              <button class="tool icon-tool unicorn-tool" data-tool="unicorn" aria-label="Unicorn" title="Unicorn">🦄</button>
              <button class="tool icon-tool" data-tool="cherry" aria-label="Cherry" title="Cherry">🍒</button>
              <button class="tool icon-tool" data-tool="apple" aria-label="Golden apple" title="Golden apple">🍎</button>
              <button class="tool icon-tool" data-tool="bee" aria-label="Bee swarm" title="Bee swarm">🐝</button>
              <button class="tool icon-tool" data-tool="portal-0" aria-label="Portal 0" title="Portal 0">🌀</button>
            </div>

            <div class="tool-group">
              <span class="tool-label">Brush</span>
              <button class="tool brush active" data-size="1" aria-label="1 by 1 brush" title="1×1 brush">
                <span class="brush-grid" style="--brush:1">
      <i>
      </i>
      </span>
              </button>
              <button class="tool brush" data-size="2" aria-label="2 by 2 brush" title="2×2 brush">
                <span class="brush-grid" style="--brush:2">
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      </span>
              </button>
              <button class="tool brush" data-size="3" aria-label="3 by 3 brush" title="3×3 brush">
                <span class="brush-grid" style="--brush:3">
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      </span>
              </button>
              <button class="tool brush" data-size="4" aria-label="4 by 4 brush" title="4×4 brush">
                <span class="brush-grid" style="--brush:4">
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      <i>
      </i>
      </span>
              </button>
            </div>
          </div>

          <div class="portal-palette" id="portal-palette" aria-label="Portal palette">
      </div>

          <div class="tool-row utility-row">
            <div class="tool-group">
              <span class="tool-label">Actions</span>
              <button class="secondary-btn icon-tool" id="undo" aria-label="Undo" title="Undo">
                <i data-lucide="undo"></i>
              </button>
              <button class="secondary-btn icon-tool" id="redo" aria-label="Redo" title="Redo">
                <i data-lucide="redo"></i>
              </button>
              <button class="secondary-btn icon-tool danger" id="clear-walls" aria-label="Clear walls" title="Clear walls">
                <i data-lucide="rotate-ccw"></i>
              </button>
              <button class="secondary-btn icon-tool danger" id="clear-all" aria-label="Clear all" title="Clear all">
                <i data-lucide="trash"></i>
              </button>
              <button class="secondary-btn icon-tool" id="random" aria-label="Random level" title="Random level">
                <i data-lucide="dices"></i>
              </button>
              <button class="secondary-btn icon-tool" id="solve" aria-label="Solve" title="Solve">
                <i data-lucide="sparkle"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="footer-row">
          <div class="status" id="status">
            <div class="score">
              <small id="status-detail"></small>
            </div>
          </div>
          <button class="primary-btn" id="play">
            <span class="play-icon">▶</span> Play level
          </button>
        </div>
      </div>
    </section>
  `;
}

function initEditor() {
  const results = document.getElementById("results");
  const install = document.getElementById("install");
  const editorLinkSection = document.getElementById("editor-link-section");

  if (!results) return;
  if (install) install.hidden = true;
  if (editorLinkSection) editorLinkSection.hidden = true;
  
  results.hidden = false;
  results.innerHTML = editorMarkup();

  const board = document.getElementById("board");
  const statusDetail = document.getElementById("status-detail");
  const mode = document.getElementById("mode");
  const widthInput = document.getElementById("width");
  const heightInput = document.getElementById("height");
  const budgetInput = document.getElementById("budget");

  let width = 12;
  let height = 12;
  let brushSize = 1;
  let activeTool = "water";
  let cells = [];
  let history = [];
  let future = [];
  let isPainting = false;
  let lastHoverIndex = null;
  let lastPaintIndex = null;
  let activeAction = null;
  let portalCounter = 0;
  let playMode = false;
  let unicornMemory = null;
  let computedSolutions = [];
  let solutionIndex = 0;
  let solveRequest = null;
  let solveCancelPromise = null;

  let solutionCells = new Set();
  let enclosedCells = new Set();
  let solutionScore = 0;
  let puzzleSolved = false;
  let puzzleReason = "horse can escape";

  const portalAge = new Map();
  const portalPlaceholders = new Map();
  const portalTypes = PORTALS;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const index = (x, y, gridWidth = width) => y * gridWidth + x;
  const snapshot = () => cells.slice();

  const actionSnapshot = () => ({
    cells: cells.slice(),
    placeholders: [...portalPlaceholders.entries()].map(([key, value]) => [
      key,
      { ...value }
    ])
  });

  const sameState = (first, second) =>
    first.length === second.length &&
    first.every((value, index) => value === second[index]);

  const sameActionState = (first, second) =>
    sameState(first.cells, second.cells) &&
    JSON.stringify(first.placeholders) === JSON.stringify(second.placeholders);

  const portalKey = tile =>
    tile.startsWith("portal-") ? tile.slice(7) : null;

  function tileLevel(tile) {
    if (tile === "horse" || tile === "unicorn") return 1;
    if (portalKey(tile)) return 2;
    if (["cherry", "apple", "bee"].includes(tile)) return 3;
    return 4;
  }

  function canReplace(current, placed) {
    if(placed === "grass" || placed == "water") return tileLevel(current) > 1;
  
    return tileLevel(current) >= tileLevel(placed);
  }

  const tileTitle = tile =>
    ({
      horse: "Neighthan",
      unicorn: "Unicorn",
      cherry: "Cherry +3",
      apple: "Golden Apple +10",
      bee: "Bee Swarm -5"
    })[tile] || (portalKey(tile) ? `Portal ${portalKey(tile)}` : "");

  const encodeCell = tile =>
    TILE_CHARS[tile] || portalKey(tile) || ".";

  const decodeCell = character =>
    CHAR_TILES[character] ||
    (portalTypes.includes(character) ? `portal-${character}` : "grass");

  function restoreActionState(state) {
    cells = state.cells.slice();
    portalPlaceholders.clear();

    state.placeholders.forEach(([key, value]) => {
      portalPlaceholders.set(key, { ...value });
    });

    const wallCount = cells.filter(value => value === "wall").length;
    budgetInput.value = Math.max(Number(budgetInput.value) || 1, wallCount);
  }

  function encodeMap() {
    return Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => encodeCell(cells[index(x, y)])).join("")
    ).join("\n");
  }

  function defaultMap() {
    const defaults = Array.from({ length: 12 * 12 }, () => "grass");
    defaults[index(6, 6, 12)] = "horse";

    return Array.from({ length: 12 }, (_, y) =>
      defaults.slice(y * 12, y * 12 + 12).map(encodeCell).join("")
    ).join("\n");
  }

  function isDefaultSession() {
    return (
      mode.value === "default" &&
      width === 12 &&
      height === 12 &&
      Number(budgetInput.value) === 12 &&
      activeTool === "water" &&
      brushSize === 1 &&
      encodeMap() === defaultMap()
    );
  }

  function saveUrl() {
    if (isDefaultSession()) {
      window.history.replaceState(null, "", location.pathname);
      return;
    }

    const session = {
      mode: mode.value,
      width,
      height,
      budget: Number(budgetInput.value),
      tool: activeTool,
      brush: brushSize,
      map: encodeMap()
    };

    const encoded = btoa(JSON.stringify(session));
    window.history.replaceState(
      null,
      "",
      `${location.pathname}?session=${encodeURIComponent(encoded)}`
    );
  }

  function initialLevel() {
    cells = Array.from({ length: width * height }, () => "grass");
    cells[index(6, 6)] = "horse";
  }

  function loadUrl() {
    const params = new URLSearchParams(location.search);
    let session = null;

    try {
      const encoded = params.get("session");
      if (encoded) session = JSON.parse(atob(encoded));
    } catch {
      session = null;
    }

    width = clamp(Number(session?.width) || 12, 8, 30);
    height = clamp(Number(session?.height) || 12, 8, 30);
    widthInput.value = width;
    heightInput.value = height;
    budgetInput.value = clamp(Number(session?.budget) || 12, 1, 99);

    if (["default", "lovebirds", "lovers-quarrel", "costly-walls"].includes(session?.mode)) {
      mode.value = session.mode;
    }

    brushSize = clamp(Number(session?.brush) || 1, 1, 4);
    activeTool = session?.tool || "water";
    if (activeTool === "portal") activeTool = "portal-0";

    const rows = (session?.map || "").split("\n");
    if (rows.length === height && rows.every(row => row.length === width)) {
      cells = rows.flatMap(row => [...row].map(decodeCell));
    } else {
      initialLevel();
    }
  }

  function fitBoard() {
    const available = Math.min(
      520,
      Math.max(0, Math.min(window.innerWidth, 960) - 88)
    );

    board.style.setProperty(
      "--cell",
      `${Math.max(18, available / Math.max(width, height))}px`
    );
  }

  function applyMode() {
    const backgrounds = {
      default: "#191d20",
      lovebirds: "#3b1f2b",
      "lovers-quarrel": "#3b1518",
      "costly-walls": "#3b2919"
    };

    document.documentElement.style.setProperty(
      "--mode-bg",
      backgrounds[mode.value]
    );

    const disabled =
      mode.value === "default" || mode.value === "costly-walls";
    const unicornTool = document.querySelector(".unicorn-tool");

    unicornTool.hidden = disabled;
    unicornTool.disabled = disabled;
  }

  function reachableFrom(type) {
    const start = cells.findIndex(value => value === type);
    const seen = new Set();
    const queue = start >= 0 ? [start] : [];

    while (queue.length) {
      const current = queue.shift();

      if (
        seen.has(current) ||
        cells[current] === "water" ||
        cells[current] === "wall"
      ) {
        continue;
      }

      seen.add(current);

      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ];

      const key = portalKey(cells[current]);
      if (key) {
        cells.forEach((value, cellIndex) => {
          if (value === `portal-${key}`) {
            neighbors.push([
              cellIndex % width,
              Math.floor(cellIndex / width)
            ]);
          }
        });
      }

      neighbors.forEach(([nextX, nextY]) => {
        if (
          nextX >= 0 &&
          nextX < width &&
          nextY >= 0 &&
          nextY < height
        ) {
          const next = index(nextX, nextY);
          if (!seen.has(next)) queue.push(next);
        }
      });
    }

    return seen;
  }

  function recomputeSolution() {
    const horseReach = reachableFrom("horse");
    const unicornReach = reachableFrom("unicorn");
    const loveMode = mode.value === "lovebirds";
    const quarrelMode = mode.value === "lovers-quarrel";
    const covered = new Set([...horseReach, ...unicornReach]);

    enclosedCells = covered;
    solutionCells = new Set();

    cells.forEach((type, cellIndex) => {
      if (type !== "wall") return;

      const x = cellIndex % width;
      const y = Math.floor(cellIndex / width);
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ];

      neighbors.forEach(([nextX, nextY]) => {
        if (
          nextX >= 0 &&
          nextX < width &&
          nextY >= 0 &&
          nextY < height &&
          covered.has(index(nextX, nextY))
        ) {
          solutionCells.add(cellIndex);
        }
      });
    });

    const touchesEdge = set =>
      [...set].some(cellIndex => {
        const x = cellIndex % width;
        const y = Math.floor(cellIndex / width);

        return x === 0 || y === 0 || x === width - 1 || y === height - 1;
      });

    const horseEscapes = touchesEdge(horseReach);
    const unicornEscapes = touchesEdge(unicornReach);
    const shared = [...horseReach].some(cellIndex =>
      unicornReach.has(cellIndex)
    );

    puzzleReason = horseEscapes
      ? "horse can escape"
      : (loveMode || quarrelMode) && unicornEscapes
        ? "unicorn can escape"
        : loveMode && !shared
          ? "horse and unicorn cannot reach each other"
          : quarrelMode && shared
            ? "horse and unicorn can reach each other"
            : "";

    puzzleSolved = !puzzleReason;
    solutionScore = 0;

    if (!puzzleSolved) return;

    covered.forEach(cellIndex => {
      const value = cells[cellIndex];
      solutionScore +=
        value === "cherry"
          ? 4
          : value === "apple"
            ? 11
            : value === "bee"
              ? -4
              : 1;
    });

    if (mode.value === "costly-walls") {
      solutionScore -= cells.filter(value => value === "wall").length * 6;
    }
  }

  function placeholderKeyAt(cellIndex) {
    for (const [key, value] of portalPlaceholders) {
      if (value.index === cellIndex) return key;
    }

    return null;
  }

  function removePlaceholderAt(cellIndex) {
    for (const [key, value] of portalPlaceholders) {
      if (value.index === cellIndex) portalPlaceholders.delete(key);
    }
  }

  function removePortalPairAt(cellIndex, changed) {
    const portalType = cells[cellIndex];
    if (!portalKey(portalType)) return;

    cells.forEach((value, index) => {
      if (value === portalType) {
        cells[index] = "grass";
        portalAge.delete(index);
        changed.add(index);
      }
    });
  }

  function applyCell(cell, type, cellIndex) {
    const key = portalKey(type);
    const x = cellIndex % width;
    const y = Math.floor(cellIndex / width);
    const centerX = centerOffset(width);
    const centerY = centerOffset(height);
    const worldX = x - centerX;
    const worldY = y - centerY;
    const highlighted = (worldX + worldY) % 2 !== 0;
    const placeholderKey = placeholderKeyAt(cellIndex);
    const wallState =
      puzzleSolved && type === "wall"
        ? solutionCells.has(cellIndex)
          ? " solution"
          : " unused-solution"
        : "";
    const enclosed =
      puzzleSolved && enclosedCells.has(cellIndex) && type !== "wall"
        ? " enclosed"
        : "";
    const placeholder = placeholderKey ? " portal-placeholder" : "";

    cell.className = `cell${highlighted ? " highlighted" : ""} ${type}${key ? " portal" : ""}${wallState}${enclosed}${placeholder}`;
    cell.title = placeholderKey
      ? `Portal ${placeholderKey} placeholder`
      : tileTitle(type);
    cell.textContent = key ? "🌀" : "";
    cell.style.backgroundColor = key ? portalColor(key) : "";

    if (placeholderKey) {
      cell.style.setProperty("--portal-color", portalColor(placeholderKey));
    }

    if (type === "water") {
    
      const x = cellIndex % width;
      const y = Math.floor(cellIndex / width);
      
      const effect =
        waterGetsBoat(x, y, width) ? "boat" :
        waterGetsWave(x, y, width) ? "wave" :
        "";

      if (effect) cell.classList.add(effect);
    }
  }

  function effectiveBrush() {
    return activeTool === "horse" ||
      activeTool === "unicorn" ||
      portalKey(activeTool)
      ? 1
      : brushSize;
  }

  function updateHover(cellIndex) {
    if (cellIndex == null || !board.children.length) return;

    lastHoverIndex = cellIndex;
    const x = cellIndex % width;
    const y = Math.floor(cellIndex / width);
    const size = effectiveBrush();
    const offset = Math.floor((size - 1) / 2);
    const startX = x - offset;
    const startY = y - offset;

    document.querySelectorAll(".hover-preview").forEach(cell => {
      cell.classList.remove("hover-preview");
    });

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const nextX = startX + dx;
        const nextY = startY + dy;

        if (
          nextX >= 0 &&
          nextX < width &&
          nextY >= 0 &&
          nextY < height
        ) {
          board.children[index(nextX, nextY)]?.classList.add("hover-preview");
        }
      }
    }
  }

  function clearHover() {
    lastHoverIndex = null;
    document.querySelectorAll(".hover-preview").forEach(cell => {
      cell.classList.remove("hover-preview");
    });
  }

  function buildGrid(next = cells) {
    cells = next;
    recomputeSolution();
    board.innerHTML = "";
    board.style.gridTemplateColumns = `repeat(${width}, var(--cell))`;
    board.style.gridTemplateRows = `repeat(${height}, var(--cell))`;

    cells.forEach((type, cellIndex) => {
      const cell = document.createElement("button");
      applyCell(cell, type, cellIndex);

      cell.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;

        event.preventDefault();
        beginAction("paint");
        const selectedType = activeTool;

        if (
          !["grass", "horse", "unicorn"].includes(selectedType) &&
          cells[cellIndex] === selectedType
        ) {
          activeAction.eraseType = selectedType;
        }

        if (selectedType === "wall") {
          activeAction.eraseType =
            cells[cellIndex] === "wall" ? "wall" : null;
        }

        isPainting = true;
        lastPaintIndex = cellIndex;
        updateHover(cellIndex);
        paint(cellIndex, selectedType);
      });

      cell.addEventListener("pointerenter", () => {
        updateHover(cellIndex);

        if (isPainting && cellIndex !== lastPaintIndex) {
          lastPaintIndex = cellIndex;
          paint(cellIndex, activeTool);
        }
      });

      cell.addEventListener("contextmenu", event => event.preventDefault());
      board.appendChild(cell);
    });

    fitBoard();

    if (lastHoverIndex != null) {
      updateHover(Math.min(lastHoverIndex, cells.length - 1));
    }

    updateStatus();
  }

  function beginAction(label) {
    if (!activeAction) {
      activeAction = {
        label,
        before: actionSnapshot(),
        anchors: animalPositions()
      };
    }
  }

  function finishAction() {
    if (!activeAction) return;

    const action = {
      ...activeAction,
      after: actionSnapshot()
    };

    if (!sameActionState(action.before, action.after)) {
      history.push(action);
      if (history.length > 30) history.shift();
      future = [];
    }

    activeAction = null;
    saveUrl();
  }

  function centerOffset(size) {
    return Math.ceil((size - 1) / 2);
  }

  function tileCoordinate(cellIndex, gridWidth = width) {
    return {
      x: (cellIndex % gridWidth) - centerOffset(gridWidth),
      y: Math.floor(cellIndex / gridWidth) - centerOffset(height)
    };
  }

  function animalPositions(
    state = cells,
    gridWidth = width,
    gridHeight = height
  ) {
    const position = type => {
      const cellIndex = state.findIndex(value => value === type);
      if (cellIndex < 0) return null;

      return {
        x: (cellIndex % gridWidth) - centerOffset(gridWidth),
        y: Math.floor(cellIndex / gridWidth) - centerOffset(gridHeight)
      };
    };

    return {
      horse: position("horse"),
      unicorn: position("unicorn")
    };
  }

  function closestIndex(anchor, predicate) {
    let best = -1;
    let distance = Infinity;

    cells.forEach((type, cellIndex) => {
      const coordinate = tileCoordinate(cellIndex);
      const nextDistance =
        (coordinate.x - anchor.x) ** 2 +
        (coordinate.y - anchor.y) ** 2;

      if (predicate(type) && nextDistance < distance) {
        best = cellIndex;
        distance = nextDistance;
      }
    });

    return best;
  }

  function ensureAnimal(type, anchor = { x: 0, y: 0 }) {
    if (cells.includes(type)) return;

    const other = type === "horse" ? "unicorn" : "horse";
    const grass = closestIndex(anchor, value => value === "grass");
    const water = closestIndex(anchor, value => value === "water");
    const target = grass >= 0
      ? grass
      : water >= 0
        ? water
        : closestIndex(anchor, value => value !== other);

    if (target >= 0) {
      removePlaceholderAt(target);
      cells[target] = type;
    }
  }

  function ensureAnimals(anchors) {
    const horse = anchors?.horse || { x: 0, y: 0 };

    if (anchors?.unicorn) unicornMemory = anchors.unicorn;
    ensureAnimal("horse", horse);

    const pairMode =
      mode.value === "lovebirds" || mode.value === "lovers-quarrel";

    if (pairMode) {
      ensureAnimal("unicorn", anchors?.unicorn || unicornMemory || horse);
      const currentUnicorn = animalPositions().unicorn;
      if (currentUnicorn) unicornMemory = currentUnicorn;
    } else {
      cells = cells.map((value, cellIndex) => {
        if (value === "unicorn") {
          unicornMemory = tileCoordinate(cellIndex);
          removePlaceholderAt(cellIndex);
        }

        return value === "unicorn" ? "grass" : value;
      });
    }
  }

  function render(changed = new Set()) {
    recomputeSolution();

    [...board.children].forEach((cell, cellIndex) => {
      applyCell(cell, cells[cellIndex], cellIndex);

      if (changed.has(cellIndex) && cells[cellIndex] !== "grass") {
        requestAnimationFrame(() => {
          cell.classList.remove("tile-pop");
          void cell.offsetWidth;
          cell.classList.add("tile-pop");
        });
      }
    });

    if (lastHoverIndex != null) updateHover(lastHoverIndex);
    updateStatus();
    saveUrl();
  }

  function changedIndices(before) {
    return new Set(
      cells
        .map((value, cellIndex) => value === before[cellIndex] ? -1 : cellIndex)
        .filter(cellIndex => cellIndex >= 0)
    );
  }

  function updateStatus(message) {
    if (message) {
      statusDetail.textContent = message;
      return;
    }

    const wallCount = cells.filter(value => value === "wall").length;
    const result = puzzleSolved
      ? `score ${solutionScore} · solved`
      : puzzleReason;
    statusDetail.textContent =
      `${result} · ${width} × ${height} · ${wallCount}/${budgetInput.value} walls`;
  }

  function resetSolveButton() {
    const button = document.getElementById("solve");
    
    button.innerHTML = `<i data-lucide="sparkle"></i>`;
    lucide.createIcons({ root: button });
    
    button.title = "Solve";
    button.setAttribute("aria-label", "Solve");
  }

  function markSolveButtonBusy() {
    const button = document.getElementById("solve");
    
    button.innerHTML = `<i data-lucide="x"></i>`;
    lucide.createIcons({ root: button });
    
    button.title = "Cancel solve";
    button.setAttribute("aria-label", "Cancel solve");
  }

  function cancelSolveRequest() {
    if (!solveRequest) return;

    solveRequest.cancelled = true;
    solveRequest.controller.abort();
    solveRequest = null;
    solveCancelPromise = cancelSolver().catch(() => {});
    resetSolveButton();
  }

  function invalidateSolutions() {
    computedSolutions = [];
    solutionIndex = 0;
    cancelSolveRequest();
  }

  function applySolution(solution) {
    const before = snapshot();
    beginAction("solve");
    cells = cells.map(tile => tile === "wall" ? "grass" : tile);

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (solution.isWall[x]?.[y]) cells[index(x, y)] = "wall";
      }
    }

    render(changedIndices(before));
    finishAction();
  }

  async function requestSolutions() {
    if (solveCancelPromise) {
      await solveCancelPromise;
      solveCancelPromise = null;
    }

    const request = {
      cancelled: false,
      controller: new AbortController()
    };
    solveRequest = request;
    markSolveButtonBusy();
    updateStatus("finding optimal solutions…");

    try {
      const response = await fetch(
        import.meta.env.BASE_URL + "enclose_horse.lp",
        { signal: request.controller.signal }
      );

      if (!response.ok) throw new Error("Could not load the solver model.");

      const staticModel = await response.text();
      const solverMap = encodeMap().replaceAll("W", ".");
      const puzzle = parsePuzzle(
        { map: solverMap, budget: Number(budgetInput.value), bonusType: mode.value },
        true
      );
      const solver = new PuzzleSolver(puzzle, staticModel);
      const result = await solver.solve(30);

      if (request.cancelled || solveRequest !== request) return;

      computedSolutions = result?.solutions || [];
      solutionIndex = 0;

      if (computedSolutions.length) {
        applySolution(computedSolutions[solutionIndex]);
        updateStatus();
      } else {
        updateStatus("No legal solution found");
      }
    } catch (error) {
      if (!request.cancelled) updateStatus(error.name === "AbortError" ? "Solve cancelled" : "Could not solve level");
    } finally {
      if (solveRequest === request) {
        solveRequest = null;
        resetSolveButton();
      }
    }
  }

  function paint(cellIndex, type) {
    const anchors = animalPositions();
    const x = cellIndex % width;
    const y = Math.floor(cellIndex / width);
    const size = effectiveBrush();
    const offset = Math.floor((size - 1) / 2);
    const startX = x - offset;
    const startY = y - offset;
    const targets = [];
    const changed = new Set();
    const measureOffset = size % 2 === 0 ? 0.5 : 0.0;

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const nextX = startX + dx;
        const nextY = startY + dy;

        if (
          nextX >= 0 &&
          nextX < width &&
          nextY >= 0 &&
          nextY < height
        ) {
          targets.push(index(nextX, nextY));
        }
      }
    }

    const uniqueTargets = [...new Set(targets)].sort((first, second) => {
      const firstDistance =
        (first % width - x - measureOffset) ** 2 +
        (Math.floor(first / width) - y - measureOffset) ** 2;
      const secondDistance =
        (second % width - x - measureOffset) ** 2 +
        (Math.floor(second / width) - y - measureOffset) ** 2;

      return firstDistance - secondDistance;
    });

    const eraseType = activeAction?.eraseType;

    if (eraseType) {
      uniqueTargets.forEach(target => {
        if (portalKey(eraseType)) {
          if (cells[target] === eraseType) {
            removePortalPairAt(target, changed);
          }

          const placeholder = portalPlaceholders.get(portalKey(eraseType));
          if (placeholder?.index === target) {
            portalPlaceholders.delete(portalKey(eraseType));
            changed.add(target);
          }
        } else if (cells[target] === eraseType) {
          removePlaceholderAt(target);
          cells[target] = "grass";
          changed.add(target);
        }
      });

      ensureAnimals(anchors);
      if (changed.size && eraseType !== "wall") invalidateSolutions();
      if (changed.size) render(changed);
      return;
    }

    if (type === "wall") {
      const wallCount = cells.filter(value => value === "wall").length;
      const remaining = Math.max(0, Number(budgetInput.value) - wallCount);
      const wallTargets = uniqueTargets.filter(
        target => cells[target] === "grass"
      );

      wallTargets.slice(0, remaining).forEach(target => {
        removePlaceholderAt(target);
        cells[target] = "wall";
        changed.add(target);
      });

      if (!changed.size && remaining === 0) {
        updateStatus("Wall budget reached — remove a wall before placing another");
      }

      ensureAnimals(anchors);
      if (changed.size) render(changed);
      return;
    }

    if (type === "horse" || type === "unicorn") {
      if (cells[cellIndex] === "water") return;

      uniqueTargets.forEach(target => {
        removePortalPairAt(target, changed);
        removePlaceholderAt(target);
      });

      const old = cells.findIndex(value => value === type);
      if (old >= 0 && old !== cellIndex) {
        cells[old] = "grass";
        changed.add(old);
      }

      if (cells[cellIndex] !== type) {
        cells[cellIndex] = type;
        changed.add(cellIndex);
      }
    } else if (portalKey(type)) {
      uniqueTargets.forEach(target => {
        const portalType = portalKey(type);
        const existingPlaceholder = portalPlaceholders.get(portalType);

        if (cells[target] === type) {
          removePortalPairAt(target, changed);
          removePlaceholderAt(target);
          return;
        }

        if (existingPlaceholder?.index === target) {
          portalPlaceholders.delete(portalType);
          changed.add(target);
          return;
        }

        if (cells[target] !== "grass") return;

        const linked = cells
          .map((value, index) => value === type ? index : -1)
          .filter(index => index >= 0)
          .sort(
            (a, b) =>
              (portalAge.get(a) ?? a) - (portalAge.get(b) ?? b)
          );

        if (linked.length === 0 && !existingPlaceholder) {
          if (cells[target] !== "grass") return;

          removePlaceholderAt(target);
          portalPlaceholders.set(portalType, { index: target });
          changed.add(target);
          return;
        }

        if (existingPlaceholder && target !== existingPlaceholder.index) {
          removePortalPairAt(existingPlaceholder.index, changed);
          removePlaceholderAt(existingPlaceholder.index);
          cells[existingPlaceholder.index] = type;
          portalAge.set(existingPlaceholder.index, portalCounter++);
          changed.add(existingPlaceholder.index);
          portalPlaceholders.delete(portalType);
        } else if (existingPlaceholder && target === existingPlaceholder.index) {
          return;
        }

        const updatedLinked = cells
          .map((value, index) => value === type ? index : -1)
          .filter(index => index >= 0)
          .sort(
            (a, b) =>
              (portalAge.get(a) ?? a) - (portalAge.get(b) ?? b)
          );

        if (updatedLinked.length >= 2) {
          const oldest = updatedLinked[0] === target
            ? updatedLinked[1]
            : updatedLinked[0];

          if (oldest !== target) {
            removePlaceholderAt(oldest);
            cells[oldest] = "grass";
            portalAge.delete(oldest);
            changed.add(oldest);
          }
        }

        removePlaceholderAt(target);

        if (portalKey(cells[target]) && cells[target] !== type) {
          removePortalPairAt(target, changed);
        }

        if (cells[target] !== type) {
          cells[target] = type;
          portalAge.set(target, portalCounter++);
          changed.add(target);
        }
      });
    } else {
      uniqueTargets.forEach(target => {
        
        const targetType = cells[target];
        if (!canReplace(targetType, type)) return;

        if (type !== "grass" && type !== "water" && targetType === "water") {
          return;
        }

        removePlaceholderAt(target);
        removePortalPairAt(target, changed);

        if (cells[target] !== type) {
          cells[target] = type;
          changed.add(target);
        }
      });
    }

    ensureAnimals(anchors);
    if (changed.size && type !== "wall") invalidateSolutions();
    render(changed);
  }

  function resize() {
    invalidateSolutions();
    const newWidth = clamp(Number(widthInput.value) || 12, 8, 30);
    const newHeight = clamp(Number(heightInput.value) || 12, 8, 30);

    widthInput.value = newWidth;
    heightInput.value = newHeight;
    beginAction("resize");
    portalPlaceholders.clear();

    const old = cells;
    const oldWidth = width;
    const oldHeight = height;
    const anchors = activeAction.anchors;
    const oldCenterX = centerOffset(oldWidth);
    const oldCenterY = centerOffset(oldHeight);
    const newCenterX = centerOffset(newWidth);
    const newCenterY = centerOffset(newHeight);
    const oldMinX = -oldCenterX;
    const oldMaxX = oldWidth - 1 - oldCenterX;
    const oldMinY = -oldCenterY;
    const oldMaxY = oldHeight - 1 - oldCenterY;

    width = newWidth;
    height = newHeight;
    cells = Array.from({ length: width * height }, (_, cellIndex) => {
      const x = cellIndex % width;
      const y = Math.floor(cellIndex / width);
      const coordinateX = x - newCenterX;
      const coordinateY = y - newCenterY;

      if (
        coordinateX >= oldMinX &&
        coordinateX <= oldMaxX &&
        coordinateY >= oldMinY &&
        coordinateY <= oldMaxY
      ) {
        return old[index(coordinateX + oldCenterX, coordinateY + oldCenterY, oldWidth)];
      }

      return "grass";
    });

    ensureAnimals(anchors);
    buildGrid();
    finishAction();
  }

  function setActiveTool(tool) {
    activeTool = tool;

    document.querySelectorAll("[data-tool]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tool === tool ||
          (button.dataset.tool === "portal-0" && portalKey(tool))
      );
    });

    document.querySelectorAll(".portal-choice").forEach(button => {
      button.classList.toggle("active", button.dataset.portal === portalKey(tool));
    });

    document
      .getElementById("portal-palette")
      .classList.toggle("open", Boolean(portalKey(tool)));

    if (lastHoverIndex != null && board.matches(":hover")) {
      updateHover(lastHoverIndex);
    }
    saveUrl();
  }

  document.addEventListener("pointerup", () => {
    isPainting = false;
    finishAction();
  });

  board.addEventListener("pointerleave", () => {
    if (!isPainting) {
      clearHover();
    }
  });

  document.querySelector(".toolbar").addEventListener("pointerdown", clearHover);

  document.querySelectorAll("[data-tool]").forEach(button => {
    button.addEventListener("click", () => setActiveTool(button.dataset.tool));
  });

  portalTypes.forEach(key => {
    const choice = document.createElement("button");
    choice.className = "portal-choice";
    choice.textContent = key;
    choice.title = `Portal ${key}`;
    choice.setAttribute("aria-label", `Portal ${key}`);
    choice.style.backgroundColor = portalColor(key);
    choice.dataset.portal = key;
    choice.addEventListener("click", () => setActiveTool(`portal-${key}`));
    document.getElementById("portal-palette").appendChild(choice);
  });

  document.querySelectorAll("[data-size]").forEach(button => {
    button.addEventListener("click", () => {
      brushSize = Number(button.dataset.size);
      document.querySelectorAll("[data-size]").forEach(item => {
        item.classList.toggle("active", Number(item.dataset.size) === brushSize);
      });
      updateHover(lastHoverIndex);
      saveUrl();
    });
  });

  mode.addEventListener("change", () => {
    invalidateSolutions();
    const anchors = animalPositions();
    beginAction("change mode");
    ensureAnimals(anchors);
    applyMode();
    recomputeSolution();
    render();
    finishAction();
    updateStatus(`${mode.options[mode.selectedIndex].text} mode selected`);
    setTimeout(updateStatus, 1300);
  });

  widthInput.addEventListener("change", resize);
  heightInput.addEventListener("change", resize);
  budgetInput.addEventListener("change", () => {
    invalidateSolutions();
    const wallCount = cells.filter(value => value === "wall").length;
    budgetInput.value = clamp(
      Math.max(wallCount, Number(budgetInput.value) || 1),
      Math.max(1, wallCount),
      99
    );
    saveUrl();
    updateStatus();
  });

  document.getElementById("undo").addEventListener("click", () => {
    invalidateSolutions();
    if (!history.length) return;

    const action = history.pop();
    future.push(action);
    restoreActionState(action.before);
    buildGrid();
    saveUrl();
  });

  document.getElementById("redo").addEventListener("click", () => {
    invalidateSolutions();
    if (!future.length) return;

    const action = future.pop();
    history.push(action);
    restoreActionState(action.after);
    buildGrid();
    saveUrl();
  });

  document.getElementById("clear-walls").addEventListener("click", () => {
    const before = snapshot();
    beginAction("clear walls");
    portalPlaceholders.clear();
    cells = cells.map(tile => tile === "wall" ? "grass" : tile);
    render(changedIndices(before));
    finishAction();
  });

  document.getElementById("clear-all").addEventListener("click", () => {
    invalidateSolutions();
    const before = snapshot();
    beginAction("clear level");
    
    portalPlaceholders.clear();
    cells = Array.from({ length: width * height }, () => "grass");
    
    let center = index(centerOffset(width), centerOffset(height));
    cells[center] = "horse";
    
    if (mode.value === "lovebirds" || mode.value === "lovers-quarrel") {
      
      center = index(centerOffset(width), centerOffset(height) - 1);
      cells[center] = "unicorn";
    }

    ensureAnimals(animalPositions());
    
    render(changedIndices(before));
    finishAction();
  });

  function generateRandomLevel() {
    const pondMinProbability = 0.05;
    const pondMaxProbability = 0.2;
    const branchProbability = 0.5;
    const minPondSize = 1;
    const maxPondSize = 5;
    const minPondSizeTemperature = 0.1;
    const maxPondSizeTemperature = 0.5;
    const minPondDistance = 5;
    
    const sparseness = Math.random();
    const pondSizeTemperature = minPondSizeTemperature + sparseness * (maxPondSizeTemperature - minPondSizeTemperature);
    
    cells = Array.from({ length: width * height }, () => "grass");
    const probability = pondMinProbability + sparseness * (pondMaxProbability - pondMinProbability);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const seedAmount = Math.round(width * height * probability);
    const seedDistance = minPondDistance * (1.0 - sparseness);
    const seeds = [];
    
    for (let i = 0; i < seedAmount; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
    
      // Check distance to all existing seeds
      const valid = seeds.every(([sx, sy]) => {
        const dx = x - sx;
        const dy = y - sy;
        return dx * dx + dy * dy >= seedDistance * seedDistance;
      });
    
      if (valid) {
        seeds.push([x, y]);
      }
    }

    for (const [x0, y0] of seeds) {
      
      let x = x0;
      let y = y0;
      
      const steps = minPondSize + Math.floor(Math.pow(Math.random(), pondSizeTemperature) * (maxPondSize - minPondSize + 1));

      for (let step = 0; step < steps; step++) {
        cells[index(x, y)] = "water";
        const [dx, dy] = directions[Math.floor(Math.random() * directions.length)];

        x = clamp(x + dx, 0, width - 1);
        y = clamp(y + dy, 0, height - 1);

        if (Math.random() < branchProbability) {
          const [branchX, branchY] =
            directions[Math.floor(Math.random() * directions.length)];
          cells[index(
            clamp(x + branchX, 0, width - 1),
            clamp(y + branchY, 0, height - 1)
          )] = "water";
        }
      }
    }

    const grassTiles = () =>
      cells.map((tile, cellIndex) => {
        const x = cellIndex % width;
        const y = Math.floor(cellIndex / width);
    
        const insideMap =
          x >= 2 &&
          x < width - 2 &&
          y >= 2 &&
          y < height - 2;
    
        return tile === "grass" && insideMap ? cellIndex : -1;
      })
      .filter(cellIndex => cellIndex >= 0);
    
    const chooseGrass = () => {
      const available = grassTiles();
      return available.length
        ? available[Math.floor(Math.random() * available.length)]
        : -1;
    };

    let center = index(centerOffset(width), centerOffset(height));

    const horse = chooseGrass();
    cells[horse >= 0 ? horse : center] = "horse";
    
    if (mode.value === "lovebirds" || mode.value === "lovers-quarrel") {
      
      if(cells[center] === "horse") center = index(centerOffset(width), centerOffset(height) - 1);
    
      const unicorn = chooseGrass();
      cells[unicorn >= 0 ? unicorn : center] = "unicorn";
    }

    ensureAnimals(animalPositions());
  }

  document.getElementById("random").addEventListener("click", () => {
    invalidateSolutions();
    const before = snapshot();
    beginAction("random level");
    portalPlaceholders.clear();
    generateRandomLevel();
    render(changedIndices(before));
    finishAction();
    updateStatus("Random level generated");
    setTimeout(updateStatus, 1300);
  });

  document.getElementById("solve").addEventListener("click", async () => {
    if (solveRequest) {
      cancelSolveRequest();
      updateStatus("Solve cancelled");
      return;
    }

    if (computedSolutions.length) {
      solutionIndex = (solutionIndex + 1) % computedSolutions.length;
      applySolution(computedSolutions[solutionIndex]);
      updateStatus();
      return;
    }

    await requestSolutions();
  });

  let copying = false;

  const button = document.getElementById("copy-puzzle");
  button.addEventListener("click", async event => {
    try {
      
      const encoded = btoa(
        JSON.stringify({
          map: encodeMap(),
          budget: Number(budgetInput.value)
        })
      );

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

  document.getElementById("play").addEventListener("click", event => {
    playMode = !playMode;
    document.querySelector(".toolbar").hidden = playMode;
    event.currentTarget.innerHTML = playMode
      ? '<span class="play-icon">✎</span> Edit level'
      : '<span class="play-icon">▶</span> Play level';

    if (playMode) {
      brushSize = 1;
      document.querySelectorAll("[data-size]").forEach(button => {
        button.classList.toggle("active", Number(button.dataset.size) === 1);
      });
      setActiveTool("wall");
    }

    updateStatus(playMode ? "Play mode preview ready" : "Edit mode");
  });

  window.addEventListener("resize", fitBoard, { passive: true });

  loadUrl();
  ensureAnimals(animalPositions());
  applyMode();
  buildGrid();
  setActiveTool(activeTool);
  document.querySelectorAll("[data-size]").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.size) === brushSize);
  });
  saveUrl();
  
  lucide.createIcons();
}

export function main() {
  initEditor();
}

main();
