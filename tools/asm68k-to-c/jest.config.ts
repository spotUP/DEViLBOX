export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['**/tests/**/*.test.ts'],
  // Compile tests as ES2022 modules so `import.meta` is allowed (the integration
  // tests use import.meta.url for __dirname). ts-jest otherwise defaults to a module
  // that rejects it (TS1343).
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: { module: 'esnext', target: 'es2022' } }],
  },
};
