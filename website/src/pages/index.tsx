import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

function HeroSection() {
  return (
    <div className="hero-section">
      <div className="hero-content">
        <div className="hero-badge">Open Source</div>
        <h1 className="hero-title">
          Deploy and orchestrate
          <br />
          <span className="hero-accent">AI agents</span>
        </h1>
        <p className="hero-description">
          Ash is a self-hostable platform for deploying Claude-powered agents as production APIs.
          Define an agent as a folder, deploy it with one command, and get sessions, streaming,
          sandboxing, and persistence out of the box.
        </p>
        <div className="hero-actions">
          <Link className="hero-btn-primary" to="/getting-started/quickstart">
            Get Started
          </Link>
          <Link className="hero-btn-secondary" to="/introduction">
            Learn More
          </Link>
        </div>
        <div className="hero-terminal">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <span className="terminal-title">Terminal</span>
          </div>
          <div className="terminal-body">
            <code>
              <span className="terminal-prompt">$</span> ash deploy ./my-agent --name my-agent
              {'\n'}
              <span className="terminal-prompt">$</span> ash chat my-agent "What is a closure in JavaScript?"
              {'\n'}
              <span className="terminal-output">A closure is a function that retains access to variables from its</span>
              {'\n'}
              <span className="terminal-output">enclosing scope, even after the outer function has returned...</span>
              {'\n'}
              <span className="terminal-session">Session: 550e8400-e29b-41d4-a716-446655440000</span>
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="home-feature-card">
      <div className="home-feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function FeaturesSection() {
  return (
    <div className="features-section">
      <div className="features-grid">
        <FeatureCard
          icon="&#x1F4E6;"
          title="Agent = Folder"
          description="Define agents as folders with a CLAUDE.md system prompt. Add skills, MCP servers, and permissions. Deploy with one command."
        />
        <FeatureCard
          icon="&#x1F512;"
          title="Sandboxed Isolation"
          description="Every session runs in an isolated sandbox with cgroups, bubblewrap, and environment allowlists. Untrusted code can't escape."
        />
        <FeatureCard
          icon="&#x1F504;"
          title="Persistent Sessions"
          description="Sessions survive server restarts, pause and resume days later, and hand off between machines. State is persisted to SQLite or Postgres."
        />
        <FeatureCard
          icon="&#x26A1;"
          title="Sub-millisecond Overhead"
          description="0.41ms per-message overhead. 44ms session creation. 1.7ms warm resume. Ash adds almost nothing on top of the LLM API latency."
        />
        <FeatureCard
          icon="&#x1F3E0;"
          title="Self-Hosted"
          description="Run on your infrastructure. Docker, EC2, ECS Fargate, or bare metal. Your data stays on your machines. No external dependencies."
        />
        <FeatureCard
          icon="&#x1F527;"
          title="SDKs & CLI"
          description="TypeScript and Python SDKs, a full-featured CLI, REST API with Swagger docs, and OpenAPI spec for code generation."
        />
      </div>
    </div>
  );
}

function ArchitectureSection() {
  return (
    <div className="architecture-section">
      <h2>How It Works</h2>
      <p className="architecture-subtitle">
        A thin wrapper around the Claude Code SDK. Ash adds orchestration &mdash; sessions, sandboxes, streaming &mdash; without reinventing the AI layer.
      </p>
      <div className="architecture-diagram">
        <div className="arch-flow">
          <div className="arch-node arch-client">
            <div className="arch-label">CLI / SDK / Browser</div>
          </div>
          <div className="arch-arrow">&rarr;</div>
          <div className="arch-node arch-server">
            <div className="arch-label">Ash Server</div>
            <div className="arch-sublabel">REST API + SSE</div>
          </div>
          <div className="arch-arrow">&rarr;</div>
          <div className="arch-node arch-sandbox">
            <div className="arch-label">Sandbox</div>
            <div className="arch-sublabel">Isolated Process</div>
          </div>
          <div className="arch-arrow">&rarr;</div>
          <div className="arch-node arch-bridge">
            <div className="arch-label">Bridge</div>
            <div className="arch-sublabel">Claude Code SDK</div>
          </div>
        </div>
      </div>
      <div className="architecture-cta">
        <Link className="hero-btn-secondary" to="/architecture/overview">
          View Architecture Docs
        </Link>
      </div>
    </div>
  );
}

function UseCasesSection() {
  return (
    <div className="use-cases-section">
      <h2>What You Can Build</h2>
      <div className="use-cases-grid">
        <div className="use-case-card">
          <h3>Customer Support Agents</h3>
          <p>Deploy agents that handle support tickets, look up account data via MCP tools, and escalate when needed.</p>
        </div>
        <div className="use-case-card">
          <h3>Code Review Bots</h3>
          <p>Agents that review PRs, run tests in sandboxes, and post structured feedback. Each review gets its own isolated session.</p>
        </div>
        <div className="use-case-card">
          <h3>Research Assistants</h3>
          <p>Persistent agents with memory that search the web, synthesize findings, and build knowledge over multiple sessions.</p>
        </div>
        <div className="use-case-card">
          <h3>Data Processing Pipelines</h3>
          <p>Agents that ingest data, run analysis in sandboxed environments, and stream results back to your application.</p>
        </div>
      </div>
      <div className="use-cases-cta">
        <Link className="hero-btn-primary" to="/getting-started/quickstart">
          Start Building
        </Link>
      </div>
    </div>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <main className="home-page">
        <HeroSection />
        <FeaturesSection />
        <ArchitectureSection />
        <UseCasesSection />
      </main>
    </Layout>
  );
}
