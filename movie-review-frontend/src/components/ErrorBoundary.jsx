import { Component } from 'react';

/**
 * Catches a render crash so the page does not go blank.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which leaves a white screen and no way back except a reload the visitor
 * has to think of themselves. A failure in one catalogue should not take the
 * reviews with it.
 *
 * This has to be a class: there is no hook equivalent of
 * getDerivedStateFromError, and there is no plan for one.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept to the console rather than sent anywhere: there is no error
    // reporting service wired up, and pretending otherwise would be worse
    // than saying so.
    console.error('Render failed:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.handleReset);

    return (
      <div className="crash" role="alert">
        <h2>Something broke on this page.</h2>
        <p>
          That is a fault here, not something you did. Trying again often
          works; if it does not, reloading will.
        </p>
        <div className="crash__actions">
          <button type="button" className="crash__button" onClick={this.handleReset}>
            Try again
          </button>
          <button
            type="button"
            className="crash__button crash__button--quiet"
            onClick={() => window.location.assign('/')}
          >
            Back to the start
          </button>
        </div>
      </div>
    );
  }
}
