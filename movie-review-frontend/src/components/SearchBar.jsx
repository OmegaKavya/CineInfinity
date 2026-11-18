/**
 * Search input with an autocomplete list.
 *
 * Presentation only: every piece of behaviour comes from useMovieSearch, so
 * the same component serves the navbar and the main search panel and the two
 * cannot drift apart. They previously had separate inputs with separate
 * handlers, and only one of them had autocomplete at all.
 *
 * The listbox carries the ARIA roles a combobox needs. The original markup
 * was a bare <ul> of <li> with click handlers, which a screen reader
 * announces as a plain list and a keyboard user cannot reach.
 */
export default function SearchBar({ search, className = '', placeholder = '🔍 Search movies…', id = 'movie-search' }) {
  const {
    query,
    suggestions,
    showSuggestions,
    activeIndex,
    onQueryChange,
    onKeyDown,
    openMovie,
    setShowSuggestions,
  } = search;

  const listId = `${id}-suggestions`;
  const open = showSuggestions && suggestions.length > 0;

  return (
    <div className="search-bar-container">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        className={className}
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setShowSuggestions(suggestions.length > 0)}
        // Deliberately on a timeout: a click on a suggestion would otherwise
        // be cancelled by the blur that closes the list before it lands.
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
      />

      {open && (
        <ul className="suggestions-dropdown" id={listId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.imdbID}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`suggestion-item ${index === activeIndex ? 'active' : ''}`}
              onMouseDown={() => openMovie(suggestion.imdbID)}
            >
              {suggestion.poster ? (
                <img
                  className="suggestion-poster"
                  src={suggestion.poster}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="suggestion-poster suggestion-poster--missing" aria-hidden="true" />
              )}
              <span className="suggestion-text">
                <span className="suggestion-title">{suggestion.title}</span>
                <span className="suggestion-meta">
                  {suggestion.year}
                  {suggestion.type ? ` · ${suggestion.type}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
