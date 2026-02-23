module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = process.env.STRIPE_PUBLISHABLE_KEY || process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '';
  const gaMeasurementId = process.env.GA_MEASUREMENT_ID || process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID || '';
  res.status(200).json({ publishableKey: key, gaMeasurementId: gaMeasurementId || undefined });
};
