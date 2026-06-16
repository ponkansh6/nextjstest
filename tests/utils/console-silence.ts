import { vi } from "bun:test";
vi.spyOn(console, 'error').mockImplementation(() => {});
