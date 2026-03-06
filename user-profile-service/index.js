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
    console.log(`[user-profile-service] Behavior changed to: ${behavior}`);
    currentBehavior = behavior;
    res.status(200).send(`Behavior set to ${behavior}`);
  } else {
    res.status(400).send('Invalid behavior');
  }
});

app.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  
  const respond = () => {
    if (currentBehavior === 'fail') {
      console.log(`[user-profile-service] Failing request for user ${userId}`);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    console.log(`[user-profile-service] Returning profile for user ${userId}`);
    res.json({
      userId: userId,
      preferences: ["Action", "Sci-Fi"]
    });
  };

  if (currentBehavior === 'slow') {
    console.log(`[user-profile-service] Delaying response for user ${userId}`);
    setTimeout(respond, 3000);
  } else {
    respond();
  }
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`user-profile-service listening on port ${PORT}`);
});
