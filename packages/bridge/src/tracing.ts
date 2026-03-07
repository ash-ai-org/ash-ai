import { context, propagation, trace, ROOT_CONTEXT } from '@opentelemetry/api';
import type { Context } from '@opentelemetry/api';

let sdk: { shutdown: () => Promise<void> } | null = null;

/**
 * Initialize OpenTelemetry tracing for the bridge process.
 * Lightweight — only OTLP exporter + HTTP instrumentation (for model API calls).
 * No-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set.
 */
export async function initBridgeTracing(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-grpc');
  const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');
  const { Resource } = await import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');

  const serviceName = process.env.OTEL_SERVICE_NAME || 'ash-bridge';

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  const traceExporter = new OTLPTraceExporter({ url: endpoint });

  const nodeSdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      // Auto-instrument outbound HTTP — propagates traceparent to model API
      new HttpInstrumentation(),
    ],
  });

  nodeSdk.start();
  sdk = nodeSdk;

  console.error(`[bridge-tracing] OpenTelemetry initialized → ${endpoint} (service: ${serviceName})`);
}

/**
 * Extract a parent context from a W3C traceparent string.
 * Returns ROOT_CONTEXT if traceparent is missing or invalid.
 */
export function extractTraceContext(traceparent: string | undefined): Context {
  if (!traceparent) return ROOT_CONTEXT;

  const carrier: Record<string, string> = { traceparent };
  return propagation.extract(ROOT_CONTEXT, carrier);
}

/**
 * Get a tracer instance for the bridge.
 */
export function getBridgeTracer() {
  return trace.getTracer('ash-bridge');
}

/**
 * Gracefully flush and shut down the OTEL SDK.
 */
export async function shutdownBridgeTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
