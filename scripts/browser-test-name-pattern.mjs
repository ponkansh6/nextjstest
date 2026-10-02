function leafTestName(name) {
  const separator = " > ";
  const separatorIndex = name.lastIndexOf(separator);
  return separatorIndex === -1 ? name : name.slice(separatorIndex + separator.length);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function makeTestNamePattern(names, { webkit = false } = {}) {
  const escapedNames = names.map((name) => escapeRegex(leafTestName(name)));
  const alternatives = `(?:${escapedNames.join("|")})`;
  return webkit ? `(?=.*webkit)${alternatives}` : `^(?!.*-webkit).*?${alternatives}`;
}
