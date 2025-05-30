const axios = require('axios');
const { CLIENT_ID, log } = require('./config.js'); // Import log from config.js

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

    if (CLIENT_ID && tokenInfo.azp !== CLIENT_ID) {
      throw new Error("Token not issued for this client");
    }

    log(debug, "Token verified successfully:", tokenInfo);
    return tokenInfo;
  } catch (error) {
    console.error("Token verification failed:", error.message);
    throw error;
  }
}

module.exports = {
  verifyAccessToken,
};
