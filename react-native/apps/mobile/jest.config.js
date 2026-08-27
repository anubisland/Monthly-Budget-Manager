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
    'src/suggest/**/*.ts',
    'src/screens/dateDisplay.ts',
    // A StyleSheet holds no logic and can only be imported by a .tsx, which
    // testEnvironment: node cannot render -- collecting it reports an
    // unreachable zero rather than a real gap.
    '!src/**/styles.ts',
    '!src/**/*.test.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, statements: 90, functions: 90, branches: 80 },
  },
};
