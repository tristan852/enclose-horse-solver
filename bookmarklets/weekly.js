(function () {
  var level = window.__WEEKLY_LEVELS__ && window.__WEEKLY_LEVELS__[0];

  if (!level || !level.id) {
    alert("Oops! I couldn't find this week's level. Please open enclose.horse and try again.");
    return;
  }

  location.href =
    "https://enclose.horse/play/" + encodeURIComponent(level.id);
})();
