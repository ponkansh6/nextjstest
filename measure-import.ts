import { performance } from 'perf_hooks';

const start = performance.now();
import { computeChartData } from './src/lib/clientCalculations.ts';
const end = performance.now();

console.log(`Import time: ${end - start}ms`);
console.log(computeChartData);
