const AWS = require("aws-sdk");
const axios = require("axios");
const { NEWS_TABLE_NAME, NEWS_API_URL, log } = require('../config.js'); // Import log from config.js

const dynamoDB = new AWS.DynamoDB.DocumentClient();

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
        body: JSON.stringify(newsData),
      };
    }

    const data = await dynamoDB.get(params).promise();

    if (data && data.Item) {
      log(debug, "News data found in cache:", data.Item);
      return {
        statusCode: 200,
        body: JSON.stringify(data.Item.news),
      };
    }

    log(debug, `News data not found in cache. Fetching from API ${NEWS_API_URL}`);

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
      body: JSON.stringify(newsData),
    };
  } catch (error) {
    console.error("Error fetching or storing news:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}

module.exports = {
  getNews,
};
