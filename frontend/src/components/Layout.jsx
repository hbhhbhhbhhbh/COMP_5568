import Header from './Header';
import ErrorBoundary from './ErrorBoundary';
import './Layout.css';

export default function Layout({ children }) {
  return (
    <div className="layout">
      <Header />
      <main className="main">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
