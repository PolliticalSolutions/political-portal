import React from "react";
import { Link } from "react-router-dom";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled error caught by ErrorBoundary", error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="page">
        <section className="section">
          <div className="container">
            <h1>Something went wrong</h1>
            <p className="muted">
              Please reload the page. If the issue continues, return home and try again.
            </p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => window.location.reload()}>
                Reload
              </button>
              <Link className="button secondary" to="/">
                Go home
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }
}

export default ErrorBoundary;
