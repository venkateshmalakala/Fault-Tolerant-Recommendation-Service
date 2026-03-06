# Fault-Tolerant Recommendation Service

This project implements a distributed movie recommendation service using the **Circuit Breaker pattern** to ensure resilience and prevent cascading failures across Microservices.

It contains four essential services orchestrated using Docker Compose:
- **`recommendation-service`**: The main API gateway that aggregates data from upstream dependencies using safe Circuit Breakers.
- **`user-profile-service`**: A mock HTTP service supplying user generic preferences.
- **`content-service`**: A mock HTTP service generating movie catalog returns.
- **`trending-service`**: A highly reliable final fallback service returning generic trending content.

## Prerequisites
- **Docker** and **Docker Compose**

## Quick Start
1. Create your environment variables file (or use default configuration):
   ```bash
   cp .env.example .env
   ```

2. Start the application services using Docker Compose:
   ```bash
   docker-compose up -d --build
   ```

3. Ensure that all the services have become healthy (it takes 10 to 20 seconds for the Docker health checks to pass):
   ```bash
   docker-compose ps
   ```

## Architecture Details

The primary `recommendation-service` exposes endpoints handling standard queries and telemetry metrics. All dependency calls inside `recommendation-service` to user profiles and content data are safely wrapped using a **Custom Circuit Breaker logic implementation (`CircuitBreaker.js`)**.

### Expected Circuit Breaker Behavior Configuration:
- **Request Timeout:** 2000 milliseconds (2 Seconds)
- **Consecutive Timeout Threshold:** 5 consecutive failures
- **Failure Rate Threshold:** 50% failure rate dynamically tracked across a sliding window of the last 10 requests.
- **Open State Duration:** 30 seconds wait before attempting recovery via `HALF-OPEN` state.
- **Half-Open state Trial Requests:** Allows precisely 3 trial requests. If all 3 requests succeed, the Circuit CLOSES. Otherwise, it immediately reverts to the `OPEN` state.

## API Usage

### 1. Get Recommendations (Main Endpoint)
Retrieves the movie recommendations based on a specific `userId`.
```bash
curl -X GET http://localhost:8080/recommendations/123
```
**Example Response (Happy Path):**
```json
{
    "userPreferences": {
        "userId": "123",
        "preferences": ["Action", "Sci-Fi"]
    },
    "recommendations": [
        {
            "movieId": 101,
            "title": "Inception",
            "genre": "Sci-Fi"
        }
    ]
}
```

If dependencies begin failing, this endpoint dynamically triggers graceful fallbacks:
- If `user-profile-service` goes down but `content-service` stays up, you will get mock content based on default local preferences. The response will include `"fallback_triggered_for": "user-profile-service"`.
- If both dependency circuits `OPEN`, the endpoint instantly reverts to grabbing final fail-safe recommendations from the `trending-service`.

**Example Response (Critical Degradation / Both Services Failed):**
```json
{
    "message": "Our recommendation service is temporarily degraded. Here are some trending movies.",
    "trending": [
        {
            "movieId": 99,
            "title": "Trending Movie 1"
        }
    ],
    "fallback_triggered_for": "user-profile-service, content-service"
}
```

### 2. Simulate Dependencies Behavior
Endpoints exist to alter runtime behavioral dynamics of your mock dependencies (`user-profile` or `content`). This lets you safely trigger failures to visualize the Circuit Breaker transitions.

Valid simulated behaviors: `normal`, `slow` (induces artificial >3s delays triggering timeouts), and `fail` (induces instant 500 errors).
```bash
# Force user profile to be slow
curl -X POST http://localhost:8080/simulate/user-profile/slow

# Force content metadata failures
curl -X POST http://localhost:8080/simulate/content/fail

# Restore to normal
curl -X POST http://localhost:8080/simulate/user-profile/normal
```

### 3. Track Circuit Breaker Metrics
Retrieve current configurations, state transitions (`CLOSED`, `OPEN`, `HALF_OPEN`), and runtime heuristics regarding success/failure calls inside a moving window.
```bash
curl -X GET http://localhost:8080/metrics/circuit-breakers
```

## Running Verification Scenarios manually

Here is how you can practically invoke state changes:
1. Hit endpoints quickly using the simulation trigger commands defined above.
2. Example to open circuit due to Timeout (Consecutive timeout > 5):
   ```bash
   curl -X POST http://localhost:8080/simulate/user-profile/slow
   # Run the recommendations query 5 times. The 6th query will trigger Fast-Failing 
   # because the circuit transitions from CLOSED to OPEN.
   ```
3. Example testing graceful partial-failures:
   - When one circuit is open, observe the recommendation response object. It will include a `fallback_triggered_for` property naming the affected mock dependency!

## Project Structure
```text
.
├── recommendation-service/     # Core Orchestrator & CircuitBreaker Logic
├── user-profile-service/       # Mock Dependency
├── content-service/          # Mock Dependency
├── trending-service/           # Fallback Dependency
├── docker-compose.yml          # Network & Container orchestration definition
├── .env.example
├── .env
└── README.md
```
