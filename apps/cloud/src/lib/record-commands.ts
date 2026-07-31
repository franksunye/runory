import type { RecordCommandOption } from "@runory/platform-core";
import { messages, type MessageKey } from "@/i18n/messages";

// ── Presenting the record command surface ──
//
// Availability, ordering and semantics are resolved by the server from the
// Command Contracts the Workspace was provisioned with. What is left here is
// purely visual: how a declared intent reads as weight and placement, and which
// message key carries the copy. Nothing in this module may inspect a record's
// status — that knowledge lives in the manifest.

export type CommandTone = "primary" | "secondary" | "danger";
export type CommandPlacement = "inline" | "overflow";

/**
 * Weight follows the declared semantics: the step that moves the record on leads,
 * an outcome that ends it off-spine reads as destructive, everything else is
 * available without competing for attention.
 */
export function commandTone(option: RecordCommandOption): CommandTone {
  if (option.terminal) return "danger";
  if (option.intent === "advance" && option.advancesSpine) return "primary";
  return "secondary";
}

/**
 * Administrative overrides admitted by almost any state belong behind the
 * overflow menu, so they never read as the expected next step.
 */
export function commandPlacement(option: RecordCommandOption): CommandPlacement {
  return option.intent === "escape_hatch" ? "overflow" : "inline";
}

export function commandLabel(
  option: RecordCommandOption,
  translate: (key: MessageKey) => string
): string {
  // A command that can leave the record where it is reads differently the second
  // time round: "Plan & dispatch" becomes "Add visit".
  if (!option.advancesSpine) {
    const repeat = messageKey(`workspace.command.${option.key}.repeat`);
    if (repeat) return translate(repeat);
  }
  const base = messageKey(`workspace.command.${option.key}`);
  return base ? translate(base) : humanizeCommandKey(option.key);
}

/** Null when the Command does not require a reason. */
export function commandReasonPrompt(
  option: RecordCommandOption,
  translate: (key: MessageKey) => string
): string | null {
  if (!option.requiresReason) return null;
  const declared = messageKey(`workspace.command.reason.${option.key}`);
  return translate(declared ?? "workspace.command.reasonPrompt");
}

function messageKey(candidate: string): MessageKey | null {
  return candidate in messages.en ? (candidate as MessageKey) : null;
}

function humanizeCommandKey(key: string): string {
  const action = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
  const spaced = action.replace(/[_.]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}
