// Proxy Docker API tạm thời: CLI tạo container với port loopback ngay từ đầu.
// Không sửa Docker daemon hoặc container của project khác.
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function startLoopback(docker, cli, root, network) {
  const endpoint = docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
  const socketPath = endpoint.startsWith("npipe://") ? endpoint.slice(8).replaceAll("/", "\\")
    : endpoint.startsWith("unix://") ? endpoint.slice(7) : null;
  if (!socketPath) throw new Error("Helper local chỉ hỗ trợ Docker Desktop/local Unix socket.");
  const sockets = new Set();
  const upstreamSockets = new Set();
  const track = (request) => request.on("socket", (socket) => {
    upstreamSockets.add(socket);
    socket.on("close", () => upstreamSockets.delete(socket));
  });
  const forward = (req, res, body) => {
    const headers = { ...req.headers };
    if (body) {
      delete headers["transfer-encoding"];
      headers["content-length"] = Buffer.byteLength(body);
    }
    const upstream = http.request({ socketPath, method: req.method, path: req.url, headers }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    track(upstream);
    res.on("close", () => upstream.destroy());
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    if (body) upstream.end(body); else req.pipe(upstream);
  };
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || !/\/containers\/create(?:\?|$)/.test(req.url)) {
      forward(req, res);
      return;
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks));
        const name = new URL(req.url, "http://localhost").searchParams.get("name");
        if (body.Labels?.["com.supabase.cli.project"] !== "cartoon-local" || !name?.endsWith("_cartoon-local")) {
          res.writeHead(403).end("Chỉ cho phép tạo container Supabase của Cartoon local.");
          return;
        }
        for (const bindings of Object.values(body.HostConfig?.PortBindings ?? {})) {
          for (const binding of bindings ?? []) binding.HostIp = "127.0.0.1";
        }
        forward(req, res, JSON.stringify(body));
      } catch {
        res.writeHead(400).end("Docker create payload không hợp lệ.");
      }
    });
  });
  server.on("upgrade", (req, downstream, head) => {
    const upstream = http.request({ socketPath, method: req.method, path: req.url, headers: req.headers });
    track(upstream);
    upstream.on("upgrade", (res, connection, upstreamHead) => {
      downstream.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n${Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
      if (upstreamHead.length) downstream.write(upstreamHead);
      if (head.length) connection.write(head);
      connection.pipe(downstream).pipe(connection);
      downstream.on("close", () => connection.destroy());
      connection.on("error", () => downstream.destroy());
    });
    upstream.on("error", () => downstream.destroy());
    upstream.end();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  // Dùng IPC riêng thay cho TCP để không mở Docker API cho browser/process khác user.
  const windows = process.platform === "win32";
  const pipeName = `cartoon-docker-${randomUUID()}`;
  const socketDirectory = windows ? null : mkdtempSync(path.join(tmpdir(), "cartoon-docker-"));
  if (socketDirectory) chmodSync(socketDirectory, 0o700);
  const proxyPath = windows ? `\\\\.\\pipe\\${pipeName}` : path.join(socketDirectory, "docker.sock");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ path: proxyPath, readableAll: false, writableAll: false }, resolve);
  });
  try {
    const env = { ...process.env, DOCKER_HOST: windows ? `npipe:////./pipe/${pipeName}` : `unix://${proxyPath}` };
    delete env.DOCKER_CONTEXT;
    delete env.DOCKER_TLS_VERIFY;
    delete env.DOCKER_CERT_PATH;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, "start", "--network-id", network], {
        cwd: root, env, stdio: ["ignore", "pipe", "inherit"],
      });
      // CLI stdout chứa credentials: tiêu thụ mà không in hoặc lưu.
      child.stdout.resume();
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Supabase start thất bại (exit ${code}).`)));
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    for (const socket of upstreamSockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    if (socketDirectory) rmdirSync(socketDirectory);
  }
}
