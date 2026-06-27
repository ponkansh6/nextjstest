// Calculate and print the first 10 Fibonacci numbers

function fibonacci(n: number): number[] {
  const fibSequence: number[] = [];
  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) {
    fibSequence.push(a);
    [a, b] = [b, a + b];
  }
  return fibSequence;
}

function main(): void {
  const n = 10;
  const fibNumbers = fibonacci(n);
  console.log("First 10 Fibonacci numbers:");
  fibNumbers.forEach((num, index) => {
    console.log(`F(${index}) = ${num}`);
  });
}

main();
