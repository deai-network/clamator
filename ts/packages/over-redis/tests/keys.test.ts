import { describe, it, expect } from 'vitest';
import { commandStream, replyStream, consumerGroupName, consumerName } from '../src/keys.js';

describe('redis key naming', () => {
  it('commandStream', () => {
    expect(commandStream('app', 'engine')).toBe('app:cmds:engine');
  });
  it('replyStream', () => {
    expect(replyStream('app', 'inst-1')).toBe('app:replies:inst-1');
  });
  it('consumerGroupName equals service', () => {
    expect(consumerGroupName('engine')).toBe('engine');
  });
  it('consumerName combines service and instance', () => {
    expect(consumerName('engine', 'inst-1')).toBe('engine:inst-1');
  });
});
