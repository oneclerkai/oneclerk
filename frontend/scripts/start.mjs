import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "..", "dist");
const port = Number(process.env.PORT || 3000);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const target = path.resolve(dist, `.${requested}`);
  return target.startsWith(dist) ? target : path.join(dist, "index.html");
}

const server = createServer(async (req, res) => {
  let file = safePath(req.url || "/");
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(dist, "index.html");
  }

  res.setHeader("Content-Type", types.get(path.extname(file)) || "application/octet-stream");
  createReadStream(file)
    .on("error", () => {
      res.statusCode = 404;
      res.end("Not found");
    })
    .pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`OneClerk frontend listening on ${port}`);
});
