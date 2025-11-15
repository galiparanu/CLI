/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand, type MessageActionReturn, type OpenDialogActionReturn } from './types.js';
import { ModelService, ModelSlashCommandEvent, logModelSlashCommand } from '@google/gemini-cli-core';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Opens a dialog to configure the model or switch to a specific model',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn | OpenDialogActionReturn> => {
    const config = context.services.config;
    
    // If no arguments provided, open the dialog
    if (!args || args.trim() === '') {
      return {
        type: 'dialog',
        dialog: 'model',
      };
    }
    
    // If arguments provided, try to switch to that model
    const requestedAlias = args.trim();
    
    // Check if model router is enabled
    if (!config?.getUseModelRouter()) {
      // If model router is not enabled, just set the model directly
      // This maintains backward compatibility with the original behavior
      if (config) {
        config.setModel(requestedAlias);
        const event = new ModelSlashCommandEvent(requestedAlias);
        logModelSlashCommand(config, event);
      }
      
      return {
        type: 'message',
        messageType: 'info',
        content: `Active model is now: ${requestedAlias}`,
      };
    }
    
    // Model router is enabled, validate against models.yaml
    try {
      const modelService = new ModelService();
      modelService.loadModels();
      
      // Validate that the requested model exists
      if (!modelService.hasModel(requestedAlias)) {
        const availableAliases = modelService.getAvailableAliases();
        return {
          type: 'message',
          messageType: 'error',
          content: `Error: Model '${requestedAlias}' not found. Available models are: ${availableAliases.join(', ')}.`,
        };
      }
      
      // Model is valid, get its configuration
      const modelConfig = modelService.getModel(requestedAlias);
      
      // Update the active model in config
      if (config) {
        config.setModel(requestedAlias);
        const event = new ModelSlashCommandEvent(requestedAlias);
        logModelSlashCommand(config, event);
      }
      
      return {
        type: 'message',
        messageType: 'info',
        content: `Active model is now: ${requestedAlias} (${modelConfig?.name || requestedAlias}).`,
      };
    } catch (error) {
      // If models.yaml fails to load, show error but don't crash
      return {
        type: 'message',
        messageType: 'error',
        content: `Error loading model configuration: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
