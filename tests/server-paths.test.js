import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let serverProcess;
let serverPort;
let serverOutput = "";

async function reservePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: serverPort, path: pathname, method: "GET" }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Static test server exited (${serverProcess.exitCode}): ${serverOutput}`);
    }
    try {
      if (await request("/src/auth/client.js") === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Static test server did not become ready: ${lastError || serverOutput}`);
}

before(async () => {
  serverPort = await reservePort();
  serverProcess = spawn(process.execPath, [path.join(projectRoot, "server.js")], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(serverPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  await waitForServer();
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const exited = once(serverProcess, "exit");
  serverProcess.kill("SIGTERM");
  const exitTimeout = new Promise((resolve) => setTimeout(resolve, 3_000, null));
  if (await Promise.race([exited, exitTimeout]) === null) serverProcess.kill("SIGKILL");
});

test("static /src and /data routes remain inside their allowed roots", async (t) => {
  const cases = [
    { name: "serves a source module", path: "/src/auth/client.js", status: 200 },
    { name: "serves the fictional sample CSV", path: "/data/transacciones-ficticias.csv", status: 200 },
    { name: "blocks encoded traversal from src to package.json", path: "/src/%2e%2e%2fpackage.json", status: 404 },
    { name: "blocks encoded traversal from data to package.json", path: "/data/%2e%2e%2fpackage.json", status: 404 },
    { name: "blocks traversal from src into data", path: "/src/%2e%2e%2fdata/transacciones-ficticias.csv", status: 404 },
    { name: "blocks traversal from data into src", path: "/data/%2e%2e%2fsrc/auth/client.js", status: 404 },
    { name: "blocks double-encoded traversal", path: "/src/%252e%252e%252fpackage.json", status: 404 },
    { name: "rejects malformed percent-encoding", path: "/src/%E0%A4%A", status: 404 },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      assert.equal(await request(scenario.path), scenario.status);
    });
  }
});
