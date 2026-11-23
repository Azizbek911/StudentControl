/** So'rovga javob qaytariladigan xato (status + talabaga ko'rinadigan matn) */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

export function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return fwd || String(req.headers["x-real-ip"] ?? "") || req.socket.remoteAddress || null;
}

/** JSON tanasi (ko'pi bilan 64 KB) */
export async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new HttpError(413, "So'rov juda katta");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Noto'g'ri JSON");
  }
}

/** multipart/form-data (rasmlar) — Node ichidagi Request.formData() bilan, qo'shimcha paketsiz */
export async function readForm(req, maxBytes) {
  const len = Number(req.headers["content-length"] ?? 0);
  if (len > maxBytes) throw new HttpError(413, "Fayl juda katta");
  const type = String(req.headers["content-type"] ?? "");
  if (!type.startsWith("multipart/form-data")) throw new HttpError(400, "multipart/form-data kerak");

  let size = 0;
  const limited = new ReadableStream({
    async start(ctrl) {
      try {
        for await (const c of req) {
          size += c.length;
          if (size > maxBytes) return ctrl.error(new HttpError(413, "Fayl juda katta"));
          ctrl.enqueue(new Uint8Array(c));
        }
        ctrl.close();
      } catch (e) {
        ctrl.error(e);
      }
    },
  });
  try {
    return await new Request("http://local/", { method: "POST", headers: { "content-type": type }, body: limited, duplex: "half" }).formData();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Forma o'qilmadi");
  }
}

/** FormData dagi fayl -> Buffer (yo'q bo'lsa null) */
export async function fileOf(form, name) {
  const f = form.get(name);
  if (!f || typeof f === "string") return null;
  return Buffer.from(await f.arrayBuffer());
}
