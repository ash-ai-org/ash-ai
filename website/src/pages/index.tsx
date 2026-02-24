import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header
      className={clsx('hero hero--primary')}
      style={{
        padding: '5rem 0 4rem',
        textAlign: 'center',
      }}
    >
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">
          Deploy Claude agents as production APIs — with sessions, streaming,
          sandboxing, and persistence handled for you.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Link className="button button--primary button--lg" to="/getting-started/quickstart">
            Get Started
          </Link>
          <Link className="button button--secondary button--lg" to="/api/overview">
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: 'Define agents as folders',
    description:
      'An agent is just a folder with a CLAUDE.md file. Add skills, MCP tools, and permission configs. Deploy with one command.',
  },
  {
    title: 'Production-ready API',
    description:
      'REST API with SSE streaming, session persistence, pause/resume, OpenAPI spec, and TypeScript + Python SDKs out of the box.',
  },
  {
    title: 'Sandboxed execution',
    description:
      'Each session runs in an isolated process with restricted environment, resource limits, and filesystem isolation.',
  },
];

function HomepageFeatures() {
  return (
    <section className="features">
      <div className="container">
        <div className="row" style={{ gap: '1rem' }}>
          {features.map(({ title, description }) => (
            <div className={clsx('col col--4')} key={title}>
              <div className="feature-card">
                <Heading as="h3">{title}</Heading>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <section
          style={{
            padding: '3rem 0',
            textAlign: 'center',
            backgroundColor: 'var(--ash-surface-dark)',
          }}
        >
          <div className="container">
            <Heading as="h2" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              Quick Start
            </Heading>
            <div
              style={{
                maxWidth: 600,
                margin: '1.5rem auto 2rem',
                textAlign: 'left',
              }}
            >
              <pre>
                <code>
{`npm install -g @ash-ai/cli

# Start the server
export ANTHROPIC_API_KEY=sk-ant-...
ash start

# Define and deploy an agent
mkdir my-agent
echo "You are a helpful assistant." > my-agent/CLAUDE.md
ash deploy ./my-agent --name my-agent

# Chat with it
ash session create my-agent
ash session send <SESSION_ID> "Hello!"`}
                </code>
              </pre>
            </div>
            <Link
              className="button button--primary button--lg"
              to="/getting-started/quickstart"
            >
              Full Quickstart Guide
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
