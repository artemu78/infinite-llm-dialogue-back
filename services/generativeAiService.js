const { GoogleGenerativeAI } = require("@google/generative-ai");
const { API_KEY, MODEL_NAME, log } = require('../config.js'); // Import log from config.js

async function generateAiResponse(userInput, personality, debug) { // Renamed to avoid conflict
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const randomMood =
      personality.moods[Math.floor(Math.random() * personality.moods.length)];
    const prompt = randomMood + userInput;

    log(debug, "Generated prompt:", prompt);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    log(debug, "Generated response text:", text);

    return text;
  } catch (error) {
    console.error("Error generating response:", error);
    throw error;
  }
}

module.exports = {
  generateAiResponse,
};
