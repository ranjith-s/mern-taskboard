import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';

const toForm = (card) => ({
  title: card.title,
  description: card.description || '',
  labels: (card.labels || []).join(', '),
  dueDate: card.dueDate ? card.dueDate.slice(0, 10) : '',
  completed: card.completed,
  assignees: (card.assignees || []).map((a) => (typeof a === 'string' ? a : a._id)),
});

export default function CardModal({ card, members, canEdit, baseUrl, onClose, onChanged }) {
  // `version` is what we last read from the server -> sent back on save.
  const [version, setVersion] = useState(card.version);
  const [form, setForm] = useState(() => toForm(card));
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const toggleAssignee = (id) =>
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(id) ? f.assignees.filter((x) => x !== id) : [...f.assignees, id],
    }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch(`${baseUrl}/cards/${card._id}`, {
        version,
        title: form.title,
        description: form.description,
        labels: form.labels.split(',').map((l) => l.trim()).filter(Boolean),
        dueDate: form.dueDate || null,
        completed: form.completed,
        assignees: form.assignees,
      });
      setVersion(data.card.version);
      setConflict(false);
      onChanged();
      onClose();
    } catch (err) {
      if (err.response?.status === 409) {
        // Someone else saved first: load THEIR version so the user can
        // review it and re-apply their change, instead of overwriting it.
        const latest = err.response.data.details.current;
        setVersion(latest.version);
        setForm(toForm(latest));
        setConflict(true);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this card?')) return;
    await api.delete(`${baseUrl}/cards/${card._id}`);
    onChanged();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="row spread">
          <h2>Card</h2>
          <button type="button" className="icon" onClick={onClose}>×</button>
        </div>

        {conflict && (
          <p className="warning">
            Someone else updated this card while you were editing. The form now shows their latest version. Re-apply
            your changes and save again.
          </p>
        )}
        {error && <p className="error">{error}</p>}

        <fieldset disabled={!canEdit}>
          <label>Title<input value={form.title} onChange={set('title')} required /></label>
          <label>Description<textarea rows={4} value={form.description} onChange={set('description')} /></label>
          <label>Labels (comma separated)<input value={form.labels} onChange={set('labels')} /></label>
          <label>Due date<input type="date" value={form.dueDate} onChange={set('dueDate')} /></label>
          <label className="row"><input type="checkbox" checked={form.completed} onChange={set('completed')} /> Completed</label>

          <div>
            <div className="label-title">Assignees</div>
            <div className="chips">
              {members.map(({ user: m }) => (
                <button
                  type="button"
                  key={m._id}
                  className={`chip ${form.assignees.includes(m._id) ? 'active' : ''}`}
                  onClick={() => toggleAssignee(m._id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {canEdit && (
          <div className="row spread">
            <button type="button" className="btn danger" onClick={remove}>Delete</button>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </form>
    </div>
  );
}
