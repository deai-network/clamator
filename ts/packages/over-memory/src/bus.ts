import type { Dispatcher } from '@clamator/protocol';

export class MemoryBus {
  private dispatchers = new Map<string, Dispatcher>();

  register(service: string, dispatch: Dispatcher): void {
    if (this.dispatchers.has(service))
      throw new Error(`service "${service}" already registered on this bus`);
    this.dispatchers.set(service, dispatch);
  }

  unregister(service: string): void {
    this.dispatchers.delete(service);
  }

  lookup(service: string): Dispatcher | undefined {
    return this.dispatchers.get(service);
  }
}
