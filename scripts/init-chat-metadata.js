#!/usr/bin/env node

/**
 * Initialization script for chat metadata
 * Creates the initial metadata item with llmParticipants configuration
 * Requirements: 1.1, 1.2
 */

const { initializeChatMetadata, getChatMetadata } = require('../services/dynamoDbService');
const { createChatMetadata } = require('../models/chatMetadata');

// AI Persona configurations with distinct personalities
const llmParticipants = [
  {
    name: "gemini",
    provider: "google",
    personality: {
      moods: [
        "I'm feeling analytical today! Let me break this down systematically for you: ",
        "Fascinating question! My neural networks are buzzing with excitement to explore: ",
        "Ah, this reminds me of patterns I've seen before. Let me share my perspective on: "
      ],
      phrase: "Hey Gemini, what's your take on "
    }
  },
  {
    name: "claude",
    provider: "anthropic",
    personality: {
      moods: [
        "I appreciate the thoughtfulness of this question. Let me consider it carefully: ",
        "This is quite interesting! I'd like to approach this with nuance and care: ",
        "Thank you for bringing this up. I think there are several important aspects to consider: "
      ],
      phrase: "Claude, I'd love your thoughtful perspective on "
    }
  },
  {
    name: "openai",
    provider: "openai",
    personality: {
      moods: [
        "Great question! I'm excited to dive into this topic and share what I know: ",
        "This is right up my alley! Let me give you a comprehensive overview of: ",
        "I love tackling questions like this. Here's my analysis of: "
      ],
      phrase: "OpenAI, can you help me understand "
    }
  }
];

/**
 * Main initialization function
 */
async function initializeChatSystem() {
  try {
    console.log('🚀 Initializing chat metadata...');
    
    // Check if metadata already exists
    const existingMetadata = await getChatMetadata(true);
    
    if (existingMetadata) {
      console.log('⚠️  Chat metadata already exists:');
      console.log('   - Participants:', existingMetadata.llmParticipants.length);
      console.log('   - Next speaker index:', existingMetadata.nextSpeakerIndex);
      console.log('   - Participant names:', existingMetadata.llmParticipants.map(p => p.name).join(', '));
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise((resolve) => {
        rl.question('Do you want to overwrite the existing metadata? (y/N): ', resolve);
      });
      
      rl.close();
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('❌ Initialization cancelled. Existing metadata preserved.');
        return;
      }
    }
    
    // Create and validate the metadata object
    const metadata = createChatMetadata(llmParticipants);
    console.log('✅ Created metadata object with', metadata.llmParticipants.length, 'participants');
    
    // Initialize the metadata in DynamoDB
    await initializeChatMetadata(llmParticipants, true);
    
    console.log('🎉 Chat metadata initialized successfully!');
    console.log('');
    console.log('📋 Configuration Summary:');
    console.log('   - Table: Chat metadata item created (PK="chat", SK=0)');
    console.log('   - Participants:', llmParticipants.length);
    console.log('   - Initial speaker index: 0');
    console.log('');
    console.log('🤖 AI Participants:');
    llmParticipants.forEach((participant, index) => {
      console.log(`   ${index + 1}. ${participant.name} (${participant.provider})`);
      console.log(`      Phrase: "${participant.personality.phrase}"`);
      console.log(`      Moods: ${participant.personality.moods.length} variations`);
    });
    console.log('');
    console.log('✨ The chat system is now ready for multi-LLM conversations!');
    
  } catch (error) {
    console.error('❌ Error initializing chat metadata:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('   - Ensure DynamoDB is running and accessible');
    console.error('   - Check that the chat table exists');
    console.error('   - Verify AWS credentials and permissions');
    console.error('   - Run: npm run init-db (if using local DynamoDB)');
    process.exit(1);
  }
}

// Handle command line execution
if (require.main === module) {
  initializeChatSystem();
}

module.exports = {
  initializeChatSystem,
  llmParticipants
};