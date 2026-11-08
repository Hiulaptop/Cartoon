import path from "node:path";
import { loadEpisode } from "./binary-search-video/content";
import { prepareEpisode } from "./binary-search-video/prepare";
import { inspectPreparedEpisode, renderEpisode, timingReport } from "./binary-search-video/render";

const args = process.argv.slice(2);
const command = args.shift() ?? "help";
const options: Record<string, string> = {};
try {
  try { process.loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  for (let i = 0; i < args.length; i++) {
    const key = args[i].slice(2);
    if (!/^--[a-z-]+$/.test(args[i]) || options[key]) throw new Error("Expected unique --name value arguments");
    if (key === "execute") { options[key] = "true"; continue; }
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Missing option value");
    options[key] = args[++i];
  }
  const required = (key: string) => { if (!options[key]) throw new Error(`Missing --${key}`); return options[key]; };
  const allow = (keys: string[]) => { if (Object.keys(options).some((key) => !keys.includes(key))) throw new Error("Unknown option"); };
  if (command === "help") console.log("Local Binary Search video:\nvalidate --pack <directory>\nprepare --pack <dir> --voice-root <private-dir> --python <exe> --output <NEW-dir>\ninspect --output <prepared-dir>\nstills|render --output <prepared-dir> --browser <existing-exe> --execute\nsegment --output <prepared-dir> --browser <existing-exe> --chapter <id> --execute\nNo command generates speech. Execution flags do not replace chat permission.");
  else if (command === "validate") {
    if (Object.keys(options).some((key) => key !== "pack")) throw new Error("Unknown validate option");
    const { episode, requests } = await loadEpisode(path.resolve(options.pack ?? "workflows/video/binary-search-english/v1"));
    console.log(JSON.stringify({ status: "valid", cues: episode.cues.length, words: episode.cues.reduce((n, c) => n + c.text.split(" ").length, 0), requests: requests.map((r) => ({ id: r.requestId, cues: r.cues.length })), inference: false }, null, 2));
  } else if (command === "prepare") {
    allow(["pack", "voice-root", "python", "output"]);
    const episode = await prepareEpisode({ packDir: path.resolve(required("pack")), voiceRoot: path.resolve(required("voice-root")), python: path.resolve(required("python")), outputDir: path.resolve(required("output")) });
    console.log(JSON.stringify(timingReport(episode), null, 2));
  } else if (command === "inspect") {
    allow(["output"]);
    console.log(JSON.stringify(timingReport(await inspectPreparedEpisode(path.resolve(required("output")))), null, 2));
  } else if (["stills", "segment", "render"].includes(command)) {
    allow(["output", "browser", "execute", ...(command === "segment" ? ["chapter"] : [])]);
    required("execute");
    console.log(JSON.stringify(await renderEpisode({ root: path.resolve(required("output")), browser: path.resolve(required("browser")), mode: command as "stills" | "segment" | "render", ...(command === "segment" ? { chapter: required("chapter") } : {}) }), null, 2));
  } else throw new Error("Unknown command; use help");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Video command failed");
  process.exitCode = 1;
}
