// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../ErrorBoundary';

function Boom({ shouldThrow }) {
  if (shouldThrow) throw new Error('kaboom');
  return <p>Recovered content</p>;
}

let consoleError;

beforeEach(() => {
  // React logs the caught error itself; silencing keeps the output readable
  // without hiding a genuine failure, since the assertions still run.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  cleanup();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>All fine</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('All fine')).toBeInTheDocument();
  });

  it('shows a way forward instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something broke/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('does not blame the visitor', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText(/not something you did/i)).toBeInTheDocument();
  });

  it('recovers when the cause has gone', async () => {
    // The child has to read the flag as it renders. Passing it as a prop
    // bakes the failing value into the element, so resetting the boundary
    // re-renders the same doomed child and the test proves nothing.
    function Flaky() {
      if (window.__shouldThrow) throw new Error('kaboom');
      return <p>Recovered content</p>;
    }

    window.__shouldThrow = true;
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    window.__shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets a caller supply its own fallback', () => {
    render(
      <ErrorBoundary fallback={(error) => <p>Custom: {error.message}</p>}>
        <Boom shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom: kaboom')).toBeInTheDocument();
  });

  it('logs the failure so it is not swallowed silently', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );
    const logged = consoleError.mock.calls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('Render failed:')
    );
    expect(logged).toBe(true);
  });
});
