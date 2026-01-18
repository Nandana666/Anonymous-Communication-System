const express = require('express');
const app = express();

app.get('/', (req, res) => {
    console.log('req.ip:', req.ip);               // Express default IP
    console.log('X-Forwarded-For:', req.headers['x-forwarded-for']); // any forwarded IP
    res.send('Check console for IP info!');
});

app.listen(5001, () => console.log('Server running on port 5001'));

