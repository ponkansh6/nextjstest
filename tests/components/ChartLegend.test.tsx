/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ChartLegend } from '../../src/app/components/ChartLegend';

describe('ChartLegend', () => {
  const mockProps = {
    title: 'Test Legend',
    keys: ['Key1', 'Key2'],
    colors: ['#000', '#fff'],
    hiddenKeys: ['Key1'],
    onToggle: vi.fn(),
  };

  it('renders legend items correctly', () => {
    render(<ChartLegend {...mockProps} />);
    expect(screen.getByText('Test Legend')).toBeDefined();
    // Assuming getLegendLabel just returns the key if not mocked properly
    expect(screen.getByText('Key1')).toBeDefined();
    expect(screen.getByText('Key2')).toBeDefined();
  });

  it('calls onToggle when a legend item is clicked', () => {
    render(<ChartLegend {...mockProps} />);
    const button = screen.getByText('Key2');
    fireEvent.click(button);
    expect(mockProps.onToggle).toHaveBeenCalledWith('Key2');
  });
});
