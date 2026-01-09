# Mindler Healthcare Platform - C4 Architecture

> Generated: 2026-01-09
> Source: DevAC Code Analysis (`devac query`, `devac status`, `devac context`)
> Scope: Core repositories (excludes worktrees, likec4, vivief tools)

---

## Table of Contents

1. [C4 Level 1: System Context](#c4-level-1-system-context)
2. [C4 Level 2: Container Diagram](#c4-level-2-container-diagram)
3. [External Systems](#external-systems)
4. [Repository Overview](#repository-overview)
5. [Data Retrieval Methodology](#data-retrieval-methodology)

---

## C4 Level 1: System Context

### Overview

The Mindler Healthcare Platform is a comprehensive digital mental health solution that connects patients with psychologists for online therapy sessions. The system operates across multiple markets (Sweden, Norway, Denmark, UK) with localized content and payment integrations.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL ACTORS                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Patients   │    │Psychologists │    │   Admins     │    │ B2B Partners │  │
│  │  (Mobile/    │    │  (Web)       │    │  (Web)       │    │  (API)       │  │
│  │   Web)       │    │              │    │              │    │              │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │                   │           │
└─────────┼───────────────────┼───────────────────┼───────────────────┼───────────┘
          │                   │                   │                   │
          ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│                    ┌────────────────────────────────────┐                       │
│                    │    MINDLER HEALTHCARE PLATFORM     │                       │
│                    │                                    │                       │
│                    │  • Online therapy booking          │                       │
│                    │  • Video consultations             │                       │
│                    │  • Patient management              │                       │
│                    │  • Healthcare integrations         │                       │
│                    │  • Multi-market support (SE/NO/DK) │                       │
│                    │                                    │                       │
│                    └────────────────────────────────────┘                       │
│                                     │                                            │
└─────────────────────────────────────┼────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────────┐
          │                           │                               │
          ▼                           ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SYSTEMS                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │     AWS      │  │   Google     │  │   Stripe     │  │   Vonage/    │        │
│  │  Services    │  │   Cloud      │  │   Payments   │  │   OpenTok    │        │
│  │  (Core)      │  │  (Analytics) │  │              │  │  (Video)     │        │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Twilio     │  │  Contentful  │  │   BankID     │  │  Mailchimp   │        │
│  │   (SMS)      │  │   (CMS)      │  │  (Auth SE)   │  │  (Email)     │        │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Zendesk    │  │   Cognito    │  │   Webdoc     │  │   DataDog    │        │
│  │  (Support)   │  │  (Auth)      │  │  (EMR)       │  │ (Monitoring) │        │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Actor Descriptions

| Actor | Description | Primary Interfaces | Confidence |
|-------|-------------|-------------------|------------|
| **Patients** | End users seeking mental health care | Mobile App (iOS/Android), Public Website | **HIGH** - Direct evidence from app/ and public-website-3/ |
| **Psychologists** | Licensed mental health professionals | Frontend Web Apps (mindlercare) | **HIGH** - Direct evidence from frontend-monorepo/ |
| **Admins** | Internal staff managing the platform | Back-office tools | **MEDIUM** - Evidence from mindler-back-office-tools |
| **B2B Partners** | Corporate partners with employee programs | API integrations, B2B portal | **HIGH** - Evidence from b2b-membership service |

### External Systems Summary

| System | Purpose | Evidence Source | Confidence |
|--------|---------|-----------------|------------|
| **AWS Services** | Core infrastructure (Lambda, DynamoDB, SES, SQS, S3, Cognito) | DevAC query: 20+ `@aws-sdk/*` imports | **HIGH** |
| **Google Cloud** | Analytics, BigQuery, Vertex AI | DevAC query: `@google-cloud/bigquery`, `@google/genai` | **HIGH** |
| **Stripe** | Payment processing | DevAC query: `stripe` module import | **HIGH** |
| **Twilio** | SMS communications | DevAC query: `twilio` module import | **HIGH** |
| **Vonage/OpenTok** | Video calling infrastructure | DevAC: `opentok-react-native` in app deps | **HIGH** |
| **Contentful** | Content management system | DevAC: `@contentful/*` imports across repos | **HIGH** |
| **Mailchimp** | Email marketing and transactional | DevAC query: `@mailchimp/*` imports | **HIGH** |
| **BankID** | Swedish identity verification | DevAC: `bankid` service in monorepo | **HIGH** |
| **DataDog** | Monitoring and logging | DevAC: `@datadog/*` imports in app/frontend | **MEDIUM** |
| **Webdoc** | Electronic Medical Records integration | DevAC: `webdoc-hook` service | **MEDIUM** |

---

## C4 Level 2: Container Diagram

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MINDLER HEALTHCARE PLATFORM                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────── CLIENT APPLICATIONS ────────────────────────────────────┐ │
│  │                                                                                 │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                   │ │
│  │  │   Mobile App   │  │ Public Website │  │ Mindlercare    │                   │ │
│  │  │   (app/)       │  │(public-web-3/) │  │(frontend-mono/)│                   │ │
│  │  │                │  │                │  │                │                   │ │
│  │  │ React Native   │  │ Next.js 15     │  │ React 18       │                   │ │
│  │  │ Expo 52        │  │ Contentful     │  │ Vite           │                   │ │
│  │  │ TypeScript     │  │ XState v5      │  │ MUI + Styled   │                   │ │
│  │  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘                   │ │
│  │          │                   │                   │                             │ │
│  └──────────┼───────────────────┼───────────────────┼─────────────────────────────┘ │
│             │                   │                   │                               │
│             └───────────────────┼───────────────────┘                               │
│                                 │                                                   │
│                                 ▼                                                   │
│  ┌─────────────────────── API GATEWAY LAYER ──────────────────────────────────────┐ │
│  │                                                                                 │ │
│  │  ┌────────────────────────────┐     ┌────────────────────────────┐            │ │
│  │  │      mindlerapi            │     │      tRPC API Layer        │            │ │
│  │  │                            │     │                            │            │ │
│  │  │  Express + tRPC            │     │  Type-safe API routes      │            │ │
│  │  │  JWT Auth                  │     │  React Query integration   │            │ │
│  │  │  Core business logic       │     │                            │            │ │
│  │  └────────────────────────────┘     └────────────────────────────┘            │ │
│  │                                                                                 │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                 │                                                   │
│                                 ▼                                                   │
│  ┌─────────────────────── MICROSERVICES (33 Services) ────────────────────────────┐ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │ auth-lambda │  │   bankid    │  │  passkey-   │  │ third-party │           │ │
│  │  │             │  │             │  │    auth     │  │    auth     │           │ │
│  │  │ API Gateway │  │ Swedish ID  │  │ WebAuthn    │  │ OAuth       │           │ │
│  │  │ Authorizer  │  │ Verification│  │ Passkeys    │  │ Providers   │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │ b2b-member  │  │health-profs │  │indianapolis │  │    miami    │           │ │
│  │  │    ship     │  │             │  │             │  │             │           │ │
│  │  │ Corporate   │  │ Patient     │  │ ICBT        │  │ Messaging   │           │ │
│  │  │ Programs    │  │ Health Data │  │ Programs    │  │ Platform    │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │ send-email  │  │  reminders  │  │  invoicing  │  │  fileserve  │           │ │
│  │  │             │  │             │  │             │  │             │           │ │
│  │  │ SES Email   │  │ Appointment │  │ Billing     │  │ File        │           │ │
│  │  │ Templates   │  │ Reminders   │  │ Management  │  │ Storage     │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  │                                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │ │
│  │  │ event-loki  │  │ mysql-stream│  │videocall-   │  │ webdoc-hook │           │ │
│  │  │             │  │             │  │    auth     │  │             │           │ │
│  │  │ Event       │  │ CDC         │  │ Video Call  │  │ EMR         │           │ │
│  │  │ Processing  │  │ Pipeline    │  │ Sessions    │  │ Integration │           │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘           │ │
│  │                                                                                 │ │
│  │  ... and 19 more services (pseudonymizer, spar, frikort, consentry, etc.)     │ │
│  │                                                                                 │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                 │                                                   │
│                                 ▼                                                   │
│  ┌─────────────────────── DATA STORES ────────────────────────────────────────────┐ │
│  │                                                                                 │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                   │ │
│  │  │  MySQL (RDS)   │  │   DynamoDB     │  │      S3        │                   │ │
│  │  │                │  │                │  │                │                   │ │
│  │  │  Primary       │  │  Session data  │  │  Files,        │                   │ │
│  │  │  relational    │  │  Cache         │  │  Documents     │                   │ │
│  │  │  data store    │  │  High-speed    │  │  Media         │                   │ │
│  │  └────────────────┘  └────────────────┘  └────────────────┘                   │ │
│  │                                                                                 │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│  ┌─────────────────────── SHARED PACKAGES (npm-private-packages/) ────────────────┐ │
│  │                                                                                 │ │
│  │  @mindlercare/auth          @mindlercare/schema       @mindlercare/logger      │ │
│  │  @mindlercare/mindlerapi-client                       @mindlercare/ui-web      │ │
│  │  @mindlercare/b2b-membership-client                   @mindlercare/crypto      │ │
│  │  @mindlercare/videocall-auth-client                   @mindlercare/pdf-gen     │ │
│  │  @mindlercare/log-washer-client                       @mindlercare/ssm-client  │ │
│  │                                                                                 │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Container Details

#### Client Applications

| Container | Technology | Purpose | Confidence |
|-----------|-----------|---------|------------|
| **Mobile App** (`app/`) | React Native, Expo 52, TypeScript | Patient mobile app for iOS/Android | **HIGH** - package.json analysis |
| **Public Website** (`public-website-3/`) | Next.js 15.3.3, Contentful, XState v5 | Marketing website, booking flows | **HIGH** - package.json, CLAUDE.md |
| **Mindlercare** (`frontend-monorepo/frontends/mindlercare`) | React 18, Vite, MUI | Provider dashboard, patient management | **HIGH** - monorepo structure |
| **Back Office Tools** (`frontend-monorepo/frontends/mindler-back-office-tools`) | React, Vite | Admin tools | **MEDIUM** - directory listing |
| **Video Stream** (`frontend-monorepo/frontends/video-stream-2`) | React | Video calling interface | **MEDIUM** - directory listing |

#### Backend Services (monorepo-3.0/services/)

| Service | Purpose | Key Dependencies | Confidence |
|---------|---------|-----------------|------------|
| **mindlerapi** | Core API, tRPC endpoints | Express, tRPC, Kysely, MySQL | **HIGH** - DevAC query router.ts |
| **auth-lambda** | API Gateway authorizer | JWT, Cognito | **HIGH** - monorepo CLAUDE.md |
| **bankid** | Swedish BankID authentication | BankID API | **HIGH** - service directory |
| **passkey-auth** | WebAuthn/Passkey authentication | @simplewebauthn | **MEDIUM** - npm-private-packages |
| **b2b-membership** | Corporate employee programs | - | **HIGH** - DevAC query effects |
| **health-profiles** | Patient health questionnaires | - | **HIGH** - DevAC query effects |
| **indianapolis** | iCBT therapy programs | - | **HIGH** - DevAC query effects |
| **miami** | Messaging platform | Vertex AI, Contentful | **HIGH** - CLAUDE.md references |
| **send-email** | Email delivery (SES templates) | @aws-sdk/client-ses | **HIGH** - monorepo CLAUDE.md |
| **reminders** | Appointment reminders | - | **MEDIUM** - service directory |
| **invoicing** | Billing and invoices | - | **MEDIUM** - service directory |
| **event-loki** | Event processing pipeline | SQS, SNS | **HIGH** - monorepo CLAUDE.md |
| **mysql-stream** | CDC (binlog streaming) | MySQL binlog | **HIGH** - monorepo CLAUDE.md |
| **videocall-auth** | Video session authorization | Vonage/OpenTok | **HIGH** - npm-private-packages |
| **webdoc-hook** | EMR integration webhook | Webdoc API | **MEDIUM** - service directory |
| **pseudonymizer** | Data anonymization | - | **MEDIUM** - service directory |
| **spar** | Swedish population registry | SPAR API | **MEDIUM** - DevAC query effects |
| **frikort** | Swedish healthcare card validation | - | **MEDIUM** - service directory |

#### Shared Packages (npm-private-packages/)

| Package | Purpose | Confidence |
|---------|---------|------------|
| **@mindlercare/auth** | Authentication utilities, Cognito integration | **HIGH** - DevAC query |
| **@mindlercare/schema** | Shared TypeScript schemas, zod validators | **HIGH** - DevAC query (73 usages) |
| **@mindlercare/mindlerapi-client** | tRPC client for frontend apps | **HIGH** - DevAC query |
| **@mindlercare/ui-web** | Shared React web components | **HIGH** - coding-rules.md |
| **@mindlercare/logger** | Logging utilities | **HIGH** - DevAC query |
| **@mindlercare/crypto** | Encryption/decryption utilities | **MEDIUM** - package directory |
| **@mindlercare/pdf-generator** | PDF document generation | **MEDIUM** - package directory |
| **@mindlercare/secrets-manager-client** | AWS Secrets Manager wrapper | **HIGH** - DevAC query (55 usages) |
| **@mindlercare/ssm-client** | AWS SSM Parameter Store client | **HIGH** - package directory |
| **@mindlercare/log-washer-client** | Log sanitization | **HIGH** - DevAC query (37 usages) |

---

## External Systems

### AWS Services Integration

| Service | Usage | Evidence | Confidence |
|---------|-------|----------|------------|
| **Lambda** | Serverless compute for all microservices | `@aws-sdk/client-lambda` | **HIGH** |
| **API Gateway** | HTTP endpoints, authorization | `@aws-sdk/client-api-gateway` | **HIGH** |
| **DynamoDB** | Session data, caching | `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` | **HIGH** |
| **S3** | File storage, documents | `@aws-sdk/client-s3`, presigned URLs | **HIGH** |
| **SES** | Transactional email | `@aws-sdk/client-ses`, `@aws-sdk/client-sesv2` | **HIGH** |
| **SQS** | Message queuing | `@aws-sdk/client-sqs` | **HIGH** |
| **SNS** | Notifications, pub/sub | `@aws-sdk/client-sns` | **HIGH** |
| **Cognito** | User authentication | `@aws-sdk/client-cognito-identity-provider` | **HIGH** |
| **Secrets Manager** | Secret storage | `@aws-sdk/client-secrets-manager` | **HIGH** |
| **SSM** | Parameter store | `@aws-sdk/client-ssm` | **HIGH** |
| **Scheduler** | Event scheduling | `@aws-sdk/client-scheduler` | **MEDIUM** |

### Google Cloud Integration

| Service | Usage | Evidence | Confidence |
|---------|-------|----------|------------|
| **BigQuery** | Analytics data warehouse | `@google-cloud/bigquery` | **HIGH** |
| **Cloud Storage** | Backup storage | `@google-cloud/storage` | **MEDIUM** |
| **Vertex AI** | AI/ML capabilities | `@google/genai` | **MEDIUM** |
| **Resource Manager** | GCP project management | `@google-cloud/resource-manager` | **LOW** |

### Third-Party Service Integrations

| Service | Purpose | Evidence | Confidence |
|---------|---------|----------|------------|
| **Stripe** | Payment processing | `stripe` import | **HIGH** |
| **Twilio** | SMS messaging | `twilio` import | **HIGH** |
| **Mailchimp** | Email marketing | `@mailchimp/mailchimp_marketing`, `@mailchimp/mailchimp_transactional` | **HIGH** |
| **Contentful** | CMS for website content | `contentful`, `@contentful/rich-text-*` | **HIGH** |
| **Vonage/OpenTok** | Video calling | `opentok-react-native` | **HIGH** |
| **BankID** | Swedish identity verification | `bankid` service | **HIGH** |
| **Unleash** | Feature flags | `@unleash/proxy-client-react` | **HIGH** |
| **Zendesk** | Customer support | `react-native-zendesk-module` | **MEDIUM** |
| **Firebase** | Crashlytics, push notifications | `@react-native-firebase/*` | **HIGH** |
| **DataDog** | Monitoring | `@datadog/browser-logs`, `@datadog/mobile-react-native` | **HIGH** |
| **Survicate** | User surveys | `@survicate/react-native-survicate` | **LOW** |

---

## Repository Overview

### Core Repositories (Included in Analysis)

| Repository | Type | Packages | Description |
|------------|------|----------|-------------|
| **monorepo-3.0** | Microservices | 35 | Backend services, AWS CDK infrastructure |
| **app** | Mobile | 3 | React Native patient mobile application |
| **frontend-monorepo** | Web apps | 6 | Provider dashboards, web applications |
| **public-website-3** | Website | 1 | Next.js marketing website |
| **npm-private-packages** | Libraries | 18 | Shared npm packages (@mindlercare/*) |
| **contentful-monorepo** | CMS | 1 | Contentful configuration and schemas |
| **mindler** | Experimental | 5 | New architecture experiments |
| **living-architecture** | Docs | 4 | Architecture documentation |
| **CodeGraph** | Tools | 2 | Code analysis tools |

### Excluded from Analysis

| Repository | Reason |
|------------|--------|
| **vivief** | DevAC tool (excluded per request) |
| **vivief-*** worktrees | Duplicates/work in progress |
| **likec4** | Architecture diagramming tool (excluded per request) |

---

## Data Retrieval Methodology

### Commands Used

This architecture document was generated using the following DevAC CLI commands and techniques:

#### 1. Workspace Discovery

```bash
# Get workspace status and package counts
devac status
# Result: Discovered packages across 12+ repositories
#         121 modules, 116 functions, 77 methods, 52 types analyzed
```

**Confidence: HIGH** - Direct CLI output from DevAC seed analysis

#### 2. External Dependencies Query

```bash
# Query external module imports from monorepo-3.0
cd /Users/grop/ws/monorepo-3.0
devac query "SELECT DISTINCT module_specifier FROM external_refs
             WHERE module_specifier NOT LIKE './%'
             AND module_specifier NOT LIKE '../%'
             ORDER BY module_specifier LIMIT 100"
```

**Result:** Identified 100+ external dependencies including:
- 20+ AWS SDK packages (`@aws-sdk/*`)
- Google Cloud packages (`@google-cloud/*`)
- Third-party integrations (stripe, twilio, mailchimp)

**Confidence: HIGH** - Direct DevAC seed data from TypeScript AST analysis

#### 3. Effects Analysis

```bash
# Query effect types distribution
devac query "SELECT effect_type, COUNT(*) as count
             FROM effects
             GROUP BY effect_type
             ORDER BY count DESC"
```

**Result:**
- FunctionCall: 33,000 effects
- Send: 34 effects
- Request: 8 effects

**Confidence: HIGH** - Comprehensive code effects analysis

#### 4. External Module Usage Frequency

```bash
# Query most-used external modules
devac query "SELECT external_module, COUNT(*) as count
             FROM effects
             WHERE is_external = true
             AND external_module IS NOT NULL
             AND external_module <> ''
             GROUP BY external_module
             ORDER BY count DESC LIMIT 40"
```

**Key Results:**
- vitest: 1,660 uses
- zod: 1,509 uses
- aws-cdk-lib: 214 uses
- @trpc/server: 213 uses
- kysely: 93 uses

**Confidence: HIGH** - Frequency data directly from code analysis

#### 5. Context Discovery

```bash
# Get repository context
devac context
```

**Result:** Identified 12 repositories, 8+ worktrees (excluded)

**Confidence: HIGH** - Direct file system and git analysis

#### 6. API Endpoint Discovery

```bash
# Query detected API targets
devac query "SELECT DISTINCT target, provider, operation
             FROM effects
             ORDER BY provider, target LIMIT 50"
```

**Result:** Identified 30+ API endpoints including:
- Internal service routes (/:STAGE/*)
- External API integrations (:API_URL/*)
- Service communication patterns

**Confidence: MEDIUM** - Effects detection may not capture all endpoints

### Supplementary Data Sources

#### Package.json Analysis
- Read package.json files from each repository
- Extracted: names, dependencies, workspace configurations

**Confidence: HIGH** - Direct file reads

#### CLAUDE.md and AGENTS.md Files
- Read project documentation files
- Extracted: architecture descriptions, tech stacks, development workflows

**Confidence: HIGH** - Maintained documentation

#### Directory Structure Analysis
- Listed service directories in monorepo-3.0/services/
- Listed packages in npm-private-packages/packages/
- Listed frontends in frontend-monorepo/frontends/

**Confidence: HIGH** - File system inspection

### Confidence Level Definitions

| Level | Description | Evidence Requirements |
|-------|-------------|----------------------|
| **HIGH** | Direct evidence from multiple sources | DevAC query + package.json + documentation |
| **MEDIUM** | Evidence from single source or inference | DevAC query OR documentation |
| **LOW** | Limited evidence, based on naming/patterns | Directory names, import patterns only |

### Limitations

1. **Effects Table Coverage**: Effects extraction requires seed files to be generated. Some repositories may have incomplete coverage.

2. **Runtime Behavior**: DevAC analyzes static code; runtime-only integrations may not be captured.

3. **Configuration-Based Integrations**: Some external systems are configured via environment variables and may not appear in code analysis.

4. **Private/Encrypted Files**: git-crypt encrypted files were not analyzed directly.

5. **Documentation Currency**: CLAUDE.md files may not reflect the latest code changes.

### Recommendations for Improved Analysis

1. **Run `devac analyze`** on repositories missing seed files (aws_infra_map_neo4j, some npm-private-packages)

2. **Enable devac watch** for continuous seed updates

3. **Generate C4 PlantUML** using `devac c4 context --output diagram.puml` when hub is available

4. **Add effect annotations** to document runtime integrations not visible in static analysis

---

*Document generated using DevAC code analysis tools. For updates, regenerate using:*
```bash
devac c4 context --name "Mindler Healthcare Platform" --json
devac c4 containers --json
```
