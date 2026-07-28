import type { JSX } from "react";
import type { FieldType } from "@runory/contracts";
import type { FieldDefinition } from "@runory/platform-core";

import TextDisplay from "./displays/TextDisplay";
import EmailDisplay from "./displays/EmailDisplay";
import PhoneDisplay from "./displays/PhoneDisplay";
import NumberDisplay from "./displays/NumberDisplay";
import DateDisplay from "./displays/DateDisplay";
import SelectDisplay from "./displays/SelectDisplay";
import BooleanDisplay from "./displays/BooleanDisplay";
import LookupDisplay from "./displays/LookupDisplay";
import UserDisplay from "./displays/UserDisplay";

/**
 * Shared props for every field display renderer.
 *
 * `FieldType` is the closed contract union from `@runory/contracts`. The
 * `FieldDefinition` row (the persisted metadata shape used across the app:
 * `fieldKey`, `label`, `type`, `validation`, ...) is owned by
 * `@runory/platform-core`, which is where every existing schema-driven
 * component imports it from; importing it from there keeps these renderers
 * structurally compatible with the pages that consume them.
 */
export interface FieldDisplayProps {
  value: unknown;
  /** Resolved display value (used by lookup/user and select option labels). */
  displayValue?: string;
  field: FieldDefinition;
  /** Active locale: `"en"` or `"zh"`. */
  locale: string;
}

/** A pure presentation renderer for a single field value. */
export type FieldDisplayRenderer = (props: FieldDisplayProps) => JSX.Element;

/**
 * Exhaustive renderer table for the closed `FieldType` union.
 *
 * `satisfies Record<FieldType, FieldDisplayRenderer>` gives compile-time
 * exhaustiveness: adding a new contract field type without a renderer is a
 * type error, and no runtime `registerFieldDisplay()` extension slot is
 * introduced. Persisted legacy/invalid types never reach this table —
 * `FieldDisplay` renders a neutral fallback for them.
 */
export const FIELD_DISPLAY_RENDERERS: Record<FieldType, FieldDisplayRenderer> = {
  text: TextDisplay,
  email: EmailDisplay,
  phone: PhoneDisplay,
  number: NumberDisplay,
  date: DateDisplay,
  select: SelectDisplay,
  boolean: BooleanDisplay,
  lookup: LookupDisplay,
  user: UserDisplay,
} satisfies Record<FieldType, FieldDisplayRenderer>;
