import { EventEmitter } from "node:events";

export interface BusinessEvent {
  eventId: string;
  type: string;
  entityType: string;
  entityId: string;
  affectedQueries: string[];
  timestamp: string;
  payload?: Record<string, unknown>;
}

export class EventBus extends EventEmitter {
  publish(event: BusinessEvent) {
    this.emit("business-event", event);
  }
}

export const eventBus = new EventBus();
