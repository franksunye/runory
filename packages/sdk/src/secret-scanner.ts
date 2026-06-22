import { isAbsolute } from "node:path";

interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity?: "low" | "medium" | "high" | "critical";
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "env_var", pattern: /process\.env\.(API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|JWT_SECRET|SESSION_SECRET|ENCRYPTION_KEY)/gi, severity: "medium" },
  { name: "api_key", pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']+["']/gi, severity: "high" },
  { name: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "critical" },
  { name: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g, severity: "critical" },
  { name: "aws_secret_key", pattern: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/g, severity: "critical" },
  { name: "github_token", pattern: /gh[ps]_[A-Za-z0-9]{36,}/g, severity: "critical" },
  { name: "slack_token", pattern: /xox[bp]-[A-Za-z0-9-]+/g, severity: "critical" },
  { name: "stripe_key", pattern: /sk_live_[A-Za-z0-9]+/g, severity: "critical" },
  { name: "stripe_restricted_key", pattern: /rk_live_[A-Za-z0-9]+/g, severity: "critical" },
  { name: "jwt", pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, severity: "high" },
  { name: "connection_string", pattern: /(mongodb|postgres|postgresql|mysql|redis):\/\/[^\s"']+:[^\s"']+@/g, severity: "critical" },
];

const FORBIDDEN_PATHS = [
  "../",
  "..\\",
  "/etc/",
  "/var/",
  "~/.ssh",
];

function checkPathEscape(input: string): boolean {
  // Check for path traversal patterns
  if (/\.\.[/\\]/.test(input) || isAbsolute(input)) return true;
  // URL-encoded path traversal
  if (/%2e%2e/i.test(input) || /%2f/i.test(input)) return true;
  return false;
}

export interface ScanResult {
  clean: boolean;
  findings: Array<{
    type: string;
    message: string;
    location?: string;
    severity?: string;
  }>;
}

export function scanForSecrets(content: string, filePath?: string): ScanResult {
  const findings: ScanResult["findings"] = [];

  for (const { name, pattern, severity } of SECRET_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      findings.push({
        type: name,
        message: `Potential secret detected: ${matches.length} occurrence(s) of ${name}`,
        location: filePath,
        severity,
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
          severity: "critical",
        });
      }
    }

    if (checkPathEscape(filePath)) {
      findings.push({
        type: "path_escape",
        message: "Path traversal or absolute path detected",
        location: filePath,
        severity: "critical",
      });
    }
  }

  return { clean: findings.length === 0, findings };
}
