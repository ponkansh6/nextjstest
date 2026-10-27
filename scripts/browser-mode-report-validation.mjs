function collectAssertions(testResults) {
  return testResults.flatMap((file) => {
    const assertions = Array.isArray(file?.assertionResults) ? file.assertionResults : [];
    const suites = Array.isArray(file?.testResults) ? file.testResults : [];
    return [...assertions, ...suites.flatMap((suite) => suite.assertionResults ?? [])];
  });
}

export function assertBrowserModeProjectPassed(
  report,
  expectedFile,
  expectedFullNames,
  requiredFullNames = [],
) {
  if (!report || !Array.isArray(report.testResults))
    throw new Error("Vitest JSON report has no testResults array.");

  const files = report.testResults;
  if (files.length !== 1)
    throw new Error(`Expected exactly one Browser Mode test file, observed ${files.length}.`);

  const actualFile = String(files[0].name ?? files[0].testFilePath ?? "").replaceAll("\\", "/");
  if (!actualFile.endsWith(expectedFile))
    throw new Error(
      `Expected Browser Mode file ${expectedFile}, observed ${actualFile || "<missing>"}.`,
    );

  const assertions = collectAssertions(files);
  if (assertions.length === 0)
    throw new Error(`Browser Mode project ran zero tests in ${expectedFile}.`);

  if (!Array.isArray(expectedFullNames) || expectedFullNames.length === 0)
    throw new Error("Expected Browser Mode fullName manifest must be a non-empty array.");
  if (new Set(expectedFullNames).size !== expectedFullNames.length)
    throw new Error("Expected Browser Mode fullName manifest contains duplicates.");
  if (
    assertions.some(
      (assertion) => typeof assertion.fullName !== "string" || assertion.fullName.length === 0,
    )
  )
    throw new Error(`Vitest JSON report has an assertion without a fullName in ${expectedFile}.`);

  const actualFullNames = assertions.map((assertion) => assertion.fullName);
  const actualNameSet = new Set(actualFullNames);
  const expectedNameSet = new Set(expectedFullNames);
  const duplicateNames = actualFullNames.filter(
    (name, index) => actualFullNames.indexOf(name) !== index,
  );
  const missingNames = expectedFullNames.filter((name) => !actualNameSet.has(name));
  const unexpectedNames = [...actualNameSet].filter((name) => !expectedNameSet.has(name));
  if (
    actualFullNames.length !== expectedFullNames.length ||
    duplicateNames.length > 0 ||
    missingNames.length > 0 ||
    unexpectedNames.length > 0
  ) {
    throw new Error(
      [
        `Browser Mode fullName manifest mismatch in ${expectedFile}: expected ${expectedFullNames.length}, observed ${actualFullNames.length}.`,
        missingNames.length ? `Missing: ${JSON.stringify(missingNames)}.` : undefined,
        unexpectedNames.length ? `Unexpected: ${JSON.stringify(unexpectedNames)}.` : undefined,
        duplicateNames.length
          ? `Duplicate: ${JSON.stringify([...new Set(duplicateNames)])}.`
          : undefined,
        `Observed fullNames: ${JSON.stringify(actualFullNames)}.`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const incomplete = assertions.filter((assertion) => assertion.status !== "passed");
  if (incomplete.length > 0) {
    const skipped = incomplete.filter((assertion) =>
      ["pending", "skipped", "todo", "disabled"].includes(assertion.status),
    ).length;
    throw new Error(
      `Browser Mode project did not pass every test in ${expectedFile}: ${incomplete.length} not passed (${skipped} skipped/pending).`,
    );
  }

  if (!Array.isArray(requiredFullNames))
    throw new Error("Required Browser Mode test names must be an array.");
  if (new Set(requiredFullNames).size !== requiredFullNames.length)
    throw new Error("Required Browser Mode test names contain duplicates.");
  for (const fullName of requiredFullNames) {
    const matches = assertions.filter((assertion) => assertion.fullName === fullName);
    if (matches.length !== 1)
      throw new Error(
        `Expected exactly one required Pixel 7 interaction for ${JSON.stringify(fullName)}, observed ${matches.length}.`,
      );
    if (matches[0].status !== "passed")
      throw new Error(
        `Required Pixel 7 interaction did not pass: ${JSON.stringify(fullName)} (${matches[0].status}).`,
      );
  }
  return actualFullNames;
}
