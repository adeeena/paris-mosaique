/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/scripts/**/*.spec.js'],
  transform: {
    '^.+\\.(ts|js|mjs|html|svg)$': [
      'jest-preset-angular',
      { tsconfig: '<rootDir>/tsconfig.spec.json', stringifyContentPathRegex: '\\.(html|svg)$' }
    ]
  },
  // Angular ships .mjs; d3-delaunay and its deps ship ESM-only .js
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|d3-delaunay|delaunator|robust-predicates))']
};
