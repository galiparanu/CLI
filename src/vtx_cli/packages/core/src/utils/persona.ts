/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Loads the persona (JARVIS system prompt) from persona.txt
 * @param personaPath Optional custom path to persona file. Defaults to persona.txt in project root.
 * @returns The persona text content, or empty string if file doesn't exist
 */
export function loadPersona(personaPath?: string): string {
  const filePath = personaPath || path.join(process.cwd(), 'persona.txt');
  
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
  } catch (error) {
    // Silently fail if persona file doesn't exist or can't be read
    // The CLI should work without it
  }
  
  return '';
}
