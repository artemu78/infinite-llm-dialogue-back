/**
 * Unit tests for ChatMessage model
 * Requirements: 1.1, 1.2, 1.3, 1.4, 9.1, 9.2, 9.3
 */
const {
  validateChatMessage,
  serializeChatMessage,
  deserializeChatMessage,
  prettyPrintChatMessage,
  createChatMessage
} = require('../../models/chatMessage');

describe('ChatMessage Model', () => {
  describe('validateChatMessage', () => {
    it('should accept valid message', () => {
      const message = {
        id: 'chat',
        datetime: Date.now(),
        sender: 'user',
        message: 'Hello',
        isProcessed: false
      };
      expect(() => validateChatMessage(message)).not.toThrow();
    });

    it('should reject message with invalid id', () => {
      const message = {
        id: 'invalid',
        datetime: Date.now(),
        sender: 'user',
        message: 'Hello',
        isProcessed: false
      };
      expect(() => validateChatMessage(message)).toThrow('Message id must be "chat"');
    });

    it('should reject message with invalid sender', () => {
      const message = {
        id: 'chat',
        datetime: Date.now(),
        sender: 'invalid',
        message: 'Hello',
        isProcessed: false
      };
      expect(() => validateChatMessage(message)).toThrow();
    });

    it('should reject message with empty content', () => {
      const message = {
        id: 'chat',
        datetime: Date.now(),
        sender: 'user',
        message: '',
        isProcessed: false
      };
      expect(() => validateChatMessage(message)).toThrow('Message content must be a non-empty string');
    });

    it('should reject message with invalid datetime', () => {
      const message = {
        id: 'chat',
        datetime: -1,
        sender: 'user',
        message: 'Hello',
        isProcessed: false
      };
      expect(() => validateChatMessage(message)).toThrow('Message datetime must be a positive number');
    });

    it('should reject message with non-boolean isProcessed', () => {
      const message = {
        id: 'chat',
        datetime: Date.now(),
        sender: 'user',
        message: 'Hello',
        isProcessed: 'false'
      };
      expect(() => validateChatMessage(message)).toThrow('Message isProcessed must be a boolean');
    });

    it('should accept message with optional email', () => {
      const message = {
        id: 'chat',
        datetime: Date.now(),
        sender: 'user',
        message: 'Hello',
        email: 'user@example.com',
        isProcessed: false
      };
      expect(() => validateChatMessage(message)).not.toThrow();
    });

    it('should reject message with invalid email type', () => {
      const message = {
        id: 'chat',
        datetime: Date.now(),
        sender: 'user',
        message: 'Hello',
        email: 123,
        isProcessed: false
      };
      expect(() => validateChatMessage(message)).toThrow('Message email must be a string or undefined');
    });
  });

  describe('serializeChatMessage', () => {
    it('should serialize valid message to DynamoDB format', () => {
      const message = {
        id: 'chat',
        datetime: 1234567890,
        sender: 'user',
        message: 'Hello',
        isProcessed: false
      };
      const serialized = serializeChatMessage(message);
      expect(serialized.id.S).toBe('chat');
      expect(serialized.datetime.N).toBe('1234567890');
      expect(serialized.sender.S).toBe('user');
      expect(serialized.message.S).toBe('Hello');
      expect(serialized.isProcessed.BOOL).toBe(false);
    });

    it('should include email in serialization when present', () => {
      const message = {
        id: 'chat',
        datetime: 1234567890,
        sender: 'user',
        message: 'Hello',
        email: 'user@example.com',
        isProcessed: false
      };
      const serialized = serializeChatMessage(message);
      expect(serialized.email.S).toBe('user@example.com');
    });

    it('should not include email in serialization when undefined', () => {
      const message = {
        id: 'chat',
        datetime: 1234567890,
        sender: 'gemini',
        message: 'Hi there',
        isProcessed: false
      };
      const serialized = serializeChatMessage(message);
      expect(serialized.email).toBeUndefined();
    });

    it('should throw on invalid message', () => {
      const message = {
        id: 'chat',
        datetime: -1,
        sender: 'user',
        message: 'Hello',
        isProcessed: false
      };
      expect(() => serializeChatMessage(message)).toThrow();
    });
  });

  describe('deserializeChatMessage', () => {
    it('should deserialize valid DynamoDB item', () => {
      const item = {
        id: { S: 'chat' },
        datetime: { N: '1234567890' },
        sender: { S: 'user' },
        message: { S: 'Hello' },
        isProcessed: { BOOL: false }
      };
      const deserialized = deserializeChatMessage(item);
      expect(deserialized.id).toBe('chat');
      expect(deserialized.datetime).toBe(1234567890);
      expect(deserialized.sender).toBe('user');
      expect(deserialized.message).toBe('Hello');
      expect(deserialized.isProcessed).toBe(false);
    });

    it('should include email when present in item', () => {
      const item = {
        id: { S: 'chat' },
        datetime: { N: '1234567890' },
        sender: { S: 'user' },
        message: { S: 'Hello' },
        email: { S: 'user@example.com' },
        isProcessed: { BOOL: false }
      };
      const deserialized = deserializeChatMessage(item);
      expect(deserialized.email).toBe('user@example.com');
    });

    it('should not include email when not present in item', () => {
      const item = {
        id: { S: 'chat' },
        datetime: { N: '1234567890' },
        sender: { S: 'gemini' },
        message: { S: 'Hi' },
        isProcessed: { BOOL: false }
      };
      const deserialized = deserializeChatMessage(item);
      expect(deserialized.email).toBeUndefined();
    });

    it('should throw on missing required field', () => {
      const item = {
        id: { S: 'chat' },
        datetime: { N: '1234567890' },
        sender: { S: 'user' }
        // missing message and isProcessed
      };
      expect(() => deserializeChatMessage(item)).toThrow();
    });
  });

  describe('prettyPrintChatMessage', () => {
    it('should format message with timestamp and sender', () => {
      const message = {
        id: 'chat',
        datetime: 1609459200000, // 2021-01-01 00:00:00 UTC
        sender: 'user',
        message: 'Hello',
        isProcessed: false
      };
      const printed = prettyPrintChatMessage(message);
      expect(printed).toContain('[○]');
      expect(printed).toContain('2021-01-01');
      expect(printed).toContain('user');
      expect(printed).toContain('Hello');
    });

    it('should show processed flag when isProcessed is true', () => {
      const message = {
        id: 'chat',
        datetime: 1609459200000,
        sender: 'gemini',
        message: 'Hi',
        isProcessed: true
      };
      const printed = prettyPrintChatMessage(message);
      expect(printed).toContain('[✓]');
    });

    it('should include email when present', () => {
      const message = {
        id: 'chat',
        datetime: 1609459200000,
        sender: 'user',
        message: 'Hello',
        email: 'user@example.com',
        isProcessed: false
      };
      const printed = prettyPrintChatMessage(message);
      expect(printed).toContain('user@example.com');
    });
  });

  describe('createChatMessage', () => {
    it('should create message with isProcessed=false', () => {
      const message = createChatMessage('user', 'Hello', 'user@example.com');
      expect(message.id).toBe('chat');
      expect(message.sender).toBe('user');
      expect(message.message).toBe('Hello');
      expect(message.email).toBe('user@example.com');
      expect(message.isProcessed).toBe(false);
      expect(typeof message.datetime).toBe('number');
      expect(message.datetime > 0).toBe(true);
    });

    it('should create message without email when not provided', () => {
      const message = createChatMessage('gemini', 'Hi');
      expect(message.email).toBeUndefined();
      expect(message.isProcessed).toBe(false);
    });

    it('should throw on invalid sender', () => {
      expect(() => createChatMessage('invalid', 'Hello')).toThrow();
    });

    it('should throw on empty message content', () => {
      expect(() => createChatMessage('user', '')).toThrow();
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve message through serialize/deserialize cycle', () => {
      const original = {
        id: 'chat',
        datetime: 1234567890,
        sender: 'user',
        message: 'Hello world',
        email: 'user@example.com',
        isProcessed: false
      };
      const serialized = serializeChatMessage(original);
      const deserialized = deserializeChatMessage(serialized);
      expect(deserialized).toEqual(original);
    });

    it('should preserve message without email through round-trip', () => {
      const original = {
        id: 'chat',
        datetime: 1234567890,
        sender: 'claude',
        message: 'Response',
        isProcessed: true
      };
      const serialized = serializeChatMessage(original);
      const deserialized = deserializeChatMessage(serialized);
      expect(deserialized).toEqual(original);
    });
  });
});
