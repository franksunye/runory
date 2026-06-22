# Internationalization Architecture

Status: Accepted for Cloud v0.1
Date: 2026-06-22

## Decision

Runory is internationalized from the first Cloud release.

- Default locale: English (`en`).
- First additional locale: Simplified Chinese (`zh`).
- Locale preference is stored in the `runory_locale` cookie and shared across public and authenticated surfaces.
- Unknown, missing, or unsupported locale values always fall back to English.
- The document language is rendered server-side as `en` or `zh-CN`; switching language updates the cookie, document language, and current route without losing user state.

The v0.1 website uses unprefixed canonical URLs. Locale-specific URL prefixes and translated SEO alternates are deferred until Runory has an indexed content system. Locale selection must not be encoded in API paths.

## Code Ownership

Internationalization infrastructure lives in `apps/cloud/src/i18n`:

```text
config.ts           locale types, default, validation, cookie name
messages.ts         typed English source messages and Chinese translations
locale-provider.tsx client context, translator, preference switch
```

English is the source locale and defines the complete `MessageKey` type. Every additional locale must satisfy the same key contract at compile time. Components consume `useI18n()` and must not branch directly on browser language or maintain their own language state.

## Product Rules

1. New user-facing UI must not hard-code prose in components.
2. Stable identifiers, API error codes, role codes, object keys, status values, and database enums remain locale-neutral English codes.
3. APIs return structured codes and interpolation data. Clients translate the presentation; servers do not infer language from email or tenant data.
4. User-authored content is never machine-translated implicitly.
5. Dates, numbers, currency, plural forms, and relative time must use locale-aware `Intl` APIs.
6. Layout must tolerate at least 30% text expansion and both desktop and mobile breakpoints.
7. English and Chinese acceptance tests cover missing keys, locale persistence, `<html lang>`, navigation, forms, and critical errors.

## Module, Pack, And Template Contracts

Catalog artifacts must separate stable keys from localized presentation:

```json
{
  "id": "runory.customer",
  "name": {
    "en": "Customers",
    "zh": "客户"
  },
  "description": {
    "en": "Manage customer organizations and relationships.",
    "zh": "管理客户组织与业务关系。"
  }
}
```

English is required for every published artifact. Chinese is required for Runory-official artifacts in v0.1. The runtime falls back field-by-field to English. Database table names, object keys, field keys, permission names, and migration SQL are never localized.

Templates may localize navigation labels, dashboard titles, terminology, empty states, and onboarding copy. They may not change the underlying capability identity.

## Delivery Sequence

### Implemented foundation

- Typed `en` and `zh` locale resources.
- English default and persisted language switch.
- Server-rendered document language.
- Full public website translation for Home, Pricing, Open Source, Header, and Footer.

### v0.1 completion

- Migrate Login, Dashboard, Workspace shell, CRM Lite, Admin, Agent operations, and shared form/table components.
- Add localized API error-code mapping; retain raw request IDs for support.
- Extend Module/Pack/Template schemas with localized name and description contracts.
- Add locale tests and a missing-key CI check.

### Later

- User profile locale synchronized across devices, with Cookie as anonymous fallback.
- Locale-aware email templates and notification delivery.
- Translated documentation routes, `hreflang`, localized sitemap, and optional URL prefixes.
- Additional locales only after translation ownership and release QA are defined.

## Acceptance Gate

Cloud v0.1 is not internationalization-complete until a new user can switch between English and Chinese and complete sign-in, workspace entry, CRM Lite navigation, core CRUD, Module installation, and audit inspection without mixed-language blocking UI. English must remain fully usable when Chinese translations are incomplete.
