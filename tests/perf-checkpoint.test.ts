import { describe, it, expect, beforeAll } from 'vitest';
import { performance } from 'perf_hooks';

const checkpoints: Record<string, number> = {};

beforeAll(() => {
  checkpoints['start'] = performance.now();
});

describe('performance checkpoints', () => {
  it('measures import and setup', async () => {
    checkpoints['import_done'] = performance.now();
    
    const { filterDataByYear } = await import('../src/lib/chartUtils.ts');
    filterDataByYear([], 2000, 2020);
    
    checkpoints['execution_done'] = performance.now();
    
    console.log('--- Performance Checkpoints (ms) ---');
    console.log(`Setup/Import duration: ${checkpoints['import_done'] - checkpoints['start']}`);
    console.log(`Execution duration: ${checkpoints['execution_done'] - checkpoints['import_done']}`);
    console.log(`Total duration: ${checkpoints['execution_done'] - checkpoints['start']}`);
  });
});