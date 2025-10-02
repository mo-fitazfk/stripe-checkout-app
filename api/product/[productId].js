const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { productId } = req.query;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Fetch product from Stripe
    const product = await stripe.products.retrieve(productId);
    
    // Fetch the default price for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 1
    });

    const price = prices.data[0];

    // Format the response
    const productData = {
      id: product.id,
      name: product.name,
      description: product.description,
      image: product.images && product.images.length > 0 ? product.images[0] : null,
      price: price ? (price.unit_amount / 100) : 0, // Convert from cents
      currency: price ? price.currency : 'usd',
      metadata: product.metadata
    };

    res.json(productData);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product details' });
  }
};
