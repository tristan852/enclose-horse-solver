import fs from "node:fs/promises";
import { defineConfig, minify } from "vite";

async function buildBookmarklet(path) {
  const source = await fs.readFile(path, "utf8");
  const result = await minify(path, source, {});

  return "javascript:" + result.code.trim();
}

function bookmarkletPlugin() {
  return {
    name: "bookmarklet-source-files",

    async transformIndexHtml(html) {
      const [bookmarklet, bookmarklet2, bookmarklet3] = await Promise.all([
        buildBookmarklet("bookmarklets/solve.js"),
        buildBookmarklet("bookmarklets/editor.js"),
        buildBookmarklet("bookmarklets/daily.js"),
      ]);

      return html
        .replace("__BOOKMARKLET__", JSON.stringify(bookmarklet))
        .replace("__BOOKMARKLET2__", JSON.stringify(bookmarklet2))
        .replace("__BOOKMARKLET3__", JSON.stringify(bookmarklet3));
    },
  };
}

export default defineConfig({
  base: "/enclose-horse-solver/",

  build: {
    minify: true,
  },

  plugins: [
    bookmarkletPlugin(),
    {
      name: "copy-index-for-edit",
      async writeBundle() {
        await fs.mkdir("dist/edit", { recursive: true });
        await fs.mkdir("dist/play", { recursive: true });
        
        await fs.copyFile("dist/index.html", "dist/edit/index.html");
        await fs.copyFile("dist/index.html", "dist/play/index.html");
      },
    },
  ],

  worker: {
    format: "es",
  },
});
