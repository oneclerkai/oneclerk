'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

const BUSINESS_TYPES = [
  { value: 'clinic',       label: '🏥  Clinic / Medical' },
  { value: 'dental',       label: '🦷  Dental Practice' },
  { value: 'salon',        label: '💇  Hair / Beauty Salon' },
  { value: 'restaurant',   label: '🍽️  Restaurant' },
  { value: 'hotel',        label: '🏨  Hotel / Hospitality' },
  { value: 'gym',          label: '💪  Gym / Fitness' },
  { value: 'legal',        label: '⚖️  Law Firm' },
  { value: 'real_estate',  label: '🏠  Real Estate' },
  { value: 'startup',      label: '🚀  Startup / Tech' },
  { value: 'other',        label: '✨  Other' },
];

export default function SignupPage() {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    business_name: '',
    business_type: 'other',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup(formData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="auth-root">
      <div className="auth-grain" aria-hidden="true" />
      <div className="auth-blob auth-blob-a" aria-hidden="true" />
      <div className="auth-blob auth-blob-b" aria-hidden="true" />
      <div className="auth-blob auth-blob-c" aria-hidden="true" />
      <div className="auth-blob auth-blob-d" aria-hidden="true" />

      <div className="auth-card" style={{ maxWidth: 440 }}>
        <Link href="/" className="auth-logo">
          <span className="auth-logo-dot" />
          OneClerk
        </Link>

        <div className="auth-badge">
          <span className="auth-badge-dot" />
          14-day free trial · No credit card
        </div>

        <h1 className="auth-heading">Create your account</h1>
        <p className="auth-sub">Your AI receptionist will be ready in 2 minutes</p>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="auth-label">Full name</label>
              <input
                type="text"
                required
                className="auth-field"
                placeholder="Alex Johnson"
                value={formData.full_name}
                onChange={set('full_name')}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="auth-label">Business name</label>
              <input
                type="text"
                required
                className="auth-field"
                placeholder="City Dental"
                value={formData.business_name}
                onChange={set('business_name')}
              />
            </div>
          </div>

          <div>
            <label className="auth-label">Email</label>
            <input
              type="email"
              required
              className="auth-field"
              placeholder="you@company.com"
              value={formData.email}
              onChange={set('email')}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="auth-label">Password</label>
            <input
              type="password"
              required
              className="auth-field"
              placeholder="Min. 8 characters"
              value={formData.password}
              onChange={set('password')}
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <div>
            <label className="auth-label">Business type</label>
            <select
              className="auth-field"
              value={formData.business_type}
              onChange={set('business_type')}
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="auth-btn"
            disabled={loading}
            style={{ marginTop: 6 }}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Creating account…
              </>
            ) : (
              <>
                Get started free
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </>
            )}
          </button>
        </form>

        <p className="auth-footer" style={{ marginTop: 16 }}>
          Already have an account?{' '}
          <Link href="/login" className="auth-link">Sign in →</Link>
        </p>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 14 }}>
          By creating an account you agree to our Terms & Privacy Policy.
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
