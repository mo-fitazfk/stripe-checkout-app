import React, { useState, useEffect } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#9e2146',
    },
  },
};

const CheckoutPage = () => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [product, setProduct] = useState(null);
  const [productLoading, setProductLoading] = useState(true);
  const [customer, setCustomer] = useState({
    email: '',
    first_name: '',
    last_name: ''
  });
  const [promoCode, setPromoCode] = useState('');

  // Fetch product details from Stripe
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        console.log('Fetching product from API...');
        const response = await axios.get('/api/product/prod_T9zGFxGJf9mTiI');
        console.log('Product API response:', response.data);
        setProduct(response.data);
      } catch (err) {
        console.error('Error fetching product:', err);
        console.log('Using fallback product data');
        // Fallback to default product if API fails
        setProduct({
          id: 'prod_T9zGFxGJf9mTiI',
          name: 'Personal Coaching',
          price: 99.99,
          image: 'https://cdn.shopify.com/s/files/1/2320/2099/files/7daytrial_63c5bf6d-db02-4ed1-a163-85e74e1e31b9.jpg?v=1753162501',
          description: 'Transform your life with personal coaching'
        });
      } finally {
        setProductLoading(false);
      }
    };

    fetchProduct();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomer(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements || !product) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create payment intent
      const response = await axios.post('/api/create-payment-intent', {
        amount: product.price,
        currency: 'usd',
        metadata: {
          customer: JSON.stringify(customer),
          product_name: product.name,
          product_id: product.id,
          quantity: '1',
          line_items: JSON.stringify([{
            title: product.name,
            price: product.price,
            quantity: 1
          }])
        }
      });

      const { clientSecret } = response.data;

      // Confirm payment
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: elements.getElement(CardElement),
            billing_details: {
              name: `${customer.first_name} ${customer.last_name}`,
              email: customer.email,
            },
          },
        }
      );

      if (stripeError) {
        setError(stripeError.message);
      } else if (paymentIntent.status === 'succeeded') {
        navigate('/success', { 
          state: { 
            paymentIntentId: paymentIntent.id,
            amount: product.price,
            customer: customer,
            product: product
          }
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred during payment');
    } finally {
      setLoading(false);
    }
  };

  if (productLoading) {
    return (
      <div className="checkout-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div className="loading"></div>
          <span>Loading product details...</span>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="checkout-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div>Failed to load product details. Please try again.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-container">
      <div className="product-section">
        <img 
          src={product.image} 
          alt={product.name}
          className="product-image"
        />
      </div>
      
      <div className="checkout-section">
        <div className="checkout-header">
          <h1 className="checkout-title">Create an account</h1>
        </div>

        <div className="promo-section">
          <label className="promo-label">Promo Code</label>
          <input
            type="text"
            className="promo-input"
            placeholder="Enter promo code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
          />
          <button type="button" className="promo-button">Apply</button>
        </div>

        <div className="social-login">
          <button type="button" className="social-button">
            Continue with Facebook
          </button>
        </div>

        <div className="divider">
          <span>or</span>
        </div>

        <form onSubmit={handleSubmit} className="form-section">
          <div className="form-group">
            <label className="form-label">Sign up with email</label>
            <input
              type="email"
              className="form-input"
              placeholder="Email address"
              name="email"
              value={customer.email}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <input
              type="text"
              className="form-input"
              placeholder="First name"
              name="first_name"
              value={customer.first_name}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <input
              type="text"
              className="form-input"
              placeholder="Last name"
              name="last_name"
              value={customer.last_name}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="card-section">
            <div className="card-info">
              Secure, fast checkout with Link<br/>
              While entering card information, you'll be automatically advanced to the next form field when the current field is complete.
            </div>
            <div className="card-element">
              <CardElement
                options={CARD_ELEMENT_OPTIONS}
              />
            </div>
            <div className="card-info">
              Supported cards include Visa, Mastercard and American Express.
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            className="checkout-button"
            disabled={!stripe || loading}
          >
            {loading && <span className="loading"></span>}
            {loading ? 'Processing...' : `Pay $${product.price.toFixed(2)}`}
          </button>

          <div className="terms">
            By providing your card information, you allow Transform by fitaz to charge your card for future payments in accordance with their terms.
          </div>
        </form>

        <div className="login-link">
          Already have an account? <a href="#login">Login</a>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
