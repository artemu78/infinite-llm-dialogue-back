/**
 * ChatMessage model with serialization/deserialization functions
 * Requirements: 1.1, 1.2, 1.3, 1.4, 9.1, 9.2, 9.3
 */

/**
 * Validates that a ChatMessage has all required fields
 * @param {Object} message - The message object to validate
 * @throws {Error} If required fields are missing or invalid
 */
function validateChatMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new Error('Message must be an object');
  }

  if (message.id !== 'chat') {
    throw new Error('Message id must be "chat"');
  }

  if (typeof message.datetime !== 'number' || message.datetime <= 0) {
    throw new Error('Message datetime must be a positive number');
  }

  const validSenders = ['user', 'gemini', 'claude', 'openai'];
  if (!validSenders.includes(message.sender)) {
    throw new Error(`Message sender must be one of: ${validSenders.join(', ')}`);
  }

  if (typeof message.message !== 'string' || message.message.length === 0) {
    throw new Error('Message content must be a non-empty string');
  }

  if (typeof message.isProcessed !== 'boolean') {
    throw new Error('Message isProcessed must be a boolean');
  }

  // email is optional, but if present must be a string
  if (message.email !== undefined && typeof message.email !== 'string') {
    throw new Error('Message email must be a string or undefined');
  }
}

/**
 * Serializes a ChatMessage object to DynamoDB format
 * @param {Object} message - The ChatMessage object to serialize
 * @returns {Object} DynamoDB formatted item
 * @throws {Error} If message validation fails
 */
function serializeChatMessage(message) {
  validateChatMessage(message);

  const item = {
    id: { S: message.id },
    datetime: { N: String(message.datetime) },
    sender: { S: message.sender },
    message: { S: message.message },
    isProcessed: { BOOL: message.isProcessed }
  };

  // Only include email if it's defined
  if (message.email !== undefined) {
    item.email = { S: message.email };
  }

  return item;
}

/**
 * Deserializes a DynamoDB item to a ChatMessage object
 * @param {Object} item - The DynamoDB item to deserialize
 * @returns {Object} ChatMessage object
 * @throws {Error} If item is missing required fields
 */
function deserializeChatMessage(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Item must be an object');
  }

  if (!item.id || !item.id.S) {
    throw new Error('Item missing required field: id');
  }

  if (!item.datetime || !item.datetime.N) {
    throw new Error('Item missing required field: datetime');
  }

  if (!item.sender || !item.sender.S) {
    throw new Error('Item missing required field: sender');
  }

  if (!item.message || !item.message.S) {
    throw new Error('Item missing required field: message');
  }

  if (item.isProcessed === undefined || item.isProcessed.BOOL === undefined) {
    throw new Error('Item missing required field: isProcessed');
  }

  const message = {
    id: item.id.S,
    datetime: Number(item.datetime.N),
    sender: item.sender.S,
    message: item.message.S,
    isProcessed: item.isProcessed.BOOL
  };

  // Include email if present
  if (item.email && item.email.S) {
    message.email = item.email.S;
  }

  return message;
}

/**
 * Pretty prints a ChatMessage for debugging
 * @param {Object} message - The ChatMessage object to print
 * @returns {string} Formatted message string
 */
function prettyPrintChatMessage(message) {
  validateChatMessage(message);

  const timestamp = new Date(message.datetime).toISOString();
  const emailPart = message.email ? ` <${message.email}>` : '';
  const processedFlag = message.isProcessed ? '[✓]' : '[○]';

  return `${processedFlag} [${timestamp}] ${message.sender}${emailPart}: ${message.message}`;
}

/**
 * Creates a new ChatMessage object with default values
 * @param {string} sender - The sender of the message
 * @param {string} messageContent - The message content
 * @param {string} [email] - Optional email address
 * @returns {Object} New ChatMessage object with isProcessed=false
 */
function createChatMessage(sender, messageContent, email) {
  const message = {
    id: 'chat',
    datetime: Date.now(),
    sender,
    message: messageContent,
    isProcessed: false
  };

  if (email !== undefined) {
    message.email = email;
  }

  validateChatMessage(message);
  return message;
}

module.exports = {
  validateChatMessage,
  serializeChatMessage,
  deserializeChatMessage,
  prettyPrintChatMessage,
  createChatMessage
};
