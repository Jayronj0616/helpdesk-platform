// Environment-driven settings. See .env.example. Read once at import time.

/** Demo mode (default on): seeds demo users and data, shows them on the login page, enables "Reset demo data". */
export const DEMO_MODE = process.env.DEMO_MODE !== "0";

/** Password given to the seeded demo accounts. Only used when DEMO_MODE is on. */
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "helpdesk-demo";

/** With DEMO_MODE=0, the first run creates this manager account instead of the demo users. */
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
