const { OAuth2Client } = require("google-auth-library");
const AWS = require("aws-sdk");

const { CLIENT_ID, personalities, log } = require('./config');
const { verifyAccessToken } = require('./auth');
const { generateAiResponse } = require('./services/generativeAiService');
const { getNews } = require('./services/newsService');
const { storeChatMessage, getChatLog, checkMessageRateLimit } = require('./services/dynamoDbService');

exports.handler = async (event) => {
  let debug = false;

  const authHeader = event.headers?.Authorization || event.headers?.authorization;
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
    const requestBody = event.body ? JSON.parse(event.body) : {};
    const userInput = requestBody.userInput;
    const userName = requestBody.userName;
    debug = requestBody.debug || false;

    const tokenInfo = await verifyAccessToken(accessToken, debug);
    log(debug, "Received event path:", event.rawPath);
    log(debug, "Parsed userInput:", userInput);
    log(debug, "User email from token:", tokenInfo.email);

    if (event.rawPath === "/news") {
      log(debug, "Routing to /news...");
      return await getNews(debug);
    }

    if (event.rawPath === "/getchat") {
      log(debug, "Routing to /getchat...");
      const chatResponse = await getChatLog(debug);
      log(debug, "Get chat response:", chatResponse);
      return chatResponse;
    }

    if (!userInput) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userInput in request body" }),
      };
    }

    // Test-specific rate limit block REMOVED from here.
    // Tests should mock checkMessageRateLimit from dynamoDbService directly.
    /*
    if (process.env.NODE_ENV === 'test' && typeof jest !== 'undefined') {
        const AWS_SDK = require("aws-sdk");
        const dynamoDBTestClient = new AWS_SDK.DynamoDB.DocumentClient();
        const mockResult = await dynamoDBTestClient.query().promise();
        if (mockResult && mockResult.Items &&
            mockResult.Items.length > 0 &&
            mockResult.Items[0].datetime &&
            (Date.now() - mockResult.Items[0].datetime) < 60000) {

          log(debug, "Rate limit test detected. Last message too recent.");
          return {
            statusCode: 429,
            body: JSON.stringify({
              error: "Please wait before sending another message."
            }),
          };
        }
    }
    */

    const messageDelayCheck = await checkMessageRateLimit(tokenInfo.email, debug);
    log(debug, "Message delay check result:", messageDelayCheck);
    if (!messageDelayCheck.canSend) {
      log(debug, "Rate limiting applied:", messageDelayCheck.message);
      return {
        statusCode: 429,
        body: JSON.stringify({ error: messageDelayCheck.message }),
      };
    }

    await storeChatMessage(userInput, userName, tokenInfo.email, debug);

    const chosenPersonalities = [];
    const numPersonalities = Math.random() < 0.5 ? 1 : 3;
    const personalityKeys = Object.keys(personalities);

    while (chosenPersonalities.length < numPersonalities && personalityKeys.length > 0) {
      const randomIndex = Math.floor(Math.random() * personalityKeys.length);
      const randomPersonalityKey = personalityKeys.splice(randomIndex, 1)[0];
      // The check `if (!chosenPersonalities.includes(randomPersonalityKey))` was redundant
      // because splice already ensures the element is removed and cannot be picked again from personalityKeys.
      // However, if personalityKeys could have duplicates (not the case for Object.keys), it might be needed.
      // For clarity and safety, keeping it doesn't hurt, but it's not strictly necessary here.
      // Let's remove it for minor cleanup as per the original script's intent.
      chosenPersonalities.push(randomPersonalityKey);
    }

    log(debug, "Chosen personalities:", chosenPersonalities);

    const responses = await Promise.all(
      chosenPersonalities.map(async (personalityKey) => {
        const personalityConfig = personalities[personalityKey];
        if (!personalityConfig) {
            log(debug, `Personality key "${personalityKey}" not found in config. Skipping.`);
            return null;
        }
        const responseText = await generateAiResponse(userInput, personalityConfig, debug);
        await storeChatMessage(responseText, personalityKey, "-", debug);
        return {
          personality: personalityKey,
          response: responseText,
        };
      })
    );

    const validResponses = responses.filter(r => r !== null);

    log(debug, "Generated responses:", validResponses);

    return {
      statusCode: 200,
      body: JSON.stringify({ responses: validResponses }),
    };

  } catch (error) {
    console.error("Error processing request in handler:", error.message); // Log specific error message
    let statusCode = 500;
    let errorMessage = "Internal Server Error";
    let errorDetails = error.message;

    if (error.message === "Token not issued for this client" || error.message === "Invalid token") {
        statusCode = 401;
        errorMessage = error.message;
    } else if (error.response && error.response.data && error.response.data.error === "invalid_token") {
         statusCode = 401;
         errorMessage = error.response.data.error_description || "Invalid token";
    }
    return {
      statusCode: statusCode,
      body: JSON.stringify({ error: errorMessage, details: errorDetails }),
    };
  }
};
