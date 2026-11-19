// Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent and
// the rest) for every test file. Without this they resolve as plain Chai
// properties and fail with "Invalid Chai property", which looks like a broken
// test rather than a missing import.
import '@testing-library/jest-dom/vitest';

// Unmount what a test rendered once it finishes.
//
// Testing Library only auto-cleans when Vitest's `globals` are enabled, and
// they are not here. Without it every render stays in document.body, so a
// query that should match one element finds one per test that has run, and
// the failure reads as a duplicate-render bug in the component.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
