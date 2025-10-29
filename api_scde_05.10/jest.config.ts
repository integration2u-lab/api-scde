import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  clearMocks: true,
  coverageProvider: "v8",
};

export default config;
