/**
 * Runtime configuration placeholder.
 * This file is replaced at runtime by entrypoint.sh in the Docker container.
 */
window.__APP_CONFIG__ = {
  API_BASE_URL: "http://localhost:8000",
  APP_ENV: "development",
  BUILD_TIME: new Date().toISOString(),
  VERSION: "0.1.0",
};
