/**
 * LLM Service - Multi-provider support for Gemini, Anthropic, and OpenAI
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { log } = require('../config.js');

// Environment variables for API keys
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_MODEL_NAME = process.env.GOOGLE_MODEL_NAME || "gemini-2.0-flash-lite-preview-02-05";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL_NAME = process.env.ANTHROPIC_MODEL_NAME || "claude-3-haiku-20240307";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || "gpt-4o-mini";

/**
 * Generate a response using Google's Gemini API
 * @param {string} prompt - The prompt to send to the model
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} - The generated response text
 */
async function generateGeminiResponse(prompt, debug = false) {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: GOOGLE_MODEL_NAME });

  log(debug, "Gemini prompt:", prompt);

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  log(debug, "Gemini response:", text);

  return text;
}

/**
 * Generate a response using Anthropic's Claude API via native fetch
 * @param {string} prompt - The prompt to send to the model
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} - The generated response text
 */
async function generateAnthropicResponse(prompt, debug = false) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  log(debug, "Anthropic prompt:", prompt);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL_NAME,
      max_tokens: 1024,
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  // Filter for text content blocks only (Claude can return multiple block types)
  const text = data.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n");

  log(debug, "Anthropic response:", text);

  return text;
}


/**
 * Generate a response using OpenAI's API via native fetch
 * @param {string} prompt - The prompt to send to the model
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} - The generated response text
 */
async function generateOpenAIResponse(prompt, debug = false) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  log(debug, "OpenAI prompt:", prompt);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_NAME,
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const text = data.choices[0]?.message?.content || "";

  log(debug, "OpenAI response:", text);

  return text;
}

/**
 * Build a prompt from user input and personality configuration
 * @param {string} userInput - The user's input message
 * @param {object} personality - Personality configuration with moods array
 * @returns {string} - The constructed prompt
 */
function buildPrompt(userInput, personality) {
  if (!personality || !personality.moods || personality.moods.length === 0) {
    return userInput;
  }
  const randomMood = personality.moods[Math.floor(Math.random() * personality.moods.length)];
  return randomMood + userInput;
}

/**
 * Unified interface to generate a response from any supported LLM provider
 * @param {string} provider - The provider to use: "google", "anthropic", or "openai"
 * @param {string} prompt - The prompt/user input to send
 * @param {object} personality - Optional personality configuration with moods
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} - The generated response text
 * @throws {Error} - If provider is not supported or API call fails
 */
async function generateResponse(provider, prompt, personality = null, debug = false) {
  const fullPrompt = personality ? buildPrompt(prompt, personality) : prompt;

  try {
    switch (provider.toLowerCase()) {
      case "google":
        return await generateGeminiResponse(fullPrompt, debug);
      case "anthropic":
        return await generateAnthropicResponse(fullPrompt, debug);
      case "openai":
        return await generateOpenAIResponse(fullPrompt, debug);
      default:
        throw new Error(`Unsupported LLM provider: ${provider}. Supported providers: google, anthropic, openai`);
    }
  } catch (error) {
    console.error(`Error generating response from ${provider}:`, error);
    throw error;
  }
}

// Orchestrator configuration
const ORCHESTRATOR_MODEL_NAME = process.env.ORCHESTRATOR_MODEL_NAME || "gemini-1.5-flash";

/**
 * Orchestrator decision response structure
 * @typedef {Object} OrchestratorDecision
 * @property {'RESPOND' | 'WAIT'} action - The action to take
 */

/**
 * Valid orchestrator actions
 */
const VALID_ORCHESTRATOR_ACTIONS = ['RESPOND', 'WAIT'];

/**
 * Validate an orchestrator decision response
 * @param {any} decision - The parsed decision object
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidOrchestratorDecision(decision) {
  if (!decision || typeof decision !== 'object') {
    return false;
  }
  if (!decision.action || typeof decision.action !== 'string') {
    return false;
  }
  return VALID_ORCHESTRATOR_ACTIONS.includes(decision.action.toUpperCase());
}

/**
 * Parse and validate the orchestrator LLM response
 * @param {string} responseText - Raw response text from the LLM
 * @returns {OrchestratorDecision} - Validated decision object
 * @throws {Error} - If response cannot be parsed or is invalid
 */
function parseOrchestratorResponse(responseText) {
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonStr = responseText.trim();
  
  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }
  
  // Try to find JSON object in the response
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  let decision;
  try {
    decision = JSON.parse(jsonStr);
  } catch (parseError) {
    throw new Error(`Failed to parse orchestrator response as JSON: ${responseText}`);
  }

  if (!isValidOrchestratorDecision(decision)) {
    throw new Error(`Invalid orchestrator decision. Expected action to be "RESPOND" or "WAIT", got: ${JSON.stringify(decision)}`);
  }

  // Normalize the action to uppercase
  return {
    action: decision.action.toUpperCase()
  };
}

/**
 * Build the orchestrator prompt with chat context
 * @param {string} context - The chat context (latest messages)
 * @returns {string} - The formatted prompt for the orchestrator
 */
function buildOrchestratorPrompt(context) {
  return `You are a conversation orchestrator for a multi-AI chat system. Your job is to analyze the latest message in the conversation and decide whether an AI should respond or wait.

Analyze the following chat context and decide:
- If the message seems to invite or expect a response from an AI participant, respond with "RESPOND"
- If the message seems like the user is still typing, thinking, or the conversation should pause, respond with "WAIT"

Chat context:
${context}

Respond with ONLY a JSON object in this exact format (no other text):
{"action": "RESPOND"} or {"action": "WAIT"}`;
}

/**
 * Get orchestrator decision on whether to respond or wait
 * Uses Gemini 1.5 Flash for fast decision making
 * 
 * @param {string} context - The chat context to analyze
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<OrchestratorDecision>} - The decision object with action field
 * @throws {Error} - If API call fails or response is invalid
 */
async function getOrchestratorDecision(context, debug = false) {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: ORCHESTRATOR_MODEL_NAME });

  const prompt = buildOrchestratorPrompt(context);
  
  log(debug, "Orchestrator prompt:", prompt);

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    log(debug, "Orchestrator raw response:", text);

    const decision = parseOrchestratorResponse(text);
    
    log(debug, "Orchestrator decision:", decision);

    return decision;
  } catch (error) {
    console.error("Error getting orchestrator decision:", error);
    throw error;
  }
}

module.exports = {
  generateResponse,
  generateGeminiResponse,
  generateAnthropicResponse,
  generateOpenAIResponse,
  buildPrompt,
  getOrchestratorDecision,
  parseOrchestratorResponse,
  isValidOrchestratorDecision,
  VALID_ORCHESTRATOR_ACTIONS
};
