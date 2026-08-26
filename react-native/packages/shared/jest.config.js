/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: { lines: 90, statements: 90, functions: 90, branches: 80 },
  },
};
