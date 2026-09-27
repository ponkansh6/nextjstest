export const NEXT_ROUTE_POC_HOST = "127.0.0.1";
export const DEFAULT_NEXT_ROUTE_POC_PORT = 3187;
export function parseNextRoutePocPort(rawPort: string | undefined): number {
  if (rawPort !== undefined && !/^\d+$/.test(rawPort)) {
    throw new Error("NEXT_ROUTE_POC_PORT must be an integer between 1024 and 65535.");
  }

  const port = rawPort === undefined ? DEFAULT_NEXT_ROUTE_POC_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("NEXT_ROUTE_POC_PORT must be an integer between 1024 and 65535.");
  }
  return port;
}

export const NEXT_ROUTE_POC_PORT = parseNextRoutePocPort(process.env.NEXT_ROUTE_POC_PORT);

export const NEXT_ROUTE_POC_BASE_URL = `http://${NEXT_ROUTE_POC_HOST}:${NEXT_ROUTE_POC_PORT}`;
