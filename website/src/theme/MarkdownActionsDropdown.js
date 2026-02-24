import React, { useState, useRef, useEffect } from 'react';

export default function MarkdownActionsDropdown({ pathname }) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentPath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Get the markdown URL for "Open Markdown" (only works in production after build)
  const getMarkdownUrl = () => {
    if (currentPath === '/' || currentPath === '') {
      return '/intro.md';
    }
    const cleanPath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    return `${cleanPath}.md`;
  };

  const markdownUrl = getMarkdownUrl();

  // Extract page content from the DOM and convert to markdown-like format
  const extractPageContent = () => {
    const article = document.querySelector('article');
    if (!article) return null;

    // Clone to avoid modifying the actual DOM
    const clone = article.cloneNode(true);

    // Remove elements we don't want in the copy
    const elementsToRemove = clone.querySelectorAll(
      '.copy-page-dropdown, .theme-code-block button, .hash-link, nav, .pagination-nav'
    );
    elementsToRemove.forEach(el => el.remove());

    // Get the page title
    const title = document.querySelector('article h1')?.textContent?.trim() || '';

    // Process the content
    let content = '';

    // Add title
    if (title) {
      content += `# ${title}\n\n`;
    }

    // Get the markdown container
    const markdown = clone.querySelector('.markdown');
    if (markdown) {
      // Process each element
      const processNode = (node, depth = 0) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const tag = node.tagName.toLowerCase();
        const children = Array.from(node.childNodes).map(n => processNode(n, depth)).join('');

        switch (tag) {
          case 'h1':
            return ''; // Skip, we already added the title
          case 'h2':
            return `\n## ${children.trim()}\n\n`;
          case 'h3':
            return `\n### ${children.trim()}\n\n`;
          case 'h4':
            return `\n#### ${children.trim()}\n\n`;
          case 'h5':
            return `\n##### ${children.trim()}\n\n`;
          case 'h6':
            return `\n###### ${children.trim()}\n\n`;
          case 'p':
            return `${children.trim()}\n\n`;
          case 'strong':
          case 'b':
            return `**${children}**`;
          case 'em':
          case 'i':
            return `*${children}*`;
          case 'code':
            // Check if it's inline code or in a pre block
            if (node.parentElement?.tagName.toLowerCase() === 'pre') {
              return children;
            }
            return `\`${children}\``;
          case 'pre':
            const codeEl = node.querySelector('code');
            const code = codeEl ? codeEl.textContent : children;
            const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || '';
            return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
          case 'a':
            const href = node.getAttribute('href');
            return `[${children}](${href})`;
          case 'ul':
            return `\n${children}\n`;
          case 'ol':
            return `\n${children}\n`;
          case 'li':
            const parent = node.parentElement?.tagName.toLowerCase();
            const prefix = parent === 'ol' ? '1.' : '-';
            return `${prefix} ${children.trim()}\n`;
          case 'blockquote':
            return `\n> ${children.trim().replace(/\n/g, '\n> ')}\n\n`;
          case 'hr':
            return '\n---\n\n';
          case 'br':
            return '\n';
          case 'table':
            return `\n${children}\n`;
          case 'thead':
          case 'tbody':
            return children;
          case 'tr':
            const cells = Array.from(node.children).map(cell => processNode(cell, depth)).join(' | ');
            const isHeader = node.parentElement?.tagName.toLowerCase() === 'thead';
            let result = `| ${cells} |\n`;
            if (isHeader) {
              const separator = Array.from(node.children).map(() => '---').join(' | ');
              result += `| ${separator} |\n`;
            }
            return result;
          case 'th':
          case 'td':
            return children.trim();
          case 'div':
          case 'span':
          case 'section':
          case 'article':
          case 'header':
          case 'main':
            return children;
          default:
            return children;
        }
      };

      // Skip the header (h1) and process the rest
      Array.from(markdown.children).forEach(child => {
        if (child.tagName?.toLowerCase() !== 'header') {
          content += processNode(child);
        }
      });
    }

    // Clean up extra whitespace
    content = content
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+/, '')
      .replace(/\s+$/, '');

    return content;
  };

  const handleOpenMarkdown = async () => {
    // First try to open the .md file (works in production)
    try {
      const response = await fetch(markdownUrl, { method: 'HEAD' });
      if (response.ok) {
        window.open(markdownUrl, '_blank');
        setIsOpen(false);
        return;
      }
    } catch (e) {
      // File doesn't exist, fall through to extract content
    }

    // Fallback: create a blob and open it
    const content = extractPageContent();
    if (content) {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setIsOpen(false);
  };

  const handleCopyMarkdown = async () => {
    try {
      let markdown = null;

      // First try to fetch the .md file (works in production)
      try {
        const response = await fetch(markdownUrl);
        if (response.ok) {
          const text = await response.text();
          // Make sure we got actual markdown, not HTML error page
          if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
            markdown = text;
          }
        }
      } catch (e) {
        console.log('Fetch failed, using DOM extraction:', e);
      }

      // Fallback: extract from DOM
      if (!markdown) {
        console.log('Using DOM extraction fallback');
        markdown = extractPageContent();
      }

      if (markdown && markdown.length > 0) {
        await navigator.clipboard.writeText(markdown);
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
          setIsOpen(false);
        }, 2000);
      } else {
        console.error('No markdown content to copy');
        alert('Failed to copy: no content found');
      }
    } catch (error) {
      console.error('Failed to copy markdown:', error);
      alert('Failed to copy: ' + error.message);
    }
  };

  const handleQuickCopy = async () => {
    await handleCopyMarkdown();
  };

  return (
    <div ref={dropdownRef} className="copy-page-dropdown">
      <button
        className="copy-page-btn"
        onClick={handleQuickCopy}
        title="Copy page as Markdown"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>{copied ? 'Copied!' : 'Copy page'}</span>
      </button>

      <button
        className="copy-page-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg width="12" height="12" viewBox="0 0 16 16">
          <path fill="currentColor" d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396a.25.25 0 00-.177-.427H4.604a.25.25 0 00-.177.427z"/>
        </svg>
      </button>

      {isOpen && (
        <div className="copy-page-menu">
          <button onClick={handleCopyMarkdown}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy page as Markdown
          </button>
          <button onClick={handleOpenMarkdown}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
            Open Markdown
          </button>
        </div>
      )}
    </div>
  );
}
