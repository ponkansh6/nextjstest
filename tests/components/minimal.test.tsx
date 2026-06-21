import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('Minimal Happy DOM test', () => {
  it('renders a simple div', () => {
    render(<div>Hello World</div>);
    expect(screen.getByText('Hello World')).toBeDefined();
  });
});
