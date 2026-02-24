const fs = require('fs');
const path = require('path');

// Doc ordering mirrors sidebars.ts
const DOC_SECTIONS = [
  {
    section: 'Getting Started',
    docs: [
      { id: 'introduction', title: 'Introduction', desc: 'Overview of Ash and what it does' },
      { id: 'getting-started/installation', title: 'Installation', desc: 'Install the Ash CLI and SDK' },
      { id: 'getting-started/quickstart', title: 'Quickstart', desc: 'Deploy your first agent in minutes' },
      { id: 'getting-started/concepts', title: 'Key Concepts', desc: 'Agents, sessions, sandboxes, and streaming' },
    ],
  },
  {
    section: 'Guides',
    docs: [
      { id: 'guides/defining-an-agent', title: 'Defining an Agent', desc: 'Create agent folders with CLAUDE.md and config' },
      { id: 'guides/deploying-agents', title: 'Deploying Agents', desc: 'Deploy agents to an Ash server' },
      { id: 'guides/managing-sessions', title: 'Managing Sessions', desc: 'Create, resume, and end agent sessions' },
      { id: 'guides/streaming-responses', title: 'Streaming Responses', desc: 'Real-time SSE streaming from agents' },
      { id: 'guides/working-with-files', title: 'Working with Files', desc: 'Upload and download files from agent sandboxes' },
      { id: 'guides/authentication', title: 'Authentication', desc: 'API keys and multi-tenant auth' },
      { id: 'guides/monitoring', title: 'Monitoring', desc: 'Health checks, Prometheus metrics, and structured logs' },
    ],
  },
  {
    section: 'Self-Hosting',
    docs: [
      { id: 'self-hosting/docker', title: 'Docker (Default)', desc: 'Run Ash with Docker sandbox isolation' },
      { id: 'self-hosting/ec2', title: 'Deploy to AWS EC2', desc: 'Production deployment on EC2' },
      { id: 'self-hosting/gce', title: 'Deploy to Google Cloud', desc: 'Production deployment on GCE' },
      { id: 'self-hosting/configuration', title: 'Configuration Reference', desc: 'All environment variables and settings' },
      { id: 'self-hosting/multi-machine', title: 'Multi-Machine Setup', desc: 'Scale with separate server and runner nodes' },
    ],
  },
  {
    section: 'API Reference',
    docs: [
      { id: 'api/overview', title: 'API Overview', desc: 'REST API conventions and base URL' },
      { id: 'api/agents', title: 'Agents', desc: 'List and inspect deployed agents' },
      { id: 'api/sessions', title: 'Sessions', desc: 'Create, get, list, and delete sessions' },
      { id: 'api/messages', title: 'Messages', desc: 'Send messages and stream responses via SSE' },
      { id: 'api/files', title: 'Files', desc: 'Upload and download sandbox files' },
      { id: 'api/health', title: 'Health and Metrics', desc: 'Health check and Prometheus metrics endpoints' },
    ],
  },
  {
    section: 'SDKs',
    docs: [
      { id: 'sdks/typescript', title: 'TypeScript SDK', desc: 'Official TypeScript/Node.js client' },
      { id: 'sdks/python', title: 'Python SDK', desc: 'Official Python client' },
      { id: 'sdks/curl', title: 'Direct API (curl)', desc: 'Use the REST API directly with curl' },
    ],
  },
  {
    section: 'CLI Reference',
    docs: [
      { id: 'cli/overview', title: 'CLI Overview', desc: 'Command-line interface reference' },
      { id: 'cli/lifecycle', title: 'Server Lifecycle', desc: 'Start, stop, and manage the Ash server' },
      { id: 'cli/agents', title: 'Agent Commands', desc: 'Deploy, list, and remove agents' },
      { id: 'cli/sessions', title: 'Session Commands', desc: 'Manage sessions from the CLI' },
      { id: 'cli/health', title: 'Health', desc: 'Check server health from the CLI' },
    ],
  },
  {
    section: 'Architecture',
    docs: [
      { id: 'architecture/overview', title: 'System Overview', desc: 'How Ash components fit together' },
      { id: 'architecture/sandbox-isolation', title: 'Sandbox Isolation', desc: 'Docker and bubblewrap isolation model' },
      { id: 'architecture/bridge-protocol', title: 'Bridge Protocol', desc: 'Unix socket protocol between server and sandbox' },
      { id: 'architecture/session-lifecycle', title: 'Session Lifecycle', desc: 'State machine for session management' },
      { id: 'architecture/sandbox-pool', title: 'Sandbox Pool', desc: 'Pre-warming and pool management' },
      { id: 'architecture/sse-backpressure', title: 'SSE Backpressure', desc: 'Flow control for streaming responses' },
      { id: 'architecture/database', title: 'Database', desc: 'SQLite schema and persistence' },
      { id: 'architecture/scaling', title: 'Scaling Architecture', desc: 'Multi-machine scaling design' },
      { id: 'architecture/decisions', title: 'Design Decisions', desc: 'ADRs and architectural rationale' },
    ],
  },
];

