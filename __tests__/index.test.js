// Import shared mocks and utilities first
const { log, CLIENT_ID, API_KEY, MODEL_NAME, NEWS_TABLE_NAME, CHAT_TABLE_NAME, NEWS_API_URL } = require("../config");

// --- Centralized Mocks ---
var mockDDBGetPromiseFn = jest.fn();
var mockDDBPutPromiseFn = jest.fn();
var mockDDBQueryPromiseFn = jest.fn();
var mockSharedClientInstancePromise = jest.fn();

var mockActualDDBGetMethod = jest.fn(function() { this.promise = mockDDBGetPromiseFn; return { promise: mockDDBGetPromiseFn }; });
var mockActualDDBPutMethod = jest.fn(function() { this.promise = mockDDBPutPromiseFn; return { promise: mockDDBPutPromiseFn }; });
var mockActualDDBQueryMethod = jest.fn(function() { this.promise = mockDDBQueryPromiseFn; return { promise: mockDDBQueryPromiseFn }; });
var mockGenAIGenerateContent = jest.fn();

jest.mock("aws-sdk", () => {
  const createMockDocClientInstance = () => ({
    get: mockActualDDBGetMethod,
    put: mockActualDDBPutMethod,
    query: mockActualDDBQueryMethod,
    promise: mockSharedClientInstancePromise, // Should not be necessary if methods return { promise: fn }
  });
  return {
    DynamoDB: {
      DocumentClient: jest.fn(createMockDocClientInstance),
    },
  };
});

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: mockGenAIGenerateContent,
    })),
  })),
}));

jest.mock("axios"); // Global mock for axios
jest.mock("google-auth-library", () => ({ OAuth2Client: jest.fn() }));
// --- End Centralized Mocks ---

describe("stab test", () => {
  test("should pass", () => { expect(true).toBe(true); });
});

