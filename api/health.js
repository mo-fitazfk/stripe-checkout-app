module.exports = async (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Stripe Shopify Checkout API is running'
  });
};
