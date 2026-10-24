module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: ['script.js'],
  // These floors are the measured baseline, not an aspiration: they are set
  // here so the gate runs (it previously never did, because CI called `jest`
  // without --coverage). Raise them as tests are added; never lower them.
  // The gap is chart drawing + event handlers, which need a canvas mock.
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 35,
      functions: 55,
      lines: 55,
    },
  },
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  coverageDirectory: '<rootDir>/coverage',
  verbose: true,
}
