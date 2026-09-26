const isEdit = window.location.pathname
  .replace(/\/$/, "")
  .endsWith("/edit");

const isPlay = window.location.pathname
  .replace(/\/$/, "")
  .endsWith("/play");

if (isEdit || isPlay) {
  import("./editor.js");
} else {
  import("./solver.js");
}
