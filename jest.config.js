// Scoped to the pure pricing engine + utils (no React Native runtime needed). ts-jest compiles the
// TypeScript directly. The money path is the thing that must be provably correct, so it gets its own
// fast, dependency-light test runner.
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/src/utils/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      isolatedModules: true,
      tsconfig: { strict: true, esModuleInterop: true, skipLibCheck: true, module: "commonjs", target: "es2019", jsx: "react" },
    }],
  },
};
