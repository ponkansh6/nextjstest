/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ChartFilters } from '../../src/app/components/ChartFilters';

describe('ChartFilters', () => {
  const mockProps = {
    allYears: [2020, 2021, 2022],
    startYear: 2020,
    endYear: 2022,
    setStartYear: vi.fn(),
    setEndYear: vi.fn(),
  };

  it('renders correctly', () => {
    render(<ChartFilters {...mockProps} />);
    expect(screen.getByLabelText('開始年:')).toBeDefined();
    expect(screen.getByLabelText('終了年:')).toBeDefined();
  });

  it('calls setStartYear when start year is changed', () => {
    render(<ChartFilters {...mockProps} />);
    const select = screen.getByLabelText('開始年:');
    fireEvent.change(select, { target: { value: '2021' } });
    expect(mockProps.setStartYear).toHaveBeenCalledWith(2021);
  });

  it('calls setEndYear when end year is changed', () => {
    render(<ChartFilters {...mockProps} />);
    const select = screen.getByLabelText('終了年:');
    fireEvent.change(select, { target: { value: '2021' } });
    expect(mockProps.setEndYear).toHaveBeenCalledWith(2021);
  });
});
