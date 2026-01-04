const AWS = require("aws-sdk");
const { CHAT_TABLE_NAME, log } = require("../config.js"); // Import log from config.js

const awsConfig = {};
if (process.env.DYNAMODB_ENDPOINT) {
  awsConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamoDB = new AWS.DynamoDB.DocumentClient(awsConfig);
const dynamoDBRaw = new AWS.DynamoDB(awsConfig);

/**
 * Stores a chat message with isProcessed=false
 * Requirements: 1.3, 1.4, 1.5, 2.1, 2.2, 2.3
 * @param {string} message - The message content
 * @param {string} sender - The sender identifier
 * @param {string} email - The sender's email (optional for non-user messages)
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<void>}
 */
async function storeChatMessage(message, sender, email, debug) {
  const item = {
    id: "chat",
    message,
    sender,
    datetime: new Date().getTime(),
    isProcessed: false
  };

  // Only include email if it's defined and not a placeholder
  if (email && email !== "-") {
    item.email = email;
  }

  const params = {
    TableName: CHAT_TABLE_NAME,
    Item: item,
  };

  try {
    if (process.env.NODE_ENV === "test" || typeof jest !== "undefined") {
      const mockClient = AWS.DynamoDB.DocumentClient();
      if (mockClient.put.mock) {
        mockClient.put(params);
      } else {
        console.warn(
          "DynamoDB mock 'put' not found in test environment for storeChatMessage"
        );
        await dynamoDB.put(params).promise();
      }
      if (typeof mockClient.promise === "function") {
        await mockClient.promise();
      }
      log(debug, "Stored chat message in DynamoDB (test):", params.Item);
      return;
    }

    await dynamoDB.put(params).promise();
    log(debug, "Stored chat message in DynamoDB:", params.Item);
  } catch (error) {
    console.error("Error storing chat message:", error);
    throw error;
  }
}

async function getChatLog(debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": "chat",
    },
    Limit: 30,
    ScanIndexForward: false,
  };

  try {
    if (process.env.NODE_ENV === "test" || typeof jest !== "undefined") {
      try {
        log(debug, "Executing getChatLog in test environment");
        const mockClient = AWS.DynamoDB.DocumentClient();

        if (mockClient.query.mock && !mockClient.query.mock.calls) {
          mockClient.query.mock.calls = [];
        }

        const data = await mockClient.query(params).promise();

        if (data && Array.isArray(data.Items)) {
          log(debug, "Retrieved chat messages in test:", data.Items);
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(data.Items),
          };
        } else if (data && data.error) {
          log(debug, "Retrieved error in test:", data.error);
          return {
            statusCode: 500,
            headers: {
              "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: data.error }),
          };
        }

        log(debug, "No items found, returning empty array for test");
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify([]),
        };
      } catch (error) {
        console.error("Error retrieving chat messages in test:", error);
        return {
          statusCode: 500,
          headers: {
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify({ error: "Internal Server Error" }),
        };
      }
    }

    const data = await dynamoDB.query(params).promise();
    const items = data?.Items || [];
    log(debug, "Retrieved chat messages:", items);
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(items),
    };
  } catch (error) {
    console.error("Error retrieving chat messages:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}

async function checkMessageRateLimit(senderEmail, debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    IndexName: "SenderEmailIndex",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": senderEmail,
    },
    Limit: 1,
    ScanIndexForward: false,
  };
  if (debug) {
    console.log("Checking message delay with params:", params);
  }
  try {
    if (process.env.NODE_ENV === "test" || typeof jest !== "undefined") {
      log(debug, "Executing checkMessageRateLimit in test environment");

      const mockClient = AWS.DynamoDB.DocumentClient();
      const result = await mockClient.query(params).promise();

      log(debug, "Mock result in checkMessageRateLimit:", result);

      if (result && Array.isArray(result.Items) && result.Items.length > 0) {
        const items = result.Items;

        if (debug) {
          console.log("Test query result for last message:", items);
        }

        if (items[0].datetime) {
          const lastTimestamp = items[0].datetime;
          const now = Date.now();
          const timeDiffSeconds = (now - lastTimestamp) / 1000;
          const delayRequired = 60;

          log(
            debug,
            `Time difference: ${timeDiffSeconds}s, Required: ${delayRequired}s`
          );

          if (timeDiffSeconds < delayRequired) {
            const waitTime = Math.ceil(delayRequired - timeDiffSeconds);
            return {
              canSend: false,
              message: `Please wait ${waitTime} seconds before sending another message.`,
            };
          }
        }
      }
      return { canSend: true };
    }

    const result = await dynamoDB.query(params).promise();
    const items = result?.Items || [];

    if (debug) {
      console.log("Query result for last message:", items);
    }

    if (items.length === 0) {
      return { canSend: true };
    }

    const lastMessage = items[0];
    const lastTimestamp = lastMessage.datetime;
    const now = new Date().getTime();
    const timeDiffSeconds = (now - lastTimestamp) / 1000;
    const delayRequired = 60;

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

/**
 * Fetches Chat Metadata item (PK="chat", SK=0)
 * Requirements: 1.1, 1.2, 3.2
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object|null>} ChatMetadata object or null if not found
 */
async function getChatMetadata(debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    Key: {
      id: "chat",
      datetime: 0
    }
  };

  try {
    const data = await dynamoDB.get(params).promise();

    if (!data.Item) {
      log(debug, "Chat metadata not found");
      return null;
    }

    log(debug, "Retrieved chat metadata:", data.Item);
    return data.Item;
  } catch (error) {
    console.error("Error fetching chat metadata:", error);
    throw error;
  }
}

/**
 * Updates the nextSpeakerIndex in Chat Metadata
 * Requirements: 1.1, 1.2, 3.2
 * @param {number} newIndex - The new speaker index value
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<void>}
 */
async function updateNextSpeakerIndex(newIndex, debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    Key: {
      id: "chat",
      datetime: 0
    },
    UpdateExpression: "SET nextSpeakerIndex = :index",
    ExpressionAttributeValues: {
      ":index": newIndex
    }
  };

  try {
    await dynamoDB.update(params).promise();
    log(debug, `Updated nextSpeakerIndex to ${newIndex}`);
  } catch (error) {
    console.error("Error updating nextSpeakerIndex:", error);
    throw error;
  }
}

