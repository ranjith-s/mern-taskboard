import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors([]);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form);
    } catch (err) {
      setError(errorMessage(err));
      setFieldErrors(err.response?.data?.details || []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card auth" onSubmit={onSubmit}>
      <h1>{isLogin ? 'Log in' : 'Create account'}</h1>
      {!isLogin && <input placeholder="Name" value={form.name} onChange={set('name')} required />}
      <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
      <input type="password" placeholder="Password" value={form.password} onChange={set('password')} required />
      {error && (
        <div className="error">
          {error}
          {fieldErrors.length > 0 && (
            <ul>{fieldErrors.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
          )}
        </div>
      )}
      <button className="btn" disabled={busy}>{busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}</button>
      <p className="muted">
        {isLogin ? <>No account? <Link to="/register">Sign up</Link></> : <>Have an account? <Link to="/login">Log in</Link></>}
      </p>
    </form>
  );
}
