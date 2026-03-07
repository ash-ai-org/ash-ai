import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for OpenTelemetry tracing initialization.
 * Verifies opt-in behavior: tracing is no-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set.
 */
describe('coordinator tracing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('initTracing is a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { initTracing, shutdownTracing } = await import('../telemetry/tracing.js');

    // Should not throw
    await initTracing();
    await shutdownTracing();
  });

  it('shutdownTracing is safe to call when tracing was never initialized', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { shutdownTracing } = await import('../telemetry/tracing.js');

    // Should not throw even if initTracing was never called
    await shutdownTracing();
  });

  it('tracer from @opentelemetry/api returns a no-op tracer when SDK is not initialized', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { trace } = await import('@opentelemetry/api');

    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('test-span');

    // No-op span should not throw
    span.setAttribute('key', 'value');
    span.addEvent('event');
    span.end();
  });

  it('manual span creation pattern works with no-op tracer', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { trace, SpanStatusCode } = await import('@opentelemetry/api');

    const tracer = trace.getTracer('ash-coordinator');
    let result: string | undefined;

    await tracer.startActiveSpan('ash.session.create', async (span) => {
      try {
        span.setAttribute('ash.session.id', 'test-123');
        span.setAttribute('ash.agent.name', 'test-agent');
        span.addEvent('selectBackend.start');
        span.addEvent('selectBackend.end');
        result = 'ok';
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'failed' });
      } finally {
        span.end();
      }
    });

    expect(result).toBe('ok');
  });

  it('trace context injection works with no-op propagator', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { context, propagation } = await import('@opentelemetry/api');

    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    // With no-op SDK, traceparent should not be set
    expect(carrier['traceparent']).toBeUndefined();
  });
});
