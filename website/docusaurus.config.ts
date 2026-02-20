import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Ash',
  tagline: 'Deploy and orchestrate AI agents',
  favicon: 'img/favicon.ico',

  url: 'https://ash.dev',
  baseUrl: '/',

  organizationName: 'ash-ai-org',
  projectName: 'ash',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/ash-ai-org/ash/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Ash',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          href: '/docs/api/overview',
          label: 'API',
          position: 'left',
        },
        {
          href: 'https://github.com/ash-ai-org/ash',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/' },
            { label: 'API Reference', to: '/docs/api/overview' },
            { label: 'CLI Reference', to: '/docs/cli/overview' },
          ],
        },
        {
          title: 'SDKs',
          items: [
            { label: 'TypeScript', to: '/docs/sdks/typescript' },
            { label: 'Python', to: '/docs/sdks/python' },
          ],
        },
        {
          title: 'More',
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
      copyright: `Copyright ${new Date().getFullYear()} Ash. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'python', 'yaml', 'sql', 'promql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
