import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = { authError: '', clearAuthError: vi.fn() };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => state }));

const AuthError = (await import('../AuthError')).default;

beforeEach(() => {
  state.authError = '';
  state.clearAuthError = vi.fn();
});

describe('sign-in failure', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<AuthError />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the failure rather than only logging it', () => {
    // The original code caught the error, logged it and returned null, so
    // the button looked dead. The failure has to reach the screen.
    state.authError = 'Sign-in is not configured for this address yet.';
    render(<AuthError />);
    expect(screen.getByRole('alert')).toHaveTextContent('not configured');
  });

  it('can be dismissed', async () => {
    state.authError = 'Sign-in failed. Try again in a moment.';
    render(<AuthError />);
    await userEvent.click(screen.getByLabelText('Dismiss'));
    expect(state.clearAuthError).toHaveBeenCalled();
  });
});
