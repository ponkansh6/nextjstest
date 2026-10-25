import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  symlink,
  stat,
  utimes,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fetchStatsData } from "../../../scripts/data-refresh/transport/estat-api.mjs";
import {
  fetchOfficialFile,
  OFFICIAL_ESTAT_FILE_HOSTS,
} from "../../../scripts/data-refresh/transport/file.mjs";
import { validateRegistry } from "../../../scripts/data-refresh/registry/schema.mjs";
import { runRefresh } from "../../../scripts/data-refresh/runner.mjs";
import { acquireExclusiveLock } from "../../../scripts/data-refresh/lib/lock.mjs";
import { publishArtifacts, recoverJournal } from "../../../scripts/data-refresh/lib/journal.mjs";
import { resolveContainedPath } from "../../../scripts/data-refresh/lib/fs-safety.mjs";

const roots = [];
async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "data-refresh-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const page = (records, { nextKey, total = 2, from } = {}) =>
  new Response(
    JSON.stringify({
      GET_STATS_DATA: {
        RESULT: { STATUS: 0, ...(nextKey ? { NEXT_KEY: nextKey } : {}) },
        STATISTICAL_DATA: {
          RESULT_INF: {
            TOTAL_NUMBER: String(total),
            FROM_NUMBER: String(
              from ?? (nextKey ? Number(nextKey) - records.length : total - records.length + 1),
            ),
            TO_NUMBER: String(
              from === undefined
                ? nextKey
                  ? Number(nextKey) - 1
                  : total
                : from + records.length - 1,
            ),
            ...(nextKey ? { NEXT_KEY: nextKey } : {}),
          },
          DATA_INF: { VALUE: records },
        },
      },
    }),
    { headers: { "content-type": "application/json" } },
  );

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const registryFor = (outputs) => ({
  sources: [
    {
      id: "fixture-source",
      identity: { kind: "file", statInfId: "00000001", format: "csv" },
      outputs: [...new Set(outputs)]
        .filter((output) => output !== ".data-refresh/semantic-state.json")
        .sort(),
    },
  ],
});
const sourceAllowlistFor = (outputs) =>
  registryFor(outputs).sources.map(({ id: sourceId, identity, outputs: declared }) => ({
    sourceId,
    identity,
    outputs: declared,
  }));
const journalFor = (id, state, entries, outputs = entries.map((entry) => entry.path)) => ({
  version: 2,
  id,
  state,
  sourceAllowlist: sourceAllowlistFor(outputs),
  entries,
});
const journalEntry = ({
  path: target,
  staged,
  backup,
  targetBytes,
  existed = false,
  intent = false,
  published = false,
}) => ({
  path: target,
  staged,
  backup,
  existed,
  metadata: null,
  backupHash: null,
  targetHash: sha256(targetBytes),
  intent,
  published,
});

