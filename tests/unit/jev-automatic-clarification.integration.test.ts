import { execFile as execFileCallback } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const client = path.resolve("skills/jev-review/scripts/jev-request.mjs");
const initialId = "implementation";
const clarificationId = "implementation_clarification";
const criteria = {
  valid_as_defined: "Pass",
  requirements_mismatch: "Requirement mismatch",
  missing_prerequisites_info: "Missing prerequisites",
  incomplete_implementation_info: "Incomplete evidence",
  implementation_issue: "Implementation issue",
  scope_violation: "Scope violation",
  other: "Other issue",
  indeterminate: "Indeterminate",
};
const candidates = {
  choices: [
    {
      id: "fix-code",
      label: "Fix the implementation",
      finding: "A shared browser interaction has regressed.",
      affected: "Pre-push browser behavior requirement",
      evidence: "The focused browser case fails on the modified path.",
      proposedFix: "Restore the shared interaction under the current requirement.",
      remainingUncertainty: "none",
    },
    {
      id: "collect-evidence",
      label: "Collect a full-browser evidence trace",
      finding:
        "The focused browser result does not establish whether the production route regressed.",
      affected: "Pre-push browser behavior requirement",
      neededEvidence: "A production route trace for the affected interaction.",
      nextAction: "Capture the production route behavior without changing code or requirements.",
      remainingUncertainty: "Whether the failure reproduces outside the focused harness.",
    },
  ],
};

function initialRequest() {
  return {
    schemaVersion: "jev-review-initial-distribution-v3",
    model: "jev-latest",
    state: { evaluationScope: "implementation_checkpoint_validity" },
    questions: {
      [initialId]: {
        type: "choice",
        instructions: "Return the judgment and probability distribution.",
        criteria,
      },
    },
  };
}

const apiResponse = (questionId: string, choice: string) => ({
  answers: {
    [questionId]: {
      questionId,
      choice,
      confidence: 0.8,
      probabilities: {
        valid_as_defined: 0.1,
        requirements_mismatch: 0.1,
        missing_prerequisites_info: 0.1,
        incomplete_implementation_info: 0.1,
        implementation_issue: 0.4,
        scope_violation: 0.1,
        other: 0.05,
        indeterminate: 0.05,
      },
    },
  },
});

async function runClient(
  initialChoice: string,
  clarificationChoice?: string,
  candidateFile: unknown = candidates,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jev-candidate-client-"));
  const requestFile = path.join(directory, "request.json");
  const candidatesFile = path.join(directory, "candidates.json");
  await writeFile(requestFile, JSON.stringify(initialRequest()));
  await writeFile(candidatesFile, JSON.stringify(candidateFile));
  const requests: unknown[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push(body);
    const isClarification = requests.length === 2;
    const choice = isClarification ? (clarificationChoice ?? "fix-code") : initialChoice;
    const questionId = isClarification ? clarificationId : initialId;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(apiResponse(questionId, choice)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("mock server did not bind a TCP port");
  try {
    let result;
    try {
      result = await execFile(
        process.execPath,
        [client, "--request", requestFile, "--clarification-candidates", candidatesFile],
        {
          timeout: 10_000,
          env: {
            ...process.env,
            TYPESAFE_API_KEY: "unit-test-token",
            TYPESAFE_BASE_URL: `http://127.0.0.1:${address.port}/v1/systemone`,
          },
        },
      );
    } catch (error) {
      const wrapped = error instanceof Error ? error : new Error(String(error));
      throw Object.assign(wrapped, { mockRequests: requests });
    }
    return { output: JSON.parse(result.stdout), requests };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

describe("JEV automatic clarification with authored candidates", () => {
  it("maps a choice-only response to the supplied candidate diagnosis", async () => {
    const { output, requests } = await runClient("implementation_issue", "collect-evidence");
    expect(requests).toHaveLength(2);
    expect(output.decisionSummary.choice).toBe("implementation_issue");
    expect(output.automaticClarification).toMatchObject({
      selectedChoice: "collect-evidence",
      diagnosisSource: "provided_candidate",
      diagnosisStatus: "complete",
      resolution: "selected",
      effectiveVerdict: "requires_revalidation",
      diagnosis: {
        affected: "Pre-push browser behavior requirement",
        neededEvidence: "A production route trace for the affected interaction.",
      },
    });
    expect(requests[1]).toMatchObject({
      state: { effectiveVerdict: "requires_revalidation" },
    });
  }, 15_000);

  it("does not clarify an initial pass", async () => {
    const { output, requests } = await runClient("valid_as_defined");
    expect(requests).toHaveLength(1);
    expect(output.automaticClarification).toBeUndefined();
  }, 15_000);

  it("fails closed on a choice outside the supplied candidates", async () => {
    const { output, requests } = await runClient("implementation_issue", "not-offered");
    expect(requests).toHaveLength(2);
    expect(output.automaticClarification).toMatchObject({
      resolution: "unresolved",
      effectiveVerdict: "requires_revalidation",
    });
  }, 15_000);

  it("rejects incomplete local candidates before making an API request", async () => {
    const incomplete = { choices: [{ id: "only", label: "Incomplete" }] };
    await expect(runClient("implementation_issue", undefined, incomplete)).rejects.toMatchObject({
      mockRequests: [],
    });
  }, 15_000);
});
