const { OAuth2Client } = require("google-auth-library");
const AWS = require("aws-sdk");
const { SchedulerClient, UpdateScheduleCommand, GetScheduleCommand } = require("@aws-sdk/client-scheduler");

// IAM Permissions Required for Lambda Execution Role:
// ----------------------------------------------------
// This function requires several permissions depending on the operations it performs.
//
// For existing chat/news/DynamoDB operations (ensure these are already covered):
// - dynamodb:PutItem (for storeChatMessage)
// - dynamodb:Query (for getChatLog, checkMessageRateLimit)
// - logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents (standard Lambda logging)
// - Potentially others depending on the exact implementation of getNews if it uses AWS services.
//
// For NEW EventBridge Schedule Management (path: /manage-schedule):
// - scheduler:GetSchedule
// - scheduler:UpdateSchedule
//
// Both scheduler permissions should be scoped to the specific schedule resource:
// Resource: "arn:aws:scheduler:us-east-1:236713206268:schedule/default/InfiniteDialogChatTrigger"
//
// Example Policy Snippet for Scheduler (to be added to existing role policy):
// {
//     "Effect": "Allow",
//     "Action": [
//         "scheduler:GetSchedule",
//         "scheduler:UpdateSchedule"
//     ],
//     "Resource": "arn:aws:scheduler:us-east-1:236713206268:schedule/default/InfiniteDialogChatTrigger"
// }
//
// Note: Google OAuth2 verification (verifyAccessToken) involves external calls, not direct AWS IAM.

const { CLIENT_ID, personalities, log } = require('./config');
const { verifyAccessToken } = require('./auth');
const { generateAiResponse } = require('./services/generativeAiService');
const { getNews } = require('./services/newsService');
const { storeChatMessage, getChatLog, checkMessageRateLimit } = require('./services/dynamoDbService');

exports.handler = async (event) => {
  let debug = false;

  // Schedule Constants
  const SCHEDULE_GROUP_NAME = "default";
  const SCHEDULE_NAME = "InfiniteDialogChatTrigger";
  const SCHEDULE_ARN = `arn:aws:scheduler:us-east-1:236713206268:schedule/${SCHEDULE_GROUP_NAME}/${SCHEDULE_NAME}`; // For logging or reference

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

    // Route for managing the schedule
    if (event.rawPath === "/manage-schedule") {
      log(debug, "Routing to /manage-schedule...");
      const { action } = requestBody; // Assuming action is in requestBody
      if (!action || (action !== 'enable' && action !== 'disable')) {
          return {
              statusCode: 400,
              body: JSON.stringify({ error: "Missing or invalid 'action' in request body for /manage-schedule. Must be 'enable' or 'disable'." }),
          };
      }

      try {
          const schedulerClient = new SchedulerClient({}); // Assumes default region from Lambda environment

          // 1. Get the current schedule details
          const getScheduleInput = {
              Name: SCHEDULE_NAME,
              GroupName: SCHEDULE_GROUP_NAME
          };
          const getCommand = new GetScheduleCommand(getScheduleInput);
          const scheduleDetails = await schedulerClient.send(getCommand);

          // 2. Prepare the update command
          const updateCommandInput = {
              Name: SCHEDULE_NAME,
              GroupName: SCHEDULE_GROUP_NAME,
              State: action === 'enable' ? 'ENABLED' : 'DISABLED',
              // Pass through other required fields from the existing schedule
              ScheduleExpression: scheduleDetails.ScheduleExpression,
              Target: scheduleDetails.Target,
              FlexibleTimeWindow: scheduleDetails.FlexibleTimeWindow,
              // Optional fields that should also be passed if they exist
              ...(scheduleDetails.Description && { Description: scheduleDetails.Description }),
              ...(scheduleDetails.ScheduleExpressionTimezone && { ScheduleExpressionTimezone: scheduleDetails.ScheduleExpressionTimezone }),
              ...(scheduleDetails.StartDate && { StartDate: scheduleDetails.StartDate }),
              ...(scheduleDetails.EndDate && { EndDate: scheduleDetails.EndDate }),
              ...(scheduleDetails.KmsKeyArn && { KmsKeyArn: scheduleDetails.KmsKeyArn }),
              ...(scheduleDetails.DeadLetterConfig && { DeadLetterConfig: scheduleDetails.DeadLetterConfig }),
              ...(scheduleDetails.RetryPolicy && { RetryPolicy: scheduleDetails.RetryPolicy }),
          };

          const updateCommand = new UpdateScheduleCommand(updateCommandInput);
          await schedulerClient.send(updateCommand);

          const message = `Schedule ${SCHEDULE_NAME} in group ${SCHEDULE_GROUP_NAME} ${action}d successfully.`;
          log(debug, message);
          return {
              statusCode: 200,
              body: JSON.stringify({ message: message }),
          };

      } catch (error) {
          console.error(`Error ${action}ing schedule:`, error);
          log(debug, `Error ${action}ing schedule: ${error.message}`);
          return {
              statusCode: 500,
              body: JSON.stringify({ error: `Failed to ${action} schedule ${SCHEDULE_NAME}.`, details: error.message }),
          };
      }
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
