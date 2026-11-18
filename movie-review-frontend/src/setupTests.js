// Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent and
// the rest) for every test file. Without this they resolve as plain Chai
// properties and fail with "Invalid Chai property", which looks like a broken
// test rather than a missing import.
import '@testing-library/jest-dom/vitest';
