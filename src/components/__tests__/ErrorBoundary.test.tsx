import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

const ProblemChild = () => {
  throw new Error('Test Explosion');
};

describe('src/components/ErrorBoundary.tsx', () => {
  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Normal Component</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal Component')).toBeDefined();
  });

  it('should render fallback error UI when a child throws an error', () => {
    // Suppress console.error in test log
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallbackTitle="Custom Error Title">
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error Title')).toBeDefined();
    expect(screen.getByText('Test Explosion')).toBeDefined();

    spy.mockRestore();
  });
});
