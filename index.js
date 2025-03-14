const { GoogleGenerativeAI } = require("@google/generative-ai");
const AWS = require("aws-sdk");
const axios = require("axios");
const { OAuth2Client } = require("google-auth-library");

const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const VITE_GNEWS_API_KEY = process.env.VITE_GNEWS_API_KEY;
const NEWS_TABLE_NAME = "InfiniteChat_NewsAPI_Cache";
const CHAT_TABLE_NAME = "InfiniteChat_ChatLog";
const MODEL_NAME = process.env.GOOGLE_MODEL_NAME;
const API_KEY = process.env.GOOGLE_API_KEY;
const NewsURL = `https://gnews.io/api/v4/search?q=artificial intelligence&lang=en&max=5&apikey=${VITE_GNEWS_API_KEY}`;
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const client = new OAuth2Client(CLIENT_ID);

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

// Token verification function
async function verifyAccessToken(token, debug) {
  try {
    const response = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
    );
    const tokenInfo = response.data;
    log(debug, "Token info:", tokenInfo);
    if (tokenInfo.error) {
      throw new Error(tokenInfo.error_description || "Invalid token");
    }

    // Optionally check if the token was issued for your client ID
    // Note: access_token has 'azp' (authorized party) or 'aud' might not match CLIENT_ID directly
    if (tokenInfo.azp !== CLIENT_ID) {
      throw new Error("Token not issued for this client");
    }

    log(debug, "Token verified successfully:", tokenInfo);
    return tokenInfo; // Contains user info like sub (user ID), scope, etc.
  } catch (error) {
    console.error("Token verification failed:", error.message);
    throw error;
  }
}

function log(debug, message, ...optionalParams) {
  if (debug) {
    console.log(message, ...optionalParams);
  }
}

async function generateResponse(userInput, personality, debug) {
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

async function News(debug) {
  const params = {
    TableName: NEWS_TABLE_NAME,
    Key: { request_hash: "1" },
  };

  try {
    const data = await dynamoDB.get(params).promise();
    if (data.Item) {
      log(debug, "News data found in cache:", data.Item);
      return {
        statusCode: 200,
        body: JSON.stringify(data.Item?.news),
      };
    } else {
      log(debug, `News data not found in cache. Fetching from API ${NewsURL}`);
      const response = await axios.get(NewsURL);
      const newsData = response.data;
      log(debug, "Fetched news data:", newsData);

      const putParams = {
        TableName: NEWS_TABLE_NAME,
        Item: {
          request_hash: "1",
          news: newsData,
          ttl: Math.floor(Date.now() / 1000) + 20 * 60, // 1 hour expiry
        },
      };

      await dynamoDB.put(putParams).promise();
      log(debug, "Stored news data in cache:", putParams.Item);
      return {
        statusCode: 200,
        body: JSON.stringify(newsData),
      };
    }
  } catch (error) {
    console.error("Error fetching or storing news:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}

async function storeChatMessage(message, sender, email, debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    Item: {
      id: "chat",
      message,
      sender,
      datetime: new Date().getTime(),
      email,
    },
  };

  try {
    await dynamoDB.put(params).promise();
    log(debug, "Stored chat message in DynamoDB:", params.Item);
  } catch (error) {
    console.error("Error storing chat message:", error);
    throw error;
  }
}

async function getChat(debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": "chat",
    },
    Limit: 30,
    ScanIndexForward: false, // Will return items in descending order by datetime
  };

  try {
    const data = await dynamoDB.query(params).promise();
    log(debug, "Retrieved chat messages:", data.Items);
    return {
      statusCode: 200,
      body: JSON.stringify(data.Items),
    };
  } catch (error) {
    console.error("Error retrieving chat messages:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}

async function checkMessageDelay(senderEmail, debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    IndexName: "SenderEmailIndex", // Use the new GSI
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": senderEmail,
    },
    Limit: 1, // Get only the most recent message
    ScanIndexForward: false, // Sort by datetime descending (latest first)
  };
  debug && console.log("Checking message delay with params:", params);
  try {
    const result = await dynamoDB.query(params).promise();
    if (debug) {
      console.log("Query result for last message:", result.Items);
    }

    if (!result.Items || result.Items.length === 0) {
      // No previous messages for this user; allow the message
      return { canSend: true };
    }

    const lastMessage = result.Items[0];
    const lastTimestamp = lastMessage.datetime; // In milliseconds
    const now = new Date().getTime();
    const timeDiffSeconds = (now - lastTimestamp) / 1000; // Convert to seconds
    const delayRequired = 60; // 1 minute in seconds

    if (timeDiffSeconds < delayRequired) {
      const waitTime = Math.ceil(delayRequired - timeDiffSeconds);
      return {
        canSend: false,
        message: `Please wait ${waitTime} seconds before sending another message.`,
      };
    }

    return { canSend: true };
  } catch (error) {
    console.error("Error checking message delay:", error);
    throw error;
  }
}

exports.handler = async (event) => {
  let debug = false;

  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: "Missing or invalid Authorization header",
      }),
    };
  }

  try {
    const accessToken = authHeader.split(" ")[1];
    const requestBody = JSON.parse(event.body);
    const userInput = requestBody.userInput;
    const userName = requestBody.userName;
    debug = requestBody.debug || false;

    const tokenInfo = await verifyAccessToken(accessToken, debug);
    log(debug, "Received event:", event);
    log(debug, "Parsed userInput:", userInput);

    if (event.rawPath === "/news") {
      log(debug, "Fetching news...");
      return await News(debug);
    }

    if (event.rawPath === "/getchat") {
      log(debug, "Retrieving chat messages...");
      return await getChat(debug);
    }

    if (!userInput) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userInput in request body" }),
      };
    }

    const messageDelayCheck = await checkMessageDelay(tokenInfo.email, debug);
    if (!messageDelayCheck.canSend) {
      return {
        statusCode: 429,
        body: JSON.stringify({ error: messageDelayCheck.message }),
      };
    }
    await storeChatMessage(userInput, userName, tokenInfo.email, debug);
    const chosenPersonalities = [];
    const numPersonalities = Math.random() < 0.5 ? 1 : 3; // Randomly choose 1 or 3 personalities

    // Ensure unique personalities are chosen
    while (chosenPersonalities.length < numPersonalities) {
      const personalityKeys = Object.keys(personalities);
      const randomPersonality =
        personalityKeys[Math.floor(Math.random() * personalityKeys.length)];
      if (!chosenPersonalities.includes(randomPersonality)) {
        chosenPersonalities.push(randomPersonality);
      }
    }

    log(debug, "Chosen personalities:", chosenPersonalities);

    const responses = await Promise.all(
      chosenPersonalities.map(async (personalityKey) => {
        const personality = personalities[personalityKey];
        const response = await generateResponse(userInput, personality, debug);
        await storeChatMessage(response, personalityKey, "-", debug); // Store each generated response
        return {
          personality: personalityKey,
          response: response,
        };
      })
    );

    log(debug, "Generated responses:", responses);

    return {
      statusCode: 200,
      body: JSON.stringify({ responses: responses }),
    };
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
