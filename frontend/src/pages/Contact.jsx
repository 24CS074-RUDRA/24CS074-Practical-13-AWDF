import React, { useState } from 'react';

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="contact-container">
      <div className="page-header">
        <h1>Contact & Feedback</h1>
        <p>Have a question or an idea? Send us a note.</p>
      </div>

      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h2 style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>Thank You!</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Your message has been sent successfully. We will get back to you soon.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', subject: '', message: '' }); }}
              style={{ marginTop: '1.5rem' }}
            >
              Send Another Message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Your Name</label>
              <input
                type="text"
                name="name"
                className="input-field"
                placeholder="Enter your name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                className="input-field"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                name="subject"
                className="input-field"
                placeholder="Subject of inquiry"
                value={formData.subject}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea
                name="message"
                className="input-field"
                rows="4"
                placeholder="Type your message here..."
                value={formData.message}
                onChange={handleChange}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Submit Inquiry
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// React.lazy() requires a default export from the dynamically imported module
export default Contact;