describe("log", () => {
  let consoleLogSpy;
  beforeEach(() => { consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {}); });
  afterEach(() => { consoleLogSpy.mockRestore(); });

  test("should call console.log when debug is true", () => {
    log(true, "Test message");
    expect(consoleLogSpy).toHaveBeenCalledWith("Test message");
  });
  test("should not call console.log when debug is false", () => {
    log(false, "Test message");
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

describe("verifyAccessToken", () => {
  const OLD_ENV = process.env;
  let consoleErrorSpy, mockAxios, verifyAccessToken;

  beforeEach(() => {
    jest.resetModules(); // Resets module cache
    process.env = { ...OLD_ENV, VITE_GOOGLE_CLIENT_ID: "test-client-id" };
    mockAxios = require("axios"); // mockAxios is the mocked axios module
    verifyAccessToken = require("../auth").verifyAccessToken; // Re-require after reset
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { process.env = OLD_ENV; consoleErrorSpy.mockRestore(); jest.clearAllMocks(); });

  test("should return token info on successful verification", async () => {
    const mockTokenData = { azp: "test-client-id", some_other_data: "data" };
    mockAxios.get.mockResolvedValueOnce({ data: mockTokenData }); // axios.get() returns { data: ... }
    const result = await verifyAccessToken("valid-token", false);
    expect(result).toEqual(mockTokenData);
    expect(mockAxios.get).toHaveBeenCalledWith(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=valid-token`);
  });
  test("should throw error if token is invalid", async () => {
    const mockErrorResponse = { data: { error: "invalid_token", error_description: "Invalid token" } };
    mockAxios.get.mockResolvedValueOnce(mockErrorResponse);
    await expect(verifyAccessToken("invalid-token", false)).rejects.toThrow("Invalid token");
  });
  test("should throw error if token is not issued for this client", async () => {
    const mockTokenData = { azp: "other-client-id" };
    mockAxios.get.mockResolvedValueOnce({ data: mockTokenData });
    await expect(verifyAccessToken("mismatched-token", false)).rejects.toThrow("Token not issued for this client");
  });
  test("should throw error if Google API call fails", async () => {
    const apiError = new Error("Network error");
    mockAxios.get.mockRejectedValueOnce(apiError);
    await expect(verifyAccessToken("any-token", false)).rejects.toThrow("Network error");
  });
});

describe("generateAiResponse", () => {
  const OLD_ENV = process.env;
  let consoleErrorSpy, consoleLogSpy, generateAiResponse;
  const testPersonality = { moods: ["Test mood 1 about ", "Test mood 2 regarding "], phrase: "Test phrase for " };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, GOOGLE_API_KEY: "test-api-key", GOOGLE_MODEL_NAME: "test-model-name" };
    generateAiResponse = require("../services/generativeAiService").generateAiResponse;
    mockGenAIGenerateContent.mockReset().mockResolvedValue({ response: { text: () => "default mock response" } });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { process.env = OLD_ENV; consoleErrorSpy.mockRestore(); consoleLogSpy.mockRestore(); jest.clearAllMocks(); });

  test("should return response text on successful generation", async () => {
    const expectedResponse = "AI generated text here";
    mockGenAIGenerateContent.mockResolvedValueOnce({ response: { text: () => expectedResponse } });
    const result = await generateAiResponse("user input", testPersonality, false);
    expect(result).toBe(expectedResponse);
    expect(mockGenAIGenerateContent).toHaveBeenCalledTimes(1);
  });
  test("should generate prompt using a random mood and user input", async () => {
    const userInput = "the future of AI";
    await generateAiResponse(userInput, testPersonality, false);
    expect(mockGenAIGenerateContent).toHaveBeenCalledTimes(1);
    const actualPrompt = mockGenAIGenerateContent.mock.calls[0][0];
    expect(testPersonality.moods.map(mood => mood + userInput)).toContain(actualPrompt);
  });
  test("should include debug logs when debug is true", async () => {
    const userInput = "another query"; const expectedResponse = "Debug response";
    mockGenAIGenerateContent.mockResolvedValueOnce({ response: { text: () => expectedResponse } });
    await generateAiResponse(userInput, testPersonality, true);
    expect(consoleLogSpy).toHaveBeenCalledWith("Generated prompt:", expect.stringContaining(userInput));
    expect(consoleLogSpy).toHaveBeenCalledWith("Generated response text:", expectedResponse);
  });
  test("should throw error if AI model call fails", async () => {
    const aiError = new Error("AI model error");
    mockGenAIGenerateContent.mockRejectedValueOnce(aiError);
    await expect(generateAiResponse("any input", testPersonality, false)).rejects.toThrow("AI model error");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error generating response:", aiError);
  });
});

describe("getNews", () => {
  const OLD_ENV = process.env;
  let consoleErrorSpy, consoleLogSpy, mockAxios, getNews;
  const VITE_GNEWS_API_KEY_val = "test-gnews-key";

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, VITE_GNEWS_API_KEY: VITE_GNEWS_API_KEY_val, NEWS_API_URL: `https://gnews.io/api/v4/search?q=artificial intelligence&lang=en&max=5&apikey=${VITE_GNEWS_API_KEY_val}`, NEWS_TABLE_NAME: "InfiniteChat_NewsAPI_Cache" };
    mockAxios = require("axios");
    getNews = require("../services/newsService").getNews;
    mockDDBGetPromiseFn.mockReset().mockResolvedValue({});
    mockDDBPutPromiseFn.mockReset().mockResolvedValue({});
    mockActualDDBGetMethod.mockClear(); // Clear call counts for the method itself
    mockActualDDBPutMethod.mockClear();
    mockAxios.get.mockReset();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { process.env = OLD_ENV; consoleErrorSpy.mockRestore(); consoleLogSpy.mockRestore(); jest.clearAllMocks(); });

  test("should retrieve news from cache if available (cache hit)", async () => {
    const cachedNewsData = { articles: [{ title: "Cached News From DB" }] };
    mockDDBGetPromiseFn.mockResolvedValueOnce({ Item: { news: cachedNewsData } });
    const response = await getNews(false);
    expect(JSON.parse(response.body)).toEqual(cachedNewsData);
    expect(mockActualDDBGetMethod).toHaveBeenCalledTimes(1);
    expect(mockAxios.get).not.toHaveBeenCalled();
  });
  test("should retrieve news from API and cache it if not in cache (cache miss)", async () => {
    const apiNewsData = { articles: [{ title: "Fresh API News" }] };
    mockAxios.get.mockResolvedValueOnce({ data: apiNewsData }); // Axios returns { data: ... }
    const response = await getNews(false);
    expect(JSON.parse(response.body)).toEqual(apiNewsData);
    expect(mockActualDDBGetMethod).toHaveBeenCalledTimes(1);
    expect(mockAxios.get).toHaveBeenCalledWith(process.env.NEWS_API_URL);
    expect(mockActualDDBPutMethod).toHaveBeenCalledTimes(1);
    expect(mockActualDDBPutMethod.mock.calls[0][0]).toMatchObject({ TableName: process.env.NEWS_TABLE_NAME, Item: { news: apiNewsData } });
  });
  test("should return 500 error if API call fails", async () => {
    const apiError = new Error("API Error");
    mockAxios.get.mockRejectedValueOnce(apiError);
    const response = await getNews(false);
    expect(response.statusCode).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching or storing news:", apiError);
  });
  test("should return 500 error if DynamoDB get operation fails", async () => {
    const dbError = new Error("Dynamo Get Error");
    mockDDBGetPromiseFn.mockRejectedValueOnce(dbError); // Mock for .get().promise()
    const response = await getNews(false);
    expect(response.statusCode).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching or storing news:", dbError);
  });
  test("should return 500 error if DynamoDB put operation fails", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { articles: [] } });
    const dbPutError = new Error("Dynamo Put Error");
    mockDDBPutPromiseFn.mockRejectedValueOnce(dbPutError); // Mock for .put().promise()
    const response = await getNews(false);
    expect(response.statusCode).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error fetching or storing news:", dbPutError);
  });
  test("should include debug logs when debug is true (cache miss scenario)", async () => {
    const apiNewsData = { articles: [{ title: "Debug API News" }] };
    mockAxios.get.mockResolvedValueOnce({ data: apiNewsData });
    process.env.NODE_ENV = 'test'; // Ensure test path is taken in getNews
    await getNews(true);
    expect(consoleLogSpy).toHaveBeenCalledWith("News cache check in test environment, found:", {});
    expect(consoleLogSpy).toHaveBeenCalledWith("News data not found in cache (test). Fetching from API.");
    expect(consoleLogSpy).toHaveBeenCalledWith("Fetched news data (test):", apiNewsData);
    expect(consoleLogSpy).toHaveBeenCalledWith("Stored news data in cache (test):", expect.objectContaining({ news: apiNewsData }));
  });
});

describe("storeChatMessage", () => {
  const OLD_ENV = process.env;
  let consoleErrorSpy, consoleLogSpy, storeChatMessage;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, CHAT_TABLE_NAME: "InfiniteChat_ChatLog" };
    storeChatMessage = require("../services/dynamoDbService").storeChatMessage;
    mockActualDDBPutMethod.mockClear();
    mockDDBPutPromiseFn.mockReset().mockResolvedValue({});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { process.env = OLD_ENV; consoleErrorSpy.mockRestore(); consoleLogSpy.mockRestore(); jest.clearAllMocks(); });

  test("should store chat message successfully", async () => {
    const itemMatcher = { id: "chat", message: "Hello", sender: "User1", email: "user1@example.com" };
    await storeChatMessage("Hello", "User1", "user1@example.com", false);
    expect(mockActualDDBPutMethod).toHaveBeenCalledTimes(1);
    expect(mockDDBPutPromiseFn).toHaveBeenCalledTimes(1); // Since SUT calls .promise()
    expect(mockActualDDBPutMethod).toHaveBeenCalledWith(expect.objectContaining({ TableName: process.env.CHAT_TABLE_NAME, Item: expect.objectContaining(itemMatcher) }));
  });
  test("should throw error if DynamoDB put operation fails", async () => {
    const dbError = new Error("Dynamo Put Error");
    mockDDBPutPromiseFn.mockRejectedValueOnce(dbError);
    await expect(storeChatMessage("Hi", "User2", "user2@example.com", false)).rejects.toThrow("Dynamo Put Error");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error storing chat message:", dbError);
  });
  test("should include debug logs when debug is true", async () => {
    process.env.NODE_ENV = 'test'; // Ensure test path
    await storeChatMessage("Debug", "User3", "user3@example.com", true);
    expect(consoleLogSpy).toHaveBeenCalledWith("Stored chat message in DynamoDB (test):", expect.any(Object));
  });
});

describe("getChatLog", () => {
  const OLD_ENV = process.env;
  let consoleErrorSpy, consoleLogSpy, getChatLog;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, CHAT_TABLE_NAME: "InfiniteChat_ChatLog" };
    getChatLog = require("../services/dynamoDbService").getChatLog;
    mockActualDDBQueryMethod.mockClear();
    mockDDBQueryPromiseFn.mockReset().mockResolvedValue({ Items: [] });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { process.env = OLD_ENV; consoleErrorSpy.mockRestore(); consoleLogSpy.mockRestore(); jest.clearAllMocks(); });

  test("should retrieve chat messages successfully", async () => {
    const chatItems = [{ message: "Hello" }];
    mockDDBQueryPromiseFn.mockResolvedValueOnce({ Items: chatItems });
    const response = await getChatLog(false);
    expect(mockActualDDBQueryMethod).toHaveBeenCalledTimes(1);
    expect(JSON.parse(response.body)).toEqual(chatItems);
  });
  test("should return empty array if no chat messages found", async () => {
    const response = await getChatLog(false); // Default mock is Items: []
    expect(JSON.parse(response.body)).toEqual([]);
  });
  test("should return empty array if DynamoDB response has no 'Items' property", async () => {
    mockDDBQueryPromiseFn.mockResolvedValueOnce({}); // No Items
    const response = await getChatLog(false);
    expect(JSON.parse(response.body)).toEqual([]);
  });
  test("should return empty array if DynamoDB response 'Items' is null", async () => {
    mockDDBQueryPromiseFn.mockResolvedValueOnce({ Items: null }); // Items is null
    const response = await getChatLog(false);
    expect(JSON.parse(response.body)).toEqual([]);
  });
  test("should return 500 error if DynamoDB query operation fails", async () => {
    const dbError = new Error("Dynamo Query Error");
    mockDDBQueryPromiseFn.mockRejectedValueOnce(dbError);
    process.env.NODE_ENV = 'test'; // To hit the specific catch block in SUT
    const response = await getChatLog(false);
    expect(response.statusCode).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error retrieving chat messages in test:", dbError);
  });
  test("should include debug logs when debug is true", async () => {
    process.env.NODE_ENV = 'test';
    await getChatLog(true);
    expect(consoleLogSpy).toHaveBeenCalledWith("Executing getChatLog in test environment");
  });
});

