# How Invoicing Works

> **Service:** `services/invoicing`
> **Last Updated:** 2026-01-09
> **Generated Using:** DevAC CLI code analysis tools

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Invoice Creation Pipeline](#invoice-creation-pipeline)
4. [No-Show and Late Cancellation Flow](#no-show-and-late-cancellation-flow)
5. [Payment Methods](#payment-methods)
6. [External Integrations](#external-integrations)
7. [Database and State Management](#database-and-state-management)
8. [Key Functions Reference](#key-functions-reference)
9. [Data Sourcing Methodology](#data-sourcing-methodology)

---

## Overview

The invoicing service handles all billing operations for the ViviefCorp healthcare platform, including:

- **Regular patient fees** - Standard consultation charges
- **No-show fees** - Charges for missed appointments
- **Late cancellation fees** - Charges for appointments cancelled within 24 hours
- **Freecard processing** - Swedish healthcare subsidy card integration
- **Refund handling** - Processing refunds for credit card payments

The service integrates with multiple external systems including Billogram (Swedish invoice provider), Stripe (credit card processing), SPAR (Swedish population registry), and Webdoc (healthcare records).

---

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Event Sources                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   EventBridge                    CloudWatch                                  │
│   (Meeting Ended)                (Scheduled 09:00 UTC+2)                    │
│        │                              │                                      │
│        ▼                              ▼                                      │
│   ┌─────────┐                  ┌──────────────────────────┐                 │
│   │   SQS   │                  │ invoiceNoShowLateCancelSlots │             │
│   └────┬────┘                  └──────────────────────────┘                 │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────┐                                                           │
│   │createInvoice│                                                           │
│   └─────────────┘                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Invoicing Service                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Billogram      │    │     SPAR        │    │    Stripe       │         │
│  │  Controller     │    │    Service      │    │    Client       │         │
│  │                 │    │                 │    │                 │         │
│  │ - Create invoice│    │ - Get address   │    │ - Refund        │         │
│  │ - Get by ID     │    │ - Validate      │    │ - Capture       │         │
│  │ - Update        │    │   identity      │    │                 │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                      │                      │                   │
│           └──────────────────────┼──────────────────────┘                   │
│                                  │                                          │
│                                  ▼                                          │
│                    ┌─────────────────────────┐                              │
│                    │   DynamoDB State        │                              │
│                    │   (Invoice Items)       │                              │
│                    └─────────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          External Services                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │   Billogram  │   │     SPAR     │   │    Stripe    │   │   Webdoc     │ │
│  │   (Invoice)  │   │  (Address)   │   │  (Payments)  │   │  (Records)   │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Service Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Main Handlers | `src/index.ts` | Lambda entry points for all invoice operations |
| Billogram Controller | `src/billogram/billogramController.ts` | Billogram API integration |
| No-Show Logic | `src/noShowLateCancellation.ts` | No-show and late cancel processing |
| DynamoDB Queries | `src/dynamoQueries.ts` | Invoice state management |
| SPAR Service | `src/sparService.ts` | Swedish address lookup |
| Payment Methods | `src/lib/payments/` | Payment processing logic |

---

## Invoice Creation Pipeline

### Regular Invoice Flow

When a meeting ends, the following pipeline processes the invoice:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Regular Invoice Creation Pipeline                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Meeting Ended Event                                                        │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Step 1: Validate & Initialize                                    │       │
│   │                                                                  │       │
│   │  • Parse event (slotId, templateId)                             │       │
│   │  • Validate template (only 1, 2, 6 processed)                   │       │
│   │  • Get invoicing info from DB                                   │       │
│   │  • Create/get DynamoDB invoice item (state: INITIALIZED)        │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Step 2: Check Freecard Eligibility                              │       │
│   │                                                                  │       │
│   │  • Call API to check freecard status                            │       │
│   │  • Adjust amount if partial freecard                            │       │
│   │  • Update state: ELIGIBILITY_FOR_FREECARD_CHECKED               │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Step 3: Create Billogram Invoice                                │       │
│   │                                                                  │       │
│   │  • Get billing address from SPAR                                │       │
│   │  • Create/get Billogram customer                                │       │
│   │  • Create invoice with line items                               │       │
│   │  • Update state: BILLOGRAM_CREATED                              │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Step 4: Capture Invoice                                         │       │
│   │                                                                  │       │
│   │  • Update payment record with billogramId, OCR, URL             │       │
│   │  • Send notification to patient                                 │       │
│   │  • Update state: CAPTURED                                       │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Step 5: Emit Event & Finalize                                   │       │
│   │                                                                  │       │
│   │  • Emit invoice_created event                                   │       │
│   │  • Register to freecard system                                  │       │
│   │  • Update state: DONE                                           │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Invoice State Machine

```
┌──────────────┐
│ INITIALIZED  │  ◄── Initial state when invoice item created
└──────┬───────┘
       │
       ▼
┌────────────────────────────────┐
│ ELIGIBILITY_FOR_FREECARD_CHECKED │  ◄── After checking freecard status
└──────────────┬─────────────────┘
               │
               ▼
┌──────────────────────┐
│   BILLOGRAM_CREATED  │  ◄── After Billogram invoice created
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   EXTRA_FEE_CREATED  │  ◄── (For no-show/late cancel only)
└──────────┬───────────┘
           │
           ▼
┌──────────────┐
│   CAPTURED   │  ◄── After payment system updated
└──────┬───────┘
       │
       ▼
┌──────────────┐
│     DONE     │  ◄── Final state - invoice fully processed
└──────────────┘
```

---

## No-Show and Late Cancellation Flow

### Overview

The no-show and late cancellation system runs as a scheduled job every morning at 09:00 UTC+2. It processes appointments from a rolling window (1 week back, 3-day period) to identify slots that require extra fee invoicing or refunds.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│             No-Show & Late Cancellation Processing Flow                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   CloudWatch Scheduled Event (09:00 UTC+2 daily)                            │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ invoiceNoShowLateCancelSlots (index.ts:1056)                    │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ├─────────────────────────────────┐                                  │
│         ▼                                 ▼                                  │
│   ┌─────────────────┐              ┌─────────────────┐                      │
│   │   getNoShows()  │              │getLateCancella- │                      │
│   │                 │              │     tions()     │                      │
│   └────────┬────────┘              └────────┬────────┘                      │
│            │                                │                                │
│            ▼                                ▼                                │
│   ┌─────────────────┐              ┌─────────────────┐                      │
│   │ Query Webdoc    │              │ Query Database  │                      │
│   │ for NO_SHOW     │              │ for LATE_CANCEL │                      │
│   │ records         │              │ status slots    │                      │
│   └────────┬────────┘              └────────┬────────┘                      │
│            │                                │                                │
│            └────────────────┬───────────────┘                               │
│                             ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │                    Categorize Slots                              │       │
│   │                                                                  │       │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │       │
│   │  │  toInvoice  │  │toBeRefunded │  │  toIgnore   │              │       │
│   │  │             │  │             │  │             │              │       │
│   │  │ Extra fee   │  │ Paid with   │  │ Fee waived  │              │       │
│   │  │ required    │  │ card, fee   │  │ or already  │              │       │
│   │  │             │  │ waived      │  │ processed   │              │       │
│   │  └──────┬──────┘  └──────┬──────┘  └─────────────┘              │       │
│   │         │                │                                       │       │
│   └─────────┼────────────────┼───────────────────────────────────────┘       │
│             │                │                                               │
│             ▼                ▼                                               │
│   ┌─────────────────┐  ┌─────────────────┐                                  │
│   │ Create Billogram│  │ Flag for CS     │                                  │
│   │ Extra Fee       │  │ Manual Refund   │                                  │
│   │ Invoice         │  │                 │                                  │
│   └─────────────────┘  └─────────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### No-Show Detection Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       No-Show Detection Flow                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ getNoShows() - noShowLateCancellation.ts:26                     │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ├───────────────────────────────────┐                                │
│         ▼                                   ▼                                │
│   ┌───────────────────────┐          ┌───────────────────────┐              │
│   │ getNoShowExtraFeeSlots│          │ getNoShowNoFeeSlots   │              │
│   │                       │          │                       │              │
│   │ Template: noShowWith- │          │ Template: noShowWith- │              │
│   │           Fee         │          │           outFee      │              │
│   └───────────┬───────────┘          └───────────┬───────────┘              │
│               │                                  │                          │
│               ▼                                  ▼                          │
│   ┌───────────────────────┐          ┌───────────────────────┐              │
│   │ Query Webdoc API      │          │ Query Webdoc API      │              │
│   │                       │          │                       │              │
│   │ - Get record template │          │ - Get record template │              │
│   │ - Search by template  │          │ - Search by template  │              │
│   │   ID and period       │          │   ID and period       │              │
│   │ - Filter: isSigned=1  │          │ - Filter: isSigned=1  │              │
│   └───────────┬───────────┘          └───────────┬───────────┘              │
│               │                                  │                          │
│               ▼                                  ▼                          │
│   ┌───────────────────────┐          ┌───────────────────────┐              │
│   │ Parse visits to get   │          │ Check if should be    │              │
│   │ slotIds from DynamoDB │          │ refunded:             │              │
│   │ mapping               │          │                       │              │
│   │                       │          │ - Paid with card?     │              │
│   │                       │          │ - Fee waived?         │              │
│   └───────────┬───────────┘          └───────────┬───────────┘              │
│               │                                  │                          │
│               ▼                                  ▼                          │
│   ┌───────────────────────┐          ┌───────────────────────┐              │
│   │     toInvoice[]       │          │    toBeRefunded[]     │              │
│   │                       │          │                       │              │
│   │ Slots that need       │          │ Slots where card      │              │
│   │ extra fee invoice     │          │ payment should be     │              │
│   │                       │          │ refunded              │              │
│   └───────────────────────┘          └───────────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Late Cancellation Detection Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Late Cancellation Detection Flow                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ getLateCancellations() - noShowLateCancellation.ts:295          │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Query Database for LATE_CANCELED status                         │       │
│   │                                                                  │       │
│   │ getSlotsByRangeAndStatus(range, ["LATE_CANCELED"])              │       │
│   │                                                                  │       │
│   │ - Date range: period.from to period.to (Stockholm timezone)     │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ For each slot, determine action:                                │       │
│   │                                                                  │       │
│   │ ┌─────────────────────────────────────────────────────────────┐ │       │
│   │ │ if (feeWaived && shouldBeRefunded)  → toBeRefunded[]        │ │       │
│   │ │ if (!feeWaived)                     → toInvoice[]           │ │       │
│   │ │ else                                → toIgnore[]            │ │       │
│   │ └─────────────────────────────────────────────────────────────┘ │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ shouldBeRefunded() check:                                       │       │
│   │                                                                  │       │
│   │ - Correct patient type (adult, not b2b)?                        │       │
│   │ - Has NO_SHOW or NO_SHOW_ALL status?                            │       │
│   │ - Paid with credit card?                                        │       │
│   │ - Payment actually captured?                                    │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Extra Fee Invoice Creation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Extra Fee Invoice Creation                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   For each slot in toInvoice[]:                                             │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Validations                                                     │       │
│   │                                                                  │       │
│   │ ✓ Email verified?                                               │       │
│   │ ✓ Not B2B payment?                                              │       │
│   │ ✓ Not already processed (DONE)?                                 │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Calculate Fee Amount                                            │       │
│   │                                                                  │       │
│   │ if (paidWithCard):                                              │       │
│   │     fee = FEE_AMOUNT - paymentAmount  (difference only)         │       │
│   │ else:                                                           │       │
│   │     fee = FEE_AMOUNT  (full no-show fee)                        │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Create Billogram Invoice                                        │       │
│   │                                                                  │       │
│   │ - Account: 3026 (NO_SHOW) or 3027 (LATE_CANCEL)                 │       │
│   │ - Title: "Avgift för sen avbokning/uteblivet besök"             │       │
│   │ - Message: Explanation of fee policy                            │       │
│   │ - creditor_unique_value: "NO_SHOW_LATE_CANCEL#{slotId}"         │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Create Fee Record in API                                        │       │
│   │                                                                  │       │
│   │ apiClient.createFeeForSlotId({                                  │       │
│   │   slotId, amount, currency: "SEK",                              │       │
│   │   externalId: billogram.id,                                     │       │
│   │   provider: "BILLOGRAM",                                        │       │
│   │   reason: extraFeeType  // "NO_SHOW" or "LATE_CANCELED"         │       │
│   │ })                                                              │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Emit Event & Finalize                                           │       │
│   │                                                                  │       │
│   │ - Emit invoice_created event                                    │       │
│   │ - Update DynamoDB state to DONE                                 │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Accounting Codes

| Category | Income Account | VAT Account | Description |
|----------|---------------|-------------|-------------|
| Regular Fee | 3024 | 2611 | Standard patient consultation fee |
| No-Show Fee | 3026 | 2611 | Missed appointment without cancellation |
| Late Cancel Fee | 3027 | 2611 | Appointment cancelled within 24 hours |

---

## Payment Methods

The invoicing service supports multiple payment methods, each implemented in `src/lib/payments/methods/`:

| Payment Method | File | Description |
|----------------|------|-------------|
| Invoice (Billogram) | `src/billogram/` | Swedish invoice sent via email/mail |
| Credit Card | `creditCard.ts` | Stripe payment processing |
| Freecard | `freecard.ts` | Swedish healthcare subsidy card |
| B2B | `b2b.ts` | Business-to-business billing |
| ViviefCorp for Youth | `youthDiscount.ts` | Free for patients under 20 |
| ViviefCorp for Elderly | `elderlyDiscount.ts` | Free for patients over 85 |
| No Payment | `noPayment.ts` | Scenarios requiring no payment |

### Payment Method Selection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Payment Method Selection                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   getSlotPaymentMethod() - paymentMethods.ts:87                             │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Check patient eligibility                                       │       │
│   │                                                                  │       │
│   │ - Age < 20?  → ViviefCorp for Youth (free)                       │       │
│   │ - Age > 85?  → ViviefCorp for Elderly (free)                    │       │
│   │ - B2B member? → B2B billing                                     │       │
│   │ - Has freecard? → Freecard processing                           │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐       │
│   │ Return eligible payment methods sorted by priority              │       │
│   └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## External Integrations

### 1. Billogram (Swedish Invoice Provider)

**Location:** `src/billogram/billogramController.ts`

**Capabilities:**
- Create and manage invoices
- Customer management
- Automatic debt collection (when address available)
- Callback/webhook handling for payment status

**Key Methods:**
| Method | Purpose |
|--------|---------|
| `createBillogramInvoice()` | Create new invoice with customer and line items |
| `getBillogramById()` | Retrieve invoice by ID |
| `updateBillogram()` | Update existing invoice |
| `verifyCallback()` | Verify webhook signatures |
| `searchBillogramsByStatus()` | Search invoices by status |

### 2. SPAR (Swedish Population Address Registry)

**Location:** `src/sparService.ts`

**Capabilities:**
- Retrieve billing address by user ID
- Detect protected identities (secret address)
- Validate Swedish postal addresses

**Usage in Invoice Flow:**
```
User ID → SPAR API → Billing Address → Billogram Invoice
```

**Notes:**
- Returns `undefined` for users with secret identity
- Only returns Swedish addresses (billingCountry === "SVERIGE")

### 3. Stripe (Credit Card Processing)

**Location:** `src/lib/payments/stripe/`

**Capabilities:**
- Create and retrieve payment intents
- Process refunds
- Capture authorized payments

### 4. Webdoc (Healthcare Records)

**Location:** `shared/webdocClient/`

**Usage:**
- Query for no-show records by template ID
- Map visits to slot IDs via DynamoDB
- Retrieve record templates and versions

---

## Database and State Management

### DynamoDB Invoice Table

**Table Name:** Defined in `src/constants.ts` as `INVOICING_DYNAMO_TABLE`

**Schema:**
```typescript
type InvoiceItem = {
  typeId: string;       // Primary key: "VISIT#{slotId}" or "NO_SHOW_LATE_CANCEL#{slotId}"
  slotId: number;       // Appointment slot ID
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
  billogramId?: string; // Billogram invoice ID (once created)
  state: InvoiceItemState;
  stateChangeReason: string;
};
```

**Type ID Patterns:**
| Payment Category | Type ID Format |
|-----------------|----------------|
| Regular Fee | `VISIT#{slotId}` |
| Extra Fee | `NO_SHOW_LATE_CANCEL#{slotId}` |

### State Transitions

```
Regular Invoice:
  INITIALIZED → ELIGIBILITY_FOR_FREECARD_CHECKED → BILLOGRAM_CREATED → CAPTURED → DONE

Extra Fee Invoice:
  INITIALIZED → BILLOGRAM_CREATED → EXTRA_FEE_CREATED → CAPTURED → DONE
```

---

## Key Functions Reference

### Main Entry Points (`src/index.ts`)

| Function | Line | Trigger | Purpose |
|----------|------|---------|---------|
| `createInvoice` | 117 | SQS (Meeting Ended) | Process regular invoice after meeting |
| `invoiceNoShowLateCancelSlots` | 1056 | CloudWatch Schedule | Daily no-show/late cancel processing |
| `captureInvoice` | 496 | Internal | Finalize invoice in payment system |
| `emitInvoiceCreatedEvent` | 534 | Internal | Emit event after invoice created |
| `handleCallback` | 587 | API Gateway | Handle Billogram webhooks |

### No-Show Processing (`src/noShowLateCancellation.ts`)

| Function | Line | Purpose |
|----------|------|---------|
| `getNoShows` | 26 | Get all no-show slots for period |
| `getLateCancellations` | 295 | Get all late-cancelled slots for period |
| `getNoShowExtraFeeSlots` | 73 | Find no-shows requiring extra fee |
| `getNoShowNoFeeSlots` | 182 | Find no-shows eligible for refund |
| `parseVisitsFromWebdoc` | 392 | Extract slot IDs from Webdoc visits |
| `shouldBeRefunded` | 551 | Check if slot payment should be refunded |

### Billogram Controller (`src/billogram/billogramController.ts`)

| Method | Line | Purpose |
|--------|------|---------|
| `createBillogramInvoice` | 160 | Create invoice in Billogram |
| `getBillogramById` | 123 | Retrieve invoice by ID |
| `getCustomerBillingAddressFromSpar` | 42 | Get address via SPAR |
| `verifyCallback` | 384 | Verify webhook signature |

---

## Data Sourcing Methodology

### How This Documentation Was Generated

This documentation was generated using the **DevAC CLI** code analysis tools. The following queries and techniques were used to extract the information:

#### 1. Symbol Discovery

```bash
# Find all invoice-related symbols across the codebase
devac query "SELECT name, kind, file_path FROM nodes
             WHERE LOWER(name) LIKE '%invoice%'
             ORDER BY kind, name"
```

**Why:** Identifies all functions, types, interfaces, and modules related to invoicing, providing a complete inventory of the codebase.

#### 2. File Structure Analysis

```bash
# List all files in the invoicing service
devac query "SELECT DISTINCT file_path FROM nodes ORDER BY file_path"
```

**Why:** Reveals the overall structure and organization of the service, helping identify key modules and their locations.

#### 3. External Dependencies

```bash
# Find external integrations (Billogram, Stripe, Webdoc)
devac query "SELECT DISTINCT module_specifier, imported_symbol
             FROM external_refs
             WHERE module_specifier LIKE '%billogram%'
                OR module_specifier LIKE '%stripe%'
                OR module_specifier LIKE '%webdoc%'"
```

**Why:** Maps external service dependencies to understand integration points.

#### 4. Function Analysis

```bash
# Get functions in specific files with line numbers
devac query "SELECT name, kind, start_line, end_line
             FROM nodes
             WHERE file_path = 'src/noShowLateCancellation.ts'
               AND kind IN ('function', 'type', 'interface')
             ORDER BY start_line"
```

**Why:** Provides precise location of key functions for reference and further analysis.

#### 5. Call Graph Analysis

```bash
# Understand function relationships
devac query "SELECT source_entity_id, target_entity_id, edge_type
             FROM edges
             WHERE edge_type = 'CALLS'"
```

**Why:** Maps how functions call each other, revealing the execution flow.

### Source Files Analyzed

The following key files were read directly to understand implementation details:

| File | Lines Read | Purpose |
|------|------------|---------|
| `src/index.ts` | 1-400, 1050-1320 | Main handlers and invoice creation flow |
| `src/billogram/billogramController.ts` | 1-400 | Billogram API integration |
| `src/noShowLateCancellation.ts` | 1-400 | No-show/late cancel logic |
| `src/dynamoQueries.ts` | 1-80 | DynamoDB state management |

### Verification Approach

1. **Cross-reference:** Information from code analysis was verified against actual file contents
2. **Type checking:** TypeScript types provided authoritative schema information
3. **Comment analysis:** Code comments (especially JSDoc) provided context for business logic
4. **Test files:** Integration tests (`*.test.integration.ts`) validated expected behaviors

---

## Appendix

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `INVOICING_DYNAMO_TABLE` | DynamoDB table name for invoice state |
| `BILLOGRAM_CLIENT_TIMEOUT` | Timeout for Billogram API calls (default: 60000ms) |
| `FORCE_MANUAL_EVENT` | Force manual event processing mode |

### Error Handling

The service uses Slack notifications for critical errors:
- Missing SPAR address
- Invalid template IDs
- Unverified user emails
- Missing payment records

### Monitoring

Key log patterns for monitoring:
- `[INTERNAL] [COUNT]` - Metrics for tracking
- `[INVOICING] [LAMBDA]` - Lambda execution timing
- `[INVOICING] [HTTP]` - External API call timing
