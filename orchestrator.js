/**
 * Orchestrator Lambda Handler
 * Manages asynchronous AI response generation for multi-LLM chat
 * 
 * Triggered by EventBridge Scheduler every 2 minutes
 * Requirements: 3.2, 3.3
 */

const { log } = require('./config.js');
const { 
  getChatMetadata, 
  getLatestMessage,
  markMessageProcessed,
  batchWriteResponseAndUpdate
} = require('./services/dynamoDbService.js');
const { 
  getOrchestratorDecision, 
  generateResponse 
} = require('./services/llmService.js');
const { 
  getNextSpeaker, 
  incrementSpeakerIndex 
} = require('./services/speakerService.js');
const { createChatMessage } = require('./models/chatMessage.js');

/**
 * Build context string from the latest message for orchestrator decision
 * @param {Object} message - The latest chat message
 * @returns {string} Formatted context string
 */
function buildContextFromMessage(message) {
  const timestamp = new Date(message.datetime).toISOString();
  const emailPart = message.email ? ` <${message.email}>` : '';
  return `[${timestamp}] ${message.sender}${emailPart}: ${message.message}`;
}

/**
 * Main orchestrator handler
 * Implements the orchestration loop logic:
 * 1. Fetch metadata and latest message
 * 2. Check if processing is needed
 * 3. Get orchestrator decision (RESPOND/WAIT)
 * 4. Execute appropriate action
 * 
 * @param {Object} event - EventBridge event (not used, but required by Lambda)
 * @returns {Object} Response object with statusCode and body
 */
exports.handler = async (event) => {
  const debug = process.env.DEBUG === 'true';
  
  log(debug, 'Orchestrator Lambda invoked');

  try {
    // Step 1: Fetch metadata and latest message (Requirements: 3.2, 3.3)
    const [metadata, latestMessage] = await Promise.all([
      getChatMetadata(debug),
      getLatestMessage(debug)
    ]);

    // Check if metadata exists
    if (!metadata) {
      console.error('Chat metadata not found. Orchestrator cannot proceed.');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          action: 'EXIT', 
          reason: 'Metadata not found' 
        })
      };
    }

    log(debug, 'Fetched metadata:', metadata);

    // Step 2: Check if no messages exist (Requirement: 4.2)
    if (!latestMessage) {
      log(debug, 'No messages exist in chat. Exiting without action.');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          action: 'EXIT', 
          reason: 'No messages exist' 
        })
      };
    }

    log(debug, 'Latest message:', latestMessage);

    // Step 3: Check if latest message is already processed (Requirement: 4.1)
    // Skip metadata item (datetime=0) - only process actual messages
    if (latestMessage.datetime === 0) {
      log(debug, 'Latest item is metadata, not a message. Exiting without action.');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          action: 'EXIT', 
          reason: 'No messages to process' 
        })
      };
    }

    if (latestMessage.isProcessed === true) {
      log(debug, 'Latest message already processed. Exiting without action.');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          action: 'EXIT', 
          reason: 'Message already processed' 
        })
      };
    }

    // Step 4: Call Orchestrator LLM for decision (Requirements: 4.3, 4.4, 4.5)
    const context = buildContextFromMessage(latestMessage);
    log(debug, 'Built context for orchestrator:', context);

    const decision = await getOrchestratorDecision(context, debug);
    log(debug, 'Orchestrator decision:', decision);

    // Step 5: Handle WAIT action (Requirements: 5.1, 5.2)
    if (decision.action === 'WAIT') {
      log(debug, 'Orchestrator decided to WAIT. Marking message as processed.');
      await markMessageProcessed(latestMessage.datetime, debug);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          action: 'WAIT', 
          messageProcessed: latestMessage.datetime 
        })
      };
    }

    // Step 6: Handle RESPOND action (Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6)
    if (decision.action === 'RESPOND') {
      log(debug, 'Orchestrator decided to RESPOND.');

      // Get current speaker (Requirement: 6.1)
      const currentSpeaker = getNextSpeaker(metadata);
      log(debug, 'Current speaker:', currentSpeaker);

      // Call appropriate LLM API (Requirement: 6.2)
      const responseText = await generateResponse(
        currentSpeaker.provider,
        latestMessage.message,
        currentSpeaker.personality,
        debug
      );
      log(debug, 'LLM response:', responseText);

      // Create new message with isProcessed=false (Requirement: 6.3)
      const newMessage = createChatMessage(
        currentSpeaker.name,
        responseText
      );
      log(debug, 'New message created:', newMessage);

      // Calculate next speaker index (Requirement: 6.5)
      const newSpeakerIndex = incrementSpeakerIndex(
        metadata.nextSpeakerIndex,
        metadata.llmParticipants.length
      );
      log(debug, 'New speaker index:', newSpeakerIndex);

      // Batch write: save new message, mark original as processed, update index (Requirement: 6.6)
      await batchWriteResponseAndUpdate(
        newMessage,
        latestMessage.datetime,
        newSpeakerIndex,
        debug
      );
      log(debug, 'Batch write completed successfully');

      return {
        statusCode: 200,
        body: JSON.stringify({
          action: 'RESPOND',
          speaker: currentSpeaker.name,
          provider: currentSpeaker.provider,
          newMessageDatetime: newMessage.datetime,
          originalMessageProcessed: latestMessage.datetime,
          newSpeakerIndex: newSpeakerIndex
        })
      };
    }

    // Unexpected decision action (should not happen due to validation in llmService)
    console.error('Unexpected orchestrator decision:', decision);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Unexpected orchestrator decision',
        decision: decision 
      })
    };

  } catch (error) {
    // Error handling (Requirement: 8.4)
    // Log error but don't corrupt chat state
    console.error('Orchestrator error:', error.message);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Orchestrator error',
        message: error.message 
      })
    };
  }
};

// Export internal functions for testing
module.exports.buildContextFromMessage = buildContextFromMessage;
