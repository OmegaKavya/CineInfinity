import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("./firebase", () => ({
  auth: { onAuthStateChanged: vi.fn(() => vi.fn()) },
  signInWithGoogle: vi.fn(),
  logout: vi.fn(),
}));

import App from "./App";

test("renders the sign-in landing page", () => {
  render(<App />);
  expect(screen.getByText(/Welcome to CineInfinity/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /sign in to continue/i })).toBeTruthy();
});
