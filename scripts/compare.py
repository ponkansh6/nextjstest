#!/usr/bin/env python3

"""Calculate and print the first 10 Fibonacci numbers."""

def fibonacci(n):
    """Generate the first n Fibonacci numbers."""
    fib_sequence = []
    a, b = 0, 1
    for _ in range(n):
        fib_sequence.append(a)
        a, b = b, a + b
    return fib_sequence

def main():
    """Main function to calculate and print first 10 Fibonacci numbers."""
    n = 10
    fib_numbers = fibonacci(n)
    print("First 10 Fibonacci numbers:")
    for i, num in enumerate(fib_numbers, 1):
        print(f"F({i-1}) = {num}")

if __name__ == "__main__":
    main()