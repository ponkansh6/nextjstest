import { vi } from 'vitest';
import * as fs from 'fs';

/**
 * Utility to mock fs.existsSync and fs.readFileSync for CSV data
 */
export function setupFsMock() {
  const existsSyncSpy = vi.spyOn(fs, 'existsSync');
  const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
  return { existsSyncSpy, readFileSyncSpy };
}

export function mockCsvFiles(files: Record<string, string>) {
  const { existsSyncSpy, readFileSyncSpy } = setupFsMock();
  
  existsSyncSpy.mockImplementation((path: fs.PathLike) => {
    return Object.keys(files).some(key => String(path).includes(key));
  });

  readFileSyncSpy.mockImplementation((path: fs.PathLike) => {
    for (const [key, content] of Object.entries(files)) {
      if (String(path).includes(key)) return content;
    }
    return '';
  });
}

export function mockMissingFiles() {
  const { existsSyncSpy } = setupFsMock();
  existsSyncSpy.mockReturnValue(false);
}
