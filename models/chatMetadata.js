/**
 * ChatMetadata model with serialization/deserialization functions
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

/**
 * Validates that a participant has all required fields
 * @param {Object} participant - The participant object to validate
 * @throws {Error} If required fields are missing or invalid
 */
function validateParticipant(participant) {
  if (!participant || typeof participant !== 'object') {
    throw new Error('Participant must be an object');
  }

  const validProviders = ['google', 'anthropic', 'openai'];
  if (!validProviders.includes(participant.provider)) {
    throw new Error(`Participant provider must be one of: ${validProviders.join(', ')}`);
  }

  if (typeof participant.name !== 'string' || participant.name.length === 0) {
    throw new Error('Participant name must be a non-empty string');
  }

  if (!participant.personality || typeof participant.personality !== 'object') {
    throw new Error('Participant personality must be an object');
  }

  if (!Array.isArray(participant.personality.moods) || participant.personality.moods.length === 0) {
    throw new Error('Participant personality.moods must be a non-empty array');
  }

  if (typeof participant.personality.phrase !== 'string' || participant.personality.phrase.length === 0) {
    throw new Error('Participant personality.phrase must be a non-empty string');
  }
}

/**
 * Validates that a ChatMetadata has all required fields
 * @param {Object} metadata - The metadata object to validate
 * @throws {Error} If required fields are missing or invalid
 */
function validateChatMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Metadata must be an object');
  }

  if (metadata.id !== 'chat') {
    throw new Error('Metadata id must be "chat"');
  }

  if (metadata.datetime !== 0) {
    throw new Error('Metadata datetime must be 0');
  }

  if (!Array.isArray(metadata.llmParticipants) || metadata.llmParticipants.length === 0) {
    throw new Error('Metadata llmParticipants must be a non-empty array');
  }

  // Validate each participant
  metadata.llmParticipants.forEach((participant, index) => {
    try {
      validateParticipant(participant);
    } catch (error) {
      throw new Error(`Invalid participant at index ${index}: ${error.message}`);
    }
  });

  if (typeof metadata.nextSpeakerIndex !== 'number' || metadata.nextSpeakerIndex < 0) {
    throw new Error('Metadata nextSpeakerIndex must be a non-negative number');
  }

  if (metadata.nextSpeakerIndex >= metadata.llmParticipants.length) {
    throw new Error(
      `Metadata nextSpeakerIndex (${metadata.nextSpeakerIndex}) must be less than ` +
      `number of participants (${metadata.llmParticipants.length})`
    );
  }
}

/**
 * Serializes a participant object to DynamoDB format
 * @param {Object} participant - The participant object to serialize
 * @returns {Object} DynamoDB formatted participant
 */
function serializeParticipant(participant) {
  validateParticipant(participant);

  return {
    M: {
      name: { S: participant.name },
      provider: { S: participant.provider },
      personality: {
        M: {
          moods: {
            L: participant.personality.moods.map(mood => ({ S: mood }))
          },
          phrase: { S: participant.personality.phrase }
        }
      }
    }
  };
}

/**
 * Deserializes a DynamoDB participant to an object
 * @param {Object} item - The DynamoDB participant item
 * @returns {Object} Participant object
 */
function deserializeParticipant(item) {
  if (!item || !item.M) {
    throw new Error('Participant item must have M field');
  }

  const m = item.M;

  if (!m.name || !m.name.S) {
    throw new Error('Participant missing required field: name');
  }

  if (!m.provider || !m.provider.S) {
    throw new Error('Participant missing required field: provider');
  }

  if (!m.personality || !m.personality.M) {
    throw new Error('Participant missing required field: personality');
  }

  const personality = m.personality.M;

  if (!personality.moods || !personality.moods.L) {
    throw new Error('Participant personality missing required field: moods');
  }

  if (!personality.phrase || !personality.phrase.S) {
    throw new Error('Participant personality missing required field: phrase');
  }

  return {
    name: m.name.S,
    provider: m.provider.S,
    personality: {
      moods: personality.moods.L.map(mood => mood.S),
      phrase: personality.phrase.S
    }
  };
}

/**
 * Serializes a ChatMetadata object to DynamoDB format
 * @param {Object} metadata - The ChatMetadata object to serialize
 * @returns {Object} DynamoDB formatted item
 * @throws {Error} If metadata validation fails
 */
function serializeChatMetadata(metadata) {
  validateChatMetadata(metadata);

  return {
    id: { S: metadata.id },
    datetime: { N: String(metadata.datetime) },
    llmParticipants: {
      L: metadata.llmParticipants.map(serializeParticipant)
    },
    nextSpeakerIndex: { N: String(metadata.nextSpeakerIndex) }
  };
}

/**
 * Deserializes a DynamoDB item to a ChatMetadata object
 * @param {Object} item - The DynamoDB item to deserialize
 * @returns {Object} ChatMetadata object
 * @throws {Error} If item is missing required fields
 */
function deserializeChatMetadata(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Item must be an object');
  }

  if (!item.id || !item.id.S) {
    throw new Error('Item missing required field: id');
  }

  if (!item.datetime || !item.datetime.N) {
    throw new Error('Item missing required field: datetime');
  }

  if (!item.llmParticipants || !item.llmParticipants.L) {
    throw new Error('Item missing required field: llmParticipants');
  }

  if (!item.nextSpeakerIndex || !item.nextSpeakerIndex.N) {
    throw new Error('Item missing required field: nextSpeakerIndex');
  }

  const metadata = {
    id: item.id.S,
    datetime: Number(item.datetime.N),
    llmParticipants: item.llmParticipants.L.map(deserializeParticipant),
    nextSpeakerIndex: Number(item.nextSpeakerIndex.N)
  };

  validateChatMetadata(metadata);
  return metadata;
}

/**
 * Creates a new ChatMetadata object with default values
 * @param {Array} llmParticipants - Array of LLM participant configurations
 * @returns {Object} New ChatMetadata object
 */
function createChatMetadata(llmParticipants) {
  const metadata = {
    id: 'chat',
    datetime: 0,
    llmParticipants,
    nextSpeakerIndex: 0
  };

  validateChatMetadata(metadata);
  return metadata;
}

module.exports = {
  validateChatMetadata,
  validateParticipant,
  serializeChatMetadata,
  deserializeChatMetadata,
  serializeParticipant,
  deserializeParticipant,
  createChatMetadata
};
