const isEdit = window.location.pathname
  .replace(/\/$/, "")
  .endsWith("/edit");

if (isEdit) {
  import("./editor.js");
} else {
  import("./solver.js");
}
