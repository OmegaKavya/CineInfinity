import { useEffect, useState } from 'react';
import { heroImages } from '../data/heroImages';

/**
 * The backdrop slideshow on the signed-out landing view.
 *
 * The timer is paused when the tab is hidden. The old version kept cycling
 * and repainting in a background tab, which costs battery for something
 * nobody is looking at.
 *
 * Respects prefers-reduced-motion by holding on the first image: an
 * auto-advancing full-bleed slideshow is exactly the kind of motion that
 * setting exists to stop.
 */
export default function HeroSlider({ intervalMs = 5000 }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || heroImages.length < 2) return undefined;

    let timer = null;
    const start = () => {
      timer = setInterval(() => setIndex((i) => (i + 1) % heroImages.length), intervalMs);
    };
    const stop = () => clearInterval(timer);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return (
    <div className="slideshow" aria-hidden="true">
      {heroImages.map((image, i) => (
        <div
          key={image.url}
          className={`slide ${i === index ? 'active' : ''}`}
          style={{ backgroundImage: `url(${image.url})` }}
        />
      ))}
    </div>
  );
}
