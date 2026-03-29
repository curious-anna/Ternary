const express = require('express');
const path = require('path');
const { toPseudocode } = require('./converter');
const app = express();
const port = process.env.PORT || 3010;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/convert', (req, res) => {
  const { formula } = req.body;
  if (!formula || typeof formula !== 'string') {
    return res.status(400).json({ error: 'Missing formula string in request body.' });
  }
  try {
    const { pseudocode, explanation } = toPseudocode(formula);
    console.log('Converting:', formula, 'to', pseudocode);
    res.json({ pseudocode, explanation });
  } catch (e) {
    // Use 422 for conversion/logic errors (the input was understood but cannot
    // be safely converted), 500 only for unexpected crashes.
    const isLogicError = !(e instanceof TypeError) && !(e instanceof ReferenceError);
    res.status(isLogicError ? 422 : 500).json({ error: 'Conversion failed: ' + e.message });
  }
});

app.post('/api/validate', (req, res) => {
  const { pseudocode } = req.body;
  if (!pseudocode || typeof pseudocode !== 'string') {
    return res.status(400).json({ error: 'Missing pseudocode string in request body.' });
  }
  const forbidden = /\|\|/.test(pseudocode) || /&&/.test(pseudocode) ||
    /\bAND\b/.test(pseudocode) || /\bOR\b/.test(pseudocode);
  res.json({ valid: !forbidden, forbidden });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

module.exports = { toPseudocode };
