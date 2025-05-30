const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const VITE_GNEWS_API_KEY = process.env.VITE_GNEWS_API_KEY;
const NEWS_TABLE_NAME = "InfiniteChat_NewsAPI_Cache";
const CHAT_TABLE_NAME = "InfiniteChat_ChatLog";
const MODEL_NAME = process.env.GOOGLE_MODEL_NAME;
const API_KEY = process.env.GOOGLE_API_KEY;
const NEWS_API_URL = `https://gnews.io/api/v4/search?q=artificial intelligence&lang=en&max=5&apikey=${VITE_GNEWS_API_KEY}`;

const personalities = {
  comedian: {
    phrase: "Hey, stand-up bot, give me the funny take on ",
    moods: [
      "Alright, let's tickle some funny bones! What's the deal with ",
      "Buckle up, buttercup, because life's a joke and I'm here to deliver the punchline. Tell me about ",
      "Okay, let's get serious...ly funny. Hit me with your best shot. What's the question? ",
    ],
  },
  captainObvious: {
    phrase: "Okay, Captain Obvious, tell me something I *don't* know about ",
    moods: [
      "Fasten your seatbelts, folks, because I'm about to blow your mind with the sheer obviousness of this revelation! Inquire away... ",
      "Oh, my sweet summer child, let me enlighten you with the simplest of truths. Ask your question, and I shall grace you with my wisdom. ",
      "Ah, yes, the mysteries of the universe often hide in plain sight. Let's delve into the profound depths of the obvious. What is your query? ",
    ],
  },
  counselor: {
    phrase:
      "Dear Dr. Feelgood, I'm struggling with... Can you offer some advice? ",
    moods: [
      "Come, come, my dear, let's have a heart-to-heart. Tell me what's troubling you, and we'll find a way to soothe your soul. ",
      "You are stronger than you think! Let's tap into your inner power and overcome this challenge. Tell me what's on your mind. ",
      "Let's break this down step by step. Tell me about the situation, and we'll create a plan to navigate through it. ",
    ],
  },
};

// Basic logger utility
function log(debug, message, ...optionalParams) {
  if (debug) {
    console.log(message, ...optionalParams);
  }
}

module.exports = {
  CLIENT_ID,
  VITE_GNEWS_API_KEY,
  NEWS_TABLE_NAME,
  CHAT_TABLE_NAME,
  MODEL_NAME,
  API_KEY,
  NEWS_API_URL,
  personalities,
  log,
};
