import { describe, test, expect } from "vitest";
import config from "../../playwright.config";
import fs from "fs";
import path from "path";

describe("E2E harness configuration", () => {
  test("H1: baseURL and webServer.url use the same port", () => {
    const baseURL = config.use?.baseURL as string;
    const webServerUrl =
      typeof config.webServer === "object" && config.webServer !== null && "url" in config.webServer
        ? (config.webServer as any).url
        : undefined;

    expect(baseURL).toBeDefined();
    expect(webServerUrl).toBeDefined();

    const basePortMatch = baseURL.match(/:(\d+)(?:\/|$)/);
    const webServerPortMatch = webServerUrl.match(/:(\d+)(?:\/|$)/);

    expect(basePortMatch).not.toBeNull();
    expect(webServerPortMatch).not.toBeNull();

    expect(basePortMatch![1]).toBe(webServerPortMatch![1]);
  });

  test("H2: webServer.command contains --port matching the baseURL port", () => {
    const baseURL = config.use?.baseURL as string;
    const basePortMatch = baseURL.match(/:(\d+)(?:\/|$)/);
    expect(basePortMatch).not.toBeNull();
    const port = basePortMatch![1];

    const command =
      typeof config.webServer === "object" &&
      config.webServer !== null &&
      "command" in config.webServer
        ? (config.webServer as any).command
        : undefined;
    expect(command).toBeDefined();

    const portRegex = new RegExp(`--port\\s+${port}`);
    expect(command).toMatch(portRegex);
  });

  test("H3: reporter includes 'list'", () => {
    const reporter = config.reporter;
    expect(reporter).toBeDefined();

    let hasList = false;
    if (typeof reporter === "string") {
      hasList = reporter === "list";
    } else if (Array.isArray(reporter)) {
      hasList = reporter.some((r) => {
        if (typeof r === "string") return r === "list";
        if (Array.isArray(r)) return r[0] === "list";
        return false;
      });
    }
    expect(hasList).toBe(true);
  });
});

describe("Staleness guard logic (H4)", () => {
  // Pure helper function implementing the staleness check logic for testing
  function isBuildStale(buildIdPath: string, srcDirs: string[]): boolean {
    if (!fs.existsSync(buildIdPath)) {
      return true;
    }
    const buildStat = fs.statSync(buildIdPath);
    const buildMtime = buildStat.mtimeMs;

    for (const dir of srcDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > buildMtime) {
            return true;
          }
        } catch {
          // ignore
        }
      }
    }
    return false;
  }

  test("returns true if BUILD_ID does not exist", () => {
    const fakeBuildId = path.join(__dirname, "non-existent-BUILD_ID");
    const stale = isBuildStale(fakeBuildId, [path.join(__dirname, "../../tests")]);
    expect(stale).toBe(true);
  });

  test("returns false if BUILD_ID is newer than src files", () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), "temp-test-"));
    try {
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(srcDir);
      const srcFile = path.join(srcDir, "index.ts");
      fs.writeFileSync(srcFile, "console.log('hello');");

      // Set src file mtime in the past
      const pastTime = new Date(Date.now() - 10000);
      fs.utimesSync(srcFile, pastTime, pastTime);

      // Create BUILD_ID with current/future mtime
      const buildIdFile = path.join(tempDir, "BUILD_ID");
      fs.writeFileSync(buildIdFile, "123");
      const futureTime = new Date();
      fs.utimesSync(buildIdFile, futureTime, futureTime);

      const stale = isBuildStale(buildIdFile, [srcDir]);
      expect(stale).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns true if any src file is newer than BUILD_ID", () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), "temp-test-"));
    try {
      const srcDir = path.join(tempDir, "src");
      fs.mkdirSync(srcDir);
      const srcFile = path.join(srcDir, "index.ts");
      fs.writeFileSync(srcFile, "console.log('hello');");

      // Create BUILD_ID with past mtime
      const buildIdFile = path.join(tempDir, "BUILD_ID");
      fs.writeFileSync(buildIdFile, "123");
      const pastTime = new Date(Date.now() - 10000);
      fs.utimesSync(buildIdFile, pastTime, pastTime);

      // Set src file mtime to now
      const now = new Date();
      fs.utimesSync(srcFile, now, now);

      const stale = isBuildStale(buildIdFile, [srcDir]);
      expect(stale).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
