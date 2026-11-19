import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firebase itself is stubbed: this is about how its error codes are turned
// into something a person can read, not about Firebase.
const popup = vi.fn();
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: class {},
  signInWithPopup: (...args) => popup(...args),
  signOut: vi.fn(),
}));
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));

const { signInWithGoogle } = await import('../firebase');

/**
 * Make the next sign-in attempt fail with a Firebase auth code.
 *
 * Thrown synchronously rather than returned as a rejected promise.
 * mockRejectedValue builds the rejected promise when it is called, before
 * anything awaits it, and Vitest reports that as an unhandled rejection and
 * fails the file. signInWithGoogle awaits inside a try block, so a
 * synchronous throw reaches the same catch.
 */
const failWith = (code) => {
  popup.mockImplementation(() => {
    throw Object.assign(new Error(code), { code });
  });
};

// A block body, deliberately. mockReset() returns the mock, and Vitest
// treats a function returned from beforeEach as the teardown callback, so
// the concise form made it call the mock after every test. With a throwing
// implementation set, that threw during teardown and failed four tests with
// an error that pointed at the fixture rather than at the cause.
beforeEach(() => {
  popup.mockReset();
});

describe('turning auth codes into sentences', () => {
  it('returns the user on success', async () => {
    popup.mockResolvedValue({ user: { uid: 'u1' } });
    await expect(signInWithGoogle()).resolves.toEqual({ uid: 'u1' });
  });

  it('treats a popup the user closed as a non-event', async () => {
    // They changed their mind. Showing an error for that is noise.
    failWith('auth/popup-closed-by-user');
    await expect(signInWithGoogle()).resolves.toBe(null);
  });

  it('says a misconfigured domain is not the visitors fault', async () => {
    failWith('auth/unauthorized-domain');
    await expect(signInWithGoogle()).rejects.toThrow(/not something you did/);
  });

  it('tells someone with blocked pop-ups what to change', async () => {
    failWith('auth/popup-blocked');
    await expect(signInWithGoogle()).rejects.toThrow(/Allow pop-ups/);
  });

  it('throws rather than resolving null on a real failure', async () => {
    // The whole bug: a swallowed rejection made the button look dead.
    failWith('auth/internal-error');
    await expect(signInWithGoogle()).rejects.toThrow();
  });
});
