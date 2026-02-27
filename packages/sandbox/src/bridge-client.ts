import net from 'node:net';
import { encode, decode, type BridgeCommand, type BridgeEvent, BRIDGE_READY_TIMEOUT_MS } from '@ash-ai/shared';

/**
 * Client-side of the bridge Unix socket protocol.
 * Connects to a bridge process inside a sandbox and sends commands / receives events.
 */
export class BridgeClient {
  private socket: net.Socket | null = null;
  private buffer = '';
  private listeners: Array<(event: BridgeEvent) => void> = [];

  constructor(private socketPath: string) {}

  /**
   * Connect to the bridge socket and wait for the 'ready' event.
   * Caller must ensure the bridge socket is already listening before calling this.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Bridge did not become ready within ${BRIDGE_READY_TIMEOUT_MS}ms`));
      }, BRIDGE_READY_TIMEOUT_MS);

      const sock = net.createConnection(this.socketPath);

      sock.on('connect', () => {
        this.socket = sock;
        this.setupDataHandler(sock);
      });

      sock.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Wait for 'ready' event
      const onReady = (event: BridgeEvent) => {
        if (event.ev === 'ready') {
          clearTimeout(timeout);
          this.removeListener(onReady);
          resolve();
        }
      };
      this.addListener(onReady);
    });
  }

  /**
   * Fire-and-forget: write a command to the bridge without waiting for events.
   * Used for interrupt — the running sendCommand generator will receive the result.
   */
  writeCommand(cmd: BridgeCommand): void {
    if (!this.socket) throw new Error('Not connected');
    this.socket.write(encode(cmd));
  }

  /**
   * Send a command and return an async iterable of events until 'done' or 'error'.
   */
  async *sendCommand(cmd: BridgeCommand): AsyncGenerator<BridgeEvent> {
    if (!this.socket) throw new Error('Not connected');

    this.socket.write(encode(cmd));

    // Yield events until done
    const queue: BridgeEvent[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const listener = (event: BridgeEvent) => {
      queue.push(event);
      resolve?.();
    };
    this.addListener(listener);

    try {
      while (!done) {
        if (queue.length === 0) {
          await new Promise<void>((r) => { resolve = r; });
          resolve = null;
        }

        while (queue.length > 0) {
          const event = queue.shift()!;
          yield event;
          if (event.ev === 'done' || event.ev === 'error') {
            done = true;
            break;
          }
        }
      }
    } finally {
      this.removeListener(listener);
    }
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
    this.listeners = [];
  }

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  private setupDataHandler(sock: net.Socket): void {
    sock.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (line.trim()) {
          const event = decode(line) as BridgeEvent;
          for (const listener of this.listeners) {
            listener(event);
          }
        }
      }
    });

    sock.on('close', () => {
      this.socket = null;
    });
  }

  private addListener(fn: (event: BridgeEvent) => void): void {
    this.listeners.push(fn);
  }

  private removeListener(fn: (event: BridgeEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
}
