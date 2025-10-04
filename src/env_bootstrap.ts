// Centralized environment bootstrap so any script/test can import once.
// Usage: import './env_bootstrap.js'; near the top of entrypoints.
import 'dotenv/config';

// Optionally validate required vars here (only warn for now)
if (!process.env.GEMINI_API_KEY) {
  console.warn('[env] GEMINI_API_KEY not set – LLM features will use offline fallbacks.');
}
