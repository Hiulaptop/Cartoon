// Supabase local cho Cartoon. Không in credentials do CLI trả về.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { startLoopback } from "./local-docker.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const network = "cartoon-local";
const database = "supabase_db_cartoon-local";
const scratch = path.join(root, ".superpowers", "local-db");
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
const action = process.argv[2];

function docker(args) {
  return execFileSync("docker", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function supabase(args, progress = false) {
  return execFileSync(process.execPath, [cli, ...args, "--network-id", network], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", progress ? "inherit" : "pipe"],
  });
}

function ensureNetwork() {
  const result = spawnSync("docker", ["network", "inspect", network], { encoding: "utf8" });
  if (result.status !== 0) {
    docker(["network", "create", "--driver", "bridge", "--opt", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1", "--label", "com.cartoon.local-db=true", network]);
    return;
  }
  const [info] = JSON.parse(result.stdout);
  if (info.Driver !== "bridge" || info.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1" || info.Labels?.["com.cartoon.local-db"] !== "true") {
    throw new Error("Network cartoon-local đã tồn tại với cấu hình khác; không tự sửa network có sẵn.");
  }
}

function checkOwnership() {
  const marker = path.join(scratch, "instance.json");
  if (existsSync(marker)) {
    if (JSON.parse(readFileSync(marker, "utf8")).project !== network) throw new Error("Instance marker không hợp lệ.");
    return;
  }
  const containers = docker(["ps", "-a", "--format", "{{.Names}}"]);
  const volumes = docker(["volume", "ls", "--format", "{{.Name}}"]);
  if ([...containers.split("\n"), ...volumes.split("\n")].some((name) => name.endsWith("_cartoon-local"))) {
    throw new Error("Đã có Supabase cartoon-local từ trước; cần xác định dữ liệu trước khi tiếp tục.");
  }
  mkdirSync(scratch, { recursive: true });
  writeFileSync(marker, JSON.stringify({ project: network, createdAt: new Date().toISOString() }), { mode: 0o600 });
}

function localContainers() {
  const ids = docker(["ps", "--filter", "name=supabase_", "--format", "{{.ID}} {{.Names}}"])
    .split("\n").filter((line) => line.endsWith("_cartoon-local")).map((line) => line.split(" ")[0]);
  if (!ids.length) throw new Error("Không tìm thấy container của Supabase local.");
  return JSON.parse(docker(["inspect", ...ids]));
}

function checkPorts() {
  const containers = localContainers();
  for (const container of containers) {
    for (const bindings of Object.values(container.NetworkSettings.Ports ?? {})) {
      if ((bindings ?? []).some((binding) => binding.HostIp !== "127.0.0.1" && binding.HostIp !== "::1")) {
        throw new Error("Supabase đang publish port ra ngoài loopback. Dừng và sửa cấu hình trước khi dùng.");
      }
    }
  }
}

function configureEnv(status) {
  const hostUrl = new URL(status.DB_URL);
  if (hostUrl.hostname !== "127.0.0.1" || hostUrl.port !== "54322") throw new Error("CLI trả endpoint DB local khác thiết kế.");
  const containerUrl = new URL(hostUrl);
  containerUrl.hostname = database;
  containerUrl.port = "5432";
  const envPath = path.join(root, ".env");
  const original = readFileSync(existsSync(envPath) ? envPath : path.join(root, ".env.example"), "utf8");
  const assignment = (key) => new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[ \\t]*(?:\"(?:\\\\.|[^\"\\\\])*\"|'[^']*'|\x60[^\x60]*\x60|[^\\r\\n]*)(?:[ \\t]*#[^\\r\\n]*)?[ \\t]*\\r?$`, "gm");
  for (const [key, expected] of Object.entries({ DATABASE_URL: hostUrl, LOCAL_DATABASE_URL: containerUrl })) {
    for (const match of original.matchAll(assignment(key))) {
      const current = parseEnv(match[0])[key];
      if (current && new URL(current).toString() !== expected.toString()) {
        throw new Error(`${key} đang trỏ DB khác; không ghi đè cấu hình hiện có.`);
      }
    }
  }
  const values = { DATABASE_URL: hostUrl.toString(), LOCAL_DATABASE_URL: containerUrl.toString(), DATABASE_SSL_MODE: "disable", DATABASE_CA_CERT: "", COMPOSE_PROFILES: "" };
  let updated = original;
  for (const [key, value] of Object.entries(values)) {
    const pattern = assignment(key);
    updated = pattern.test(updated) ? updated.replace(pattern, () => `${key}=${value}`) : `${updated.trimEnd()}\n${key}=${value}\n`;
  }
  if (updated !== original) {
    writeFileSync(path.join(scratch, `.env.before-${Date.now()}`), original, { mode: 0o600 });
    writeFileSync(envPath, updated, { mode: 0o600 });
  }
}

function printStatus() {
  const status = JSON.parse(supabase(["status", "--output", "json"]));
  checkPorts();
  console.log(`Studio: ${status.STUDIO_URL}`);
  console.log("Postgres trên Windows: 127.0.0.1:54322");
  console.log(`Postgres trong Docker: ${database}:5432`);
  return status;
}

try {
  if (!existsSync(cli)) throw new Error("Thiếu Supabase CLI; chạy npm install trước.");
  if (action === "start") {
    docker(["info", "--format", "{{.ServerVersion}}"]);
    checkOwnership();
    ensureNetwork();
    console.log("Đang khởi động Supabase local (lần đầu cần tải image)...");
    try {
      await startLoopback(docker, cli, root, network);
      const status = printStatus();
      configureEnv(status);
    } catch (error) {
      try { supabase(["stop"], true); } catch { /* Giữ lỗi gốc để chẩn đoán. */ }
      throw error;
    }
    console.log("Đã cấu hình .env cho DB local; giữ nguyên thông tin 9router.");
  } else if (action === "stop") {
    if (existsSync(path.join(root, ".env"))) {
      docker(["compose", "-f", "docker-compose.yml", "-f", "docker-compose.local.yml", "stop", "app", "worker"]);
    }
    supabase(["stop"], true);
    console.log("Đã dừng stack local; dữ liệu Supabase được giữ lại.");
  } else if (action === "status") {
    printStatus();
  } else {
    throw new Error("Dùng npm run db:local:start, db:local:stop hoặc db:local:status.");
  }
} catch (error) {
  // execFileSync errors có thể kèm stdout chứa credentials: chỉ in thông báo chung.
  console.error(error.status === undefined ? error.message : `Lệnh ${error.path ?? "Docker/Supabase"} thất bại (exit ${error.status}); xem lỗi khởi động phía trên.`);
  process.exitCode = 1;
}
