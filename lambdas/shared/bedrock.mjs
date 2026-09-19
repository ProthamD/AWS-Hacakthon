/**
 * shared/bedrock.mjs — Universal Bedrock Converse API wrapper.
 *
 * Uses the ConverseCommand (universal API) instead of InvokeModelCommand
 * so it works with Amazon Nova, Claude, Titan, and any future models
 * without changing payload format per model.
 *
 * Model: amazon.nova-lite-v1:0 (1st-party, no use-case approval needed)
 */

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export const DEFAULT_MODEL = process.env.BEDROCK_MODEL_ID || "apac.amazon.nova-lite-v1:0";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-south-1" });

/**
 * Call Bedrock using the universal Converse API.
 *
 * @param {object} opts
 * @param {string} opts.userMessage   — the user's message text
 * @param {string} [opts.systemPrompt] — optional system prompt
 * @param {number} [opts.maxTokens]   — max response tokens (default 400)
 * @param {string} [opts.modelId]     — override model (default: env var)
 * @returns {Promise<string>}          — response text
 */
export async function converse({ userMessage, systemPrompt, maxTokens = 400, modelId = DEFAULT_MODEL }) {
  const input = {
    modelId,
    messages: [
      {
        role: "user",
        content: [{ text: userMessage }],
      },
    ],
    inferenceConfig: {
      maxTokens,
      temperature: 0.7,
    },
  };

  // System prompt (optional)
  if (systemPrompt) {
    input.system = [{ text: systemPrompt }];
  }

  const response = await client.send(new ConverseCommand(input));
  return response.output?.message?.content?.[0]?.text || "";
}
