import { hostname } from 'node:os';
import { VERSION } from '../version.js';

let sdk: { shutdown: () => Promise<void> } | null = null;

/**
 * Initialize OpenTelemetry distributed tracing.
 * No-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set — zero overhead.
 *
 * MUST be called before any HTTP modules are imported so the
 * auto-instrumentations can patch them.
 */
export async function initTracing(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-grpc');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
  const { Resource } = await import('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions');

  const serviceName = process.env.OTEL_SERVICE_NAME || 'ash-coordinator';

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: VERSION,
    'host.name': hostname(),
  });

  const traceExporter = new OTLPTraceExporter({ url: endpoint });

  const nodeSdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy FS instrumentation — we only want HTTP/net spans
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  nodeSdk.start();
  sdk = nodeSdk;

  console.log(`[tracing] OpenTelemetry initialized → ${endpoint} (service: ${serviceName})`);
}

/**
 * Gracefully flush and shut down the OTEL SDK.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
