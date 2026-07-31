import type { ComponentType } from "react";
import type { CommandIntent } from "@runory/contracts";
import type { RecordCommandOption } from "@runory/platform-core";
import {
  ArrowRightLeft,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Navigation,
  Play,
  RotateCcw,
  Send,
  FileText,
  XCircle,
} from "lucide-react";

// ── Command icon tokens ──
//
// Manifests declare a kebab-case token (`icon: calendar`), the same vocabulary
// navigation and dashboard widgets use. This module is the only place that
// binds those tokens to Lucide components, so a new Command ships with a token
// and never needs a switch on its key in the UI.

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const COMMAND_ICON_MAP: Record<string, IconComponent> = {
  play: Play,
  send: Send,
  ban: Ban,
  check: Check,
  "check-circle": CheckCircle2,
  "x-circle": XCircle,
  "rotate-ccw": RotateCcw,
  "arrow-right-left": ArrowRightLeft,
  "clipboard-list": ClipboardList,
  calendar: Calendar,
  navigation: Navigation,
  "map-pin": MapPin,
  "file-text": FileText,
};

const INTENT_FALLBACK: Record<CommandIntent, IconComponent> = {
  advance: Play,
  decide: Check,
  escape_hatch: Ban,
};

/**
 * Resolve the glyph for a command surface option.
 *
 * Declared token wins; otherwise the intent supplies a neutral default so a
 * third-party Module that omits `icon` still renders without a client change.
 */
export function resolveCommandIcon(option: Pick<RecordCommandOption, "icon" | "intent">): IconComponent {
  if (option.icon && COMMAND_ICON_MAP[option.icon]) {
    return COMMAND_ICON_MAP[option.icon];
  }
  return INTENT_FALLBACK[option.intent] ?? Play;
}