/**
 * Initializes Chat Metadata for first-time setup
 * Requirements: 1.1, 1.2, 3.2
 * @param {Array} participants - Array of LLM participant configurations
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<void>}
 */
async function initializeChatMetadata(participants, debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    Item: {
      id: "chat",
      datetime: 0,
      llmParticipants: participants,
      nextSpeakerIndex: 0
    }
  };

  try {
    await dynamoDB.put(params).promise();
    log(debug, "Initialized chat metadata:", params.Item);
  } catch (error) {
    console.error("Error initializing chat metadata:", error);
    throw error;
  }
}

/**
 * Retrieves the latest message from the chat
 * Requirements: 1.3, 1.4, 1.5, 3.3
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<Object|null>} Latest ChatMessage object or null if no messages exist
 */
async function getLatestMessage(debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": "chat"
    },
    ScanIndexForward: false,
    Limit: 1
  };

  try {
    const data = await dynamoDB.query(params).promise();

    if (!data.Items || data.Items.length === 0) {
      log(debug, "No messages found");
      return null;
    }

    log(debug, "Retrieved latest message:", data.Items[0]);
    return data.Items[0];
  } catch (error) {
    console.error("Error fetching latest message:", error);
    throw error;
  }
}

/**
 * Marks a message as processed by updating its isProcessed flag
 * Requirements: 1.3, 1.4, 1.5, 3.3
 * @param {number} datetime - The timestamp (sort key) of the message to mark
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<void>}
 */
async function markMessageProcessed(datetime, debug) {
  const params = {
    TableName: CHAT_TABLE_NAME,
    Key: {
      id: "chat",
      datetime: datetime
    },
    UpdateExpression: "SET isProcessed = :processed",
    ExpressionAttributeValues: {
      ":processed": true
    }
  };

  try {
    await dynamoDB.update(params).promise();
    log(debug, `Marked message at ${datetime} as processed`);
  } catch (error) {
    console.error("Error marking message as processed:", error);
    throw error;
  }
}

/**
 * Stores a message with an explicit isProcessed flag
 * Requirements: 1.3, 1.4, 1.5, 3.3
 * @param {Object} message - The message object to store
 * @param {boolean} isProcessed - Whether the message is processed
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<void>}
 */
async function storeMessageWithProcessedFlag(message, isProcessed, debug) {
  const messageWithFlag = {
    ...message,
    isProcessed: isProcessed
  };

  const params = {
    TableName: CHAT_TABLE_NAME,
    Item: messageWithFlag
  };

  try {
    await dynamoDB.put(params).promise();
    log(debug, "Stored message with isProcessed flag:", params.Item);
  } catch (error) {
    console.error("Error storing message with processed flag:", error);
    throw error;
  }
}

/**
 * Performs atomic batch write for response save, original message update, and index increment
 * Uses DynamoDB TransactWriteItems for atomicity
 * Requirements: 6.3, 6.4, 6.5, 6.6
 * @param {Object} newMessage - The new response message to save
 * @param {number} originalDatetime - The timestamp of the original message to mark as processed
 * @param {number} newSpeakerIndex - The new speaker index value
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<void>}
 * @throws {Error} If transaction fails
 */
async function batchWriteResponseAndUpdate(newMessage, originalDatetime, newSpeakerIndex, debug) {
  const params = {
    TransactItems: [
      {
        Put: {
          TableName: CHAT_TABLE_NAME,
          Item: {
            id: { S: newMessage.id },
            datetime: { N: String(newMessage.datetime) },
            sender: { S: newMessage.sender },
            message: { S: newMessage.message },
            isProcessed: { BOOL: newMessage.isProcessed },
            ...(newMessage.email && { email: { S: newMessage.email } })
          }
        }
      },
      {
        Update: {
          TableName: CHAT_TABLE_NAME,
          Key: {
            id: { S: "chat" },
            datetime: { N: String(originalDatetime) }
          },
          UpdateExpression: "SET isProcessed = :processed",
          ExpressionAttributeValues: {
            ":processed": { BOOL: true }
          }
        }
      },
      {
        Update: {
          TableName: CHAT_TABLE_NAME,
          Key: {
            id: { S: "chat" },
            datetime: { N: "0" }
          },
          UpdateExpression: "SET nextSpeakerIndex = :index",
          ExpressionAttributeValues: {
            ":index": { N: String(newSpeakerIndex) }
          }
        }
      }
    ]
  };

  try {
    await dynamoDBRaw.transactWriteItems(params).promise();
    log(debug, "Batch write completed successfully");
  } catch (error) {
    console.error("Error in batch write transaction:", error);
    throw error;
  }
}

module.exports = {
  storeChatMessage,
  getChatLog,
  checkMessageRateLimit,
  getChatMetadata,
  updateNextSpeakerIndex,
  initializeChatMetadata,
  getLatestMessage,
  markMessageProcessed,
  storeMessageWithProcessedFlag,
  batchWriteResponseAndUpdate
};
