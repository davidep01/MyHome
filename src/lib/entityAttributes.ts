const SENSITIVE_ATTRIBUTE = /(?:^|_)(?:access_?token|token|password|secret|credential|api_?key|authorization|cookie)(?:$|_)/i

/** HA camera/media attributes may contain signed credentials; never render them. */
export function isSensitiveEntityAttribute(key: string): boolean {
  return SENSITIVE_ATTRIBUTE.test(key.replace(/[\s-]+/g, '_'))
}
