const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
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

    console.log('Fetching product:', productId);
    console.log('Stripe key exists:', !!process.env.STRIPE_SECRET_KEY);

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('Stripe secret key not found');
      return res.status(500).json({ error: 'Stripe configuration missing' });
    }

    // Fetch product from Stripe
    const product = await stripe.products.retrieve(productId);
    console.log('Product fetched:', product.name);
    
    // Fetch the default price for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 1
    });

    const price = prices.data[0];
    console.log('Price fetched:', price);

    // Format the response
    const productData = {
      id: product.id,
      name: product.name,
      description: product.description,
      image: product.images && product.images.length > 0 ? product.images[0] : 'https://cdn.shopify.com/s/files/1/2320/2099/files/7daytrial_63c5bf6d-db02-4ed1-a163-85e74e1e31b9.jpg?v=1753162501',
      price: price ? (price.unit_amount / 100) : 99.99, // Convert from cents
      currency: price ? price.currency : 'usd',
      metadata: product.metadata
    };

    console.log('Returning product data:', productData);
    res.json(productData);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product details', details: error.message });
  }
}
