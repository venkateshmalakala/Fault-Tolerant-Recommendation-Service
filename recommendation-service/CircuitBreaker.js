class CircuitBreaker {
    constructor(name, failureThreshold = 5, timeout = 2000, resetTimeout = 30000, halfOpenMaxAttempts = 3, metricsWindowSize = 10, failureRateThreshold = 0.5) {
        this.name = name;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN

        // Configurations
        this.failureThreshold = failureThreshold;
        this.timeout = timeout;
        this.resetTimeout = resetTimeout;
        this.halfOpenMaxAttempts = halfOpenMaxAttempts;

        // Config for failure rate
        this.metricsWindowSize = metricsWindowSize;
        this.failureRateThreshold = failureRateThreshold;

        // State Tracking
        this.failureCount = 0; // tracking consecutive failures (timeouts)
        this.nextAttempt = 0;
        this.halfOpenAttempts = 0;

        // Metrics tracking for sliding window (boolean: true if success, false if failure)
        this.requestWindow = [];

        // Global metrics tracking for the endpoint output
        this.totalSuccessfulCalls = 0;
        this.totalFailedCalls = 0;
    }

    // Record a result in the sliding window
    _recordResult(success) {
        if (success) {
            this.totalSuccessfulCalls++;
        } else {
            this.totalFailedCalls++;
        }

        this.requestWindow.push(success);
        if (this.requestWindow.length > this.metricsWindowSize) {
            this.requestWindow.shift();
        }
    }

    _getFailureRate() {
        if (this.requestWindow.length === 0) return 0;
        const failures = this.requestWindow.filter(res => res === false).length;
        return failures / this.requestWindow.length;
    }

    isOpen() {
        if (this.state === 'OPEN') {
            if (Date.now() >= this.nextAttempt) {
                // Time to try again, transition to HALF_OPEN
                this.state = 'HALF_OPEN';
                this.halfOpenAttempts = 0;
                console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN state.`);
                return false;
            }
            return true; // Still open
        }

        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
                // Limit number of trial requests
                return true; // Max attempts taken, pretend we are open for this request
            }
        }

        return false; // CLOSED or allowed HALF_OPEN attempt
    }

    recordSuccess() {
        this._recordResult(true);
        this.failureCount = 0;

        if (this.state === 'HALF_OPEN') {
            this.halfOpenAttempts++;
            if (this.halfOpenAttempts === this.halfOpenMaxAttempts) {
                // All half-open attempts succeeded!
                console.log(`[CircuitBreaker:${this.name}] Transitioning from HALF_OPEN to CLOSED state.`);
                this.state = 'CLOSED';
                this.requestWindow = []; // Reset metrics window on close
            }
        }
    }

    recordFailure() {
        this._recordResult(false);
        this.failureCount++;

        const failureRate = this._getFailureRate();

        if (this.state === 'HALF_OPEN') {
            console.log(`[CircuitBreaker:${this.name}] Failure during HALF_OPEN. Transitioning back to OPEN.`);
            this.openCircuit();
        } else if (this.state === 'CLOSED') {
            if (this.failureCount >= this.failureThreshold) {
                console.log(`[CircuitBreaker:${this.name}] Failure threshold (${this.failureThreshold} timeouts) reached. Opening circuit.`);
                this.openCircuit();
            } else if (this.requestWindow.length === this.metricsWindowSize && failureRate >= this.failureRateThreshold) {
                console.log(`[CircuitBreaker:${this.name}] Failure rate threshold (${failureRate * 100}%) reached. Opening circuit.`);
                this.openCircuit();
            }
        }
    }

    openCircuit() {
        this.state = 'OPEN';
        this.nextAttempt = Date.now() + this.resetTimeout;
    }

    async execute(action) {
        if (this.isOpen()) {
            throw new Error(`Circuit is ${this.state}`); // Fail fast
        }

        if (this.state === 'HALF_OPEN') {
            this.halfOpenAttempts++;
        }

        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                // Technically this shouldn't record failure yet since it might still resolve, 
                // but for simulation, we'll mark timeout as fail.
                this.recordFailure();
                reject(new Error('Circuit breaker timeout'));
            }, this.timeout);

            try {
                const result = await action();
                clearTimeout(timer);
                this.recordSuccess();
                resolve(result);
            } catch (err) {
                clearTimeout(timer);
                this.recordFailure();
                reject(err);
            }
        });
    }

    getMetrics() {
        return {
            state: this.state,
            failureRate: `${(this._getFailureRate() * 100).toFixed(1)}%`,
            successfulCalls: this.totalSuccessfulCalls,
            failedCalls: this.totalFailedCalls
        };
    }
}

module.exports = CircuitBreaker;
