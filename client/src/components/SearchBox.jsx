import { useEffect, useState } from 'react';
import api from '../api/client';

// Debounced server-side search: wait until the user stops typing for 300ms,
// so we send one request instead of one per keystroke.
export default function SearchBox({ boardId, members, onOpen }) {
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!q && !assignee) {
      setResult(null);
      return undefined;
    }
    const controller = new AbortController(); // cancel stale requests
    const t = setTimeout(() => {
      api
        .get(`/boards/${boardId}/cards`, { params: { q: q || undefined, assignee: assignee || undefined, limit: 10 }, signal: controller.signal })
        .then((r) => setResult(r.data))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, assignee, boardId]);

  return (
    <div className="search">
      <div className="row">
        <input placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Anyone</option>
          {members.map(({ user }) => <option key={user._id} value={user._id}>{user.name}</option>)}
        </select>
      </div>
      {result && (
        <div className="search-results card">
          <div className="muted small">{result.total} result{result.total === 1 ? '' : 's'}</div>
          {result.items.map((c) => (
            <button
              key={c._id}
              className="search-item"
              onClick={() => {
                onOpen(c._id);
                setQ('');
                setAssignee('');
              }}
            >
              {c.title} <span className="muted small">in {c.list?.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
