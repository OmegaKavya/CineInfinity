// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Catalogue from '../Catalogue';

afterEach(cleanup);

const films = [
  { id: 1, title: 'The Lion King', year: '2019', rating: 7.1, poster: null },
  { id: 2, title: 'Aladdin', year: '2019', rating: 7.0, poster: null },
];

describe('Catalogue', () => {
  it('hands the whole film to onSelect, year included', async () => {
    // This is the guard for a real defect. Reviews are keyed by IMDb id, and
    // the id is resolved from the title through OMDb. A title alone is
    // ambiguous: OMDb answers "The Lion King" with the 1994 film and
    // "Aladdin" with the 1992 one, so selecting either 2019 poster opened the
    // wrong film and filed reviews against the wrong id. The year travelling
    // with the selection is what makes the lookup exact.
    const onSelect = vi.fn();
    render(<Catalogue title="Hollywood" items={films} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /The Lion King/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const selected = onSelect.mock.calls[0][0];
    expect(selected.title).toBe('The Lion King');
    expect(selected.year).toBe('2019');
  });

  it('shows placeholders while loading rather than collapsing', () => {
    const { container } = render(
      <Catalogue title="Anime" items={[]} loading onSelect={() => {}} />
    );
    expect(container.querySelectorAll('.poster--placeholder').length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('reports an error instead of rendering an empty row', () => {
    render(
      <Catalogue title="Bollywood" items={[]} error="Could not load." onSelect={() => {}} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load.');
  });

  it('offers a Try again that asks for the row to be loaded again', async () => {
    const onRetry = vi.fn();
    render(
      <Catalogue title="Bollywood" items={[]} error="Could not load." onRetry={onRetry} onSelect={() => {}} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the year and rating on a card', () => {
    render(<Catalogue title="Hollywood" items={films} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Aladdin/ })).toHaveTextContent('2019');
    expect(screen.getByRole('button', { name: /Aladdin/ })).toHaveTextContent('7.0');
  });
});
