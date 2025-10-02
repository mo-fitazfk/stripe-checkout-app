import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutPage from './components/CheckoutPage';
import SuccessPage from './components/SuccessPage';
import './App.css';

// Initialize Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Stripe Checkout with Shopify</h1>
      </header>
      <main>
        <Elements stripe={stripePromise}>
          <Routes>
            <Route path="/" element={<CheckoutPage />} />
            <Route path="/success" element={<SuccessPage />} />
          </Routes>
        </Elements>
      </main>
    </div>
  );
}

export default App;
