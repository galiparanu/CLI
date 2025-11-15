/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single message in the conversation history.
 */
export interface Message {
  role: 'user' | 'model';
  content: string;
}

/**
 * Represents the runtime state of the CLI application.
 * Manages the active model selection, conversation history, and persona.
 */
export class CliState {
  private activeModelAlias: string;
  private history: Message[];
  private persona: string;

  constructor(
    initialModel: string = 'gemini',
    initialPersona: string = '',
  ) {
    this.activeModelAlias = initialModel;
    this.history = [];
    this.persona = initialPersona;
  }

  /**
   * Gets the currently active model alias.
   */
  getActiveModelAlias(): string {
    return this.activeModelAlias;
  }

  /**
   * Sets the active model alias.
   */
  setActiveModelAlias(alias: string): void {
    this.activeModelAlias = alias;
  }

  /**
   * Gets the conversation history.
   */
  getHistory(): Message[] {
    return [...this.history];
  }

  /**
   * Adds a message to the conversation history.
   */
  addMessage(message: Message): void {
    this.history.push(message);
  }

  /**
   * Clears the conversation history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Gets the persona (JARVIS system prompt).
   */
  getPersona(): string {
    return this.persona;
  }

  /**
   * Sets the persona (JARVIS system prompt).
   */
  setPersona(persona: string): void {
    this.persona = persona;
  }
}
