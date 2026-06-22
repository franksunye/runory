const SECRET_PATTERNS = [
  { name: "env_var", pattern: /process\.env\.\w+/g },
  { name: "api_key", pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']+["']/gi },
  { name: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

const FORBIDDEN_PATHS = [
  "../",
  "..\\",
  "/etc/",
  "/var/",
  "~/.ssh",
];

export interface ScanResult {
  clean: boolean;
  findings: Array<{
    type: string;
    message: string;
    location?: string;
  }>;
}

export function scanForSecrets(content: string, filePath?: string): ScanResult {
  const findings: ScanResult["findings"] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      findings.push({
        type: name,
        message: `Potential secret detected: ${matches.length} occurrence(s) of ${name}`,
        location: filePath,
      });
    }
  }

  if (filePath) {
    for (const forbidden of FORBIDDEN_PATHS) {
      if (filePath.includes(forbidden)) {
        findings.push({
          type: "path_escape",
          message: `Path contains forbidden segment: ${forbidden}`,
          location: filePath,
        });
      }
    }
  }

  return { clean: findings.length === 0, findings };
}
