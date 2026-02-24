import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'link',
      label: 'Dashboard',
      href: 'https://ash-cloud.ai',
      className: 'sidebar-link-dashboard',
    },
    {
      type: 'link',
      label: 'GitHub',
      href: 'https://github.com/ash-ai-org/ash',
      className: 'sidebar-link-github',
    },
    {
      type: 'link',
      label: 'npm',
      href: 'https://www.npmjs.com/package/@ash-ai/cli',
      className: 'sidebar-link-npm',
    },
    {
      type: 'link',
      label: 'Changelog',
      href: 'https://github.com/ash-ai-org/ash-ai/releases',
      className: 'sidebar-link-changelog',
    },
    'introduction',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quickstart',
        'getting-started/concepts',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/defining-an-agent',
        'guides/deploying-agents',
        'guides/managing-sessions',
        'guides/streaming-responses',
        'guides/working-with-files',
        'guides/authentication',
        'guides/monitoring',
      ],
    },
    {
      type: 'category',
      label: 'Self-Hosting',
      items: [
        'self-hosting/docker',
        'self-hosting/ec2',
        'self-hosting/gce',
        'self-hosting/configuration',
        'self-hosting/multi-machine',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/overview',
        'api/agents',
        'api/sessions',
        'api/messages',
        'api/files',
        'api/health',
      ],
    },
    {
      type: 'category',
      label: 'SDKs',
      items: [
        'sdks/typescript',
        'sdks/python',
        'sdks/curl',
      ],
    },
    {
      type: 'category',
      label: 'CLI Reference',
      items: [
        'cli/overview',
        'cli/lifecycle',
        'cli/agents',
        'cli/sessions',
        'cli/health',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/sandbox-isolation',
        'architecture/bridge-protocol',
        'architecture/session-lifecycle',
        'architecture/sandbox-pool',
        'architecture/sse-backpressure',
        'architecture/database',
        'architecture/scaling',
        'architecture/decisions',
      ],
    },
    {
      type: 'category',
      label: 'Comparisons',
      items: [
        'comparisons/computesdk',
      ],
    },
    {
      type: 'category',
      label: 'Contributing',
      items: [
        'contributing/development-setup',
        'contributing/project-structure',
        'contributing/testing',
        'contributing/releases',
      ],
    },
  ],
};

export default sidebars;
