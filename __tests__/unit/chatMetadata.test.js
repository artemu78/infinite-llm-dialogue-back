/**
 * Unit tests for ChatMetadata model
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
const {
  validateChatMetadata,
  validateParticipant,
  serializeChatMetadata,
  deserializeChatMetadata,
  serializeParticipant,
  deserializeParticipant,
  createChatMetadata
} = require('../../models/chatMetadata');

describe('ChatMetadata Model', () => {
  const validParticipant = {
    name: 'gemini',
    provider: 'google',
    personality: {
      moods: ['curious', 'helpful'],
      phrase: 'I think...'
    }
  };

  const validMetadata = {
    id: 'chat',
    datetime: 0,
    llmParticipants: [
      {
        name: 'gemini',
        provider: 'google',
        personality: { moods: ['curious'], phrase: 'I think...' }
      },
      {
        name: 'claude',
        provider: 'anthropic',
        personality: { moods: ['thoughtful'], phrase: 'Let me consider...' }
      }
    ],
    nextSpeakerIndex: 0
  };

  describe('validateParticipant', () => {
    it('should accept valid participant', () => {
      expect(() => validateParticipant(validParticipant)).not.toThrow();
    });

    it('should reject participant with invalid provider', () => {
      const participant = { ...validParticipant, provider: 'invalid' };
      expect(() => validateParticipant(participant)).toThrow();
    });

    it('should reject participant with empty name', () => {
      const participant = { ...validParticipant, name: '' };
      expect(() => validateParticipant(participant)).toThrow('Participant name must be a non-empty string');
    });

    it('should reject participant with missing personality', () => {
      const participant = { ...validParticipant };
      delete participant.personality;
      expect(() => validateParticipant(participant)).toThrow('Participant personality must be an object');
    });

    it('should reject participant with empty moods array', () => {
      const participant = {
        ...validParticipant,
        personality: { moods: [], phrase: 'test' }
      };
      expect(() => validateParticipant(participant)).toThrow('Participant personality.moods must be a non-empty array');
    });

    it('should reject participant with empty phrase', () => {
      const participant = {
        ...validParticipant,
        personality: { moods: ['test'], phrase: '' }
      };
      expect(() => validateParticipant(participant)).toThrow('Participant personality.phrase must be a non-empty string');
    });
  });

  describe('validateChatMetadata', () => {
    it('should accept valid metadata', () => {
      expect(() => validateChatMetadata(validMetadata)).not.toThrow();
    });

    it('should reject metadata with invalid id', () => {
      const metadata = { ...validMetadata, id: 'invalid' };
      expect(() => validateChatMetadata(metadata)).toThrow('Metadata id must be "chat"');
    });

    it('should reject metadata with invalid datetime', () => {
      const metadata = { ...validMetadata, datetime: 1 };
      expect(() => validateChatMetadata(metadata)).toThrow('Metadata datetime must be 0');
    });

    it('should reject metadata with empty participants array', () => {
      const metadata = { ...validMetadata, llmParticipants: [] };
      expect(() => validateChatMetadata(metadata)).toThrow('Metadata llmParticipants must be a non-empty array');
    });

    it('should reject metadata with negative nextSpeakerIndex', () => {
      const metadata = { ...validMetadata, nextSpeakerIndex: -1 };
      expect(() => validateChatMetadata(metadata)).toThrow('Metadata nextSpeakerIndex must be a non-negative number');
    });

    it('should reject metadata with out-of-bounds nextSpeakerIndex', () => {
      const metadata = { ...validMetadata, nextSpeakerIndex: 5 };
      expect(() => validateChatMetadata(metadata)).toThrow();
    });

    it('should reject metadata with invalid participant', () => {
      const metadata = {
        ...validMetadata,
        llmParticipants: [
          { ...validParticipant, provider: 'invalid' }
        ]
      };
      expect(() => validateChatMetadata(metadata)).toThrow();
    });
  });

  describe('serializeParticipant', () => {
    it('should serialize valid participant to DynamoDB format', () => {
      const serialized = serializeParticipant(validParticipant);
      expect(serialized.M.name.S).toBe('gemini');
      expect(serialized.M.provider.S).toBe('google');
      expect(serialized.M.personality.M.moods.L).toHaveLength(2);
      expect(serialized.M.personality.M.phrase.S).toBe('I think...');
    });

    it('should throw on invalid participant', () => {
      const participant = { ...validParticipant, provider: 'invalid' };
      expect(() => serializeParticipant(participant)).toThrow();
    });
  });

  describe('deserializeParticipant', () => {
    it('should deserialize valid DynamoDB participant', () => {
      const item = {
        M: {
          name: { S: 'gemini' },
          provider: { S: 'google' },
          personality: {
            M: {
              moods: { L: [{ S: 'curious' }, { S: 'helpful' }] },
              phrase: { S: 'I think...' }
            }
          }
        }
      };
      const deserialized = deserializeParticipant(item);
      expect(deserialized.name).toBe('gemini');
      expect(deserialized.provider).toBe('google');
      expect(deserialized.personality.moods).toEqual(['curious', 'helpful']);
      expect(deserialized.personality.phrase).toBe('I think...');
    });

    it('should throw on missing required field', () => {
      const item = {
        M: {
          name: { S: 'gemini' }
          // missing provider and personality
        }
      };
      expect(() => deserializeParticipant(item)).toThrow();
    });
  });

  describe('serializeChatMetadata', () => {
    it('should serialize valid metadata to DynamoDB format', () => {
      const serialized = serializeChatMetadata(validMetadata);
      expect(serialized.id.S).toBe('chat');
      expect(serialized.datetime.N).toBe('0');
      expect(serialized.llmParticipants.L).toHaveLength(2);
      expect(serialized.nextSpeakerIndex.N).toBe('0');
    });

    it('should throw on invalid metadata', () => {
      const metadata = { ...validMetadata, nextSpeakerIndex: 10 };
      expect(() => serializeChatMetadata(metadata)).toThrow();
    });
  });

  describe('deserializeChatMetadata', () => {
    it('should deserialize valid DynamoDB item', () => {
      const item = {
        id: { S: 'chat' },
        datetime: { N: '0' },
        llmParticipants: {
          L: [
            {
              M: {
                name: { S: 'gemini' },
                provider: { S: 'google' },
                personality: {
                  M: {
                    moods: { L: [{ S: 'curious' }] },
                    phrase: { S: 'I think...' }
                  }
                }
              }
            }
          ]
        },
        nextSpeakerIndex: { N: '0' }
      };
      const deserialized = deserializeChatMetadata(item);
      expect(deserialized.id).toBe('chat');
      expect(deserialized.datetime).toBe(0);
      expect(deserialized.llmParticipants).toHaveLength(1);
      expect(deserialized.nextSpeakerIndex).toBe(0);
    });

    it('should throw on missing required field', () => {
      const item = {
        id: { S: 'chat' },
        datetime: { N: '0' }
        // missing llmParticipants and nextSpeakerIndex
      };
      expect(() => deserializeChatMetadata(item)).toThrow();
    });
  });

  describe('createChatMetadata', () => {
    it('should create metadata with nextSpeakerIndex=0', () => {
      const participants = [validParticipant];
      const metadata = createChatMetadata(participants);
      expect(metadata.id).toBe('chat');
      expect(metadata.datetime).toBe(0);
      expect(metadata.llmParticipants).toEqual(participants);
      expect(metadata.nextSpeakerIndex).toBe(0);
    });

    it('should throw on empty participants array', () => {
      expect(() => createChatMetadata([])).toThrow();
    });

    it('should throw on invalid participant', () => {
      const participants = [{ ...validParticipant, provider: 'invalid' }];
      expect(() => createChatMetadata(participants)).toThrow();
    });
  });

  describe('Round-trip serialization', () => {
    it('should preserve metadata through serialize/deserialize cycle', () => {
      const serialized = serializeChatMetadata(validMetadata);
      const deserialized = deserializeChatMetadata(serialized);
      expect(deserialized).toEqual(validMetadata);
    });

    it('should preserve metadata with multiple participants', () => {
      const metadata = {
        id: 'chat',
        datetime: 0,
        llmParticipants: [
          {
            name: 'gemini',
            provider: 'google',
            personality: { moods: ['curious', 'helpful'], phrase: 'I think...' }
          },
          {
            name: 'claude',
            provider: 'anthropic',
            personality: { moods: ['thoughtful'], phrase: 'Let me consider...' }
          },
          {
            name: 'openai',
            provider: 'openai',
            personality: { moods: ['analytical'], phrase: 'Based on...' }
          }
        ],
        nextSpeakerIndex: 1
      };
      const serialized = serializeChatMetadata(metadata);
      const deserialized = deserializeChatMetadata(serialized);
      expect(deserialized).toEqual(metadata);
    });
  });
});
