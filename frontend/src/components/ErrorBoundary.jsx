import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error?.message || error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <h2 className="text-xl font-serif mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">An unexpected error occurred. Try refreshing the page.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="bg-terracotta text-white px-4 py-2 rounded"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}