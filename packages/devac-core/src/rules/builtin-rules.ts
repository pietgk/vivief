/**
 * Builtin Rules - Default Pattern Detection
 *
 * Common patterns for detecting domain effects from code effects.
 * These rules can be used out-of-the-box or customized.
 *
 * Part of DevAC v3.0 Foundation.
 */

import { type Rule, defineRule } from "./rule-engine.js";

/**
 * Database operation rules
 */
export const databaseRules: Rule[] = [
  defineRule({
    id: "db-write-dynamodb",
    name: "DynamoDB Write",
    description: "Detects DynamoDB put/update operations",
    match: {
      effectType: "FunctionCall",
      callee: /dynamodb.*\.(put|update|delete|batchWrite)/i,
      isExternal: true,
    },
    emit: {
      domain: "Database",
      action: "Write",
      metadata: { provider: "dynamodb" },
    },
    priority: 10,
  }),

  defineRule({
    id: "db-read-dynamodb",
    name: "DynamoDB Read",
    description: "Detects DynamoDB get/query/scan operations",
    match: {
      effectType: "FunctionCall",
      callee: /dynamodb.*\.(get|query|scan|batchGet)/i,
      isExternal: true,
    },
    emit: {
      domain: "Database",
      action: "Read",
      metadata: { provider: "dynamodb" },
    },
    priority: 10,
  }),

  defineRule({
    id: "db-write-sql",
    name: "SQL Write",
    description: "Detects SQL INSERT/UPDATE/DELETE operations",
    match: {
      effectType: "FunctionCall",
      callee: /\.(insert|update|delete|execute|run)\(/i,
    },
    emit: {
      domain: "Database",
      action: "Write",
      metadata: { provider: "sql" },
    },
    priority: 5,
  }),

  defineRule({
    id: "db-read-sql",
    name: "SQL Read",
    description: "Detects SQL SELECT/query operations",
    match: {
      effectType: "FunctionCall",
      callee: /\.(select|query|find|all|first|get)\(/i,
    },
    emit: {
      domain: "Database",
      action: "Read",
      metadata: { provider: "sql" },
    },
    priority: 5,
  }),

  defineRule({
    id: "db-prisma-write",
    name: "Prisma Write",
    description: "Detects Prisma create/update/delete operations",
    match: {
      effectType: "FunctionCall",
      callee: /prisma\.\w+\.(create|update|upsert|delete|deleteMany|updateMany)/i,
    },
    emit: {
      domain: "Database",
      action: "Write",
      metadata: { provider: "prisma" },
    },
    priority: 10,
  }),

  defineRule({
    id: "db-prisma-read",
    name: "Prisma Read",
    description: "Detects Prisma findUnique/findMany/count operations",
    match: {
      effectType: "FunctionCall",
      callee: /prisma\.\w+\.(findUnique|findFirst|findMany|count|aggregate)/i,
    },
    emit: {
      domain: "Database",
      action: "Read",
      metadata: { provider: "prisma" },
    },
    priority: 10,
  }),
];

/**
 * Payment processing rules
 */
export const paymentRules: Rule[] = [
  defineRule({
    id: "payment-stripe-charge",
    name: "Stripe Charge",
    description: "Detects Stripe payment creation",
    match: {
      effectType: "FunctionCall",
      callee: /stripe\.(charges|paymentIntents)\.(create|confirm)/i,
      isExternal: true,
    },
    emit: {
      domain: "Payment",
      action: "Charge",
      metadata: { provider: "stripe" },
    },
    priority: 20,
  }),

  defineRule({
    id: "payment-stripe-refund",
    name: "Stripe Refund",
    description: "Detects Stripe refund operations",
    match: {
      effectType: "FunctionCall",
      callee: /stripe\.refunds\.create/i,
      isExternal: true,
    },
    emit: {
      domain: "Payment",
      action: "Refund",
      metadata: { provider: "stripe" },
    },
    priority: 20,
  }),

  defineRule({
    id: "payment-stripe-subscription",
    name: "Stripe Subscription",
    description: "Detects Stripe subscription operations",
    match: {
      effectType: "FunctionCall",
      callee: /stripe\.subscriptions\.(create|update|cancel)/i,
      isExternal: true,
    },
    emit: {
      domain: "Payment",
      action: "Subscription",
      metadata: { provider: "stripe" },
    },
    priority: 20,
  }),
];

/**
 * Authentication and authorization rules
 */
export const authRules: Rule[] = [
  defineRule({
    id: "auth-jwt-sign",
    name: "JWT Sign",
    description: "Detects JWT token creation",
    match: {
      effectType: "FunctionCall",
      callee: /jwt\.(sign|encode)/i,
    },
    emit: {
      domain: "Auth",
      action: "TokenCreate",
      metadata: { type: "jwt" },
    },
    priority: 15,
  }),

  defineRule({
    id: "auth-jwt-verify",
    name: "JWT Verify",
    description: "Detects JWT token verification",
    match: {
      effectType: "FunctionCall",
      callee: /jwt\.(verify|decode)/i,
    },
    emit: {
      domain: "Auth",
      action: "TokenVerify",
      metadata: { type: "jwt" },
    },
    priority: 15,
  }),

  defineRule({
    id: "auth-bcrypt-hash",
    name: "Password Hash",
    description: "Detects password hashing",
    match: {
      effectType: "FunctionCall",
      callee: /bcrypt\.(hash|hashSync)/i,
    },
    emit: {
      domain: "Auth",
      action: "PasswordHash",
    },
    priority: 15,
  }),

  defineRule({
    id: "auth-bcrypt-compare",
    name: "Password Compare",
    description: "Detects password verification",
    match: {
      effectType: "FunctionCall",
      callee: /bcrypt\.(compare|compareSync)/i,
    },
    emit: {
      domain: "Auth",
      action: "PasswordVerify",
    },
    priority: 15,
  }),

  defineRule({
    id: "auth-cognito",
    name: "Cognito Auth",
    description: "Detects AWS Cognito authentication",
    match: {
      effectType: "FunctionCall",
      callee: /cognito.*\.(adminInitiateAuth|initiateAuth|signUp|confirmSignUp)/i,
      isExternal: true,
    },
    emit: {
      domain: "Auth",
      action: "CognitoAuth",
      metadata: { provider: "aws-cognito" },
    },
    priority: 20,
  }),
];

/**
 * HTTP/Network communication rules
 */
export const httpRules: Rule[] = [
  defineRule({
    id: "http-fetch",
    name: "HTTP Fetch",
    description: "Detects fetch API calls",
    match: {
      effectType: "FunctionCall",
      callee: /^fetch$/,
      isExternal: true,
    },
    emit: {
      domain: "HTTP",
      action: "Request",
      metadata: { method: "fetch" },
    },
    priority: 5,
  }),

  defineRule({
    id: "http-axios",
    name: "Axios Request",
    description: "Detects axios HTTP calls",
    match: {
      effectType: "FunctionCall",
      callee: /axios\.(get|post|put|patch|delete|request)/i,
      isExternal: true,
    },
    emit: {
      domain: "HTTP",
      action: "Request",
      metadata: { method: "axios" },
    },
    priority: 10,
  }),
];

/**
 * Messaging and queue rules
 */
export const messagingRules: Rule[] = [
  defineRule({
    id: "messaging-sqs-send",
    name: "SQS Send",
    description: "Detects SQS message sending",
    match: {
      effectType: "FunctionCall",
      callee: /sqs.*\.(sendMessage|sendMessageBatch)/i,
      isExternal: true,
    },
    emit: {
      domain: "Messaging",
      action: "Send",
      metadata: { provider: "aws-sqs" },
    },
    priority: 15,
  }),

  defineRule({
    id: "messaging-sqs-receive",
    name: "SQS Receive",
    description: "Detects SQS message receiving",
    match: {
      effectType: "FunctionCall",
      callee: /sqs.*\.(receiveMessage)/i,
      isExternal: true,
    },
    emit: {
      domain: "Messaging",
      action: "Receive",
      metadata: { provider: "aws-sqs" },
    },
    priority: 15,
  }),

  defineRule({
    id: "messaging-sns-publish",
    name: "SNS Publish",
    description: "Detects SNS topic publishing",
    match: {
      effectType: "FunctionCall",
      callee: /sns.*\.(publish)/i,
      isExternal: true,
    },
    emit: {
      domain: "Messaging",
      action: "Publish",
      metadata: { provider: "aws-sns" },
    },
    priority: 15,
  }),

  defineRule({
    id: "messaging-eventbridge",
    name: "EventBridge Put",
    description: "Detects EventBridge event publishing",
    match: {
      effectType: "FunctionCall",
      callee: /eventbridge.*\.(putEvents)/i,
      isExternal: true,
    },
    emit: {
      domain: "Messaging",
      action: "Publish",
      metadata: { provider: "aws-eventbridge" },
    },
    priority: 15,
  }),
];

/**
 * Storage rules (S3, file system, etc.)
 */
export const storageRules: Rule[] = [
  defineRule({
    id: "storage-s3-put",
    name: "S3 Put",
    description: "Detects S3 object uploads",
    match: {
      effectType: "FunctionCall",
      callee: /s3.*\.(putObject|upload)/i,
      isExternal: true,
    },
    emit: {
      domain: "Storage",
      action: "Write",
      metadata: { provider: "aws-s3" },
    },
    priority: 15,
  }),

  defineRule({
    id: "storage-s3-get",
    name: "S3 Get",
    description: "Detects S3 object downloads",
    match: {
      effectType: "FunctionCall",
      callee: /s3.*\.(getObject)/i,
      isExternal: true,
    },
    emit: {
      domain: "Storage",
      action: "Read",
      metadata: { provider: "aws-s3" },
    },
    priority: 15,
  }),

  defineRule({
    id: "storage-fs-write",
    name: "File System Write",
    description: "Detects file system write operations",
    match: {
      effectType: "FunctionCall",
      callee: /fs.*\.(writeFile|appendFile|createWriteStream)/i,
    },
    emit: {
      domain: "Storage",
      action: "Write",
      metadata: { provider: "filesystem" },
    },
    priority: 5,
  }),

  defineRule({
    id: "storage-fs-read",
    name: "File System Read",
    description: "Detects file system read operations",
    match: {
      effectType: "FunctionCall",
      callee: /fs.*\.(readFile|createReadStream)/i,
    },
    emit: {
      domain: "Storage",
      action: "Read",
      metadata: { provider: "filesystem" },
    },
    priority: 5,
  }),
];

/**
 * Logging and monitoring rules
 */
export const observabilityRules: Rule[] = [
  defineRule({
    id: "logging-console",
    name: "Console Log",
    description: "Detects console logging",
    match: {
      effectType: "FunctionCall",
      callee: /console\.(log|info|warn|error|debug)/,
    },
    emit: {
      domain: "Observability",
      action: "Log",
      metadata: { provider: "console" },
    },
    priority: 1,
  }),

  defineRule({
    id: "logging-datadog",
    name: "Datadog Metric",
    description: "Detects Datadog metrics/tracing",
    match: {
      effectType: "FunctionCall",
      callee: /dd-trace|datadog/i,
      isExternal: true,
    },
    emit: {
      domain: "Observability",
      action: "Metric",
      metadata: { provider: "datadog" },
    },
    priority: 10,
  }),
];

/**
 * All builtin rules combined
 */
export const builtinRules: Rule[] = [
  ...databaseRules,
  ...paymentRules,
  ...authRules,
  ...httpRules,
  ...messagingRules,
  ...storageRules,
  ...observabilityRules,
];

/**
 * Get builtin rules by domain
 */
export function getRulesByDomain(domain: string): Rule[] {
  return builtinRules.filter((rule) => rule.emit.domain === domain);
}

/**
 * Get builtin rules by provider
 */
export function getRulesByProvider(provider: string): Rule[] {
  return builtinRules.filter((rule) => rule.emit.metadata?.provider === provider);
}
