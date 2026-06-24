import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 5173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested =
    pathname === "/"
      ? "index.html"
      : normalize(pathname)
          .replace(/^[/\\]+/, "")
          .replace(/^(\.\.[/\\])+/, "");
  const target = resolve(join(root, requested));

  if (!target.startsWith(root) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": types[extname(target)] || "application/octet-stream" });
  createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`K-line replay MVP: http://127.0.0.1:${port}`);
});
