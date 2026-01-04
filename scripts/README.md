# Chat Metadata Initialization Scripts

This directory contains scripts for initializing and managing the chat system metadata.

## init-chat-metadata.js

Initializes the chat metadata in DynamoDB with the required AI participant configurations.

### Purpose

Creates the initial metadata item (PK="chat", SK=0) with:
- Three AI personas: Gemini, Claude, and OpenAI
- Each persona has distinct personality configurations
- Sets initial nextSpeakerIndex to 0 for round-robin speaker selection

### Usage

```bash
# Using npm script (recommended)
npm run init-chat-metadata

# Direct execution
node scripts/init-chat-metadata.js
```

### Prerequisites

1. DynamoDB table must exist (run `node local-setup/init-db.js` for local setup)
2. AWS credentials configured (for production) or local DynamoDB running
3. Environment variables set (see .env.example)

### AI Personas Configuration

The script initializes three AI participants:

1. **Gemini** (Google provider)
   - Analytical and systematic approach
   - 3 mood variations for response diversity

2. **Claude** (Anthropic provider)
   - Thoughtful and nuanced responses
   - Emphasis on careful consideration

3. **OpenAI** (OpenAI provider)
   - Comprehensive and enthusiastic responses
   - Direct and informative style

### Safety Features

- Checks for existing metadata before overwriting
- Prompts for confirmation if metadata already exists
- Validates all participant configurations
- Provides detailed error messages and troubleshooting tips

### Requirements Satisfied

- **Requirement 1.1**: Chat Metadata with partition key "chat" and sort key 0
- **Requirement 1.2**: Chat Metadata containing llmParticipants array and nextSpeakerIndex number

### Example Output

```
🚀 Initializing chat metadata...
✅ Created metadata object with 3 participants
🎉 Chat metadata initialized successfully!

📋 Configuration Summary:
   - Table: Chat metadata item created (PK="chat", SK=0)
   - Participants: 3
   - Initial speaker index: 0

🤖 AI Participants:
   1. gemini (google)
      Phrase: "Hey Gemini, what's your take on "
      Moods: 3 variations
   2. claude (anthropic)
      Phrase: "Claude, I'd love your thoughtful perspective on "
      Moods: 3 variations
   3. openai (openai)
      Phrase: "OpenAI, can you help me understand "
      Moods: 3 variations

✨ The chat system is now ready for multi-LLM conversations!
```