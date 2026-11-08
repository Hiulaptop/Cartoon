import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import ipaddr from "ipaddr.js";
import { Parser } from "htmlparser2";
import { getDb } from "@/lib/db/client";
import { automationSources } from "@/lib/db/schema";
import { writeDataFile } from "@/lib/storage";
import { sha256 } from "./fingerprint";

function publicAddress(address: string) {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.process(address);
  if (parsed.range() !== "unicast") return false;
  // IPv6 transition mechanisms may conceal an IPv4 destination.
  return parsed.kind() !== "ipv6" || (!parsed.match(ipaddr.parse("2002::"), 16) && !parsed.match(ipaddr.parse("2001::"), 32));
}
export function validateSourceUrl(value: string, hosts: readonly string[]): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || isIP(url.hostname.replace(/^\[|\]$/g, "")) || !hosts.includes(url.hostname) || url.hostname.endsWith(".")) throw new Error("Nguồn phải là HTTPS:443 trên hostname đã cho phép, không dùng IP hoặc thông tin đăng nhập");
  url.hash = "";
  return url;
}
export function extractSourceText(html: string) {
  const chunks: string[] = [];
  const hidden = new Set(["script", "style", "nav", "footer", "header", "noscript", "svg", "template"]);
  let depth = 0;
  let title = false;
  let sourceTitle = "";
  const parser = new Parser({
    onopentag(name) { if (hidden.has(name)) depth++; if (name === "title") title = true; if (["p", "div", "li", "br", "h1", "h2", "h3"].includes(name) && !depth) chunks.push("\n"); },
    ontext(value) { if (!depth) { chunks.push(value); if (title) sourceTitle += value; } },
    onclosetag(name) { if (hidden.has(name)) depth = Math.max(0, depth - 1); if (name === "title") title = false; },
  }, { decodeEntities: true });
  parser.write(html); parser.end();
  return { title: sourceTitle.trim().slice(0, 300), text: chunks.join("").replace(/[\t \r]+/g, " ").replace(/\n\s*\n/g, "\n").trim() };
}
export async function readPublicSource(value: string, hosts: readonly string[]) {
  const deadline = Date.now() + 15_000;
  const url = validateSourceUrl(value, hosts);
  const records = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("DNS quá thời hạn")), 15_000); timer.unref(); }),
  ]);
  if (!records.length || records.some((r) => !publicAddress(r.address))) throw new Error("DNS nguồn không phải địa chỉ public an toàn");
  const pinned = records[0];
  const body = await new Promise<{ body: string; html: boolean }>((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { reject(new Error("Nguồn quá thời hạn")); return; }
    const req = request(url, {
      agent: false, servername: url.hostname, rejectUnauthorized: true,
      headers: { "Accept-Encoding": "identity", Accept: "text/html,text/plain", "User-Agent": "Cartoon-Automation-SourceReader/1" },
      lookup: (_hostname, options, callback) => { if (options.all) callback(null, [pinned]); else callback(null, pinned.address, pinned.family); },
    }, (res) => {
      const peer = res.socket.remoteAddress;
      if (!peer || !publicAddress(peer) || ipaddr.process(peer).toString() !== ipaddr.process(pinned.address).toString()) { req.destroy(new Error("Peer nguồn không khớp DNS đã kiểm")); return; }
      const type = res.headers["content-type"] ?? "";
      const encoding = res.headers["content-encoding"];
      if (res.statusCode !== 200 || (encoding && encoding !== "identity") || !/^(text\/html|text\/plain)(;|$)/i.test(type) || (/charset=/i.test(type) && !/charset=["']?utf-8["']?(?:;|$)/i.test(type))) { req.destroy(new Error("Nguồn không được hỗ trợ (redirect, loại nội dung hoặc encoding)")); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) req.destroy(new Error("Nguồn vượt 2 MiB")); else chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => { clearTimeout(timer); try { resolve({ body: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), html: /^text\/html/i.test(type) }); } catch { reject(new Error("Nguồn không phải UTF-8 hợp lệ")); } });
    });
    const timer = setTimeout(() => req.destroy(new Error("Nguồn vượt thời hạn 15 giây")), remaining);
    req.on("error", (error) => { clearTimeout(timer); reject(error); }); req.end();
  });
  const extracted = body.html ? extractSourceText(body.body) : { title: url.hostname, text: body.body.trim() };
  if (extracted.text.length < 100 || extracted.text.length > 120_000) throw new Error("Nguồn không có đủ văn bản hoặc quá dài cho MVP");
  return { url: url.toString(), ...extracted };
}
export async function saveSourceSnapshot(videoId: string, document: Awaited<ReturnType<typeof readPublicSource>>) {
  const id = randomUUID();
  const hash = sha256(document.text);
  const filePath = `automation/private/sources/${id}/text.txt`;
  await writeDataFile(filePath, document.text);
  await getDb().insert(automationSources).values({ id, videoId, url: document.url, title: document.title || new URL(document.url).hostname, hash, filePath });
  return { id, hash, text: document.text };
}
