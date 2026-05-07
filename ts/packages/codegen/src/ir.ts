export interface IrSchema {
  /** JSON Schema draft 7 (or OpenAPI 3 if configured). */
  jsonSchema: Record<string, unknown>;
  /** Stable hash of the JSON-Schema string. */
  hash: string;
}

export interface IrMethod {
  name: string;             // wire name (camelCase or kebab as defined)
  isNotification: boolean;
  params: IrSchema;
  result: IrSchema | null;  // null iff notification
}

export interface IrContract {
  service: string;          // wire service name (lowercase, kebab allowed)
  sourceFile: string;
  methods: IrMethod[];      // sorted by name for determinism
}
