(async () => {
  try {
    const encoded = (await navigator.clipboard.readText()).trim();

    if (!encoded) {
      alert("Clipboard is empty.");
      return;
    }

    function decodeBase64UTF8(value) {
      try {
        value = value.replace(/-/g, "+").replace(/_/g, "/");

        while (value.length % 4) {
          value += "=";
        }

        const binary = atob(value);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return new TextDecoder("utf-8").decode(bytes);
      } catch {
        return null;
      }
    }

    const decoded = decodeBase64UTF8(encoded);

    if (decoded === null) {
      alert("Clipboard does not contain valid Base64.");
      return;
    }

    let data;

    try {
      data = JSON.parse(decoded);
    } catch {
      alert("Decoded clipboard contents are not valid JSON.");
      return;
    }

    if (!data || typeof data.map !== "string") {
      alert('Decoded data must contain a string "map" property.');
      return;
    }

    if (
      data.budget !== undefined &&
      (!Number.isFinite(data.budget) || data.budget < 1 || data.budget > 99)
    ) {
      alert("Decoded budget is invalid.");
      return;
    }

    const ascii = data.map;
    const walls = data.budget ?? 12;
    const rows = ascii.trim().split(/\r?\n/).map(row => row.trim());

    if (!rows.length || !rows[0]) {
      alert("Empty level.");
      return;
    }

    const width = rows[0].length;
    const height = rows.length;

    if (width < 8 || width > 30 || height < 8 || height > 30) {
      alert(
        "Invalid size " +
          width +
          "x" +
          height +
          ". Editor supports 8x8 through 30x30."
      );
      return;
    }

    if (rows.some(row => row.length !== width)) {
      alert("All map rows must have the same width.");
      return;
    }

    if (window.__LEVEL_CREATION_ENABLED__ !== true) {
      if (!window.__LEVEL__) {
        alert("Open an enclose.horse level or the level editor.");
        return;
      }

      let puzzleHasWalls = false;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const character = rows[y][x];

          if (character === "W") {
            puzzleHasWalls = true;
            break;
          }
        }

        if (puzzleHasWalls) {
          break;
        }
      }

      if (!puzzleHasWalls) {
        alert("The copied puzzle contains no walls to paste.");
        return;
      }

      document.querySelector("#playButtons")?.firstElementChild?.click();
      await new Promise(resolve => requestAnimationFrame(resolve));

      const game = document.querySelector("#game");

      function wallCellCenter(x, y) {
        const rect = game.getBoundingClientRect();

        return {
          x: rect.left + rect.width * ((x + 0.5) / width),
          y: rect.top + rect.height * ((y + 0.5) / height),
        };
      }

      function place(x, y) {
        const point = wallCellCenter(x, y);

        game.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            clientX: point.x,
            clientY: point.y,
            button: 0,
          })
        );
        game.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            clientX: point.x,
            clientY: point.y,
            button: 0,
          })
        );
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (rows[y][x] === "W") {
            place(x, y);
          }
        }
      }

      return;
    }

    const reserved = new Set([".", "~", "W", "H", "U", "C", "G", "S"]);
    const portals = {};
    let puzzleHasUnicorn = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const character = rows[y][x];

        if (character === "U") {
          puzzleHasUnicorn = true;
        }

        if (reserved.has(character)) {
          continue;
        }

        if (!portals[character]) {
          portals[character] = [];
        }

        portals[character].push([x, y]);
      }
    }

    if (puzzleHasUnicorn) {
      function checkTool(title) {
        return document.querySelector(
          '#toolSelector canvas[title="' + title + '"]'
        );
      }

      if (!checkTool("Unicorn (U)")) {
        alert("Cannot paste puzzle with unicorn into this editor!");
        return;
      }
    }

    for (const [character, cells] of Object.entries(portals)) {
      if (cells.length !== 2) {
        alert(
          'Portal "' +
            character +
            '" appears ' +
            cells.length +
            " times. Each portal character must appear exactly twice."
        );
        return;
      }
    }

    const game = document.querySelector("#game");
    const sizeW = document.querySelector("#sizeW");
    const sizeH = document.querySelector("#sizeH");
    const budget = document.querySelector("#inpBudget");

    if (!game || !sizeW || !sizeH || !budget) {
      alert("Could not find the enclose.horse editor.");
      return;
    }

    function setInput(element, value) {
      element.focus();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set;

      setter.call(element, String(value));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setInput(sizeW, width);
    setInput(sizeH, height);
    setInput(budget, walls);
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));

    document
      .querySelector('#editorIconButtons canvas[title="Clear All (X)"]')
      ?.click();
    await new Promise(resolve => requestAnimationFrame(resolve));

    function selectBrush(title) {
      const element = document.querySelector(
        '#brushSelector canvas[title="' + title + '"]'
      );

      if (!element) {
        throw new Error("Brush not found: " + title);
      }

      element.click();
    }

    selectBrush("1x1 (1)");

    function selectTool(title) {
      const element = document.querySelector(
        '#toolSelector canvas[title="' + title + '"]'
      );

      if (!element) {
        throw new Error("Tool not found: " + title);
      }

      element.click();
    }

    function selectBonus(title) {
      const element = [...document.querySelectorAll("[title]")].find(
        element => element.title === title
      );

      if (!element) {
        throw new Error("Bonus tool not found: " + title);
      }

      element.click();
    }

    function cellCenter(x, y) {
      const rect = game.getBoundingClientRect();

      return {
        x: rect.left + rect.width * ((x + 0.5) / width),
        y: rect.top + rect.height * ((y + 0.5) / height),
      };
    }

    function paint(x, y) {
      const point = cellCenter(x, y);

      game.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          button: 0,
        })
      );
      game.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          button: 0,
        })
      );
    }

    const groups = {
      water: [],
      wall: [],
      horse: [],
      unicorn: [],
      cherry: [],
      apple: [],
      bees: [],
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        switch (rows[y][x]) {
          case "~":
            groups.water.push([x, y]);
            break;
          case "W":
            groups.wall.push([x, y]);
            break;
          case "H":
            groups.horse.push([x, y]);
            break;
          case "U":
            groups.unicorn.push([x, y]);
            break;
          case "C":
            groups.cherry.push([x, y]);
            break;
          case "G":
            groups.apple.push([x, y]);
            break;
          case "S":
            groups.bees.push([x, y]);
            break;
          case ".":
          default:
            break;
        }
      }
    }

    if (groups.horse.length) {
      selectTool("Horse (H)");

      for (const [x, y] of groups.horse) {
        paint(x, y);
      }
    }

    if (groups.unicorn.length) {
      selectTool("Unicorn (U)");

      for (const [x, y] of groups.unicorn) {
        paint(x, y);
      }
    }

    if (groups.water.length) {
      selectTool("Water (T)");

      for (const [x, y] of groups.water) {
        paint(x, y);
      }
    }

    if (groups.cherry.length) {
      selectTool("Bonus (R)");
      selectBonus("Cherry (+3)");

      for (const [x, y] of groups.cherry) {
        paint(x, y);
      }
    }

    if (groups.apple.length) {
      selectTool("Bonus (R)");
      selectBonus("Apple (+10)");

      for (const [x, y] of groups.apple) {
        paint(x, y);
      }
    }

    if (groups.bees.length) {
      selectTool("Bonus (R)");
      selectBonus("Bees (-5)");

      for (const [x, y] of groups.bees) {
        paint(x, y);
      }
    }

    if (Object.keys(portals).length) {
      selectTool("Portal (O)");

      for (const [, cells] of Object.entries(portals)) {
        paint(...cells[0]);
        paint(...cells[1]);
      }
    }

    if (groups.wall.length) {
      selectTool("Wall (W)");

      for (const [x, y] of groups.wall) {
        paint(x, y);
      }
    }

    selectTool("Water (T)");
  } catch (error) {
    console.error(error);
    alert(
      "Level/solution loader failed:\n" +
        (error?.message ?? String(error))
    );
  }
})();
