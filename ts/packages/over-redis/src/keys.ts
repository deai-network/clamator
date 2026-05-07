export function commandStream(prefix: string, service: string): string {
  return `${prefix}:cmds:${service}`;
}

export function replyStream(prefix: string, instanceId: string): string {
  return `${prefix}:replies:${instanceId}`;
}

export function consumerGroupName(service: string): string {
  return service;
}

export function consumerName(service: string, instanceId: string): string {
  return `${service}:${instanceId}`;
}
