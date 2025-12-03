/**
 * Speaker Selection Service
 * Implements round-robin speaker selection logic for multi-LLM chat
 * Requirements: 6.1, 6.5, 7.1, 7.2
 */

/**
 * Gets the next speaker from the metadata based on the current nextSpeakerIndex
 * Requirements: 6.1, 6.5
 * @param {Object} metadata - The ChatMetadata object containing llmParticipants and nextSpeakerIndex
 * @returns {Object} The current speaker participant object
 * @throws {Error} If metadata is invalid or missing required fields
 */
function getNextSpeaker(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Metadata must be an object');
  }

  if (!Array.isArray(metadata.llmParticipants) || metadata.llmParticipants.length === 0) {
    throw new Error('Metadata must contain a non-empty llmParticipants array');
  }

  if (typeof metadata.nextSpeakerIndex !== 'number' || metadata.nextSpeakerIndex < 0) {
    throw new Error('Metadata must contain a non-negative nextSpeakerIndex');
  }

  const participantCount = metadata.llmParticipants.length;
  
  // Ensure index is within bounds (handles case where index might be out of sync)
  const safeIndex = metadata.nextSpeakerIndex % participantCount;
  
  return metadata.llmParticipants[safeIndex];
}

/**
 * Calculates the next speaker index with wrap-around (round-robin)
 * Requirements: 6.5, 7.1, 7.2
 * @param {number} currentIndex - The current speaker index
 * @param {number} participantCount - The total number of participants
 * @returns {number} The next speaker index (wraps to 0 when reaching the end)
 * @throws {Error} If inputs are invalid
 */
function incrementSpeakerIndex(currentIndex, participantCount) {
  if (typeof currentIndex !== 'number' || currentIndex < 0) {
    throw new Error('currentIndex must be a non-negative number');
  }

  if (typeof participantCount !== 'number' || participantCount <= 0) {
    throw new Error('participantCount must be a positive number');
  }

  // Round-robin: increment and wrap around using modulo
  return (currentIndex + 1) % participantCount;
}

module.exports = {
  getNextSpeaker,
  incrementSpeakerIndex
};
