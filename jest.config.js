module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/unit/**/*.test.js',
    '**/__tests__/properties/**/*.test.js'
  ],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
};