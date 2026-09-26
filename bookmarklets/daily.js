(function () {
  var level = window.__DAILY_LEVELS__ && window.__DAILY_LEVELS__[0];

  if (!level || !level.id) {
    alert("Oops! I couldn't find today's level. Please open enclose.horse and try again.");
    return;
  }

  window.open(
    "https://enclose.horse/play/" + encodeURIComponent(level.id),
    "_blank"
  );
})();
