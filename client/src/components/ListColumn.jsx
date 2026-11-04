import { useRef, useState } from 'react';
import api, { errorMessage } from '../api/client';

// Native HTML5 drag & drop: no library needed for a simple board.
export default function ListColumn({ list, cards, canEdit, baseUrl, onChanged, onMoveCard, onOpenCard }) {
  const [title, setTitle] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const containerRef = useRef(null);

  // Work out the drop index from the mouse position: the first card whose
  // vertical middle is below the cursor is the one we drop in front of.
  function dropIndex(clientY, draggedId) {
    const els = [...containerRef.current.querySelectorAll('[data-card-id]')].filter(
      (el) => el.dataset.cardId !== draggedId
    );
    const i = els.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    return i === -1 ? els.length : i;
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const cardId = e.dataTransfer.getData('text/card-id');
    if (cardId) onMoveCard(cardId, list._id, dropIndex(e.clientY, cardId));
  }

  async function addCard(e) {
    e.preventDefault();
    try {
      await api.post(`${baseUrl}/cards`, { listId: list._id, title });
      setTitle('');
      onChanged();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  async function renameList() {
    const next = prompt('List title', list.title);
    if (!next || next === list.title) return;
    await api.patch(`${baseUrl}/lists/${list._id}`, { title: next });
    onChanged();
  }

  async function deleteList() {
    if (!confirm(`Delete "${list.title}" and all its cards?`)) return;
    await api.delete(`${baseUrl}/lists/${list._id}`);
    onChanged();
  }

  const now = Date.now();

  return (
    <section
      className={`list ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="list-header">
        <h3>{list.title} <span className="muted small">{cards.length}</span></h3>
        {canEdit && (
          <div className="row">
            <button className="icon" title="Rename" onClick={renameList}>✎</button>
            <button className="icon" title="Delete" onClick={deleteList}>×</button>
          </div>
        )}
      </div>

      <div className="cards" ref={containerRef}>
        {cards.map((card) => {
          const overdue = card.dueDate && !card.completed && new Date(card.dueDate).getTime() < now;
          return (
            <article
              key={card._id}
              data-card-id={card._id}
              className={`card-item ${card.completed ? 'done' : ''}`}
              draggable={canEdit}
              onDragStart={(e) => e.dataTransfer.setData('text/card-id', card._id)}
              onClick={() => onOpenCard(card._id)}
            >
              {card.labels?.length > 0 && (
                <div className="labels">{card.labels.map((l) => <span key={l} className="label">{l}</span>)}</div>
              )}
              <div className="card-title">{card.title}</div>
              <div className="card-meta">
                {card.dueDate && (
                  <span className={overdue ? 'overdue' : 'muted'}>
                    📅 {new Date(card.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                <span className="avatars">
                  {card.assignees?.map((a) => (
                    <span key={a._id} className="avatar" title={a.name}>{a.name?.[0]}</span>
                  ))}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {canEdit && (
        <form onSubmit={addCard}>
          <input placeholder="+ Add a card" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </form>
      )}
    </section>
  );
}
