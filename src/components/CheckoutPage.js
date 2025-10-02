import React, { useState } from 'react';
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
  const [customer, setCustomer] = useState({
    email: '',
    first_name: '',
    last_name: ''
  });
  const [quantity, setQuantity] = useState(1);
  
  const product = {
    name: 'Premium Product',
    price: 99.99,
    image: '🛍️'
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomer(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleQuantityChange = (change) => {
    setQuantity(prev => Math.max(1, prev + change));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create payment intent
      const response = await axios.post('/api/create-payment-intent', {
        amount: product.price * quantity,
        currency: 'usd',
        metadata: {
          customer: JSON.stringify(customer),
          product_name: product.name,
          quantity: quantity.toString(),
          line_items: JSON.stringify([{
            title: product.name,
            price: product.price,
            quantity: quantity
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
            amount: product.price * quantity,
            customer: customer
          }
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred during payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="checkout-container">
      <h2>Complete Your Purchase</h2>
      
      <div className="product-card">
        <div className="product-image">{product.image}</div>
        <div className="product-details">
          <h3 className="product-name">{product.name}</h3>
          <p className="product-price">${product.price.toFixed(2)}</p>
          <div className="quantity-controls">
            <button 
              className="quantity-btn" 
              onClick={() => handleQuantityChange(-1)}
              disabled={quantity <= 1}
            >
              -
            </button>
            <span className="quantity-display">{quantity}</span>
            <button 
              className="quantity-btn" 
              onClick={() => handleQuantityChange(1)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="customer-form">
        <h3>Customer Information</h3>
        
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            name="email"
            value={customer.email}
            onChange={handleInputChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="first_name">First Name</label>
          <input
            type="text"
            id="first_name"
            name="first_name"
            value={customer.first_name}
            onChange={handleInputChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="last_name">Last Name</label>
          <input
            type="text"
            id="last_name"
            name="last_name"
            value={customer.last_name}
            onChange={handleInputChange}
            required
          />
        </div>

        <h3>Payment Information</h3>
        <div className="form-group">
          <label htmlFor="card-element">Card Details</label>
          <div style={{ padding: '12px', border: '1px solid #ddd', borderRadius: '6px' }}>
            <CardElement
              id="card-element"
              options={CARD_ELEMENT_OPTIONS}
            />
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="total-section">
          <h3>Total: <span className="total-amount">${(product.price * quantity).toFixed(2)}</span></h3>
        </div>

        <button 
          type="submit" 
          className="checkout-button"
          disabled={!stripe || loading}
        >
          {loading && <span className="loading"></span>}
          {loading ? 'Processing...' : `Pay $${(product.price * quantity).toFixed(2)}`}
        </button>
      </form>
    </div>
  );
};

export default CheckoutPage;
