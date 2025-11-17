/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// List of sensitive keys to redact from logs
const SENSITIVE_KEYS = [
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'Authorization',
  'access_token',
  'client_secret',
];

// Regex to find and redact sensitive information
const REDACTION_REGEX = new RegExp(
  `("?(${SENSITIVE_KEYS.join('|')})"?\\s*[:=]\\s*"?)([^"\\s,{}]+)("?)`,
  'gi',
);

/**
 * Redact sensitive information from a string
 * @param text The text to redact
 * @returns The redacted text
 */
export function redact(text: string): string {
  if (!text) {
    return text;
  }
  return text.replace(REDACTION_REGEX, '$1[REDACTED]$4');
}

/**
 * Redact sensitive information from an error object
 * @param error The error to redact
 * @returns The redacted error
 */
export function redactError(error: Error): Error {
  if (error.message) {
    error.message = redact(error.message);
  }
  if (error.stack) {
    error.stack = redact(error.stack);
  }
  return error;
}
