import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Ash',
  tagline: 'Deploy and orchestrate AI agents',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  url: 'https://docs.ash-cloud.ai',
  baseUrl: '/',

  organizationName: 'ash-ai-org',
  projectName: 'ash',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: ['./plugins/llm-txt-plugin.js'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/ash-ai-org/ash/tree/main/website/',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/ash-logo.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Ash',
      logo: {
        alt: 'Ash Logo',
        src: 'img/ash-logo.png',
        style: { borderRadius: '8px', height: '32px' },
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/ash-ai-org/ash',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://ash-cloud.ai',
          label: 'Dashboard',
          position: 'right',
          className: 'navbar-dashboard-link',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started/quickstart',
            },
            {
              label: 'API Reference',
              to: '/api/overview',
            },
            {
              label: 'CLI Reference',
              to: '/cli/overview',
            },
            {
              label: 'llms.txt',
              href: 'https://docs.ash-cloud.ai/llms.txt',
            },
            {
              label: 'llms-full.txt',
              href: 'https://docs.ash-cloud.ai/llms-full.txt',
            },
            {
              label: 'openapi.json',
              href: 'https://docs.ash-cloud.ai/openapi.json',
            },
          ],
        },
        {
          title: 'SDKs',
          items: [
            { label: 'TypeScript', to: '/sdks/typescript' },
            { label: 'Python', to: '/sdks/python' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/ash-ai-org/ash',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/@ash-ai/cli',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Ash. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript', 'python', 'yaml', 'sql'],
    },
    mermaid: {
      theme: { light: 'dark', dark: 'dark' },
      options: {
        themeVariables: {
          background: '#0a0a0a',
          primaryColor: '#1a1a1a',
          secondaryColor: '#111111',
          tertiaryColor: '#0c0c0c',
          primaryBorderColor: '#ccff00',
          secondaryBorderColor: 'rgba(255, 255, 255, 0.2)',
          tertiaryBorderColor: 'rgba(255, 255, 255, 0.1)',
          lineColor: 'rgba(255, 255, 255, 0.4)',
          primaryTextColor: 'rgba(255, 255, 255, 0.9)',
          secondaryTextColor: 'rgba(255, 255, 255, 0.7)',
          tertiaryTextColor: 'rgba(255, 255, 255, 0.5)',
          textColor: 'rgba(255, 255, 255, 0.9)',
          nodeBorder: '#ccff00',
          nodeTextColor: 'rgba(255, 255, 255, 0.9)',
          mainBkg: '#1a1a1a',
          clusterBkg: '#111111',
          clusterBorder: 'rgba(255, 255, 255, 0.15)',
          actorBkg: '#1a1a1a',
          actorBorder: '#ccff00',
          actorTextColor: 'rgba(255, 255, 255, 0.9)',
          actorLineColor: 'rgba(255, 255, 255, 0.3)',
          signalColor: 'rgba(255, 255, 255, 0.7)',
          signalTextColor: 'rgba(255, 255, 255, 0.9)',
          labelBoxBkgColor: '#1a1a1a',
          labelBoxBorderColor: 'rgba(255, 255, 255, 0.2)',
          labelTextColor: 'rgba(255, 255, 255, 0.9)',
          loopTextColor: 'rgba(255, 255, 255, 0.7)',
          noteBorderColor: '#ccff00',
          noteBkgColor: 'rgba(204, 255, 0, 0.1)',
          noteTextColor: 'rgba(255, 255, 255, 0.9)',
          activationBorderColor: '#ccff00',
          activationBkgColor: 'rgba(204, 255, 0, 0.15)',
          sequenceNumberColor: '#000000',
          attributeBackgroundColorOdd: '#111111',
          attributeBackgroundColorEven: '#0c0c0c',
          edgeLabelBackground: '#0a0a0a',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: '14px',
        },
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