const OPTIONAL_SECTIONS = [
  {
    section: 'Comparisons',
    docs: [
      { id: 'comparisons/computesdk', title: 'Ash vs ComputeSDK', desc: 'Feature comparison with Anthropic ComputeSDK' },
    ],
  },
  {
    section: 'Contributing',
    docs: [
      { id: 'contributing/development-setup', title: 'Development Setup', desc: 'Set up the monorepo for local development' },
      { id: 'contributing/project-structure', title: 'Project Structure', desc: 'Package layout and responsibilities' },
      { id: 'contributing/testing', title: 'Testing Guide', desc: 'How to write and run tests' },
      { id: 'contributing/releases', title: 'Release Process', desc: 'Changesets, versioning, and publishing' },
    ],
  },
];

const BASE_URL = 'https://docs.ash-cloud.ai';

function buildLlmTxt() {
  const lines = [];

  lines.push('# Ash');
  lines.push('');
  lines.push('> Ash is an open-source CLI, SDK, and self-hostable system for deploying and orchestrating AI agents. Deploy Claude agents as production APIs with sessions, streaming, sandboxing, and persistence.');
  lines.push('');

  for (const { section, docs } of DOC_SECTIONS) {
    lines.push(`## ${section}`);
    lines.push('');
    for (const doc of docs) {
      const url = doc.id === 'introduction' ? `${BASE_URL}/` : `${BASE_URL}/${doc.id}`;
      lines.push(`- [${doc.title}](${url}): ${doc.desc}`);
    }
    lines.push('');
  }

  lines.push('## Optional');
  lines.push('');
  for (const { section, docs } of OPTIONAL_SECTIONS) {
    for (const doc of docs) {
      const url = `${BASE_URL}/${doc.id}`;
      lines.push(`- [${doc.title}](${url}): ${doc.desc}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function stripFrontmatter(content) {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) {
      return content.slice(end + 3).trim();
    }
  }
  return content;
}

function stripMdx(content) {
  // Remove import statements
  content = content.replace(/^import\s+.*$/gm, '');

  // Remove JSX tags like <Tabs>, </Tabs>, <TabItem ...>, </TabItem>
  content = content.replace(/<\/?(?:Tabs|TabItem|details|summary)[^>]*>/gi, '');

  // Remove admonition markers (:::tip, :::note, :::warning, :::danger, :::info, :::caution)
  content = content.replace(/^:::[\w]*.*$/gm, '');

  // Clean up excessive blank lines (3+ in a row → 2)
  content = content.replace(/\n{3,}/g, '\n\n');

  return content.trim();
}

function buildLlmFullTxt(docsDir) {
  const allDocs = [...DOC_SECTIONS, ...OPTIONAL_SECTIONS];
  const parts = [];

  parts.push('# Ash Documentation');
  parts.push('');
  parts.push('> Complete documentation for Ash — an open-source system for deploying and orchestrating AI agents.');
  parts.push('');

  for (const { section, docs } of allDocs) {
    for (const doc of docs) {
      const filePath = path.join(docsDir, `${doc.id}.md`);
      if (!fs.existsSync(filePath)) {
        console.warn(`[llm-txt] Warning: ${filePath} not found, skipping`);
        continue;
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const stripped = stripMdx(stripFrontmatter(raw));

      const url = doc.id === 'introduction' ? `${BASE_URL}/` : `${BASE_URL}/${doc.id}`;
      parts.push('---');
      parts.push('');
      parts.push(`# ${doc.title}`);
      parts.push('');
      parts.push(`Source: ${url}`);
      parts.push('');
      parts.push(stripped);
      parts.push('');
    }
  }

  return parts.join('\n');
}

module.exports = function llmTxtPlugin(_context, _options) {
  return {
    name: 'llm-txt-plugin',

    async postBuild({ outDir }) {
      const docsDir = path.join(__dirname, '..', 'docs');

      const llmTxt = buildLlmTxt();
      const llmTxtPath = path.join(outDir, 'llms.txt');
      fs.writeFileSync(llmTxtPath, llmTxt, 'utf-8');
      console.log(`[llm-txt] Wrote ${llmTxtPath} (${llmTxt.length} bytes)`);

      const llmFullTxt = buildLlmFullTxt(docsDir);
      const llmFullTxtPath = path.join(outDir, 'llms-full.txt');
      fs.writeFileSync(llmFullTxtPath, llmFullTxt, 'utf-8');
      console.log(`[llm-txt] Wrote ${llmFullTxtPath} (${llmFullTxt.length} bytes)`);
    },
  };
};
