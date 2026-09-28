export function resource(
  type: string,
  options?: {
    id?: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, unknown>;
  }
) {
  return {
    data: {
      type,
      ...(options?.id ? { id: options.id } : {}),
      ...(options?.attributes ? { attributes: options.attributes } : {}),
      ...(options?.relationships ? { relationships: options.relationships } : {}),
    },
  };
}

export function rel(type: string, id: string) {
  return { data: { type, id } };
}

export function relList(type: string, ids: string[]) {
  return { data: ids.map((id) => ({ type, id })) };
}

export function compactAttributes(values: Record<string, unknown>) {
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) attributes[key] = value;
  }
  return attributes;
}
