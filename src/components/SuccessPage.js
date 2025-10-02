import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const SuccessPage = () => {
  const location = useLocation();
  const { paymentIntentId, amount, customer } = location.state || {};

  return (
    <div className="success-page">
      <div className="success-icon">✅</div>
      <h2 className="success-title">Payment Successful!</h2>
      <p className="success-message">
        Thank you for your purchase! Your payment has been processed successfully.
      </p>
      
      {paymentIntentId && (
        <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f8f9fa', borderRadius: '6px' }}>
          <p><strong>Payment ID:</strong> {paymentIntentId}</p>
          {amount && <p><strong>Amount:</strong> ${amount.toFixed(2)}</p>}
          {customer && (
            <p><strong>Customer:</strong> {customer.first_name} {customer.last_name} ({customer.email})</p>
          )}
        </div>
      )}
      
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Your order has been automatically created in Shopify and you will receive a confirmation email shortly.
      </p>
      
      <Link to="/" className="back-button">
        Make Another Purchase
      </Link>
    </div>
  );
};

export default SuccessPage;
