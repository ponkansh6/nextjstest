export function assertSelectedBrowserCasesPassed(report, expectedNames) {
  if (!Array.isArray(expectedNames) || expectedNames.length === 0)
    throw new Error("Browser selection must expect at least one test.");
  if (new Set(expectedNames).size !== expectedNames.length)
    throw new Error("Browser selection contains duplicate expected test names.");
  if (!report || !Array.isArray(report.testResults))
    throw new Error("Vitest JSON report has no testResults array.");

  const assertions = report.testResults.flatMap((file) =>
    Array.isArray(file?.assertionResults) ? file.assertionResults : [],
  );
  const executed = assertions.filter((assertion) =>
    ["passed", "failed"].includes(assertion.status),
  );
  if (executed.length !== expectedNames.length)
    throw new Error(
      `Expected ${expectedNames.length} selected tests, observed ${executed.length}.`,
    );

  for (const expectedName of expectedNames) {
    const matches = executed.filter((assertion) => assertion.fullName === expectedName);
    if (matches.length !== 1)
      throw new Error(
        `Expected exactly one result for ${JSON.stringify(expectedName)}, observed ${matches.length}.`,
      );
    if (matches[0].status !== "passed")
      throw new Error(
        `Selected browser test did not pass: ${JSON.stringify(expectedName)} (${matches[0].status}).`,
      );
  }
}
