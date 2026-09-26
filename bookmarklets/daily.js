(function () {
  var level = window.DAILY_LEVELS && window.DAILY_LEVELS[0];

  if (!level || !level.id) {
    alert("Oops! I couldn't find today's level. Please open the Enclose Horse daily page and try again.");
    return;
  }

  window.open(
    "https://enclose.horse/play/" + encodeURIComponent(level.id),
    "_blank"
  );
})();
