const { OAuth2Client } = require("google-auth-library");
const AWS = require("aws-sdk");

const { CLIENT_ID, personalities, log } = require('./config');
const { verifyAccessToken } = require('./auth');
const { generateAiResponse } = require('./services/generativeAiService');
const { getNews } = require('./services/newsService');
const { storeChatMessage, getChatLog, checkMessageRateLimit, getChatMetadata, initializeChatMetadata } = require('./services/dynamoDbService');
const { initializeChatSystem } = require('./scripts/init-chat-metadata');

exports.handler = async (event) => {
  let debug = false;

  // Handle CORS Preflight
  if (event.requestContext && event.requestContext.http && event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.rawPath === "/init-chat" || event.rawPath.endsWith("/init-chat")) return checkInitChat(event);

  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Missing or invalid Authorization header",
      }),
    };
  }

  try {
    const accessToken = authHeader.split(" ")[1];

    // Validate JSON payload structure (Requirements: 2.4)
    let requestBody;
    try {
      requestBody = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON payload" }),
      };
    }

    // Validate that requestBody is an object
    if (typeof requestBody !== 'object' || requestBody === null || Array.isArray(requestBody)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body must be a JSON object" }),
      };
    }

    const userInput = requestBody.userInput;
    const userName = requestBody.userName;
    debug = requestBody.debug || (event.queryStringParameters && event.queryStringParameters.debug === 'true') || false;

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

    // Validate required fields for message submission (Requirements: 2.4)
    if (!userInput) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userInput in request body" }),
      };
    }

    if (typeof userInput !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userInput must be a string" }),
      };
    }

    if (!userName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userName in request body" }),
      };
    }

    if (typeof userName !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userName must be a string" }),
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
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
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
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: errorMessage, details: errorDetails }),
    };
  }
};

async function checkInitChat(event) {
  const debug = event.queryStringParameters?.debug === 'true' || false;

  log(debug, "Routing to /init-chat...");
  try {
    await initializeChatSystem();
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ message: "Chat system initialized successfully" })
    };
  } catch (error) {
    console.error("Error in checkInitChat:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Failed to initialize chat system", details: error.message })
    };
  }
}