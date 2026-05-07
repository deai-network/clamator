import { describe, it, expect } from 'vitest';
import { camelToSnake, kebabAndCamelToPascal, snakeToCamel } from '../src/case.js';

describe('case conversions', () => {
  it('camelToSnake', () => {
    expect(camelToSnake('processId')).toBe('process_id');
    expect(camelToSnake('alreadySnake')).toBe('already_snake');
    expect(camelToSnake('lower')).toBe('lower');
    expect(camelToSnake('aBC')).toBe('a_b_c');
  });

  it('snakeToCamel', () => {
    expect(snakeToCamel('process_id')).toBe('processId');
    expect(snakeToCamel('alreadyCamel')).toBe('alreadyCamel');
  });

  it('kebabAndCamelToPascal', () => {
    expect(kebabAndCamelToPascal('engine')).toBe('Engine');
    expect(kebabAndCamelToPascal('excavator-engine')).toBe('ExcavatorEngine');
    expect(kebabAndCamelToPascal('processStream')).toBe('ProcessStream');
  });
});
