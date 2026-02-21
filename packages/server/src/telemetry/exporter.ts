import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

export interface TelemetryEvent {
  id: string;
  sessionId: string;
  agentName: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  sequence: number;
}

export interface TelemetryExporter {
  emit(event: Omit<TelemetryEvent, 'id' | 'timestamp' | 'sequence'>): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER_SIZE = 100;

/** Maps Ash SessionEventType to platform event types. */
function mapEventType(type: string): string {
  if (type === 'tool_result') return 'tool_end';
  return type;
}

class HttpTelemetryExporter implements TelemetryExporter {
  private buffer: TelemetryEvent[] = [];
  private sequences = new Map<string, number>();
  private timer: ReturnType<typeof setInterval>;
  private instanceId = hostname();

  constructor(
    private url: string,
    private key: string,
  ) {
    this.timer = setInterval(() => {
      this.flush().catch((err) =>
        console.warn(`[telemetry] flush failed: ${err}`)
      );
    }, FLUSH_INTERVAL_MS);
    // Don't prevent process exit
    this.timer.unref();
  }

  emit(event: Omit<TelemetryEvent, 'id' | 'timestamp' | 'sequence'>): void {
    const seq = (this.sequences.get(event.sessionId) ?? 0) + 1;
    this.sequences.set(event.sessionId, seq);

    this.buffer.push({
      ...event,
      type: mapEventType(event.type),
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      sequence: seq,
    });

    // Clean up sequence counter when session ends
    if (event.type === 'lifecycle' && (event.data as any)?.status === 'ended') {
      this.sequences.delete(event.sessionId);
    }

    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush().catch((err) =>
        console.warn(`[telemetry] flush failed: ${err}`)
      );
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.key}`,
        },
        body: JSON.stringify({
          instanceId: this.instanceId,
          events: batch,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        console.warn(`[telemetry] POST ${this.url} returned ${res.status}`);
      }
    } catch (err) {
      console.warn(`[telemetry] POST failed: ${err}`);
      // Fire-and-forget: drop the batch
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}

class NoopExporter implements TelemetryExporter {
  emit(): void {}
  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

export function createTelemetryExporter(): TelemetryExporter {
  const url = process.env.ASH_TELEMETRY_URL;
  const key = process.env.ASH_TELEMETRY_KEY ?? '';

  if (!url) return new NoopExporter();

  console.log(`[telemetry] exporter enabled → ${url}`);
  return new HttpTelemetryExporter(url, key);
}
