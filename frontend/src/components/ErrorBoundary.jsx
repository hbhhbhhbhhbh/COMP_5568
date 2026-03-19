import { Component } from 'react';

/**
 * Catches render errors in child (e.g. Borrow) so we show a message instead of blank.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[DeFi] ErrorBoundary caught', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ padding: '2rem', background: '#2a0a0a', border: '2px solid #ff6b6b', marginTop: '1rem' }}>
          <h2 style={{ color: '#ff6b6b', marginTop: 0 }}>Something went wrong</h2>
          <p style={{ color: '#e6e9f0', fontSize: '14px' }}>{this.state.error?.message ?? String(this.state.error)}</p>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
