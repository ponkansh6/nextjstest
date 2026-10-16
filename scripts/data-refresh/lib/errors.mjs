export class RefreshError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "RefreshError";
    this.code = code;
  }
}

export function invariant(condition, code, message) {
  if (!condition) throw new RefreshError(code, message);
}
