/**
 * Rate Limiting Utility
 * 
 * Token bucket implementation for rate limiting API requests.
 * Supports configurable requests per minute with exponential backoff on 429 errors.
 */

interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  clientName: string;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}

class RateLimiter {
  private bucket: TokenBucket;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    const requestsPerMs = config.maxRequestsPerMinute / (60 * 1000);
    this.bucket = {
      tokens: config.maxRequestsPerMinute,
      lastRefill: Date.now(),
      maxTokens: config.maxRequestsPerMinute,
      refillRate: requestsPerMs,
    };
  }

  /**
   * Wait for a token to become available
   */
  async waitForToken(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.bucket.lastRefill;
    
    // Refill tokens based on elapsed time
    const tokensToAdd = elapsed * this.bucket.refillRate;
    this.bucket.tokens = Math.min(
      this.bucket.maxTokens,
      this.bucket.tokens + tokensToAdd
    );
    this.bucket.lastRefill = now;

    // If no tokens available, wait
    if (this.bucket.tokens < 1) {
      const waitTime = (1 - this.bucket.tokens) / this.bucket.refillRate;
      await new Promise(resolve => setTimeout(resolve, Math.ceil(waitTime)));
      // Refill again after waiting
      return this.waitForToken();
    }

    // Consume a token
    this.bucket.tokens -= 1;
  }

  /**
   * Handle 429 (Too Many Requests) errors with exponential backoff
   */
  async handle429Error(
    retryCount: number = 0,
    maxRetries: number = 3
  ): Promise<void> {
    if (retryCount >= maxRetries) {
      throw new Error(
        `Rate limit exceeded for ${this.config.clientName}. Max retries reached.`
      );
    }

    // Exponential backoff with jitter: baseDelay * 2^retryCount + random(0-1000ms)
    const baseDelay = 1000; // 1 second base
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    const waitTime = Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds

    console.log(
      `[${this.config.clientName}] Rate limit hit (429). ` +
      `Waiting ${Math.round(waitTime)}ms before retry ${retryCount + 1}/${maxRetries}`
    );

    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  /**
   * Make a rate-limited request with automatic 429 handling
   */
  async makeRequest<T>(
    requestFn: () => Promise<Response>,
    retryCount: number = 0,
    maxRetries: number = 3
  ): Promise<T> {
    // Wait for token
    await this.waitForToken();

    try {
      const response = await requestFn();

      // Handle 429 with retry
      if (response.status === 429) {
        await this.handle429Error(retryCount, maxRetries);
        return this.makeRequest(requestFn, retryCount + 1, maxRetries);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `API error [${response.status}]: ${response.statusText}. ${errorText}`
        );
      }

      return response.json() as Promise<T>;
    } catch (error: any) {
      // If it's a 429 error from the response, handle it
      if (error.message?.includes('429') || error.status === 429) {
        await this.handle429Error(retryCount, maxRetries);
        return this.makeRequest(requestFn, retryCount + 1, maxRetries);
      }
      throw error;
    }
  }
}

/**
 * Create a rate limiter instance
 */
export function createRateLimiter(
  maxRequestsPerMinute: number,
  clientName: string
): RateLimiter {
  return new RateLimiter({
    maxRequestsPerMinute,
    clientName,
  });
}

/**
 * Get rate limit from environment variable with fallback
 */
export function getRateLimitFromEnv(
  envVarName: string,
  defaultValue: number
): number {
  const envValue = process.env[envVarName];
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultValue;
}

