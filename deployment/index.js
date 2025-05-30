// index.js (for AWS Lambda - deployment version)

// Import from shared config and services
// Adjust relative paths assuming deployment/index.js is one level down.
const { API_KEY, MODEL_NAME, personalities, log } = require('../config');
const { generateAiResponse } = require('../services/generativeAiService');

exports.handler = async (event) => {
  let debug = false;
  try {
    // Assuming event.body is a JSON string
    const requestBody = event.body ? JSON.parse(event.body) : {};
    const userInput = requestBody.userInput;
    debug = requestBody.debug || false;

    log(debug, "Deployment Handler: Received event:", event); // Add context for deployment logs
    log(debug, "Deployment Handler: Parsed userInput:", userInput);

    if (!userInput) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userInput in request body" }),
      };
    }

    // Randomly choose 1 or 3 personalities - same logic as main index.js
    const chosenPersonalities = [];
    const numPersonalities = Math.random() < 0.5 ? 1 : 3;
    const personalityKeys = Object.keys(personalities);

    // Ensure unique personalities are chosen
    while (chosenPersonalities.length < numPersonalities && personalityKeys.length > 0) {
      const randomIndex = Math.floor(Math.random() * personalityKeys.length);
      // Splice returns an array, so take the first element
      const randomPersonalityKey = personalityKeys.splice(randomIndex, 1)[0];
      // The check `if (!chosenPersonalities.includes(randomPersonalityKey))` is redundant
      // because splice removes the key from the array, preventing it from being chosen again.
      chosenPersonalities.push(randomPersonalityKey);
    }

    log(debug, "Deployment Handler: Chosen personalities:", chosenPersonalities);

    const responses = await Promise.all(
      chosenPersonalities.map(async (personalityKey) => {
        const personalityConfig = personalities[personalityKey];
        if (!personalityConfig) {
            log(debug, `Deployment Handler: Personality key "${personalityKey}" not found in config. Skipping.`);
            return null;
        }
        // Use the imported generateAiResponse function
        const responseText = await generateAiResponse(userInput, personalityConfig, debug);
        return {
          personality: personalityKey,
          response: responseText,
        };
      })
    );

    const validResponses = responses.filter(r => r !== null);

    log(debug, "Deployment Handler: Generated responses:", validResponses);

    return {
      statusCode: 200,
      body: JSON.stringify({ responses: validResponses }),
    };
  } catch (error) {
    console.error("Deployment Handler: Error processing request:", error);
    return {
      statusCode: 500,
      // Provide a more generic error message for deployment, but log details
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
