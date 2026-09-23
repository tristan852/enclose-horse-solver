(function () {
  var level = window.__LEVEL__;

  if (!level) {
    alert("Open an enclose.horse puzzle first.");
    return;
  }

  var windowHandle = window.open("about:blank", "_blank");
  var hasBonus =
    (level.hasBonus === undefined ? false : Boolean(level.hasBonus)) ||
    level.bonusId !== undefined ||
    level.bonusOptimalScore !== undefined;

  var encode = function (value) {
    var bytes = new TextEncoder().encode(JSON.stringify(value));
    var binary = "";

    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  };

  var done = function (bonus) {
    var url =
      "https://tristan852.github.io/enclose-horse-solver/" +
      "?level=" +
      encodeURIComponent(encode(level)) +
      (bonus ? "&bonus=" + encodeURIComponent(encode(bonus)) : "");

    if (windowHandle && !windowHandle.closed) {
      windowHandle.location = url;
    } else {
      location.href = url;
    }
  };

  if (hasBonus) {
    fetch("/api/daily/bonus/" + encodeURIComponent(level.id))
      .then(function (response) {
        if (!response.ok) {
          throw Error("Bonus request failed (" + response.status + ")");
        }

        return response.json();
      })
      .then(function (bonus) {
        bonus.type =
          level.bonusType ||
          bonus.bonusType ||
          (level.bonus && level.bonus.type) ||
          "default";

        var names = {
          costlywalls: "Costly Walls",
          lovebirds: "Lovebirds",
          loversquarrel: "Lovers Quarrel",
        };

        bonus.name =
          "Bonus round: " +
          (names[String(bonus.type).toLowerCase()] ||
            String(bonus.type).replace(/[-_]+/g, " "));

        done(bonus);
      })
      .catch(function (error) {
        if (windowHandle && !windowHandle.closed) {
          windowHandle.close();
        }

        alert("Could not prepare this puzzle: " + error.message);
      });
  } else {
    done(null);
  }
})();
