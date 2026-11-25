import { useNavigate } from 'react-router-dom';
import Hero from '../components/Hero';
import Catalogue from '../components/Catalogue';
import Trending from '../components/Trending';
import { useAuth } from '../context/AuthContext';
import { useCatalogue } from '../hooks/useCatalogue';
import { useMovieSearch } from '../hooks/useMovieSearch';

/**
 * The front page: hero, what people here are reviewing, then the catalogues.
 *
 * Selecting anything navigates rather than mutating state in place, so every
 * destination has an address and the back button works.
 */
export default function HomePage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const search = useMovieSearch();

  const hollywood = useCatalogue('hollywood');
  const bollywood = useCatalogue('bollywood');
  const anime = useCatalogue('anime');

  /**
   * A catalogue card knows a title and a year, not an IMDb id, because it
   * came from TMDb. Reviews are keyed by IMDb id, so the id has to be
   * resolved before the film has an address worth navigating to.
   */
  const openFilm = async (film) => {
    const resolved = await search.resolveByTitle?.(film.title, film.year);
    if (resolved?.imdbID) navigate(`/film/${resolved.imdbID}`);
  };

  return (
    <>
      <Hero search={search} signedIn={Boolean(user)} onSignIn={signIn} />

      <main className="app-main">
        <Trending />

        <Catalogue
          title="Anime"
          subtitle="Pick a series to see what order to watch it in."
          items={anime.items}
          loading={anime.loading}
          error={anime.error}
          onRetry={anime.retry}
          filterable
          onSelect={(item) => navigate(`/anime/${item.id}`)}
        />

        <Catalogue
          title="Hollywood"
          subtitle="Popular English-language cinema."
          items={hollywood.items}
          loading={hollywood.loading}
          error={hollywood.error}
          onRetry={hollywood.retry}
          filterable
          onSelect={openFilm}
        />

        <Catalogue
          title="Bollywood"
          subtitle="Popular Hindi-language cinema."
          items={bollywood.items}
          loading={bollywood.loading}
          error={bollywood.error}
          onRetry={bollywood.retry}
          filterable
          onSelect={openFilm}
        />
      </main>
    </>
  );
}
