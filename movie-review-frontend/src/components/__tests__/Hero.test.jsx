// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../data/heroImages', () => ({
  heroImages: [
    { url: 'https://image.tmdb.org/t/p/original/a.jpg', title: 'La La Land', year: '2016' },
    { url: 'https://image.tmdb.org/t/p/original/b.jpg', title: 'Interstellar', year: '2014' },
    { url: 'https://image.tmdb.org/t/p/original/c.jpg', title: 'Tenet', year: '2020' },
  ],
}));

vi.mock('../SearchBar', () => ({
  default: () => <input aria-label="Search" />,
}));

const { default: Hero } = await import('../Hero');

afterEach(cleanup);

const search = { searchByTitle: vi.fn(), searching: false };

describe('Hero', () => {
  it('captions the slide that is actually showing', async () => {
    // The previous data paired real TMDb urls with the wrong titles, so the
    // caption read "La La Land" over a backdrop from a different film. The
    // caption and the active slide must come from the same entry.
    const { container } = render(
      <Hero search={search} signedIn={false} onSignIn={vi.fn()} />
    );

    const active = container.querySelector('.hero-slide.is-active');
    expect(active.style.backgroundImage).toContain('/a.jpg');
    expect(screen.getByText('La La Land')).toBeInTheDocument();
    expect(screen.getByText('2016')).toBeInTheDocument();
  });

  it('moves caption and backdrop together when a marker is clicked', async () => {
    const { container } = render(
      <Hero search={search} signedIn={false} onSignIn={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Tenet' }));

    const active = container.querySelector('.hero-slide.is-active');
    expect(active.style.backgroundImage).toContain('/c.jpg');
    expect(screen.getByText('Tenet')).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
  });

  it('marks exactly one position as selected', () => {
    render(<Hero search={search} signedIn={false} onSignIn={vi.fn()} />);
    const selected = screen
      .getAllByRole('tab')
      .filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });

  it('invites a signed-out visitor to browse rather than blocking them', () => {
    render(<Hero search={search} signedIn={false} onSignIn={vi.fn()} />);
    expect(screen.getByText(/browse freely/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('drops the sign-in prompt once signed in', () => {
    render(<Hero search={search} signedIn onSignIn={vi.fn()} />);
    expect(screen.queryByText(/browse freely/i)).toBeNull();
  });
});
