// Simple test file to check if Vercel can deploy
console.log('Test deployment file loaded');
module.exports = (req, res) => {
  res.json({ message: 'Test deployment working!', timestamp: new Date().toISOString() });
};
