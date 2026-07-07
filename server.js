const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DATA_DIR = path.join(ROOT, "data");
const PHOTOS_FILE = path.join(DATA_DIR, "photos.json");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || "123456";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const sessions = new Map();
const captchas = new Map();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PHOTOS_FILE)) {
  fs.writeFileSync(PHOTOS_FILE, "[]\n", "utf8");
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map(value => value.trim())
      .filter(Boolean)
      .map(cookie => {
        const index = cookie.indexOf("=");
        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function makeToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getSession(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  return { token, session };
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    json(res, 401, { error: "请先登录" });
    return null;
  }
  return session;
}

function readBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("请求体太大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeJsonFile() {
  try {
    return JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writePhotos(photos) {
  fs.writeFileSync(PHOTOS_FILE, `${JSON.stringify(photos, null, 2)}\n`, "utf8");
}

function createCaptcha() {
  const answer = String(1000 + crypto.randomInt(9000));
  const id = makeToken();
  captchas.set(id, {
    answer,
    expiresAt: Date.now() + 5 * 60 * 1000
  });
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="58" viewBox="0 0 160 58">
  <rect width="160" height="58" rx="8" fill="#eef6f1"/>
  <path d="M8 43 C28 14, 52 48, 78 22 S126 39, 152 16" fill="none" stroke="#00a678" stroke-width="3" opacity=".45"/>
  <path d="M12 18 L151 43 M24 51 L139 8" stroke="#6d7d74" stroke-width="1.4" opacity=".35"/>
  <text x="80" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="7" fill="#13221b">${answer}</text>
</svg>`;
  return {
    id,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  };
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) throw new Error("缺少上传边界");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const fields = {};
  const files = [];
  let cursor = buffer.indexOf(boundary);

  while (cursor !== -1) {
    cursor += boundary.length;
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(cursor, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundary, dataStart);
    if (nextBoundary === -1) break;
    const dataEnd = nextBoundary - 2;
    const data = buffer.slice(dataStart, dataEnd);

    const name = /name="([^"]+)"/.exec(headerText)?.[1];
    const filename = /filename="([^"]*)"/.exec(headerText)?.[1];
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headerText)?.[1] || "application/octet-stream";

    if (name && filename) {
      files.push({ name, filename, type, data });
    } else if (name) {
      fields[name] = data.toString("utf8");
    }
    cursor = nextBoundary;
  }

  return { fields, files };
}

function sanitizeText(value, fallback) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 80) : fallback;
}

function extensionFor(type, filename) {
  const byType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
  };
  return byType[type] || path.extname(filename).toLowerCase() || ".jpg";
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/captcha") {
    return json(res, 200, createCaptcha());
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8") || "{}");
    const captcha = captchas.get(body.captchaId);
    const captchaOk = captcha && captcha.expiresAt > Date.now() && body.captcha === captcha.answer;
    captchas.delete(body.captchaId);

    if (!captchaOk) return json(res, 400, { error: "验证码错误或已过期" });
    if (body.username !== ADMIN_USER || body.password !== ADMIN_PASSWORD) {
      return json(res, 401, { error: "账号或密码不正确" });
    }

    const token = makeToken();
    sessions.set(token, { user: ADMIN_USER, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return json(res, 200, { ok: true }, {
      "Set-Cookie": `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const token = parseCookies(req).session;
    if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, {
      "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const session = getSession(req);
    return json(res, 200, { authenticated: Boolean(session), user: session?.session.user || null });
  }

  if (req.method === "GET" && url.pathname === "/api/photos") {
    if (!requireAuth(req, res)) return;
    return json(res, 200, safeJsonFile());
  }

  if (req.method === "POST" && url.pathname === "/api/photos") {
    if (!requireAuth(req, res)) return;
    const body = await readBody(req);
    const { fields, files } = parseMultipart(body, req.headers["content-type"]);
    const image = files.find(file => file.type.startsWith("image/"));
    if (!image) return json(res, 400, { error: "请选择图片文件" });

    const ext = extensionFor(image.type, image.filename);
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), image.data);

    const photos = safeJsonFile();
    const photo = {
      id: crypto.randomUUID(),
      title: sanitizeText(fields.title, image.filename.replace(/\.[^.]+$/, "")),
      category: sanitizeText(fields.category, "other"),
      tags: String(fields.tags || "")
        .split(/[,，]/)
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 12),
      src: `/uploads/${filename}`,
      createdAt: new Date().toISOString(),
      favorite: false,
      size: image.data.length
    };
    photos.unshift(photo);
    writePhotos(photos);
    return json(res, 201, photo);
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/photos/")) {
    if (!requireAuth(req, res)) return;
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const photos = safeJsonFile();
    const photo = photos.find(item => item.id === id);
    if (!photo) return json(res, 404, { error: "照片不存在" });
    photo.favorite = !photo.favorite;
    writePhotos(photos);
    return json(res, 200, photo);
  }

  return json(res, 404, { error: "接口不存在" });
}

function serveStatic(req, res, url) {
  const route = url.pathname === "/" ? "/index.html" : url.pathname;
  const isUpload = route.startsWith("/uploads/");
  const baseDir = isUpload ? UPLOAD_DIR : PUBLIC_DIR;
  const relativeRoute = isUpload ? route.replace(/^\/uploads\//, "") : route.replace(/^\//, "");
  const filePath = path.normalize(path.join(baseDir, decodeURIComponent(relativeRoute)));
  if (!filePath.startsWith(baseDir)) return send(res, 403, "Forbidden", { "Content-Type": "text/plain" });

  fs.readFile(filePath, (error, data) => {
    if (error) return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    const type = contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(res, 200, data, { "Content-Type": type, "Cache-Control": "public, max-age=3600" });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: "服务器错误" });
  }
});

server.listen(PORT, () => {
  console.log(`Photo library server running at http://localhost:${PORT}`);
  console.log(`Default login: ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
});
