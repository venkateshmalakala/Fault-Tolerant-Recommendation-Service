const express = require('express');
const app = express();

app.use(express.json());

let currentBehavior = 'normal';

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Simulate failure endpoint
app.post('/simulate/:behavior', (req, res) => {
    const { behavior } = req.params;
    if (['normal', 'slow', 'fail'].includes(behavior)) {
        console.log(`[content-service] Behavior changed to: ${behavior}`);
        currentBehavior = behavior;
        res.status(200).send(`Behavior set to ${behavior}`);
    } else {
        res.status(400).send('Invalid behavior');
    }
});

app.get('/content', (req, res) => {
    const respond = () => {
        if (currentBehavior === 'fail') {
            console.log(`[content-service] Failing request for content`);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        console.log(`[content-service] Returning content`);
        res.json([
            { movieId: 101, title: "Inception", genre: "Sci-Fi" },
            { movieId: 102, title: "The Dark Knight", genre: "Action" }
        ]);
    };

    if (currentBehavior === 'slow') {
        console.log(`[content-service] Delaying response for content`);
        setTimeout(respond, 3000);
    } else {
        respond();
    }
});

const PORT = process.env.PORT || 8082;
app.listen(PORT, () => {
    console.log(`content-service listening on port ${PORT}`);
});
