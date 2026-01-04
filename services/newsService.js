const AWS = require("aws-sdk");
const axios = require("axios");
const { NEWS_TABLE_NAME, NEWS_API_URL, log } = require('../config.js'); // Import log from config.js

const awsConfig = {};
if (process.env.DYNAMODB_ENDPOINT) {
  awsConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
}

const dynamoDB = new AWS.DynamoDB.DocumentClient(awsConfig);

async function getNews(debug) {
  const params = {
    TableName: NEWS_TABLE_NAME,
    Key: { request_hash: "1" },
  };

  try {
    if (process.env.NODE_ENV === 'test' || typeof jest !== 'undefined') {
      const data = await dynamoDB.get(params).promise();
      log(debug, "News cache check in test environment, found:", data);

      if (data && data.Item) {
        log(debug, "News data found in cache (test):", data.Item);
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify(data.Item.news),
        };
      }

      log(debug, `News data not found in cache (test). Fetching from API.`);

      // axios.get is globally mocked. Its behavior for a specific test
      // is determined by mockResolvedValueOnce/mockRejectedValueOnce in the test setup.
      const mockResponse = await axios.get(NEWS_API_URL);

      const newsData = mockResponse.data;
      log(debug, "Fetched news data (test):", newsData);

      const putParams = {
        TableName: NEWS_TABLE_NAME,
        Item: {
          request_hash: "1",
          news: newsData,
          ttl: Math.floor(Date.now() / 1000) + 20 * 60,
        },
      };

      await dynamoDB.put(putParams).promise();
      log(debug, "Stored news data in cache (test):", putParams.Item);

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(newsData),
      };
    }

    const data = await dynamoDB.get(params).promise();

    if (data && data.Item) {
      log(debug, "News data found in cache:", data.Item);
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(data.Item.news),
      };
    }

    console.log();
    // Check if running locally with SAM
    if (process.env.IS_LOCAL || process.env.AWS_SAM_LOCAL === 'true') {
      log(debug, "SAM Local detected. Returning mock news data.");
      const mockNews = {
        totalArticles: 1,
        articles: [
          {
            title: "Local Test Article: AI is taking over... your localhost!",
            description: "This is a mock article returned because you are running locally.",
            content: "Lorem ipsum dolor sit amet...",
            url: "http://localhost:3000",
            image: "https://via.placeholder.com/151",
            publishedAt: new Date().toISOString(),
            source: {
              name: "Localhost News",
              url: "http://localhost:3000"
            }
          }
        ]
      };

      // Cache it so subsequent requests work like prod
      const putParams = {
        TableName: NEWS_TABLE_NAME,
        Item: {
          request_hash: "1",
          news: mockNews,
          ttl: Math.floor(Date.now() / 1000) + 20 * 60,
        },
      };
      await dynamoDB.put(putParams).promise();

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(mockNews),
      };
    } else {
      log(debug, `News data not found in cache. Fetching from API ${NEWS_API_URL}`);
    }

    const response = await axios.get(NEWS_API_URL);
    const newsData = response.data;
    log(debug, "Fetched news data:", newsData);

    const putParams = {
      TableName: NEWS_TABLE_NAME,
      Item: {
        request_hash: "1",
        news: newsData,
        ttl: Math.floor(Date.now() / 1000) + 20 * 60,
      },
    };

    await dynamoDB.put(putParams).promise();
    log(debug, "Stored news data in cache:", putParams.Item);
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(newsData),
    };
  } catch (error) {
    console.error("Error fetching or storing news:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}

module.exports = {
  getNews,
};
