import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api/client';

export default function BoardsPage() {
  const [boards, setBoards] = useState(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/boards').then((r) => setBoards(r.data.boards)).catch((e) => setError(errorMessage(e)));
  }, []);

  async function createBoard(e) {
    e.preventDefault();
    try {
      const { data } = await api.post('/boards', { title });
      navigate(`/boards/${data.board._id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="page">
      <h1>Your boards</h1>
      <form className="row" onSubmit={createBoard}>
        <input placeholder="New board title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <button className="btn">Create board</button>
      </form>
      {error && <p className="error">{error}</p>}
      {!boards ? (
        <p className="muted">Loading…</p>
      ) : boards.length === 0 ? (
        <p className="muted">No boards yet. Create one above.</p>
      ) : (
        <div className="grid">
          {boards.map((b) => (
            <Link key={b._id} to={`/boards/${b._id}`} className="card board-tile">
              <h3>{b.title}</h3>
              {b.description && <p className="muted">{b.description}</p>}
              <p className="muted small">
                {b.memberCount} member{b.memberCount > 1 ? 's' : ''} · you are <b>{b.myRole}</b>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
