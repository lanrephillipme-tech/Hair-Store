declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    ADMIN_USER_IDS?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  }
}
