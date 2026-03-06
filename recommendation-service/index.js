const express = require('express');
const axios = require('axios');
const CircuitBreaker = require('./CircuitBreaker');

const app = express();
app.use(express.json());

const USER_PROFILE_URL = process.env.USER_PROFILE_URL || 'http://user-profile-service:8081';
const CONTENT_URL = process.env.CONTENT_URL || 'http://content-service:8082';
const TRENDING_URL = process.env.TRENDING_URL || 'http://trending-service:8083';

// Spec: 5 consecutive timeouts OR 50% failure rate over 10 requests. Timeout: 2s. Open duration: 30s.
const userProfileBreaker = new CircuitBreaker(
    'userProfileCircuitBreaker',
    5,    // failureThreshold for consecutive timeouts
    2000, // timeout (2s)
    30000,// resetTimeout (30s)
    3,    // halfOpenMaxAttempts
    10,   // metricsWindowSize
    0.5   // failureRateThreshold (50%)
);

const contentBreaker = new CircuitBreaker(
    'contentCircuitBreaker',
    5,
    2000,
    30000,
    3,
    10,
    0.5
);

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Endpoint to simulate dependency behavior
app.post('/simulate/:service_name/:behavior', async (req, res) => {
    const { service_name, behavior } = req.params;

    try {
        if (service_name === 'user-profile') {
            await axios.post(`${USER_PROFILE_URL}/simulate/${behavior}`);
            res.status(200).send(`Behavior of user-profile set to ${behavior}`);
        } else if (service_name === 'content') {
            await axios.post(`${CONTENT_URL}/simulate/${behavior}`);
            res.status(200).send(`Behavior of content set to ${behavior}`);
        } else {
            res.status(400).send('Invalid service name');
        }
    } catch (error) {
        res.status(500).send(`Failed to update behavior: ${error.message}`);
    }
});

app.get('/metrics/circuit-breakers', (req, res) => {
    res.json({
        userProfileCircuitBreaker: userProfileBreaker.getMetrics(),
        contentCircuitBreaker: contentBreaker.getMetrics()
    });
});

app.get('/recommendations/:userId', async (req, res) => {
    const { userId } = req.params;

    let userProfile = null;
    let fallbackForUser = false;

    let content = null;
    let fallbackForContent = false;

    // Try fetching User Profile
    try {
        userProfile = await userProfileBreaker.execute(async () => {
            const response = await axios.get(`${USER_PROFILE_URL}/user/${userId}`);
            return response.data;
        });
    } catch (error) {
        console.error(`user-profile-service failed or circuit open: ${error.message}`);
        fallbackForUser = true;
        userProfile = {
            userId: userId,
            preferences: ["default-genre-1", "default-genre-2"]
        };
    }

    // Try fetching Content
    try {
        content = await contentBreaker.execute(async () => {
            const response = await axios.get(`${CONTENT_URL}/content`);
            return response.data;
        });
    } catch (error) {
        console.error(`content-service failed or circuit open: ${error.message}`);
        fallbackForContent = true;
    }

    // Fallback Logic (Req 8 & 9)
    const fallbackServices = [];
    if (fallbackForUser) fallbackServices.push('user-profile-service');
    if (fallbackForContent) fallbackServices.push('content-service');

    // Both failed, use Final fallback (Req 9)
    if (fallbackForUser && fallbackForContent) {
        try {
            const trendingResponse = await axios.get(`${TRENDING_URL}/trending`);
            return res.json({
                message: "Our recommendation service is temporarily degraded. Here are some trending movies.",
                trending: trendingResponse.data,
                fallback_triggered_for: "user-profile-service, content-service"
            });
        } catch (err) {
            return res.status(500).json({ error: 'System critically degraded. All fallbacks failed.' });
        }
    }

    // Custom logic for Req 8: 
    const finalContent = content || []; // Default recommendations if content fails

    const responseBody = {
        userPreferences: userProfile,
        recommendations: finalContent
    };

    if (fallbackServices.length > 0) {
        responseBody.fallback_triggered_for = fallbackServices.join(', ');
    }

    res.json(responseBody);
});

const PORT = process.env.API_PORT || 8080;
app.listen(PORT, () => {
    console.log(`recommendation-service listening on port ${PORT}`);
});
