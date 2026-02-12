# Email Usage Overview

> **Monorepo:** `monorepo-3.0`
> **Last Updated:** 2026-01-09
> **Generated Using:** DevAC CLI code analysis tools

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [C4 Context Diagram](#c4-context-diagram)
3. [Email Service Components](#email-service-components)
4. [Email Sending Patterns](#email-sending-patterns)
5. [Template System](#template-system)
6. [Sequence Diagrams](#sequence-diagrams)
7. [Integration Details](#integration-details)
8. [Configuration Reference](#configuration-reference)
9. [Data Sourcing Methodology](#data-sourcing-methodology)

---

## Executive Summary

The ViviefCorp platform uses a multi-provider email architecture to handle different email use cases:

| Provider | Use Case | Service |
|----------|----------|---------|
| **AWS SES** | Transactional emails (verification, notifications) | `send-email` |
| **Mailchimp Transactional** | Marketing-template emails (reminders, welcome) | `reminders` |
| **Nodemailer/SMTP** | Account notifications | `remove-old-accounts` |

### Key Email Types

- **Verification emails** - Email address confirmation
- **Appointment reminders** - Session starting, unpaid reminders
- **Welcome emails** - New user onboarding
- **Account notifications** - Deletion confirmations
- **SEB membership** - Partner-specific notifications

---

## C4 Context Diagram

### System Context

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            VIVIEFCORP EMAIL SYSTEM                                │
│                                System Context                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                              ┌─────────────┐                                     │
│                              │   Patient   │                                     │
│                              │   (User)    │                                     │
│                              └──────┬──────┘                                     │
│                                     │                                            │
│                         Receives emails from                                     │
│                                     │                                            │
│                                     ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                          │   │
│   │                       VIVIEFCORP PLATFORM                                │   │
│   │                                                                          │   │
│   │   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────────┐   │   │
│   │   │ send-email  │   │  reminders  │   │   remove-old-accounts       │   │   │
│   │   │  service    │   │   service   │   │        service              │   │   │
│   │   └──────┬──────┘   └──────┬──────┘   └──────────────┬──────────────┘   │   │
│   │          │                 │                         │                   │   │
│   └──────────┼─────────────────┼─────────────────────────┼───────────────────┘   │
│              │                 │                         │                       │
│              ▼                 ▼                         ▼                       │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐         │
│   │    AWS SES      │  │    Mailchimp    │  │   SMTP (AWS SES)        │         │
│   │  (eu-west-1)    │  │  Transactional  │  │   via Nodemailer        │         │
│   │                 │  │                 │  │                         │         │
│   │  - SendEmail    │  │  - Templates    │  │  - Pooled connections   │         │
│   │  - Dedicated IP │  │  - Campaigns    │  │  - TLS encryption       │         │
│   └─────────────────┘  └─────────────────┘  └─────────────────────────┘         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Email Service Components

### Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EMAIL SERVICE CONTAINERS                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         send-email Service                                 │  │
│  │                                                                            │  │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐    │  │
│  │  │  API Gateway    │───▶│  Lambda Handler │───▶│   Template Engine   │    │  │
│  │  │  (REST API)     │    │   (app.ts)      │    │   (templates/)      │    │  │
│  │  └─────────────────┘    └────────┬────────┘    └─────────────────────┘    │  │
│  │                                  │                                         │  │
│  │                                  ▼                                         │  │
│  │                         ┌─────────────────┐                                │  │
│  │                         │    AWS SES v2   │                                │  │
│  │                         │  (eu-west-1)    │                                │  │
│  │                         └─────────────────┘                                │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                          reminders Service                                 │  │
│  │                                                                            │  │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐    │  │
│  │  │  CloudWatch     │───▶│  Lambda Handler │───▶│  Contentful         │    │  │
│  │  │  Scheduled      │    │  (reminders.ts) │    │  Templates          │    │  │
│  │  └─────────────────┘    └────────┬────────┘    └─────────────────────┘    │  │
│  │                                  │                                         │  │
│  │                                  ▼                                         │  │
│  │                         ┌─────────────────┐                                │  │
│  │                         │    Mailchimp    │                                │  │
│  │                         │  Transactional  │                                │  │
│  │                         └─────────────────┘                                │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     remove-old-accounts Service                            │  │
│  │                                                                            │  │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐    │  │
│  │  │  Scheduled      │───▶│  Lambda Handler │───▶│  Email Templates    │    │  │
│  │  │  Event          │    │  (handlers/)    │    │  (i18n translated)  │    │  │
│  │  └─────────────────┘    └────────┬────────┘    └─────────────────────┘    │  │
│  │                                  │                                         │  │
│  │                                  ▼                                         │  │
│  │                         ┌─────────────────┐                                │  │
│  │                         │   Nodemailer    │                                │  │
│  │                         │   (SMTP/SES)    │                                │  │
│  │                         └─────────────────┘                                │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Component Summary

| Service | Location | Email Provider | Trigger |
|---------|----------|----------------|---------|
| `send-email` | `services/send-email/` | AWS SES v2 | API Gateway (REST) |
| `reminders` | `services/reminders/` | Mailchimp Transactional | CloudWatch Schedule |
| `remove-old-accounts` | `services/remove-old-accounts/` | Nodemailer (SMTP) | Scheduled Event |

---

## Email Sending Patterns

### Pattern 1: Direct SES (send-email Service)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        PATTERN 1: DIRECT SES SENDING                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Client Request                                                                 │
│        │                                                                         │
│        ▼                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ POST /send-email                                                         │   │
│   │ {                                                                        │   │
│   │   "email": "patient@example.com",                                        │   │
│   │   "template": "verifyEmail",                                             │   │
│   │   "country": "SWE",                                                      │   │
│   │   "language": "SV",                                                      │   │
│   │   "params": { "token": "...", "countryId": 1 }                          │   │
│   │ }                                                                        │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         Lambda Handler (app.ts)                          │   │
│   │                                                                          │   │
│   │  1. Parse request body                                                   │   │
│   │  2. Validate email address                                               │   │
│   │  3. Get template by name/country/language                                │   │
│   │  4. Get reply-to email by country                                        │   │
│   │  5. Send via SESv2Client                                                 │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                              AWS SES v2                                  │   │
│   │                                                                          │   │
│   │  SendEmailCommand({                                                      │   │
│   │    FromEmailAddress: "noreply@viviefcorp.com",                           │   │
│   │    Destination: { ToAddresses: ["patient@example.com"] },               │   │
│   │    ReplyToAddresses: ["support.se@viviefcorp.com"],                      │   │
│   │    Content: { Simple: { Subject, Body: { Html, Text } } }               │   │
│   │  })                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Pattern 2: Mailchimp Transactional (reminders Service)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                   PATTERN 2: MAILCHIMP TRANSACTIONAL                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   CloudWatch Schedule (e.g., every 15 minutes)                                  │
│        │                                                                         │
│        ▼                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                    reminders Lambda Handler                              │   │
│   │                                                                          │   │
│   │  sendReminders()                                                         │   │
│   │    ├── sendStartingSoonReminders()                                       │   │
│   │    ├── sendStartingSoonUnpaidReminders()                                 │   │
│   │    ├── sendStartingTomorrowReminders()                                   │   │
│   │    ├── sendStartingTomorrowUnpaidReminders()                             │   │
│   │    ├── sendStartingWithinTwoHoursReminders()                             │   │
│   │    └── sendStartingTheDayAfterTomorrowUnpaidReminders()                  │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                        Template Resolution                               │   │
│   │                                                                          │   │
│   │  1. Query Contentful for reminder templates                              │   │
│   │  2. Match template by: templateName + market + language                  │   │
│   │     Example: "welcomeEmail-SE-sv"                                        │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                      Mailchimp Integration                               │   │
│   │                                                                          │   │
│   │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│   │  │ Marketing API                                                    │    │   │
│   │  │  - List campaigns                                                │    │   │
│   │  │  - Get campaign content (HTML/text)                              │    │   │
│   │  └─────────────────────────────────────────────────────────────────┘    │   │
│   │                                  │                                       │   │
│   │                                  ▼                                       │   │
│   │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│   │  │ Transactional API                                                │    │   │
│   │  │  - Sync template (create/update if changed)                      │    │   │
│   │  │  - Render template with merge vars                               │    │   │
│   │  │  - Send email via messages.send()                                │    │   │
│   │  └─────────────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Pattern 3: SMTP via Nodemailer

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      PATTERN 3: SMTP VIA NODEMAILER                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Scheduled Event (account cleanup)                                             │
│        │                                                                         │
│        ▼                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                  remove-old-accounts Handler                             │   │
│   │                                                                          │   │
│   │  emailNotifications/                                                     │   │
│   │    ├── emailConfig.ts    → createTransporter()                          │   │
│   │    ├── emailTemplates/   → removeAccountNotification                    │   │
│   │    └── getReplyToEmail.ts → country-specific reply addresses            │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         Nodemailer Transport                             │   │
│   │                                                                          │   │
│   │  nodemailer.createTransport({                                            │   │
│   │    pool: true,                          // Connection pooling            │   │
│   │    host: "email-smtp.eu-west-1.amazonaws.com",                           │   │
│   │    port: 2465,                          // TLS port                      │   │
│   │    secure: true,                        // Use TLS                       │   │
│   │    auth: {                                                               │   │
│   │      user: process.env.SMTP_AUTH_USER,                                   │   │
│   │      pass: await getSecret("smtp-password")                              │   │
│   │    }                                                                     │   │
│   │  })                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Template System

### Template Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          TEMPLATE ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    send-email Service Templates                          │    │
│  │                    (services/send-email/src/templates/)                  │    │
│  │                                                                          │    │
│  │  templates/                                                              │    │
│  │    ├── index.ts           → Template registry & getTemplate()           │    │
│  │    ├── types.ts           → EmailTemplateCountriesLanguages<T>          │    │
│  │    ├── config.ts          → getEmailTemplateByCountryAndLanguage()      │    │
│  │    ├── translations/      → Per-country, per-language strings           │    │
│  │    │   ├── sv-SWE.ts                                                    │    │
│  │    │   ├── en-SWE.ts                                                    │    │
│  │    │   ├── no-NOR.ts                                                    │    │
│  │    │   └── en-NOR.ts                                                    │    │
│  │    │                                                                     │    │
│  │    ├── verifyEmail.ts     → Email verification template                 │    │
│  │    ├── accountDeletionCS.ts → Customer support deletion notice          │    │
│  │    ├── accountDeletionClient.ts → Client deletion confirmation          │    │
│  │    ├── sebNotifyEmail.ts  → SEB partner notification                    │    │
│  │    └── sebMembershipActivated.ts → SEB membership activation            │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    reminders Service Templates                           │    │
│  │                                                                          │    │
│  │  Template Source: Mailchimp Marketing Campaigns                          │    │
│  │                                                                          │    │
│  │  Template ID Format: {templateName}-{market}-{language}                  │    │
│  │    Examples:                                                             │    │
│  │      - welcomeEmail-SE-sv                                                │    │
│  │      - welcomeEmail-SE-en                                                │    │
│  │      - welcomeEmail-NO-no                                                │    │
│  │                                                                          │    │
│  │  Contentful Templates:                                                   │    │
│  │    - SESSION_STARTING        → "Your session is starting soon"          │    │
│  │    - SESSION_TOMORROW        → "Your session is tomorrow"               │    │
│  │    - SESSION_WITHIN_TWO_HOURS → "Your session starts in 2 hours"        │    │
│  │    - NO_PAYMENT_SOON         → "Payment needed for upcoming session"    │    │
│  │    - NO_PAYMENT              → "Payment reminder"                        │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Available Templates

| Template Name | Service | Params | Markets |
|---------------|---------|--------|---------|
| `verifyEmail` | send-email | token, language, countryId | SWE, NOR |
| `accountDeletionCS` | send-email | (various) | SWE, NOR, NLD, FRA, GBR |
| `accountDeletionClient` | send-email | (none) | SWE, NOR, NLD, FRA, GBR |
| `sebNotifyEmail` | send-email | (SEB-specific) | SWE |
| `sebMembershipActivated` | send-email | (SEB-specific) | SWE |
| `welcomeEmail` | reminders | firstName, lastName | SE, NO |
| `SESSION_STARTING` | reminders | (slot details) | All |
| `NO_PAYMENT` | reminders | (payment details) | All |

---

## Sequence Diagrams

### Email Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       EMAIL VERIFICATION SEQUENCE                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  User        Frontend        API             send-email        AWS SES          │
│   │             │             │                  │                │             │
│   │  Register   │             │                  │                │             │
│   │────────────▶│             │                  │                │             │
│   │             │             │                  │                │             │
│   │             │ POST /auth  │                  │                │             │
│   │             │────────────▶│                  │                │             │
│   │             │             │                  │                │             │
│   │             │             │ Generate token   │                │             │
│   │             │             │─────────────────▶│                │             │
│   │             │             │                  │                │             │
│   │             │             │         POST /send-email          │             │
│   │             │             │         {template:"verifyEmail"}  │             │
│   │             │             │─────────────────▶│                │             │
│   │             │             │                  │                │             │
│   │             │             │                  │ Get template   │             │
│   │             │             │                  │ (SWE/SV)       │             │
│   │             │             │                  │                │             │
│   │             │             │                  │ SendEmailCmd   │             │
│   │             │             │                  │───────────────▶│             │
│   │             │             │                  │                │             │
│   │             │             │                  │    200 OK      │             │
│   │             │             │                  │◀───────────────│             │
│   │             │             │                  │                │             │
│   │             │      200 OK │                  │                │             │
│   │             │◀────────────│                  │                │             │
│   │             │             │                  │                │             │
│   │  ◀───────────────────────────────────────────────────────────────────────   │
│   │          Email delivered to inbox                                            │
│   │                                                                              │
│   │  Click verification link                                                     │
│   │─────────────────────────────▶                                               │
│   │             │             │                  │                │             │
│   │             │ GET /verify?token=...         │                │             │
│   │             │────────────▶│                  │                │             │
│   │             │             │                  │                │             │
│   │             │    Email verified             │                │             │
│   │             │◀────────────│                  │                │             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Reminder Email Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         REMINDER EMAIL SEQUENCE                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  CloudWatch   reminders       Database      Contentful     Mailchimp            │
│  Schedule     Lambda            │              │              │                 │
│     │            │              │              │              │                 │
│     │ Trigger    │              │              │              │                 │
│     │───────────▶│              │              │              │                 │
│     │            │              │              │              │                 │
│     │            │ findSlots    │              │              │                 │
│     │            │ StartingIn   │              │              │                 │
│     │            │ Interval()   │              │              │                 │
│     │            │─────────────▶│              │              │                 │
│     │            │              │              │              │                 │
│     │            │   Slots[]    │              │              │                 │
│     │            │◀─────────────│              │              │                 │
│     │            │              │              │              │                 │
│     │            │      getReminderTemplate()  │              │                 │
│     │            │─────────────────────────────▶              │                 │
│     │            │              │              │              │                 │
│     │            │      Template content       │              │                 │
│     │            │◀─────────────────────────────              │                 │
│     │            │              │              │              │                 │
│     │            │              │    sendMailchimpTransactionalEmail()          │
│     │            │──────────────────────────────────────────▶│                 │
│     │            │              │              │              │                 │
│     │            │              │              │   Sync template (if changed)   │
│     │            │              │              │              │────────┐        │
│     │            │              │              │              │        │        │
│     │            │              │              │              │◀───────┘        │
│     │            │              │              │              │                 │
│     │            │              │              │   Render + Send                │
│     │            │              │              │              │────────┐        │
│     │            │              │              │              │        │        │
│     │            │              │              │              │◀───────┘        │
│     │            │              │              │              │                 │
│     │            │              │     Send result             │                 │
│     │            │◀──────────────────────────────────────────│                 │
│     │            │              │              │              │                 │
│     │  Complete  │              │              │              │                 │
│     │◀───────────│              │              │              │                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Details

### AWS SES Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Region | `eu-west-1` | Ireland - email identities hosted here |
| Dedicated IPs | Yes | Production uses dedicated IP configuration |
| Configuration Set | `dedicated-ip` | For reliable delivery |
| From Address | SSM: `/emailAddresses/NO_REPLY` | Environment-specific |

### Mailchimp Configuration

| API | Purpose | Rate Limit |
|-----|---------|------------|
| Marketing API | Template source, campaign management | 10 concurrent connections |
| Transactional API | Email sending, template rendering | Higher limits |

### Reply-To Addresses by Country

```typescript
// From getReplyToEmail.ts
const countryToEmail: Record<CodeISO3, string> = {
  SWE: process.env.REPLY_TO_EMAIL_SWE,  // support.se@viviefcorp.com
  NOR: process.env.REPLY_TO_EMAIL_NOR,  // support.no@viviefcorp.com
  NLD: process.env.REPLY_TO_EMAIL_NLD,  // support.nl@viviefcorp.com
  FRA: process.env.REPLY_TO_EMAIL_FRA,  // support.fr@viviefcorp.com
  GBR: process.env.REPLY_TO_EMAIL_GBR,  // support.uk@viviefcorp.com
};
```

---

## Configuration Reference

### Environment Variables

#### send-email Service

| Variable | Source | Description |
|----------|--------|-------------|
| `EMAIL_ADDRESS_FROM` | SSM | Sender "from" address |
| `REPLY_TO_EMAIL_SWE` | SSM | Sweden reply-to address |
| `REPLY_TO_EMAIL_NOR` | SSM | Norway reply-to address |
| `SMTP_HOST` | Hardcoded | `email-smtp.eu-west-1.amazonaws.com` |
| `SMTP_PORT` | Hardcoded | `2465` |
| `SMTP_AUTH_USER` | SSM | SMTP authentication user |
| `SMTP_AUTH_PASSWORD_SECRET` | Secrets Manager | SMTP password |
| `VALIDATE_EMAIL_PAGE_URL` | SSM | Verification landing page URL |

#### reminders Service

| Variable | Source | Description |
|----------|--------|-------------|
| `MAILCHIMP_TRANSACTIONAL_API_KEY` | Secrets Manager | Transactional API key |
| `MAILCHIMP_API_KEY` | Secrets Manager | Marketing API key |
| `MAILCHIMP_PREFIX` | Secrets Manager | Server prefix (e.g., us22) |

### SSM Parameters

```
/emailAddresses/
├── NO_REPLY                    → noreply@viviefcorp.com
├── REPLY_TO_SWE               → support.se@viviefcorp.com
├── REPLY_TO_NOR               → support.no@viviefcorp.com
├── REPLY_TO_NLD               → support.nl@viviefcorp.com
├── REPLY_TO_FRA               → support.fr@viviefcorp.com
├── REPLY_TO_GBR               → support.uk@viviefcorp.com
└── AUTH_USER                  → SMTP authentication username

/sendEmail/
└── VALIDATE_EMAIL_PAGE_URL    → https://app.viviefcorp.com/verify-email
```

---

## Data Sourcing Methodology

### How This Documentation Was Generated

This documentation was generated using **DevAC CLI** code analysis tools. The following approach was used:

### 1. Symbol Discovery Queries

```bash
# Find all email-related symbols
devac hub query "SELECT name, kind, file_path FROM nodes
                 WHERE LOWER(name) LIKE '%email%'
                 ORDER BY kind, name LIMIT 100"
```

**Purpose:** Identified 100+ email-related functions, classes, types, and modules across the codebase.

**Key Findings:**
- `sendEmail` function in multiple services
- `sendMailchimpTransactionalEmail` for Mailchimp integration
- Email template types and factories
- Email verification flow components

### 2. Mail Provider Discovery

```bash
# Find mail-related symbols (Mailchimp, SMTP)
devac hub query "SELECT name, kind, file_path FROM nodes
                 WHERE LOWER(name) LIKE '%mail%'
                 AND LOWER(name) NOT LIKE '%email%'
                 ORDER BY kind, name LIMIT 50"
```

**Purpose:** Discovered Mailchimp integration patterns and nodemailer usage.

**Key Findings:**
- Mailchimp Marketing and Transactional API clients
- Template synchronization logic
- Nodemailer SMTP transport configuration

### 3. File Structure Analysis

```bash
# Find email-related files
devac hub query "SELECT DISTINCT file_path FROM nodes
                 WHERE file_path LIKE '%email%' OR file_path LIKE '%mail%'
                 ORDER BY file_path LIMIT 50"
```

**Purpose:** Mapped file organization to understand service boundaries.

**Key Findings:**
- `services/send-email/` - Dedicated email service
- `services/reminders/` - Reminder email logic
- `shared/mail/` - Shared Mailchimp integration
- `services/remove-old-accounts/` - Account notification emails

### 4. External Dependencies

```bash
# Find email-related external packages
devac hub query "SELECT DISTINCT module_specifier FROM external_refs
                 WHERE LOWER(module_specifier) LIKE '%ses%'
                 OR LOWER(module_specifier) LIKE '%mail%'
                 ORDER BY module_specifier LIMIT 30"
```

**Purpose:** Identified third-party integrations.

**Key Findings:**
- `@aws-sdk/client-sesv2` - AWS SES integration
- `@mailchimp/mailchimp_transactional` - Transactional emails
- `@mailchimp/mailchimp_marketing` - Template management
- `nodemailer` - SMTP transport

### 5. Template Discovery

```bash
# Find email template definitions
devac hub query "SELECT name, kind, file_path FROM nodes
                 WHERE name LIKE '%Template%'
                 AND (file_path LIKE '%email%' OR file_path LIKE '%mail%')
                 ORDER BY file_path LIMIT 40"
```

**Purpose:** Mapped all email template types and factories.

**Key Findings:**
- `EmailTemplateTitle` enum with template names
- `EmailTemplateCountriesLanguages` type for i18n
- `MailchimpTemplate` type for transactional templates
- Template registration in `templates/index.ts`

### 6. Reminder Flow Analysis

```bash
# Find reminder email functions
devac hub query "SELECT name, kind, file_path FROM nodes
                 WHERE name LIKE '%Reminder%'
                 AND (file_path LIKE '%email%' OR name LIKE '%Email%')
                 ORDER BY file_path LIMIT 30"
```

**Purpose:** Traced reminder email sending patterns.

**Key Findings:**
- Multiple reminder types (starting soon, tomorrow, unpaid)
- Contentful template integration
- Time-based scheduling logic

### Source Files Analyzed

| File | Lines Read | Purpose |
|------|------------|---------|
| `services/send-email/src/app.ts` | 1-125 | Main email handler with SES integration |
| `services/send-email/src/templates/index.ts` | 1-61 | Template registry and lookup |
| `services/send-email/src/templates/types.ts` | 1-34 | Template type definitions |
| `services/send-email/src/templates/verifyEmail.ts` | 1-157 | Verification email template |
| `services/send-email/infra/SendEmailService.ts` | 1-100 | CDK infrastructure definition |
| `shared/mail/mailchimp.ts` | 1-485 | Mailchimp integration logic |
| `shared/mail/client.ts` | 1-66 | Mailchimp client configuration |
| `services/reminders/src/reminders.ts` | 1-150 | Reminder scheduling logic |
| `services/reminders/src/emails.ts` | 1-177 | Email sending for reminders |
| `services/remove-old-accounts/.../emailConfig.ts` | 1-28 | Nodemailer SMTP configuration |

### Verification Approach

1. **Cross-reference:** DevAC query results verified against actual file contents
2. **Type analysis:** TypeScript types provided authoritative schema information
3. **Infrastructure review:** CDK stacks confirmed AWS service integrations
4. **Environment mapping:** SSM parameter references mapped to configuration

### Query Statistics

| Query Type | Records Found | Time |
|------------|---------------|------|
| Email symbols | 100 | 1676ms |
| Mail symbols | 27 | 830ms |
| Email files | 45 | 826ms |
| Template symbols | 40 | 938ms |
| Reminder functions | 7 | 862ms |
| External refs | 30 | 821ms |

---

## Appendix

### Adding a New Email Template

1. **Create template file** in `services/send-email/src/templates/`:
```typescript
export const myTemplate: EmailTemplateCountriesLanguages<MyParams> = {
  [codeISO3Schema.Enum.SWE]: {
    [Language.SV]: (params) => ({
      subject: "...",
      html: "...",
      text: "...",
    }),
    default: Language.SV,
  },
};
```

2. **Register in index.ts**:
```typescript
export const templates = {
  // ... existing
  myTemplate,
};
```

3. **Add translations** in `translations/` directory

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Email not delivered | Check SES bounce/complaint metrics |
| Template not found | Verify country/language combination exists |
| Mailchimp sync failed | Check API key validity and rate limits |
| SMTP connection failed | Verify credentials in Secrets Manager |

### Monitoring

- **AWS SES:** CloudWatch metrics for send, bounce, complaint rates
- **Mailchimp:** Dashboard for delivery and open rates
- **Lambda logs:** CloudWatch Logs for error tracking
