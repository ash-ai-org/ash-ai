// Custom Root.js - Overrides plugin's Root to work with routeBasePath: '/'
import React, { useEffect } from 'react';
import { useLocation } from '@docusaurus/router';
import MarkdownActionsDropdown from './MarkdownActionsDropdown';

export default function Root({ children }) {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (hash) {
      const scrollToElement = () => {
        const id = decodeURIComponent(hash.substring(1));
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          return true;
        }
        return false;
      };

      if (!scrollToElement()) {
        const timeouts = [100, 300, 500, 1000];
        timeouts.forEach(delay => {
          setTimeout(() => {
            scrollToElement();
          }, delay);
        });
        window.addEventListener('load', scrollToElement, { once: true });
      }
    }
  }, [hash]);

  // Inject dropdown button into article header
  useEffect(() => {
    const injectDropdown = () => {
      // Find the article header (works for all doc pages)
      const articleHeader = document.querySelector('article .markdown header');
      if (!articleHeader) return;

      // Check if already injected
      if (articleHeader.querySelector('.markdown-actions-container')) return;

      // Create container for the dropdown
      const container = document.createElement('div');
      container.className = 'markdown-actions-container';

      // Append to header
      articleHeader.appendChild(container);

      // Render React component into container
      import('react-dom/client').then(({ createRoot }) => {
        const root = createRoot(container);
        root.render(<MarkdownActionsDropdown pathname={pathname} />);
      });
    };

    // Try to inject after a short delay to ensure DOM is ready
    const timeouts = [0, 100, 300, 500];
    timeouts.forEach(delay => {
      setTimeout(injectDropdown, delay);
    });
  }, [pathname]);

  return <>{children}</>;
}
