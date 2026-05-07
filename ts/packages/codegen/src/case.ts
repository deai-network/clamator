export function camelToSnake(s: string): string {
  // Insert underscore between lowercase/digit and uppercase: aB -> a_B
  // Insert underscore between uppercase letters: ABC -> A_B_C
  // Handle transition from multiple uppercase to uppercase followed by lowercase: ABc -> A_Bc
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function kebabAndCamelToPascal(s: string): string {
  // Split on hyphens, then PascalCase each segment (preserving inner caps if camelCase).
  return s.split('-').map(seg => seg.charAt(0).toUpperCase() + seg.slice(1)).join('');
}
