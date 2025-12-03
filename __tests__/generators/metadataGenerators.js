/**
 * Metadata generators for property-based testing
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
const fc = require('fast-check');

/**
 * Valid LLM provider types
 */
const VALID_PROVIDERS = ['google', 'anthropic', 'openai'];

/**
 * Valid LLM persona names
 */
const VALID_PERSONA_NAMES = ['gemini', 'claude', 'openai'];

/**
 * Arbitrary generator for personality configuration
 */
const personalityArb = fc.record({
  moods: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
  phrase: fc.string({ minLength: 1, maxLength: 200 })
});

/**
 * Arbitrary generator for a single LLM participant
 */
const llmParticipantArb = fc.record({
  name: fc.constantFrom(...VALID_PERSONA_NAMES),
  provider: fc.constantFrom(...VALID_PROVIDERS),
  personality: personalityArb
});

/**
 * Arbitrary generator for the standard 3-participant configuration
 * (Gemini, Claude, OpenAI)
 */
const standardParticipantsArb = fc.tuple(
  fc.record({
    name: fc.constant('gemini'),
    provider: fc.constant('google'),
    personality: personalityArb
  }),
  fc.record({
    name: fc.constant('claude'),
    provider: fc.constant('anthropic'),
    personality: personalityArb
  }),
  fc.record({
    name: fc.constant('openai'),
    provider: fc.constant('openai'),
    personality: personalityArb
  })
).map(([gemini, claude, openai]) => [gemini, claude, openai]);

/**
 * Arbitrary generator for variable-length participant arrays (1-5 participants)
 */
const variableParticipantsArb = fc.array(llmParticipantArb, { minLength: 1, maxLength: 5 });

/**
 * Arbitrary generator for valid ChatMetadata objects
 * Matches the data model from design.md
 */
const validChatMetadataArb = fc.record({
  id: fc.constant('chat'),
  datetime: fc.constant(0),
  llmParticipants: standardParticipantsArb,
  nextSpeakerIndex: fc.integer({ min: 0, max: 2 }) // 0-2 for 3 participants
});

/**
 * Arbitrary generator for ChatMetadata with variable participants
 * nextSpeakerIndex is constrained to valid range based on participant count
 */
const variableChatMetadataArb = variableParticipantsArb.chain(participants => 
  fc.record({
    id: fc.constant('chat'),
    datetime: fc.constant(0),
    llmParticipants: fc.constant(participants),
    nextSpeakerIndex: fc.integer({ min: 0, max: participants.length - 1 })
  })
);

/**
 * Arbitrary generator for ChatMetadata with specific participant count
 * @param {number} count - Number of participants
 */
const chatMetadataWithParticipantCountArb = (count) => {
  return fc.array(llmParticipantArb, { minLength: count, maxLength: count }).chain(participants =>
    fc.record({
      id: fc.constant('chat'),
      datetime: fc.constant(0),
      llmParticipants: fc.constant(participants),
      nextSpeakerIndex: fc.integer({ min: 0, max: count - 1 })
    })
  );
};

// --- Invalid metadata generators for testing error handling ---

/**
 * Arbitrary generator for ChatMetadata with empty participants array
 */
const emptyParticipantsMetadataArb = fc.record({
  id: fc.constant('chat'),
  datetime: fc.constant(0),
  llmParticipants: fc.constant([]),
  nextSpeakerIndex: fc.integer({ min: 0, max: 10 })
});

/**
 * Arbitrary generator for ChatMetadata with out-of-bounds nextSpeakerIndex
 */
const invalidIndexMetadataArb = standardParticipantsArb.chain(participants =>
  fc.record({
    id: fc.constant('chat'),
    datetime: fc.constant(0),
    llmParticipants: fc.constant(participants),
    nextSpeakerIndex: fc.oneof(
      fc.integer({ min: participants.length, max: 100 }), // Too high
      fc.integer({ max: -1 }) // Negative
    )
  })
);

/**
 * Arbitrary generator for ChatMetadata with missing required fields
 */
const invalidMissingFieldsMetadataArb = fc.oneof(
  // Missing llmParticipants
  fc.record({
    id: fc.constant('chat'),
    datetime: fc.constant(0),
    nextSpeakerIndex: fc.integer({ min: 0, max: 2 })
  }),
  // Missing nextSpeakerIndex
  fc.record({
    id: fc.constant('chat'),
    datetime: fc.constant(0),
    llmParticipants: standardParticipantsArb
  })
);

/**
 * Arbitrary generator for participant with invalid provider
 */
const invalidProviderParticipantArb = fc.record({
  name: fc.constantFrom(...VALID_PERSONA_NAMES),
  provider: fc.string().filter(s => !VALID_PROVIDERS.includes(s)),
  personality: personalityArb
});

module.exports = {
  // Valid generators
  validChatMetadataArb,
  variableChatMetadataArb,
  chatMetadataWithParticipantCountArb,
  llmParticipantArb,
  standardParticipantsArb,
  variableParticipantsArb,
  personalityArb,
  
  // Invalid generators
  emptyParticipantsMetadataArb,
  invalidIndexMetadataArb,
  invalidMissingFieldsMetadataArb,
  invalidProviderParticipantArb,
  
  // Constants
  VALID_PROVIDERS,
  VALID_PERSONA_NAMES
};
