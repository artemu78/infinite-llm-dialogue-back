const AWS = require("aws-sdk");
const axios = require("axios");
const index = require("../index");

// Mock dependencies
jest.mock("aws-sdk", () => {
  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => ({
        get: jest.fn().mockReturnThis(),
        put: jest.fn().mockReturnThis(),
        query: jest.fn().mockReturnThis(),
        promise: jest.fn(),
      })),
    },
  };
});

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue("mocked response text"),
        },
      }),
    }),
  })),
}));

jest.mock("axios");
jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn(),
}));

describe("stab test", () => {
  test("should pass", () => {
    expect(true).toBe(true);
  });
});
