import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  circuitBreaker,
  handleWhen,
  retry,
  wrap,
} from 'cockatiel';
import { env } from './env.js';
import { shouldRetryMetaError } from './metaErrorClassifier.js';

/**
 * Creates a single, resilient policy for Meta SDK calls that combines a circuit breaker
 * and a retry strategy with exponential backoff.
 *
 * This follows the best practice of wrapping a retry policy with a circuit breaker.
 * This means a full set of retries that ultimately fails will only count as a single
 * failure towards the circuit breaker's threshold.
 *
 * @returns A composite Cockatiel policy object.
 */
export function createMetaResiliencePolicy() {
  const exponentialBackoff = new ExponentialBackoff({
    initialDelay: env.RETRY_BASE_DELAY,
    maxDelay: env.RETRY_MAX_DELAY,
  });

  const retryPolicy = retry(handleWhen(shouldRetryMetaError), {
    maxAttempts: env.RETRY_MAX_ATTEMPTS,
    backoff: exponentialBackoff,
  });

  const circuitBreakerPolicy = circuitBreaker(handleWhen(shouldRetryMetaError), {
    halfOpenAfter: env.CIRCUIT_BREAKER_RESET_TIMEOUT,
    breaker: new ConsecutiveBreaker(env.CIRCUIT_BREAKER_FAILURE_THRESHOLD),
  });

  // Combine the policies using the wrap pattern.
  // The circuit breaker is the outer policy, protecting our system from
  // repeated failures, while the retry policy handles transient issues internally.
  const resiliencePolicy = wrap(circuitBreakerPolicy, retryPolicy);

  return resiliencePolicy;
}
