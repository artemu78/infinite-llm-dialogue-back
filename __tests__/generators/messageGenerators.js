/**
 * Message generators for property-based testing
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
const fc = require('fast-check');

/**
 * Valid sender types for chat messages
 */
const VALID_SENDERS = ['user', 'gemini', 'claude', 'openai'];

/**
 * Arbitrary generator for valid sender values
 */
const senderArb = fc.constantFrom(...VALID_SENDERS);

/**
 * Arbitrary generator for valid email addresses
 */
const emailArb = fc.emailAddress();

/**
 * Arbitrary generator for valid message content (non-empty strings)
 */
const messageContentArb = fc.string({ minLength: 1, maxLength: 1000 });

/**
 * Arbitrary generator for valid datetime (positive integers representing timestamps)
 */
const datetimeArb = fc.integer({ min: 1, max: Date.now() + 86400000 }); // Up to 1 day in future

/**
 * Arbitrary generator for valid ChatMessage objects
 * Matches the data model from design.md
 */
const validChatMessageArb = fc.record({
  id: fc.constant('chat'),
  datetime: datetimeArb,
  sender: senderArb,
  message: messageContentArb,
  email: fc.option(emailArb, { nil: undefined }),
  isProcessed: fc.boolean()
});

/**
 * Arbitrary generator for user ChatMessage (always has email, sender is 'user')
 */
const userChatMessageArb = fc.record({
  id: fc.constant('chat'),
  datetime: datetimeArb,
  sender: fc.constant('user'),
  message: messageContentArb,
  email: emailArb,
  isProcessed: fc.boolean()
});

/**
 * Arbitrary generator for AI ChatMessage (no email, sender is AI persona)
 */
const aiChatMessageArb = fc.record({
  id: fc.constant('chat'),
  datetime: datetimeArb,
  sender: fc.constantFrom('gemini', 'claude', 'openai'),
  message: messageContentArb,
  email: fc.constant(undefined),
  isProcessed: fc.boolean()
});

/**
 * Arbitrary generator for new (unprocessed) ChatMessage
 * Per Requirement 1.5: new messages have isProcessed=false
 */
const newChatMessageArb = fc.record({
  id: fc.constant('chat'),
  datetime: datetimeArb,
  sender: senderArb,
  message: messageContentArb,
  email: fc.option(emailArb, { nil: undefined }),
  isProcessed: fc.constant(false)
});

/**
 * Arbitrary generator for processed ChatMessage
 */
const processedChatMessageArb = fc.record({
  id: fc.constant('chat'),
  datetime: datetimeArb,
  sender: senderArb,
  message: messageContentArb,
  email: fc.option(emailArb, { nil: undefined }),
  isProcessed: fc.constant(true)
});

// --- Invalid payload generators for testing error handling ---

/**
 * Arbitrary generator for ChatMessage with missing required fields
 */
const invalidMissingFieldsArb = fc.oneof(
  // Missing sender
  fc.record({
    id: fc.constant('chat'),
    datetime: datetimeArb,
    message: messageContentArb,
    isProcessed: fc.boolean()
  }),
  // Missing message
  fc.record({
    id: fc.constant('chat'),
    datetime: datetimeArb,
    sender: senderArb,
    isProcessed: fc.boolean()
  }),
  // Missing datetime
  fc.record({
    id: fc.constant('chat'),
    sender: senderArb,
    message: messageContentArb,
    isProcessed: fc.boolean()
  })
);

/**
 * Arbitrary generator for ChatMessage with invalid sender
 */
const invalidSenderArb = fc.record({
  id: fc.constant('chat'),
  datetime: datetimeArb,
  sender: fc.string().filter(s => !VALID_SENDERS.includes(s)),
  message: messageContentArb,
  email: fc.option(emailArb, { nil: undefined }),
  isProcessed: fc.boolean()
});

/**
 * Arbitrary generator for ChatMessage with empty message
 */
const emptyMessageArb = fc.record({
  id: fc.constant('chat'),
  datetime: datetimeArb,
  sender: senderArb,
  message: fc.constant(''),
  email: fc.option(emailArb, { nil: undefined }),
  isProcessed: fc.boolean()
});

/**
 * Arbitrary generator for ChatMessage with invalid datetime (negative or non-number)
 */
const invalidDatetimeArb = fc.record({
  id: fc.constant('chat'),
  datetime: fc.oneof(fc.integer({ max: 0 }), fc.constant(null), fc.constant(undefined)),
  sender: senderArb,
  message: messageContentArb,
  email: fc.option(emailArb, { nil: undefined }),
  isProcessed: fc.boolean()
});

module.exports = {
  // Valid generators
  validChatMessageArb,
  userChatMessageArb,
  aiChatMessageArb,
  newChatMessageArb,
  processedChatMessageArb,
  
  // Invalid generators
  invalidMissingFieldsArb,
  invalidSenderArb,
  emptyMessageArb,
  invalidDatetimeArb,
  
  // Component generators
  senderArb,
  emailArb,
  messageContentArb,
  datetimeArb,
  
  // Constants
  VALID_SENDERS
};
