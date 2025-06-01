const express = require('express');
const path = require('path');
const app = express();

app.use(express.static('build'));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(3003, '0.0.0.0', () => {
  console.log('Frontend ready on :3003');
});
