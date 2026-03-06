const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/trending', (req, res) => {
    console.log(`[trending-service] Returning trending content`);
    res.json([
        { movieId: 99, title: "Trending Movie 1" }
    ]);
});

const PORT = process.env.PORT || 8083;
app.listen(PORT, () => {
    console.log(`trending-service listening on port ${PORT}`);
});
