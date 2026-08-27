/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // ts before js, so a stray compiled artifact can never shadow source.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  collectCoverageFrom: [
    'src/state/**/*.ts',
    'src/i18n/**/*.ts',
    'src/charts/**/*.ts',
    'src/components/**/*.ts',
    'src/entry/**/*.ts',
    'src/compare/**/*.ts',
    '!src/**/*.test.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, statements: 90, functions: 90, branches: 80 },
  },
};