describe("e-Stat transport", () => {
  it("follows API paging tokens through the final page", async () => {
    const requests = [];
    const responses = [
      page([{ id: 1 }, { id: 2 }], { nextKey: "3", total: 3 }),
      page([{ id: 3 }], { total: 3 }),
    ];
    const result = await fetchStatsData({
      statsDataId: "0004052037",
      appId: "fixture-secret",
      limit: 2,
      fetchImpl: async (url) => {
        requests.push(new URL(url).searchParams);
        return responses.shift();
      },
    });
    expect(result.records).toHaveLength(3);
    expect(requests.map((params) => params.get("startPosition"))).toEqual(["1", "3"]);
  });

  it("retries 429 only to the finite retry bound", async () => {
    let calls = 0;
    await expect(
      fetchStatsData({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        maxRetries: 2,
        retryBaseMs: 0,
        fetchImpl: async () => {
          calls += 1;
          return new Response("busy", { status: 429 });
        },
      }),
    ).rejects.toMatchObject({ code: "api-http-error" });
    expect(calls).toBe(3);
  });

  it("rejects HTTP 200 HTML without exposing the API key", async () => {
    const failure = await fetchStatsData({
      statsDataId: "0004052037",
      appId: "fixture-secret",
      fetchImpl: async () =>
        new Response("<html>no</html>", { headers: { "content-type": "text/html" } }),
    }).catch((error) => error);
    expect(failure.message).toMatch(/non-JSON/);
    expect(failure.message).not.toContain("fixture-secret");
  });

  it("rejects repeated paging tokens without exposing the API key", async () => {
    const responses = [
      page([{ id: 1 }], { nextKey: "2", total: 2 }),
      page([{ id: 2 }], { nextKey: "2", total: 2, from: 2 }),
    ];
    await expect(
      fetchStatsData({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        fetchImpl: async () => responses.shift(),
      }),
    ).rejects.toMatchObject({ code: "api-paging-loop" });
  });

  it("rejects business status failures and non-JSON files", async () => {
    await expect(
      fetchStatsData({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        fetchImpl: async () =>
          new Response(JSON.stringify({ GET_STATS_DATA: { RESULT: { STATUS: 100 } } }), {
            headers: { "content-type": "application/json" },
          }),
      }),
    ).rejects.toMatchObject({ code: "api-business-error", apiPhase: "stats-data", apiStatus: 100 });
    await expect(
      fetchOfficialFile({
        url: "https://example.invalid/file",
        allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
        fetchImpl: async () => new Response("<html>login</html>"),
      }),
    ).rejects.toMatchObject({ code: "file-host-not-allowlisted" });
  });

  it("requires an explicit host allowlist and refuses redirects without following them", async () => {
    let calls = 0;
    const fetchImpl = async (_url, init) => {
      calls += 1;
      expect(init.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/file" },
      });
    };
    await expect(
      fetchOfficialFile({ url: "https://www.e-stat.go.jp/file", fetchImpl }),
    ).rejects.toMatchObject({ code: "file-host-allowlist-required" });
    await expect(
      fetchOfficialFile({
        url: "https://www.e-stat.go.jp/file",
        allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "file-http-error" });
    expect(calls).toBe(1);
  });

  it("retries only 429/5xx and transient network failures with bounded Retry-After", async () => {
    let calls = 0;
    const responses = [
      new Response("busy", { status: 429, headers: { "retry-after": "120" } }),
      new Response("temporary", { status: 503 }),
      new Response("ok"),
    ];
    const result = await fetchOfficialFile({
      url: "https://www.e-stat.go.jp/file",
      allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
      maxRetries: 2,
      retryBaseMs: 0,
      maxRetryAfterMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return responses.shift();
      },
    });
    expect(Buffer.from(result.bytes).toString()).toBe("ok");
    expect(calls).toBe(3);

    calls = 0;
    let nonRetryableFailure;
    try {
      await fetchOfficialFile({
        url: "https://www.e-stat.go.jp/file",
        allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
        maxRetries: 3,
        retryBaseMs: 0,
        maxRetryAfterMs: 0,
        fetchImpl: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      });
    } catch (error) {
      nonRetryableFailure = error;
    }
    expect(nonRetryableFailure).toMatchObject({
      code: "file-http-error",
      fileFailure: {
        status: 404,
        attempt: 1,
        maxAttempts: 4,
        retryable: false,
        retriesExhausted: false,
      },
    });
    expect(calls).toBe(1);

    calls = 0;
    let exhaustedFailure;
    try {
      await fetchOfficialFile({
        url: "https://www.e-stat.go.jp/file?token=private",
        allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
        maxRetries: 1,
        retryBaseMs: 0,
        maxRetryAfterMs: 0,
        fetchImpl: async () => {
          calls += 1;
          return new Response("private response body", { status: 503 });
        },
      });
    } catch (error) {
      exhaustedFailure = error;
    }
    expect(exhaustedFailure).toMatchObject({
      code: "file-http-error",
      fileFailure: {
        status: 503,
        attempt: 2,
        maxAttempts: 2,
        retryable: true,
        retriesExhausted: true,
      },
    });
    expect(exhaustedFailure.message).not.toContain("token=private");
    expect(exhaustedFailure.message).not.toContain("private response body");
    expect(calls).toBe(2);

    calls = 0;
    const recovered = await fetchOfficialFile({
      url: "https://www.e-stat.go.jp/file",
      allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
      maxRetries: 1,
      retryBaseMs: 0,
      maxRetryAfterMs: 0,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("network private details");
        return new Response("ok");
      },
    });
    expect(Buffer.from(recovered.bytes).toString()).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("refresh core", () => {
  function makeRegistry() {
    return validateRegistry({
      requiredAdapters: ["fixture"],
      sources: [
        {
          id: "fixture-source",
          required: true,
          adapterId: "fixture",
          identity: { kind: "file", statInfId: "000040499070", format: "xlsx" },
          title: "fixture table",
          classifications: ["all"],
          frequency: "monthly",
          unit: "index",
          baseline: "2020",
          period: { from: "2020-01", through: "latest-published" },
          revision: "full-history",
          outputs: ["canonical/data.csv", "canonical/data.raw", "canonical/data.metadata.json"],
          dependencies: [],
        },
      ],
    });
  }

  const makeAdapter =
    (semanticValue, data = "normalized-v1", raw = "raw-v1") =>
    async () => ({
      semanticValue,
      artifacts: [
        { path: "canonical/data.csv", bytes: Buffer.from(data) },
        { path: "canonical/data.raw", bytes: Buffer.from(raw) },
        {
          path: "canonical/data.metadata.json",
          bytes: Buffer.from(JSON.stringify({ fetchedAt: "volatile", raw })),
        },
      ],
      rawFetches: [{ name: "fixture-raw", bytes: Buffer.from(raw) }],
      coverage: { periods: 2 },
      validationSummary: { passed: true },
    });
  const fixtureQualityValidator = async () => ({ fixture: true });

  async function makePublishedGitFixture() {
    const root = await temporaryRoot();
    const outputs = ["canonical/data.csv", "canonical/data.raw", "canonical/data.metadata.json"];
    await mkdir(path.join(root, "canonical"), { recursive: true });
    for (const output of outputs) await writeFile(path.join(root, output), "baseline");
    const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Data refresh fixture");
    git("add", ...outputs);
    git("commit", "-qm", "baseline");
    const registry = makeRegistry();
    const common = {
      root,
      registry,
      adapters: new Map([["fixture", makeAdapter({ values: [1, 2] })]]),
      validate: fixtureQualityValidator,
    };
    await runRefresh(common);
    return { root, outputs, common, git };
  }

  it("verifies exact last-published outputs as a check-only semantic no-op", async () => {
    const { common } = await makePublishedGitFixture();
    let publishCalls = 0;
    let checkObserved = false;
    const report = await runRefresh({
      ...common,
      adapters: new Map([
        [
          "fixture",
          async (options) => {
            checkObserved = options.check === true;
            return makeAdapter({ values: [1, 2] })();
          },
        ],
      ]),
      check: true,
      verifyLastPublishNoop: true,
      publish: async () => {
        publishCalls += 1;
      },
    });
    expect(report.mode).toBe("verify-last-publish-noop");
    expect(checkObserved).toBe(true);
    expect(publishCalls).toBe(0);
  });

  it("records and validates the CPI-specific approval range in semantic state", async () => {
    const fixture = await makePublishedGitFixture();
    fixture.git("add", ...fixture.outputs);
    fixture.git("commit", "-qm", "record fixture outputs before CPI manifest check");
    const registry = {
      ...fixture.common.registry,
      sources: fixture.common.registry.sources.map((source) => ({
        ...source,
        id: "cpi-long",
        approvedPeriod: { from: "202607", through: "202609" },
      })),
    };
    const common = { ...fixture.common, registry };
    await runRefresh(common);

    const statePath = path.join(fixture.root, ".data-refresh/semantic-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    expect(state.cpiVintageApproval).toEqual({
      discoveryPeriod: "latest-published",
      approvedPeriod: { from: "202607", through: "202609" },
    });

    const unapprovedRegistry = {
      ...registry,
      sources: registry.sources.map((source) => ({
        ...source,
        approvedPeriod: { from: "202607", through: "202610" },
      })),
    };
    await expect(
      runRefresh({ ...common, registry: unapprovedRegistry, check: true }),
    ).rejects.toMatchObject({ code: "cpi-approval-contract-invalid" });

    state.cpiVintageApproval.approvedPeriod.through = "202609";
    await writeFile(statePath, JSON.stringify(state));
    await expect(
      runRefresh({ ...common, check: true, verifyLastPublishNoop: true }),
    ).rejects.toMatchObject({ code: "verify-noop-state-invalid" });
  });

  it("accepts a clean tracked managed output after verifying its published hash", async () => {
    const fixture = await makePublishedGitFixture();
    const cleanOutput = fixture.outputs[0];
    fixture.git("add", cleanOutput);
    fixture.git("commit", "-qm", "record published managed output");
    await expect(
      runRefresh({
        ...fixture.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).resolves.toMatchObject({ mode: "verify-last-publish-noop", status: "validated" });
  });

  it("ignores unrelated dirty code and documentation paths during no-op verification", async () => {
    const fixture = await makePublishedGitFixture();
    await writeFile(path.join(fixture.root, "README.md"), "committed documentation");
    fixture.git("add", "README.md");
    fixture.git("commit", "-qm", "add documentation baseline");
    await writeFile(path.join(fixture.root, "README.md"), "local documentation edit");
    await expect(
      runRefresh({
        ...fixture.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).resolves.toMatchObject({ mode: "verify-last-publish-noop", status: "validated" });
  });

  it("rejects altered or staged outputs in last-publish no-op verification", async () => {
    const altered = await makePublishedGitFixture();
    await writeFile(path.join(altered.root, altered.outputs[0]), "tampered");
    await expect(
      runRefresh({
        ...altered.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-output-hash" });

    const staged = await makePublishedGitFixture();
    staged.git("add", staged.outputs[0]);
    await expect(
      runRefresh({
        ...staged.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-git-state" });

    const untracked = await makePublishedGitFixture();
    untracked.git("update-index", "--force-remove", untracked.outputs[0]);
    await expect(
      runRefresh({
        ...untracked.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-git-state" });
  });

  it("rejects dirty data/source paths outside the managed output allowlist", async () => {
    const fixture = await makePublishedGitFixture();
    await mkdir(path.join(fixture.root, "data/source"), { recursive: true });
    await writeFile(path.join(fixture.root, "data/source/unmanaged.csv"), "private source data");
    await expect(
      runRefresh({
        ...fixture.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-git-state" });
  });

  it("rejects staged and tracked-modified unmanaged data/source paths", async () => {
    const staged = await makePublishedGitFixture();
    await mkdir(path.join(staged.root, "data/source"), { recursive: true });
    const stagedPath = "data/source/unmanaged.csv";
    await writeFile(path.join(staged.root, stagedPath), "baseline");
    staged.git("add", stagedPath);
    staged.git("commit", "-qm", "track unmanaged source data");
    await writeFile(path.join(staged.root, stagedPath), "staged source edit");
    staged.git("add", stagedPath);
    await expect(
      runRefresh({
        ...staged.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-git-state" });

    const modified = await makePublishedGitFixture();
    await mkdir(path.join(modified.root, "data/source"), { recursive: true });
    const modifiedPath = "data/source/unmanaged.csv";
    await writeFile(path.join(modified.root, modifiedPath), "baseline");
    modified.git("add", modifiedPath);
    modified.git("commit", "-qm", "track unmanaged source data");
    await writeFile(path.join(modified.root, modifiedPath), "tracked source edit");
    await expect(
      runRefresh({
        ...modified.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-git-state" });
  });

  it("rejects missing or malformed last-publish state and a pending journal", async () => {
    const missing = await makePublishedGitFixture();
    await rm(path.join(missing.root, ".data-refresh/semantic-state.json"));
    await expect(
      runRefresh({
        ...missing.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-state-missing" });

    const malformed = await makePublishedGitFixture();
    await writeFile(path.join(malformed.root, ".data-refresh/semantic-state.json"), "{}");
    await expect(
      runRefresh({
        ...malformed.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "verify-noop-state-invalid" });

    const pending = await makePublishedGitFixture();
    await writeFile(path.join(pending.root, ".data-refresh/publish-journal.json"), "{}");
    await expect(
      runRefresh({
        ...pending.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
  });

  it("keeps ordinary check mode strict for published dirty outputs", async () => {
    const fixture = await makePublishedGitFixture();
    await expect(runRefresh({ ...fixture.common, check: true })).rejects.toMatchObject({
      code: "canonical-edited",
    });
  });

  it("requires the exact old state hash before a check-only rebaseline", async () => {
    const fixture = await makePublishedGitFixture();
    fixture.git("add", ...fixture.outputs);
    fixture.git("commit", "-qm", "record published outputs");
    const statePath = path.join(fixture.root, ".data-refresh/semantic-state.json");
    const stateBefore = await readFile(statePath);
    const stateHash = sha256(stateBefore);
    const outputsBefore = await Promise.all(
      fixture.outputs.map((output) => readFile(path.join(fixture.root, output))),
    );
    let adapterCalls = 0;
    const adapters = new Map([
      [
        "fixture",
        async (options) => {
          adapterCalls += 1;
          return fixture.common.adapters.get("fixture")(options);
        },
      ],
    ]);

    await expect(
      runRefresh({
        ...fixture.common,
        check: true,
        rebaselineSemanticStateHash: "0".repeat(64),
        adapters,
      }),
    ).rejects.toMatchObject({ code: "rebaseline-state-hash-mismatch" });
    expect(adapterCalls).toBe(0);

    const report = await runRefresh({
      ...fixture.common,
      check: true,
      rebaselineSemanticStateHash: stateHash,
      adapters,
    });
    expect(report.status).toBe("validated");
    expect(report.semanticStateRebaseline).toMatchObject({
      reason: "explicit-hash-pinned-state-transition",
      oldStateSha256: stateHash,
      oldStateVersion: 1,
      candidateFingerprints: { "fixture-source": expect.stringMatching(/^[a-f0-9]{64}$/) },
      candidateOutputHashes: { "fixture-source": expect.any(Object) },
    });
    expect(report.sources[0].result).toBe("fetched");
    expect(adapterCalls).toBe(1);
    expect(await readFile(statePath)).toEqual(stateBefore);
    for (const [index, output] of fixture.outputs.entries()) {
      expect(await readFile(path.join(fixture.root, output))).toEqual(outputsBefore[index]);
    }
  });

  it("rejects dirty, staged, untracked, and recovery-residue outputs before rebaseline fetch", async () => {
    const makeCleanFixture = async () => {
      const fixture = await makePublishedGitFixture();
      fixture.git("add", ...fixture.outputs);
      fixture.git("commit", "-qm", "record published outputs");
      const state = await readFile(path.join(fixture.root, ".data-refresh/semantic-state.json"));
      return { ...fixture, stateHash: sha256(state) };
    };
    const invoke = (fixture) =>
      runRefresh({
        ...fixture.common,
        check: true,
        rebaselineSemanticStateHash: fixture.stateHash,
      });

    const dirty = await makeCleanFixture();
    await writeFile(path.join(dirty.root, dirty.outputs[0]), "dirty");
    await expect(invoke(dirty)).rejects.toMatchObject({ code: "rebaseline-output-dirty" });

    const staged = await makeCleanFixture();
    await writeFile(path.join(staged.root, staged.outputs[0]), "staged");
    staged.git("add", staged.outputs[0]);
    await expect(invoke(staged)).rejects.toMatchObject({ code: "rebaseline-output-dirty" });

    const untracked = await makeCleanFixture();
    untracked.git("update-index", "--force-remove", untracked.outputs[0]);
    await expect(invoke(untracked)).rejects.toMatchObject({
      code: "rebaseline-output-not-tracked",
    });

    const pending = await makeCleanFixture();
    const pendingId = "00000000-0000-4000-8000-000000000001";
    const pendingEntry = journalEntry({
      path: pending.outputs[0],
      staged: `.data-refresh/staging/${pendingId}/artifacts/pending`,
      backup: `.data-refresh/backups/${pendingId}/0.bak`,
      targetBytes: "pending",
    });
    await writeFile(
      path.join(pending.root, ".data-refresh/publish-journal.json"),
      JSON.stringify(journalFor(pendingId, "publishing", [pendingEntry], pending.outputs)),
    );
    await expect(invoke(pending)).rejects.toMatchObject({ code: "rebaseline-recovery-required" });

    const stagingResidue = await makeCleanFixture();
    await mkdir(path.join(stagingResidue.root, ".data-refresh/staging/old-run"), {
      recursive: true,
    });
    await expect(invoke(stagingResidue)).rejects.toMatchObject({
      code: "rebaseline-staging-residue",
    });

    const backupResidue = await makeCleanFixture();
    await mkdir(path.join(backupResidue.root, ".data-refresh/backups/old-transaction"), {
      recursive: true,
    });
    await writeFile(
      path.join(backupResidue.root, ".data-refresh/backups/old-transaction/0.bak"),
      "backup",
    );
    await expect(invoke(backupResidue)).rejects.toMatchObject({
      code: "rebaseline-backup-residue",
    });

    const rollbackTemp = await makeCleanFixture();
    await writeFile(
      path.join(rollbackTemp.root, `${rollbackTemp.outputs[0]}.refresh-rollback-stale`),
      "rollback temporary",
    );
    await expect(invoke(rollbackTemp)).rejects.toMatchObject({
      code: "rebaseline-recovery-residue",
    });
  });

  it("rechecks the state hash and clean HEAD outputs immediately before rebaseline publish", async () => {
    const outputFixture = await makePublishedGitFixture();
    outputFixture.git("add", ...outputFixture.outputs);
    outputFixture.git("commit", "-qm", "record published outputs");
    const outputStatePath = path.join(outputFixture.root, ".data-refresh/semantic-state.json");
    const outputState = await readFile(outputStatePath);
    const outputHash = sha256(outputState);
    const outputSnapshots = await Promise.all(
      outputFixture.outputs.map((output) => readFile(path.join(outputFixture.root, output))),
    );
    let outputPublishCalls = 0;
    const mutatingOutputAdapter = async () => {
      await writeFile(
        path.join(outputFixture.root, outputFixture.outputs[0]),
        "concurrent output edit",
      );
      return outputFixture.common.adapters.get("fixture")();
    };
    await expect(
      runRefresh({
        ...outputFixture.common,
        rebaselineSemanticStateHash: outputHash,
        adapters: new Map([["fixture", mutatingOutputAdapter]]),
        publish: async () => {
          outputPublishCalls += 1;
        },
      }),
    ).rejects.toMatchObject({ code: "rebaseline-output-dirty" });
    expect(outputPublishCalls).toBe(0);
    expect(await readFile(outputStatePath)).toEqual(outputState);
    for (const [index, output] of outputFixture.outputs.entries()) {
      const actual = await readFile(path.join(outputFixture.root, output));
      if (index === 0) expect(actual.toString()).toBe("concurrent output edit");
      else expect(actual).toEqual(outputSnapshots[index]);
    }

    const stateFixture = await makePublishedGitFixture();
    stateFixture.git("add", ...stateFixture.outputs);
    stateFixture.git("commit", "-qm", "record published outputs");
    const statePath = path.join(stateFixture.root, ".data-refresh/semantic-state.json");
    const stateBytes = await readFile(statePath);
    const stateHash = sha256(stateBytes);
    const stateOutputSnapshots = await Promise.all(
      stateFixture.outputs.map((output) => readFile(path.join(stateFixture.root, output))),
    );
    let statePublishCalls = 0;
    const mutatingStateAdapter = async () => {
      await writeFile(statePath, Buffer.concat([stateBytes, Buffer.from(" ")]));
      return stateFixture.common.adapters.get("fixture")();
    };
    await expect(
      runRefresh({
        ...stateFixture.common,
        rebaselineSemanticStateHash: stateHash,
        adapters: new Map([["fixture", mutatingStateAdapter]]),
        publish: async () => {
          statePublishCalls += 1;
        },
      }),
    ).rejects.toMatchObject({ code: "rebaseline-state-changed" });
    expect(statePublishCalls).toBe(0);
    expect(await readFile(statePath)).toEqual(Buffer.concat([stateBytes, Buffer.from(" ")]));
    for (const [index, output] of stateFixture.outputs.entries()) {
      expect(await readFile(path.join(stateFixture.root, output))).toEqual(
        stateOutputSnapshots[index],
      );
    }
  });

  it("publishes the rebaseline through the transaction and restores the prior state on rollback", async () => {
    const fixture = await makePublishedGitFixture();
    fixture.git("add", ...fixture.outputs);
    fixture.git("commit", "-qm", "record published outputs");
    const statePath = path.join(fixture.root, ".data-refresh/semantic-state.json");
    const stateBefore = await readFile(statePath);
    const stateHash = sha256(stateBefore);
    const outputsBefore = await Promise.all(
      fixture.outputs.map((output) => readFile(path.join(fixture.root, output))),
    );
    const rollbackPublish = async (options) =>
      publishArtifacts({
        ...options,
        onRename: (_index, output) => {
          if (output === fixture.outputs[0]) throw new Error("fixture publish interruption");
        },
      });

    await expect(
      runRefresh({
        ...fixture.common,
        rebaselineSemanticStateHash: stateHash,
        publish: rollbackPublish,
      }),
    ).rejects.toMatchObject({ code: "publish-failed" });
    expect(await readFile(statePath)).toEqual(stateBefore);
    for (const [index, output] of fixture.outputs.entries()) {
      expect(await readFile(path.join(fixture.root, output))).toEqual(outputsBefore[index]);
    }

    const report = await runRefresh({
      ...fixture.common,
      rebaselineSemanticStateHash: stateHash,
    });
    expect(report.status).toBe("published");
    const stateAfter = JSON.parse(await readFile(statePath, "utf8"));
    expect(stateAfter.version).toBe(2);
    expect(stateAfter.publishTransactionId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(
      runRefresh({
        ...fixture.common,
        check: true,
        verifyLastPublishNoop: true,
      }),
    ).resolves.toMatchObject({ status: "validated", mode: "verify-last-publish-noop" });
    await expect(
      runRefresh({
        ...fixture.common,
        check: true,
        verifyLastPublishNoop: true,
        rebaselineSemanticStateHash: sha256(await readFile(statePath)),
      }),
    ).rejects.toMatchObject({ code: "rebaseline-noop-conflict" });
  });

  it("uses the typed identity variants and rejects cross-kind IDs", () => {
    expect(() =>
      validateRegistry({
        requiredAdapters: [],
        sources: [
          {
            id: "bad-source",
            required: true,
            identity: { kind: "api", statsDataId: "0004052037", statInfId: "000040482945" },
            title: "bad",
            classifications: ["all"],
            frequency: "monthly",
            unit: "index",
            baseline: "2020",
            period: { from: "a", through: "b" },
            revision: "latest",
            outputs: ["data.csv"],
            dependencies: [],
          },
        ],
      }),
    ).toThrow(/cannot use file identity fields/);
  });

  it("locks exclusively and allows safe relative paths only", async () => {
    const root = await temporaryRoot();
    const lock = path.join(root, "run.lock");
    const release = await acquireExclusiveLock(lock);
    await expect(acquireExclusiveLock(lock)).rejects.toMatchObject({ code: "refresh-locked" });
    await release();
    await expect(resolveContainedPath(root, "../outside")).rejects.toMatchObject({
      code: "path-not-allowlisted",
    });
    await symlink(os.tmpdir(), path.join(root, "link"));
    await expect(resolveContainedPath(root, "link/file.csv")).rejects.toMatchObject({
      code: "symlink-path",
    });
  });

  it("fails closed before source work if a required adapter is missing", async () => {
    const root = await temporaryRoot();
    await expect(
      runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map(),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      }),
    ).rejects.toMatchObject({
      code: "source-preflight-blocked",
      sources: [{ sourceId: "fixture-source", reason: "adapter-not-registered" }],
    });
    await expect(readFile(path.join(root, "canonical/data.csv"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports only safe reason codes for blocked sources before lock or adapter execution", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "canonical-before");
    const registry = makeRegistry();
    registry.sources[0].blockedReason =
      "fixture-mapping-unverified: raw source contains PRIVATE-TOKEN";
    let fetchCalls = 0;
    let publishCalls = 0;
    const adapters = new Map([
      [
        "fixture",
        async () => {
          fetchCalls += 1;
          throw new Error("must not fetch");
        },
      ],
    ]);
    const failure = await runRefresh({
      root,
      registry,
      adapters,
      validate: fixtureQualityValidator,
      publish: async () => {
        publishCalls += 1;
      },
    }).catch((error) => error);
    expect(failure).toMatchObject({
      code: "source-preflight-blocked",
      sources: [{ sourceId: "fixture-source", reason: "fixture-mapping-unverified" }],
    });
    expect(failure.message).not.toContain("PRIVATE-TOKEN");
    expect(fetchCalls).toBe(0);
    expect(publishCalls).toBe(0);
    await expect(readFile(path.join(root, ".data-refresh/refresh.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(failure.reportPath).toMatch(/^\.data-refresh\/reports\/[A-Za-z0-9._-]+\.json$/);
    const reportText = await readFile(path.join(root, failure.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report).toMatchObject({
      plan: "shared-plan-52",
      planState: "blocked-before-fetch",
      status: "source-preflight-blocked",
      sources: [{ sourceId: "fixture-source", reason: "fixture-mapping-unverified" }],
    });
    expect(report.generatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(reportText).not.toContain("PRIVATE-TOKEN");
    expect(reportText).not.toContain("raw source");
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("canonical-before");
  });

  it("writes a per-source pending candidate report when adapter resolution fails", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const pending = Object.assign(new Error("candidate unavailable: PRIVATE-TOKEN"), {
      candidateResolutionPending: true,
      sourceId: "fixture-source",
      code: "candidate-resolution-pending",
    });
    const failure = await runRefresh({
      root,
      registry,
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw pending;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    expect(failure).toBe(pending);
    const reportText = await readFile(path.join(root, failure.reportPath), "utf8");
    expect(JSON.parse(reportText).sources).toEqual([
      {
        sourceId: "fixture-source",
        result: "blocked",
        sourceCandidate: { status: "pending", reasonCode: "candidate-resolution-pending" },
      },
    ]);
    expect(reportText).not.toContain("PRIVATE-TOKEN");
  });

  it("writes every source worker failure as a sanitized pending report", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const failure = Object.assign(new Error("SECRET and https://private.example/data"), {
      code: "bad code SECRET",
    });
    const thrown = await runRefresh({
      root,
      registry,
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    expect(thrown).toBe(failure);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText)).toMatchObject({
      errorCode: "source-worker-failed",
      sources: [
        {
          sourceId: "fixture-source",
          result: "blocked",
          sourceCandidate: { status: "pending", reasonCode: "source-worker-failed" },
        },
      ],
    });
    expect(reportText).not.toContain("SECRET");
    expect(reportText).not.toContain("private.example");
  });

  it("serializes only fixed numeric CPI candidate diagnostics", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const failure = Object.assign(new Error("candidate identity did not match"), {
      code: "cpi-candidate-not-found",
      candidateDiagnostics: {
        rowsReturned: 8,
        requiredIdentityFields: 7,
        titleAndStatNameIdentityMatch: 4,
        monthlyFrequencyMatch: 3,
        surveyDate2025Match: 2,
        fullMatch: 0,
        identityCandidates: [
          {
            statsDataId: "0004052037",
            cycleCategory: "monthly",
            surveyYears: ["2025"],
            privateTitle: "PRIVATE NESTED TITLE",
          },
        ],
        rawTitle: "PRIVATE TITLE",
        apiId: "PRIVATE ID",
      },
    });
    const thrown = await runRefresh({
      root,
      registry,
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].sourceCandidate).toEqual({
      status: "pending",
      reasonCode: "cpi-candidate-not-found",
      candidateDiagnostics: {
        rowsReturned: 8,
        requiredIdentityFields: 7,
        titleAndStatNameIdentityMatch: 4,
        monthlyFrequencyMatch: 3,
        surveyDate2025Match: 2,
        fullMatch: 0,
        identityCandidates: [
          {
            statsDataId: "0004052037",
            cycleCategory: "monthly",
            surveyYears: ["2025"],
          },
        ],
      },
    });
    expect(reportText).not.toContain("PRIVATE TITLE");
    expect(reportText).not.toContain("PRIVATE ID");
    expect(reportText).not.toContain("PRIVATE NESTED TITLE");
  });

  it("serializes only allowlisted CPI metadata predicate results", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("metadata identity mismatch"), {
      code: "cpi-meta-candidate-mismatch",
      candidateDiagnostics: {
        selectedPresent: true,
        idExact: true,
        titleContainsSelectedTitle: true,
        identityMarkers: true,
        statisticsName: true,
        rawTitle: "PRIVATE CPI TITLE",
        statistics: "PRIVATE STATISTICS NAME",
        responseBody: "PRIVATE RESPONSE BODY",
      },
    });
    const thrown = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].sourceCandidate).toEqual({
      status: "pending",
      reasonCode: "cpi-meta-candidate-mismatch",
      candidateDiagnostics: {
        selectedPresent: true,
        idExact: true,
        titleContainsSelectedTitle: true,
        identityMarkers: true,
        statisticsName: true,
      },
    });
    expect(reportText).not.toContain("PRIVATE CPI TITLE");
    expect(reportText).not.toContain("PRIVATE STATISTICS NAME");
    expect(reportText).not.toContain("PRIVATE RESPONSE BODY");
  });

  it("serializes only fixed boolean CPI metadata area predicates", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("area metadata is unproven"), {
      code: "cpi-meta-area-unproven",
      cpiMetadataAreaDiagnostics: {
        areaDimensionFound: true,
        nationalCode00000Found: true,
        nationalNameNationalFound: true,
        nationalCodeAndNameSameClass: false,
        rawClassId: "PRIVATE CLASS ID",
        rawClassName: "PRIVATE CLASS NAME",
        rawClassValue: "PRIVATE CLASS VALUE",
      },
    });
    const thrown = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].cpiMetadataAreaDiagnostics).toEqual({
      areaDimensionFound: true,
      nationalCode00000Found: true,
      nationalNameNationalFound: true,
      nationalCodeAndNameSameClass: false,
    });
    expect(reportText).not.toContain("PRIVATE CLASS ID");
    expect(reportText).not.toContain("PRIVATE CLASS NAME");
    expect(reportText).not.toContain("PRIVATE CLASS VALUE");
  });

  it("serializes only allowlisted CPI category counts", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("category identity mismatch"), {
      code: "cpi-meta-series-mismatch",
      cpiMetadataCategoryDiagnostics: {
        categoryClassObjFound: true,
        rowCount: 79,
        uniqueCodeCount: 78,
        expectedCodeMatchCount: 79,
        exactNameMatchCount: 78,
        namePrimitiveCount: 79,
        nameDollarWrappedCount: 0,
        nameMissingCount: 0,
        normalizedNameMatchCount: 77,
        expectedCodeNamePresentCount: 79,
        rawCodes: ["PRIVATE CODE"],
        rawNames: ["PRIVATE NAME"],
        rawResponse: "PRIVATE RESPONSE",
      },
    });
    const thrown = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].cpiMetadataCategoryDiagnostics).toEqual({
      categoryClassObjFound: true,
      rowCount: 79,
      uniqueCodeCount: 78,
      expectedCodeMatchCount: 79,
      exactNameMatchCount: 78,
      namePrimitiveCount: 79,
      nameDollarWrappedCount: 0,
      nameMissingCount: 0,
      normalizedNameMatchCount: 77,
      expectedCodeNamePresentCount: 79,
    });
    expect(reportText).not.toContain("PRIVATE CODE");
    expect(reportText).not.toContain("PRIVATE NAME");
    expect(reportText).not.toContain("PRIVATE RESPONSE");
  });

  it("serializes only fixed CPI distribution code counts", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("distribution series identity is invalid"), {
      code: "cpi-distribution-series-invalid",
      cpiDistributionSeriesDiagnostics: {
        codeRowColumnCount: 752,
        totalCodeCount: 751,
        nonEmptyCodeCount: 751,
        uniqueCodeCount: 750,
        emptyCodeCount: 0,
        duplicateCodeCount: 1,
        expectedCodeMatchCount: 77,
        supplementalCodeCount: 673,
        missingExpectedCodeCount: 1,
        rawCodes: ["PRIVATE CODE"],
        rawNames: ["PRIVATE NAME"],
        rawValue: "PRIVATE VALUE",
      },
    });
    const thrown = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].cpiDistributionSeriesDiagnostics).toEqual({
      codeRowColumnCount: 752,
      totalCodeCount: 751,
      nonEmptyCodeCount: 751,
      uniqueCodeCount: 750,
      emptyCodeCount: 0,
      duplicateCodeCount: 1,
      expectedCodeMatchCount: 77,
      supplementalCodeCount: 673,
      missingExpectedCodeCount: 1,
    });
    expect(reportText).not.toContain("PRIVATE CODE");
    expect(reportText).not.toContain("PRIVATE NAME");
    expect(reportText).not.toContain("PRIVATE VALUE");
  });

  it("serializes only allowlisted CPI distribution period diagnostics", async () => {
    const root = await temporaryRoot();
    const distributionFileSha256 = "a".repeat(64);
    const failure = Object.assign(new Error("distribution periods differ"), {
      code: "cpi-distribution-api-period-mismatch",
      cpiDistributionPeriodDiagnostics: {
        apiPeriodCount: 679,
        apiStartMonth: "197001",
        apiEndMonth: "202607",
        distributionPeriodCount: 678,
        distributionStartMonth: "197001",
        distributionEndMonth: "202606",
        distributionFileByteLength: 2_152_253,
        distributionFileSha256,
        positionalMismatchCount: 0,
        firstMismatchIndex: null,
        firstMismatchApiMonth: null,
        firstMismatchDistributionMonth: null,
        missingApiPeriodCount: 1,
        rawValue: "PRIVATE CELL VALUE",
        responseBody: "PRIVATE RESPONSE BODY",
        rawBytes: Buffer.from("PRIVATE CSV CONTENT"),
      },
    });
    const thrown = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].cpiDistributionPeriodDiagnostics).toEqual({
      apiPeriodCount: 679,
      apiStartMonth: "197001",
      apiEndMonth: "202607",
      distributionPeriodCount: 678,
      distributionStartMonth: "197001",
      distributionEndMonth: "202606",
      distributionFileByteLength: 2_152_253,
      distributionFileSha256,
      positionalMismatchCount: 0,
      firstMismatchIndex: null,
      firstMismatchApiMonth: null,
      firstMismatchDistributionMonth: null,
      missingApiPeriodCount: 1,
    });
    expect(reportText).not.toContain("PRIVATE CELL VALUE");
    expect(reportText).not.toContain("PRIVATE RESPONSE BODY");
    expect(reportText).not.toContain("PRIVATE CSV CONTENT");
  });

  it("serializes only fixed CPI metadata time booleans and counts", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("time metadata is unproven"), {
      code: "cpi-meta-time-unproven",
      cpiMetadataTimeDiagnostics: {
        timeDimensionFound: true,
        rowCount: 680,
        monthlyPeriodCount: 679,
        annualPeriodCount: 1,
        malformedLabelCount: 0,
        monthLabelPatternCount: 679,
        calendarYearLabelPatternCount: 0,
        fiscalYearLabelPatternCount: 0,
        annualAverageLabelPatternCount: 1,
        blankLabelCount: 0,
        otherLabelPatternCount: 0,
        malformedUniqueCodeCount: 0,
        duplicateCodeCount: 0,
        duplicatePeriodCount: 0,
        requiredStartMonthFound: true,
        monthlyContinuity: true,
        rawTimeCode: "PRIVATE TIME CODE",
        rawTimeLabel: "PRIVATE TIME LABEL",
        responseBody: "PRIVATE RESPONSE BODY",
      },
    });
    const thrown = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].cpiMetadataTimeDiagnostics).toEqual({
      timeDimensionFound: true,
      requiredStartMonthFound: true,
      monthlyContinuity: true,
      rowCount: 680,
      monthlyPeriodCount: 679,
      annualPeriodCount: 1,
      malformedLabelCount: 0,
      monthLabelPatternCount: 679,
      calendarYearLabelPatternCount: 0,
      fiscalYearLabelPatternCount: 0,
      annualAverageLabelPatternCount: 1,
      blankLabelCount: 0,
      otherLabelPatternCount: 0,
      malformedUniqueCodeCount: 0,
      duplicateCodeCount: 0,
      duplicatePeriodCount: 0,
    });
    expect(reportText).not.toContain("PRIVATE TIME CODE");
    expect(reportText).not.toContain("PRIVATE TIME LABEL");
    expect(reportText).not.toContain("PRIVATE RESPONSE BODY");
  });

  it("serializes only fixed CPI VALUE record counts", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("CPI VALUE records are unclassified"), {
      code: "cpi-api-record-invalid",
      cpiApiRecordDiagnostics: {
        totalRows: 12,
        unknownCategoryCount: 2,
        unrecognizedTimeCount: 3,
        bothInvalidCount: 1,
        rawCategory: "PRIVATE CATEGORY",
        rawTime: "PRIVATE TIME",
        rawValue: "PRIVATE VALUE",
        responseBody: "PRIVATE RESPONSE BODY",
      },
    });
    const thrown = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText).sources[0].cpiApiRecordDiagnostics).toEqual({
      totalRows: 12,
      unknownCategoryCount: 2,
      unrecognizedTimeCount: 3,
      bothInvalidCount: 1,
    });
    expect(reportText).not.toContain("PRIVATE CATEGORY");
    expect(reportText).not.toContain("PRIVATE TIME");
    expect(reportText).not.toContain("PRIVATE VALUE");
    expect(reportText).not.toContain("PRIVATE RESPONSE BODY");
  });

  it("keeps allowlisted CTI file candidate summaries and bounded output diff hashes", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const adapter = makeAdapter({ rows: 1 }, "data", "raw");
    const wrapped = async (input) => ({
      ...(await adapter(input)),
      reportSummary: {
        fileCandidates: [
          {
            identityStatInfId: "000040499070",
            catalogResourceId: "resource-1",
            legacyStatInfId: "000040499099",
            title: "世帯消費動向指数 基本系列",
            resourceTitle: "世帯消費動向指数 XLSX",
            format: "XLSX",
            releaseDate: "2026-09-01",
            lastModifiedDate: "2026-10-01",
            candidateCount: 2,
          },
        ],
        coverage: { start: "2002-01", end: "2026年7月", monthCount: 295, seriesCount: 66 },
        revisionCount: 1,
        revisionHash: "a".repeat(64),
        validationResult: "passed",
        outputHashes: [
          { path: "data/source/example.csv", oldSha256: "b".repeat(64), newSha256: "c".repeat(64) },
        ],
        unsafeUrl: "https://www.e-stat.go.jp/private",
      },
    });
    await runRefresh({
      root,
      registry,
      adapters: new Map([["fixture", wrapped]]),
      check: true,
      validate: fixtureQualityValidator,
    });
    const reportFiles = (await readdir(path.join(root, ".data-refresh"))).filter((name) =>
      name.endsWith(".json"),
    );
    const reportText = await readFile(path.join(root, ".data-refresh", reportFiles[0]), "utf8");
    const candidate = JSON.parse(reportText).sources[0].sourceCandidate;
    expect(candidate.fileCandidates).toMatchObject([
      { identityStatInfId: "000040499070", catalogResourceId: "resource-1", candidateCount: 2 },
    ]);
    expect(candidate).toMatchObject({
      revisionCount: 1,
      revisionHash: "a".repeat(64),
      validationResult: "passed",
    });
    expect(candidate.outputHashes).toEqual([
      { path: "data/source/example.csv", oldSha256: "b".repeat(64), newSha256: "c".repeat(64) },
    ]);
    expect(reportText).not.toContain("unsafeUrl");
    expect(reportText).not.toContain("private");
  });

  it("fails closed without writing a blocked report through a symlinked report directory", async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh"), { recursive: true });
    await symlink(outside, path.join(root, ".data-refresh/reports"));
    const registry = makeRegistry();
    registry.sources[0].blockedReason = "fixture-identity-unverified";
    let fetchCalls = 0;
    const adapters = new Map([
      [
        "fixture",
        async () => {
          fetchCalls += 1;
          return {};
        },
      ],
    ]);
    await expect(
      runRefresh({ root, registry, adapters, validate: fixtureQualityValidator }),
    ).rejects.toMatchObject({ code: "symlink-path" });
    expect(fetchCalls).toBe(0);
    expect(await readFile(path.join(outside, "refresh-report.json")).catch(() => null)).toBeNull();
    await expect(readFile(path.join(root, ".data-refresh/refresh.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("requires an explicit quality validator and runs it against all staged source results", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const adapters = new Map([["fixture", makeAdapter({ values: [1, 2] })]]);
    await expect(
      runRefresh({ root, registry, adapters, preflightChanges: async () => false }),
    ).rejects.toMatchObject({ code: "quality-validator-required" });
    let validationInput;
    const report = await runRefresh({
      root,
      registry,
      adapters,
      validate: async (input) => {
        validationInput = input;
        return {
          fixture:
            input.sourceResults.length === 1 &&
            input.sourceResults[0].result.artifacts.length === 3,
        };
      },
      preflightChanges: async () => false,
    });
    expect(validationInput.stageRoot).toBeTruthy();
    expect(report.quality).toEqual({ fixture: true });
  });

  it("reports only allowlisted CTI revision counts, samples, and hashes", async () => {
    const root = await temporaryRoot();
    const result = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => ({
            semanticValue: { revision: true },
            artifacts: [
              { path: "canonical/data.csv", bytes: Buffer.from("data") },
              { path: "canonical/data.raw", bytes: Buffer.from("raw") },
              { path: "canonical/data.metadata.json", bytes: Buffer.from("{}") },
            ],
            revisionAudit: {
              source_1: {
                overlapCount: 3,
                changedObservationCount: 1,
                changedValueCount: 2,
                sha256: "a".repeat(64),
                previousSha256: "b".repeat(64),
                sourceSha256: "c".repeat(64),
                changedSample: [
                  {
                    seriesIndex: 4,
                    month: "2025-01",
                    previousValue: "secret-old",
                    sourceValue: "secret-new",
                  },
                ],
                rawBytes: "secret-bytes",
              },
            },
          }),
        ],
      ]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    });
    expect(result.sources[0].revisionAudit).toEqual([
      {
        sourceId: "source_1",
        overlapCount: 3,
        changedObservationCount: 1,
        changedValueCount: 2,
        sha256: "a".repeat(64),
        previousSha256: "b".repeat(64),
        sourceSha256: "c".repeat(64),
        changedSample: [{ seriesIndex: 4, month: "2025-01" }],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("reports bounded accepted annual earnings rounding adjustments", async () => {
    const root = await temporaryRoot();
    const validSample = (year) => ({
      series: "total_earning",
      year: String(year),
      oldValue: 104.7,
      newValue: 104.8,
      reason: "official-cy-upper-rounding-at-monthly-midpoint",
      url: "https://secret.example/file",
      rawBytes: "secret-bytes",
    });
    const result = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => ({
            semanticValue: { revision: "earnings" },
            artifacts: [
              { path: "canonical/data.csv", bytes: Buffer.from("data") },
              { path: "canonical/data.raw", bytes: Buffer.from("raw") },
              { path: "canonical/data.metadata.json", bytes: Buffer.from("{}") },
            ],
            revisionAudit: {
              total_earning: {
                acceptedAnnualRoundingAdjustmentCount: 6,
                acceptedAnnualRoundingAdjustmentSample: [
                  validSample(2020),
                  { ...validSample(2021), year: "0000" },
                  { ...validSample(2022), year: "9999" },
                  { ...validSample(2023), oldValue: 1_000_001 },
                  { ...validSample(2024), newValue: 1_000_001 },
                  validSample(2025),
                  { ...validSample(2026), series: "unregistered" },
                  { ...validSample(2027), year: "20x7" },
                  { ...validSample(2028), oldValue: -1 },
                  { ...validSample(2029), newValue: Infinity },
                  { ...validSample(2030), reason: "unapproved-rule" },
                ],
                rawBytes: "secret-bytes",
                sourceUrl: "https://secret.example/file",
              },
            },
          }),
        ],
      ]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    });

    expect(result.sources[0].revisionAudit).toEqual([
      {
        sourceId: "total_earning",
        acceptedAnnualRoundingAdjustmentCount: 6,
        acceptedAnnualRoundingAdjustmentSample: [
          {
            series: "total_earning",
            year: "2020",
            oldValue: 104.7,
            newValue: 104.8,
            reason: "official-cy-upper-rounding-at-monthly-midpoint",
          },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("rawBytes");
  });

  it("reports only allowlisted population revision values, hashes, and timestamps", async () => {
    const root = await temporaryRoot();
    const result = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => ({
            semanticValue: { revision: "population" },
            artifacts: [
              { path: "canonical/data.csv", bytes: Buffer.from("data") },
              { path: "canonical/data.raw", bytes: Buffer.from("raw") },
              { path: "canonical/data.metadata.json", bytes: Buffer.from("{}") },
            ],
            revisionAudit: {
              population: {
                comparedObservationCount: 270,
                changedObservationCount: 1,
                previousSha256: "a".repeat(64),
                currentSha256: "b".repeat(64),
                previousRetrievedAt: "2026-09-12T11:14:39+09:00",
                retrievedAt: "2026-10-16T12:00:00.000Z",
                changedSample: [
                  {
                    period: "2026-05",
                    previous: 10976.25,
                    current: 10977.5,
                    sourceUrl: "https://secret.example/file",
                    rawBytes: "secret-bytes",
                  },
                  { period: "2026-13", previous: 1, current: 2 },
                  { period: "2026-06", previous: 10977.5, current: 10978.25 },
                  { period: "2026-07", previous: -1, current: 2 },
                  { period: "2026-08", previous: 1, current: 100_001 },
                ],
                sourceUrl: "https://secret.example/file",
                rawBytes: "secret-bytes",
              },
            },
          }),
        ],
      ]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    });

    expect(result.sources[0].revisionAudit).toEqual([
      {
        sourceId: "population",
        comparedObservationCount: 270,
        changedObservationCount: 1,
        previousSha256: "a".repeat(64),
        currentSha256: "b".repeat(64),
        previousRetrievedAt: "2026-09-12T11:14:39+09:00",
        retrievedAt: "2026-10-16T12:00:00.000Z",
        changedSample: [{ period: "2026-05", previous: 10976.25, current: 10977.5 }],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("sanitizes earnings annual overlap diagnostics to registered series and bounded samples", async () => {
    const root = await temporaryRoot();
    let thrown;
    try {
      await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([
          [
            "fixture",
            async () => {
              throw Object.assign(new Error("annual overlap mismatch"), {
                code: "earnings-annual-overlap-revision-unverified",
                earningsAnnualOverlapDiagnostics: {
                  series: "contractual_earnings",
                  mismatchCount: 2,
                  sample: [
                    { year: 2023, oldValue: 1.25, newValue: 1.5, url: "https://secret" },
                    { year: "0000", oldValue: 3, newValue: 4 },
                    { year: "9999", oldValue: 3, newValue: 4 },
                    { year: "2024", oldValue: 1_000_001, newValue: 4 },
                    { year: "2024", oldValue: 3, newValue: 1_000_001 },
                    { year: "2025", oldValue: 5, newValue: 6 },
                    { year: "2026", oldValue: 6, newValue: 7 },
                  ],
                  body: "private response",
                },
              });
            },
          ],
        ]),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      thrown = error;
    }
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report.sources[0].sourceCandidate.earningsAnnualOverlapDiagnostics).toEqual({
      series: "contractual_earnings",
      mismatchCount: 2,
      sample: [{ year: "2023", oldValue: 1.25, newValue: 1.5 }],
    });
    expect(reportText).not.toContain("secret");
    expect(reportText).not.toContain("private response");
  });

  it("normalizes safe CPI revision samples from YYYYMM and keeps revision bounds", async () => {
    const root = await temporaryRoot();
    const result = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => ({
            semanticValue: { report: "cpi" },
            artifacts: [
              { path: "canonical/data.csv", bytes: Buffer.from("data") },
              { path: "canonical/data.raw", bytes: Buffer.from("raw") },
              { path: "canonical/data.metadata.json", bytes: Buffer.from("{}") },
            ],
            reportSummary: {
              revisionStartMonth: "197001",
              revisionEndMonth: "202607",
              revisionComparedValueCount: 52_962,
              revisionSamples: [
                { seriesId: "0001", month: "197001", url: "https://secret" },
                { seriesId: "series_2", month: "2026-07", body: "private" },
                { seriesId: "bad id", month: "202607" },
                { seriesId: "0002", month: "202613" },
              ],
            },
          }),
        ],
      ]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    });
    expect(result.sources[0].sourceCandidate).toMatchObject({
      revisionStartMonth: "197001",
      revisionEndMonth: "202607",
      revisionComparedValueCount: 52_962,
      revisionSamples: [
        { seriesId: "0001", month: "1970-01" },
        { seriesId: "series_2", month: "2026-07" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("does not publish staged outputs when the quality validator fails", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "canonical-before");
    await expect(
      runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
        validate: async () => {
          throw Object.assign(new Error("suite failed"), { code: "runtime-quality-suite-failed" });
        },
        preflightChanges: async () => false,
      }),
    ).rejects.toMatchObject({ code: "runtime-quality-suite-failed" });
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("canonical-before");
  });

  it("serializes bounded runtime report status and drops arbitrary failure fields", async () => {
    const root = await temporaryRoot();
    const failure = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-failures-found",
            reportBytes: 1024,
            testResultCount: 2,
            failedAssertionCount: 1,
            failedTestSamples: [
              {
                file: "tests/data-quality/cpi-data-integrity.test.ts",
                title: "safe title",
                fileErrorCategory: "unknown",
              },
            ],
            reportPath: "/private/vitest.json",
            stdout: "PRIVATE-STDOUT",
            arbitraryValue: "PRIVATE-ARBITRARY",
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    const blockedSource = report.sources.find((source) => source.result === "blocked");
    expect(blockedSource).toBeDefined();
    expect(blockedSource.sourceCandidate.runtimeQualityDiagnostics).toEqual({
      exitCode: 1,
      reportStatus: "report-failures-found",
      reportBytes: 1024,
      testResultCount: 2,
      failedAssertionCount: 1,
      failedTestSamples: [
        {
          file: "tests/data-quality/cpi-data-integrity.test.ts",
          title: "safe title",
          fileErrorCategory: "unknown",
        },
      ],
    });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE|reportPath|stdout|arbitraryValue/);
  });

  it("drops runtime failure diagnostics with an unrecognized suite error category", async () => {
    const root = await temporaryRoot();
    const failure = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-failures-found",
            reportBytes: 100,
            testResultCount: 1,
            failedAssertionCount: 0,
            failedTestSamples: [
              {
                file: "tests/data-quality/cpi-data-integrity.test.ts",
                fileErrorCategory: "raw error text must not pass",
              },
            ],
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    const blockedSource = report.sources.find((source) => source.result === "blocked");
    expect(blockedSource.sourceCandidate.runtimeQualityDiagnostics).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain("raw error text must not pass");
  });

  it("serializes only a bounded startup diagnostic for a missing report", async () => {
    const root = await temporaryRoot();
    const failure = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-missing",
            reportBytes: 0,
            failedTestSamples: [],
            startupError: "Error: Cannot load [path] [url] [redacted]",
            stdout: "PRIVATE-STDOUT",
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    const diagnostics = report.sources.find((source) => source.result === "blocked").sourceCandidate
      .runtimeQualityDiagnostics;
    expect(diagnostics.startupError).toBe("Error: Cannot load [path] [url] [redacted]");
    expect(JSON.stringify(report)).not.toContain("PRIVATE-STDOUT");
  });

  it("serializes only sanitized allowlisted JavaScript startup error headings", async () => {
    for (const heading of [
      "TypeError",
      "SyntaxError",
      "ReferenceError",
      "RangeError",
      "URIError",
    ]) {
      const root = await temporaryRoot();
      const startupError = `${heading}: Cannot load [path] [url] token=[redacted]`;
      const failure = await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
        validate: async () => {
          throw Object.assign(new Error("suite failed"), {
            code: "runtime-quality-suite-failed",
            runtimeQualityDiagnostics: {
              exitCode: 1,
              reportStatus: "report-missing",
              reportBytes: 0,
              failedTestSamples: [],
              startupError,
            },
          });
        },
        preflightChanges: async () => false,
      }).catch((error) => error);
      const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
      const diagnostics = report.sources.find((source) => source.result === "blocked")
        .sourceCandidate.runtimeQualityDiagnostics;
      expect(diagnostics.startupError).toBe(startupError);
    }

    const root = await temporaryRoot();
    const failure = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-missing",
            reportBytes: 0,
            failedTestSamples: [],
            startupError: "FatalError: Cannot load [path] [url] token=[redacted]",
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    const diagnostics = report.sources.find((source) => source.result === "blocked").sourceCandidate
      .runtimeQualityDiagnostics;
    expect(diagnostics).not.toHaveProperty("startupError");
  });

  it("serializes sanitized esbuild startup causes and rejects raw secret diagnostics", async () => {
    const safeStartupError = "✘ [ERROR] Could not resolve '[path]' [url] token=[redacted]";
    const root = await temporaryRoot();
    const failure = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-missing",
            reportBytes: 0,
            failedTestSamples: [],
            startupError: safeStartupError,
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    const diagnostics = report.sources.find((source) => source.result === "blocked").sourceCandidate
      .runtimeQualityDiagnostics;
    expect(diagnostics.startupError).toBe(safeStartupError);

    const unsafeRoot = await temporaryRoot();
    const unsafeFailure = await runRefresh({
      root: unsafeRoot,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-missing",
            reportBytes: 0,
            failedTestSamples: [],
            startupError: "✘ [ERROR] Could not resolve /home/private/module token=hunter2",
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const unsafeReport = JSON.parse(
      await readFile(path.join(unsafeRoot, unsafeFailure.reportPath), "utf8"),
    );
    const unsafeSource = unsafeReport.sources.find((source) => source.result === "blocked");
    expect(unsafeSource.sourceCandidate.runtimeQualityDiagnostics).not.toHaveProperty(
      "startupError",
    );
    expect(JSON.stringify(unsafeReport)).not.toMatch(/\/home\/private|hunter2/);
  });

  it("drops unsafe runtime report status, byte count, and result counts", async () => {
    const invalidDiagnostics = [
      { reportStatus: "private-status" },
      { reportBytes: 10 * 1024 * 1024 + 1 },
      { testResultCount: 1_000_001 },
      { testResultCount: -1 },
      { failedAssertionCount: 1_000_001 },
      { failedAssertionCount: -1 },
    ];
    for (const invalid of invalidDiagnostics) {
      const root = await temporaryRoot();
      const failure = await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
        validate: async () => {
          throw Object.assign(new Error("suite failed"), {
            code: "runtime-quality-suite-failed",
            runtimeQualityDiagnostics: {
              exitCode: 1,
              reportStatus: "report-failures-found",
              reportBytes: 512,
              testResultCount: 1,
              failedAssertionCount: 1,
              failedTestSamples: [
                { file: "tests/data-quality/cpi-data-integrity.test.ts", title: "safe title" },
              ],
              ...invalid,
            },
          });
        },
        preflightChanges: async () => false,
      }).catch((error) => error);
      const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
      const blockedSource = report.sources.find((source) => source.result === "blocked");
      expect(blockedSource).toBeDefined();
      const diagnostics = blockedSource.sourceCandidate.runtimeQualityDiagnostics;
      expect(
        diagnostics === undefined ||
          diagnostics.failedTestSamples?.some(
            ({ file, title }) =>
              file === "tests/data-quality/cpi-data-integrity.test.ts" && title === "safe title",
          ),
      ).toBe(true);
      if (diagnostics) {
        expect(diagnostics.reportStatus).not.toBe("private-status");
        expect(diagnostics.reportBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
        expect(diagnostics.testResultCount).toBeLessThanOrEqual(1_000_000);
        expect(diagnostics.failedAssertionCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rejects runtime assertion titles that contain local absolute paths", async () => {
    const root = await temporaryRoot();
    const failure = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-failures-found",
            reportBytes: 64,
            failedTestSamples: [
              {
                file: "tests/data-quality/cpi-data-integrity.test.ts",
                title: "failed /home/private/project/data.csv",
              },
            ],
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    const source = report.sources.find((entry) => entry.result === "blocked");
    expect(source.sourceCandidate).not.toHaveProperty("runtimeQualityDiagnostics");
    expect(JSON.stringify(report)).not.toContain("/home/private");
  });

  it("rejects runtime assertion titles that contain UNC paths", async () => {
    const root = await temporaryRoot();
    const failure = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
      validate: async () => {
        throw Object.assign(new Error("suite failed"), {
          code: "runtime-quality-suite-failed",
          runtimeQualityDiagnostics: {
            exitCode: 1,
            reportStatus: "report-failures-found",
            reportBytes: 64,
            failedTestSamples: [
              {
                file: "tests/data-quality/cpi-data-integrity.test.ts",
                title: "failed \\\\private-server\\share\\secret.csv",
              },
            ],
          },
        });
      },
      preflightChanges: async () => false,
    }).catch((error) => error);
    const report = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    const source = report.sources.find((entry) => entry.result === "blocked");
    expect(source.sourceCandidate).not.toHaveProperty("runtimeQualityDiagnostics");
    expect(JSON.stringify(report)).not.toContain("private-server");
  });

  it("serializes only safe API phase and numeric status diagnostics", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("safe failure"), {
      code: "api-business-error",
      apiPhase: "stats-data",
      apiStatus: 123,
      requestUrl: "https://api.example/?appId=secret",
      responseBody: "credential-secret",
    });
    let thrown;
    try {
      await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([
          [
            "fixture",
            async () => {
              throw failure;
            },
          ],
        ]),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report.sources[0].apiFailure).toEqual({ phase: "stats-data", status: 123 });
    expect(reportText).not.toContain("appId=secret");
    expect(reportText).not.toContain("credential-secret");
  });

  it("serializes only safe file HTTP status and retry diagnostics", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("safe file failure"), {
      code: "file-http-error",
      fileFailure: {
        status: 503,
        attempt: 3,
        maxAttempts: 3,
        retryable: true,
        retriesExhausted: true,
        url: "https://www.e-stat.go.jp/file?token=private",
        headers: { authorization: "private-header" },
        body: "private-response-body",
      },
      requestUrl: "https://www.e-stat.go.jp/file?token=private",
      responseBody: "private-response-body",
    });
    let thrown;
    try {
      await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([
          [
            "fixture",
            async () => {
              throw failure;
            },
          ],
        ]),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report.sources[0].fileFailure).toEqual({
      status: 503,
      attempt: 3,
      maxAttempts: 3,
      retryable: true,
      retriesExhausted: true,
    });
    expect(reportText).not.toContain("token=private");
    expect(reportText).not.toContain("private-header");
    expect(reportText).not.toContain("private-response-body");
  });

  it("serializes allowlisted API phase for schema failures without response details", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("invalid schema"), {
      code: "api-invalid-schema",
      apiPhase: "catalog",
      apiSchemaFailureCode: "paging-metadata-missing",
      responseBody: "private-response",
      requestUrl: "https://api.example/?appId=private-app-id",
    });
    let thrown;
    try {
      await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([
          [
            "fixture",
            async () => {
              throw failure;
            },
          ],
        ]),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report.sources[0].apiFailure).toEqual({
      phase: "catalog",
      schemaCode: "paging-metadata-missing",
    });
    expect(reportText).not.toContain("private-response");
    expect(reportText).not.toContain("private-app-id");
  });

  it("omits unrecognized API schema failure codes from reports", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("invalid schema"), {
      code: "api-invalid-schema",
      apiPhase: "table-list",
      apiSchemaFailureCode: "private-response-value",
    });
    let thrown;
    try {
      await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([
          [
            "fixture",
            async () => {
              throw failure;
            },
          ],
        ]),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      thrown = error;
    }
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report.sources[0].apiFailure).toEqual({ phase: "table-list" });
    expect(reportText).not.toContain("private-response-value");
  });

  it("serializes only fixed numeric catalog candidate diagnostics", async () => {
    const root = await temporaryRoot();
    const failure = Object.assign(new Error("candidate pending"), {
      code: "candidate-resolution-pending",
      apiPhase: "catalog",
      candidateDiagnostics: {
        catalogRows: 1,
        datasetRows: 1,
        resourceRows: 2,
        expectedIdMatches: 1,
        allowedFormatMatches: 2,
        httpsOfficialHostMatches: 1,
        datasetTitleMarkerMatches: 2,
        resourceTitleMarkerMatches: 1,
        parseableDateMatches: 2,
        fullMatches: 1,
        latestTieCount: 1,
        subCategory1MarkerMatches: 1,
        title: "private catalog title",
        url: "https://private.example/secret",
      },
    });
    let thrown;
    try {
      await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([
          [
            "fixture",
            async () => {
              throw failure;
            },
          ],
        ]),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      thrown = error;
    }
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report.sources[0].apiFailure).toEqual({
      phase: "catalog",
      candidateCounts: {
        catalogRows: 1,
        datasetRows: 1,
        resourceRows: 2,
        expectedIdMatches: 1,
        allowedFormatMatches: 2,
        httpsOfficialHostMatches: 1,
        datasetTitleMarkerMatches: 2,
        resourceTitleMarkerMatches: 1,
        parseableDateMatches: 2,
        fullMatches: 1,
        latestTieCount: 1,
        subCategory1MarkerMatches: 1,
      },
    });
    expect(reportText).not.toContain("private catalog title");
    expect(reportText).not.toContain("private.example");
  });

  it("preserves canonical raw and metadata on semantic no-op and check mode never publishes", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const adapters = new Map([["fixture", makeAdapter({ values: [1, 2] })]]);
    const common = {
      root,
      registry,
      adapters,
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    };
    await runRefresh(common);
    const initialRaw = await readFile(path.join(root, "canonical/data.raw"), "utf8");
    const initialMetadata = await readFile(path.join(root, "canonical/data.metadata.json"), "utf8");
    const fixedTime = new Date("2024-01-02T03:04:05.000Z");
    await utimes(path.join(root, "canonical/data.raw"), fixedTime, fixedTime);
    await utimes(path.join(root, "canonical/data.metadata.json"), fixedTime, fixedTime);
    const rawMtime = (await stat(path.join(root, "canonical/data.raw"))).mtimeMs;
    const metadataMtime = (await stat(path.join(root, "canonical/data.metadata.json"))).mtimeMs;
    const unchanged = await runRefresh({
      ...common,
      adapters: new Map([
        ["fixture", makeAdapter({ values: [1, 2] }, "normalized-v1", "raw-repacked")],
      ]),
    });
    expect(unchanged.status).toBe("unchanged");
    expect(await readFile(path.join(root, "canonical/data.raw"), "utf8")).toBe(initialRaw);
    expect(await readFile(path.join(root, "canonical/data.metadata.json"), "utf8")).toBe(
      initialMetadata,
    );
    expect((await stat(path.join(root, "canonical/data.raw"))).mtimeMs).toBe(rawMtime);
    expect((await stat(path.join(root, "canonical/data.metadata.json"))).mtimeMs).toBe(
      metadataMtime,
    );

    const check = await runRefresh({
      ...common,
      check: true,
      adapters: new Map([
        ["fixture", makeAdapter({ values: [1, 2, 3] }, "new-canonical", "new-raw")],
      ]),
    });
    expect(check.mode).toBe("check");
    expect(check.status).toBe("validated");
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("normalized-v1");
  });

  it("persists sanitized per-output diffs for check mode, including missing staged outputs", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "same-data");
    await writeFile(path.join(root, "canonical/data.raw"), "old-raw");
    const adapters = new Map([
      [
        "fixture",
        async () => ({
          semanticValue: { revision: 1 },
          artifacts: [
            { path: "canonical/data.csv", bytes: Buffer.from("same-data") },
            { path: "canonical/data.raw", bytes: Buffer.from("private-new-raw") },
            { path: "canonical/data.metadata.json", bytes: Buffer.from("new-metadata") },
          ],
        }),
      ],
    ]);
    const report = await runRefresh({
      root,
      registry,
      adapters,
      check: true,
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    });
    expect(report.outputDiffs).toHaveLength(3);
    expect(report.outputDiffs.map(({ status }) => status)).toEqual([
      "unchanged",
      "added",
      "changed",
    ]);
    expect(report.outputDiffs[0]).toMatchObject({
      path: "canonical/data.csv",
      canonicalPrior: { exists: true, sha256: sha256("same-data"), byteLength: 9 },
      stagedPost: { exists: true, sha256: sha256("same-data"), byteLength: 9 },
    });
    expect(report.outputDiffs[1]).toMatchObject({
      path: "canonical/data.metadata.json",
      canonicalPrior: { exists: false, sha256: null, byteLength: null },
      status: "added",
    });
    expect(await readFile(path.join(root, "canonical/data.raw"), "utf8")).toBe("old-raw");
    await expect(readFile(path.join(root, "canonical/data.metadata.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const reports = (await readdir(path.join(root, ".data-refresh"))).filter((name) =>
      name.endsWith(`${report.runId}.json`),
    );
    const persisted = await readFile(path.join(root, ".data-refresh", reports[0]), "utf8");
    expect(JSON.parse(persisted).outputDiffs).toEqual(report.outputDiffs);
    expect(persisted).not.toContain("private-new-raw");

    await writeFile(path.join(root, "canonical/data.metadata.json"), "old-metadata");
    const partialRegistry = makeRegistry();
    partialRegistry.sources[0].outputs.push("canonical/not-staged.csv");
    const partial = new Map([
      [
        "fixture",
        async () => ({
          semanticValue: { revision: 2 },
          artifacts: [
            { path: "canonical/data.csv", bytes: Buffer.from("same-data") },
            { path: "canonical/data.raw", bytes: Buffer.from("old-raw") },
          ],
        }),
      ],
    ]);
    let failure;
    try {
      await runRefresh({
        root,
        registry: partialRegistry,
        adapters: partial,
        check: true,
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "adapter-incomplete-output" });
    const failedReport = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    expect(
      failedReport.outputDiffs.find(
        ({ path: output }) => output === "canonical/data.metadata.json",
      ),
    ).toMatchObject({
      canonicalPrior: { exists: true },
      stagedPost: { exists: false, sha256: null, byteLength: null },
      status: "removed",
    });
    expect(
      failedReport.outputDiffs.find(({ path: output }) => output === "canonical/not-staged.csv"),
    ).toMatchObject({
      canonicalPrior: { exists: false, sha256: null, byteLength: null },
      stagedPost: { exists: false, sha256: null, byteLength: null },
      status: "missing",
    });
  });

  it("marks outputs not evaluated when preflight stops before adapters run", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await mkdir(path.join(root, ".data-refresh"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "existing");
    await writeFile(
      path.join(root, ".data-refresh/publish-journal.json"),
      JSON.stringify({ version: 1, state: "publishing", entries: [] }),
    );
    let failure;
    try {
      await runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([
          [
            "fixture",
            async () => {
              throw new Error("adapter must not run before preflight");
            },
          ],
        ]),
        check: true,
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "recovery-required" });
    const failedReport = JSON.parse(await readFile(path.join(root, failure.reportPath), "utf8"));
    expect(failedReport.outputDiffs).toHaveLength(3);
    expect(failedReport.outputDiffs.map(({ status }) => status)).toEqual([
      "not-evaluated",
      "not-evaluated",
      "not-evaluated",
    ]);
    expect(failedReport.outputDiffs[0]).toMatchObject({
      path: "canonical/data.csv",
      canonicalPrior: { exists: true },
      status: "not-evaluated",
    });
  });

  it("fails closed when an unchanged source has a missing or modified canonical output", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const common = {
      root,
      registry,
      adapters: new Map([["fixture", makeAdapter({ values: [1, 2] })]]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    };
    await runRefresh(common);
    await rm(path.join(root, "canonical/data.raw"));
    await expect(runRefresh(common)).rejects.toMatchObject({ code: "canonical-output-missing" });
    await writeFile(path.join(root, "canonical/data.raw"), "restored");
    await expect(runRefresh(common)).rejects.toMatchObject({ code: "canonical-output-modified" });
  });

  it("refuses check mode when an unfinished journal exists without changing canonical files", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "old");
    await writeFile(
      path.join(root, ".data-refresh/publish-journal.json"),
      JSON.stringify({ version: 1, state: "publishing", entries: [] }),
    );
    await expect(
      runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([["fixture", makeAdapter({ values: [] })]]),
        validate: fixtureQualityValidator,
        check: true,
        preflightChanges: async () => false,
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("old");
  });

  it("rolls back all earlier renames if publish fails partway through", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh/staging"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await mkdir(path.join(root, ".data-refresh/backups"), { recursive: true });
    await writeFile(path.join(root, "canonical/a.csv"), "old-a");
    await writeFile(path.join(root, "canonical/b.csv"), "old-b");
    await writeFile(path.join(root, ".data-refresh/staging/a.new"), "new-a");
    await writeFile(path.join(root, ".data-refresh/staging/b.new"), "new-b");
    await expect(
      publishArtifacts({
        root,
        workDir: path.join(root, ".data-refresh/staging"),
        journalPath: path.join(root, ".data-refresh/publish-journal.json"),
        backupRoot: path.join(root, ".data-refresh/backups"),
        registry: registryFor(["canonical/a.csv", "canonical/b.csv"]),
        artifacts: [
          { path: "canonical/a.csv", stagedPath: ".data-refresh/staging/a.new" },
          { path: "canonical/b.csv", stagedPath: ".data-refresh/staging/b.new" },
        ],
        onRename: async (index) => {
          if (index === 0) throw new Error("fixture interruption");
        },
      }),
    ).rejects.toMatchObject({ code: "publish-failed" });
    expect(await readFile(path.join(root, "canonical/a.csv"), "utf8")).toBe("old-a");
    expect(await readFile(path.join(root, "canonical/b.csv"), "utf8")).toBe("old-b");
    expect(
      await recoverJournal({
        root,
        journalPath: path.join(root, ".data-refresh/publish-journal.json"),
        backupRoot: path.join(root, ".data-refresh/backups"),
      }),
    ).toBe(false);
  });

  it("recovers a publish interrupted by process termination after the first durable rename", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const staging = path.join(work, "staging");
    const backupRoot = path.join(work, "backups");
    const journalPath = path.join(work, "publish-journal.json");
    const registry = makeRegistry();
    const outputs = registry.sources[0].outputs;
    const oldContents = ["old-data", "old-raw", "old-metadata"];
    const newContents = ["new-data", "new-raw", "new-metadata"];
    await mkdir(staging, { recursive: true });
    await mkdir(backupRoot, { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    for (const [index, output] of outputs.entries()) {
      await writeFile(path.join(root, output), oldContents[index]);
      await writeFile(path.join(staging, `${index}.new`), newContents[index]);
    }

    const journalModule = path.resolve("scripts/data-refresh/lib/journal.mjs");
    const childScript = `
      import { pathToFileURL } from "node:url";
      const { publishArtifacts } = await import(pathToFileURL(process.argv[1]).href);
      const root = process.argv[2];
      const outputs = [
        "canonical/data.csv",
        "canonical/data.raw",
        "canonical/data.metadata.json",
      ];
      const registry = {
        sources: [{
          id: "fixture-source",
          identity: { kind: "file", statInfId: "000040499070", format: "xlsx" },
          outputs,
        }],
      };
      await publishArtifacts({
        root,
        workDir: root + "/.data-refresh/staging",
        journalPath: root + "/.data-refresh/publish-journal.json",
        backupRoot: root + "/.data-refresh/backups",
        registry,
        artifacts: outputs.map((output, index) => ({
          path: output,
          stagedPath: ".data-refresh/staging/" + index + ".new",
        })),
        onRename(index) {
          if (index === 0) process.kill(process.pid, "SIGKILL");
        },
      });
    `;
    let termination;
    try {
      execFileSync(process.execPath, [
        "--input-type=module",
        "-e",
        childScript,
        journalModule,
        root,
      ]);
    } catch (error) {
      termination = error;
    }
    expect(termination).toMatchObject({ signal: "SIGKILL" });

    expect(await readFile(path.join(root, outputs[0]), "utf8")).toBe(newContents[0]);
    expect(await readFile(path.join(root, outputs[1]), "utf8")).toBe(oldContents[1]);
    expect(await readFile(path.join(root, outputs[2]), "utf8")).toBe(oldContents[2]);
    const interruptedJournal = JSON.parse(await readFile(journalPath, "utf8"));
    expect(interruptedJournal.state).toBe("publishing");
    expect(interruptedJournal.entries.map(({ published }) => published)).toEqual([
      true,
      false,
      false,
    ]);
    const transactionBackup = path.join(backupRoot, interruptedJournal.id);
    expect((await readdir(transactionBackup)).sort()).toEqual(["0.bak", "1.bak", "2.bak"]);

    let adapterCalled = false;
    const report = await runRefresh({
      root,
      registry,
      adapters: new Map([
        [
          "fixture",
          async () => {
            adapterCalled = true;
            for (const [index, output] of outputs.entries()) {
              expect(await readFile(path.join(root, output), "utf8")).toBe(oldContents[index]);
            }
            return {
              semanticValue: { values: ["recovered"] },
              artifacts: outputs.map((output, index) => ({
                path: output,
                bytes: Buffer.from(newContents[index]),
              })),
              rawFetches: [],
              coverage: { periods: 1 },
              validationSummary: { passed: true },
            };
          },
        ],
      ]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    });
    expect(adapterCalled).toBe(true);
    expect(report.status).toBe("published");
    expect(report.outputsPublished).toEqual(outputs);
    for (const [index, output] of outputs.entries()) {
      expect(await readFile(path.join(root, output), "utf8")).toBe(newContents[index]);
    }
    await expect(readFile(journalPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readdir(transactionBackup)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readdir(backupRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not remove a target for a journal entry that was never published", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(work, "backups"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/untouched.csv"), "keep");
    await writeFile(path.join(work, "staging/untouched.new"), "new");
    const journalPath = path.join(work, "publish-journal.json");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, `backups/${id}`), { recursive: true });
    const entries = [
      journalEntry({
        path: "canonical/untouched.csv",
        staged: ".data-refresh/staging/untouched.new",
        backup: `.data-refresh/backups/${id}/0.bak`,
        targetBytes: "new",
      }),
    ];
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", entries)));
    await recoverJournal({
      root,
      journalPath,
      backupRoot: path.join(work, "backups"),
      registry: registryFor(["canonical/untouched.csv"]),
    });
    expect(await readFile(path.join(root, "canonical/untouched.csv"), "utf8")).toBe("keep");
  });

  it("recovers an atomic rename whose published marker was not persisted", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(work, "backups"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/new.csv"), "published");
    const journalPath = path.join(work, "publish-journal.json");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, `backups/${id}`), { recursive: true });
    const entries = [
      journalEntry({
        path: "canonical/new.csv",
        staged: ".data-refresh/staging/new.tmp",
        backup: `.data-refresh/backups/${id}/0.bak`,
        targetBytes: "published",
        intent: true,
      }),
    ];
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", entries)));
    await recoverJournal({
      root,
      journalPath,
      backupRoot: path.join(work, "backups"),
      registry: registryFor(["canonical/new.csv"]),
    });
    await expect(readFile(path.join(root, "canonical/new.csv"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      await recoverJournal({ root, journalPath, backupRoot: path.join(work, "backups") }),
    ).toBe(false);
  });

  it("keeps committed journal and backups untouched when a target hash is invalid", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, `backups/${id}`), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/item.csv"), "tampered");
    await writeFile(path.join(work, `backups/${id}/0.bak`), "old");
    const journalPath = path.join(work, "publish-journal.json");
    const entry = journalEntry({
      path: "canonical/item.csv",
      staged: ".data-refresh/staging/item.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "published",
      existed: true,
      intent: true,
      published: true,
    });
    const backupInfo = await stat(path.join(work, `backups/${id}/0.bak`));
    entry.metadata = {
      mode: backupInfo.mode & 0o7777,
      uid: backupInfo.uid,
      gid: backupInfo.gid,
      atimeMs: Math.trunc(backupInfo.atimeMs),
      mtimeMs: Math.trunc(backupInfo.mtimeMs),
    };
    entry.backupHash = sha256("old");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "committed", [entry])));
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/item.csv"), "utf8")).toBe("tampered");
    expect(await readFile(path.join(work, `backups/${id}/0.bak`), "utf8")).toBe("old");
    expect(await readFile(journalPath, "utf8")).toContain("committed");
  });

  it("restores original mode, ownership, and access and modification times when rolling back", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    const target = path.join(root, "canonical/item.csv");
    await writeFile(target, "old");
    await chmod(target, 0o640);
    await utimes(target, 1_704_164_645.123456, 1_704_164_645.654321);
    const original = await stat(target);
    await writeFile(path.join(work, "staging/item.new"), "new");
    await expect(
      publishArtifacts({
        root,
        workDir: path.join(work, "staging"),
        journalPath: path.join(work, "publish-journal.json"),
        backupRoot: path.join(work, "backups"),
        artifacts: [{ path: "canonical/item.csv", stagedPath: ".data-refresh/staging/item.new" }],
        registry: registryFor(["canonical/item.csv"]),
        onRename: async () => {
          throw new Error("interrupt");
        },
      }),
    ).rejects.toMatchObject({ code: "publish-failed" });
    const restored = await stat(target);
    expect(restored.mode & 0o777).toBe(0o640);
    expect(restored.uid).toBe(original.uid);
    expect(restored.gid).toBe(original.gid);
    expect(restored.atimeMs).toBeCloseTo(original.atimeMs, 2);
    expect(restored.mtimeMs).toBeCloseTo(original.mtimeMs, 2);
  });

  it("rejects a publishing journal whose published entries are not a prefix", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups", id), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/b.csv"), "published");
    const journalPath = path.join(work, "publish-journal.json");
    const first = journalEntry({
      path: "canonical/a.csv",
      staged: ".data-refresh/staging/a.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "new-a",
    });
    const second = journalEntry({
      path: "canonical/b.csv",
      staged: ".data-refresh/staging/b.new",
      backup: `.data-refresh/backups/${id}/1.bak`,
      targetBytes: "published",
      intent: true,
      published: true,
    });
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", [first, second])));
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/a.csv", "canonical/b.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/b.csv"), "utf8")).toBe("published");
    expect(await readFile(journalPath, "utf8")).toContain("publishing");
  });

  it("fails closed when an uncommitted journal is missing an original backup", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups", id), { recursive: true });
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/item.csv"), "original");
    await writeFile(path.join(work, "staging/item.new"), "staged");
    const backupPath = path.join(work, "backups", id, "0.bak");
    const originalInfo = await stat(path.join(root, "canonical/item.csv"));
    const entry = journalEntry({
      path: "canonical/item.csv",
      staged: ".data-refresh/staging/item.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "staged",
      existed: true,
    });
    entry.metadata = {
      mode: originalInfo.mode & 0o7777,
      uid: originalInfo.uid,
      gid: originalInfo.gid,
      atimeMs: originalInfo.atimeMs,
      mtimeMs: originalInfo.mtimeMs,
    };
    entry.backupHash = sha256("original");
    const journalPath = path.join(work, "publish-journal.json");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", [entry])));
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/item.csv"), "utf8")).toBe("original");
    expect(await readFile(journalPath, "utf8")).toContain("publishing");
    await expect(readFile(backupPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("resumes committed cleanup when some backups were already removed", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const backupDirectory = path.join(work, "backups", id);
    await mkdir(backupDirectory, { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    const entries = [];
    for (const [index, name] of ["a.csv", "b.csv"].entries()) {
      const original = path.join(backupDirectory, `${index}.bak`);
      await writeFile(original, `old-${name}`);
      const info = await stat(original);
      const entry = journalEntry({
        path: `canonical/${name}`,
        staged: `.data-refresh/staging/${name}.new`,
        backup: `.data-refresh/backups/${id}/${index}.bak`,
        targetBytes: `new-${name}`,
        existed: true,
        intent: true,
        published: true,
      });
      entry.metadata = {
        mode: info.mode & 0o7777,
        uid: info.uid,
        gid: info.gid,
        atimeMs: info.atimeMs,
        mtimeMs: info.mtimeMs,
      };
      entry.backupHash = sha256(`old-${name}`);
      entries.push(entry);
      await writeFile(path.join(root, entry.path), `new-${name}`);
    }
    await rm(path.join(backupDirectory, "0.bak"));
    const journalPath = path.join(work, "publish-journal.json");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "committed", entries)));
    expect(
      await recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(entries.map((entry) => entry.path)),
      }),
    ).toBe(true);
    await expect(readFile(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(backupDirectory, "1.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(path.join(root, "canonical/a.csv"), "utf8")).toBe("new-a.csv");
    expect(await readFile(path.join(root, "canonical/b.csv"), "utf8")).toBe("new-b.csv");
  });

  it("resumes committed cleanup when the transaction backup directory is already gone", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/item.csv"), "published");
    const entry = journalEntry({
      path: "canonical/item.csv",
      staged: ".data-refresh/staging/item.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "published",
      intent: true,
      published: true,
    });
    const journalPath = path.join(work, "publish-journal.json");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "committed", [entry])));
    expect(
      await recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).toBe(true);
    await expect(readFile(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(root, "canonical/item.csv"), "utf8")).toBe("published");
  });

  it("leaves malformed path-escape journals and backups untouched", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups"), { recursive: true });
    await writeFile(path.join(work, "backups/marker"), "keep");
    const journalPath = path.join(work, "publish-journal.json");
    const entry = journalEntry({
      path: "../outside",
      staged: ".data-refresh/staging/x",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "x",
    });
    await writeFile(
      journalPath,
      JSON.stringify(journalFor(id, "publishing", [entry], ["canonical/item.csv"])),
    );
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(work, "backups/marker"), "utf8")).toBe("keep");
    expect(await readFile(journalPath, "utf8")).toContain("../outside");
  });

  it("limits publication to the exact registry outputs, including ordinary data and metadata paths", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh/staging"), { recursive: true });
    await writeFile(path.join(root, ".data-refresh/staging/new"), "payload");
    for (const target of ["data/source/cpi-2025-series-map.csv", "data/unmanaged.csv"]) {
      await expect(
        publishArtifacts({
          root,
          workDir: path.join(root, ".data-refresh/staging"),
          journalPath: path.join(root, ".data-refresh/publish-journal.json"),
          backupRoot: path.join(root, ".data-refresh/backups"),
          registry: registryFor(["canonical/allowed.csv"]),
          artifacts: [{ path: target, stagedPath: ".data-refresh/staging/new" }],
        }),
      ).rejects.toMatchObject({ code: "path-not-allowlisted" });
    }
  });

  it("rejects forged, duplicate, metadata, and undeclared data targets during recovery", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups", id), { recursive: true });
    const journalPath = path.join(work, "publish-journal.json");
    const cases = [
      { label: "forged target", paths: ["data/unmanaged.csv"], current: ["canonical/allowed.csv"] },
      {
        label: "forged identity",
        paths: ["canonical/allowed.csv"],
        current: ["canonical/allowed.csv"],
        forgedIdentity: true,
      },
      {
        label: "metadata target",
        paths: ["data/source/cpi_data2025_long.metadata.json"],
        current: ["canonical/allowed.csv"],
      },
      {
        label: "ordinary data target",
        paths: ["data/source/unmanaged.csv"],
        current: ["canonical/allowed.csv"],
      },
      {
        label: "duplicate target",
        paths: ["canonical/allowed.csv", "canonical/allowed.csv"],
        current: ["canonical/allowed.csv"],
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const entries = testCase.paths.map((target, entryIndex) =>
        journalEntry({
          path: target,
          staged: `.data-refresh/staging/${index}-${entryIndex}.new`,
          backup: `.data-refresh/backups/${id}/${entryIndex}.bak`,
          targetBytes: "payload",
        }),
      );
      const declared =
        testCase.label === "forged target" ? ["data/unmanaged.csv"] : ["canonical/allowed.csv"];
      const journal = journalFor(id, "publishing", entries, declared);
      if (testCase.forgedIdentity) journal.sourceAllowlist[0].identity.statInfId = "00000002";
      await writeFile(journalPath, JSON.stringify(journal));
      await expect(
        recoverJournal({
          root,
          journalPath,
          backupRoot: path.join(work, "backups"),
          registry: registryFor(testCase.current),
        }),
      ).rejects.toMatchObject({ code: "recovery-required" });
      await rm(journalPath);
    }
  });
});