describe("checkMessageRateLimit", () => {
  const OLD_ENV = process.env;
  let consoleErrorSpy, consoleLogSpy, checkMessageRateLimit;
  const MOCK_NOW = 1700000000000;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, CHAT_TABLE_NAME: "InfiniteChat_ChatLog" };
    checkMessageRateLimit = require("../services/dynamoDbService").checkMessageRateLimit;
    mockActualDDBQueryMethod.mockClear();
    mockDDBQueryPromiseFn.mockReset().mockResolvedValue({ Items: [] }); // Default: no previous messages
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(Date, 'now').mockReturnValue(MOCK_NOW);
  });
  afterEach(() => { process.env = OLD_ENV; consoleErrorSpy.mockRestore(); consoleLogSpy.mockRestore(); jest.restoreAllMocks(); });

  const getExpectedQueryParams = (email) => ({ TableName: process.env.CHAT_TABLE_NAME, IndexName: "SenderEmailIndex", KeyConditionExpression: "email = :email", ExpressionAttributeValues: { ":email": email }, Limit: 1, ScanIndexForward: false });

  test("should allow sending if no previous messages", async () => {
    const result = await checkMessageRateLimit("newuser@example.com", false);
    expect(mockActualDDBQueryMethod).toHaveBeenCalledWith(getExpectedQueryParams("newuser@example.com"));
    expect(result).toEqual({ canSend: true });
  });
  test("should allow sending if last message was long ago", async () => {
    mockDDBQueryPromiseFn.mockResolvedValueOnce({ Items: [{ datetime: MOCK_NOW - 70000 }] }); // 70s ago
    const result = await checkMessageRateLimit("olduser@example.com", false);
    expect(result).toEqual({ canSend: true });
  });
  test("should prevent sending if last message was recent", async () => {
    process.env.NODE_ENV = 'test'; // Ensure test path
    mockDDBQueryPromiseFn.mockResolvedValueOnce({ Items: [{ datetime: MOCK_NOW - 30000 }] }); // 30s ago
    const result = await checkMessageRateLimit("recentuser@example.com", true);
    expect(result).toEqual({ canSend: false, message: "Please wait 30 seconds before sending another message." });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Time difference: 30s, Required: 60s"));
  });
  test("should prevent sending if last message was very recent (e.g. 1 sec ago)", async () => {
    process.env.NODE_ENV = 'test'; // Ensure test path
    mockDDBQueryPromiseFn.mockResolvedValueOnce({ Items: [{ datetime: MOCK_NOW - 1000 }] }); // 1s ago
    const result = await checkMessageRateLimit("veryrecentuser@example.com", false);
    expect(result).toEqual({ canSend: false, message: "Please wait 59 seconds before sending another message." });
  });
  test("should throw error if DynamoDB query operation fails", async () => {
    const dbError = new Error("Dynamo GSI Query Error");
    mockDDBQueryPromiseFn.mockRejectedValueOnce(dbError);
    await expect(checkMessageRateLimit("erroruser@example.com", false)).rejects.toThrow("Dynamo GSI Query Error");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error checking message delay:", dbError);
  });
  test("should include debug logs when debug is true", async () => {
    process.env.NODE_ENV = 'test';
    const mockDynamoResp = { Items: [] };
    mockDDBQueryPromiseFn.mockResolvedValueOnce(mockDynamoResp);
    await checkMessageRateLimit("debuguser@example.com", true);
    expect(consoleLogSpy).toHaveBeenCalledWith("Executing checkMessageRateLimit in test environment");
    expect(consoleLogSpy).toHaveBeenCalledWith("Mock result in checkMessageRateLimit:", mockDynamoResp);
  });
});
