import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const CATEGORIES = ['Family', 'Celebrations', 'Daily Life', 'Pets', 'Travel', 'Other'];

export default function MemoriesAdminPage() {
  const [memories, setMemories] = useState([]);
  const [form, setForm] = useState({ caption: '', people: '', date: '', category: 'Family' });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('sahay_memories');
      if (raw) setMemories(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (list) => {
    setMemories(list);
    localStorage.setItem('sahay_memories', JSON.stringify(list));
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    const mem = {
      id: Date.now(),
      src: preview,
      caption: form.caption || 'A beautiful memory',
      people: form.people || '',
      date: form.date || '',
      category: form.category,
    };
    const updated = [mem, ...memories];
    persist(updated);
    setPreview(null);
    setForm({ caption: '', people: '', date: '', category: 'Family' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleDelete = (id) => {
    const updated = memories.filter(m => m.id !== id);
    persist(updated);
  };

  return (
    <div className="page utility-page utility-page--memories">
      {/* Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div className="badge badge--gold" style={{ marginBottom: '1rem' }}>🎞️ Memory Theater</div>
        <h1 className="section-title">Patient Memory Collection</h1>
        <p className="section-subtitle">
          Upload photos and videos of happy memories. Sahay will show these to the patient during confused or distressed moments.
        </p>
        {memories.length > 0 && (
          <Link to="/memories/theater" className="btn btn--gold" style={{ marginTop: '0.5rem' }}>
            ▶ Preview Memory Theater
          </Link>
        )}
      </div>

      <div className="grid-2" style={{ alignItems: 'start', gap: '2rem' }}>
        {/* Upload panel */}
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Add a Memory</h2>
          <div className="card card--no-hover">
            {/* Photo drop zone */}
            <div
              onClick={() => document.getElementById('mem-file').click()}
              style={{
                border: `2px dashed ${preview ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '1.25rem',
                transition: 'border-color 0.2s',
                background: preview ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.02)',
                minHeight: 160,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
              }}
            >
              {preview ? (
                <img src={preview} alt="Preview" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 12, objectFit: 'cover' }} />
              ) : (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📷</div>
                  <div style={{ color: 'var(--color-text-2)', fontSize: '0.875rem' }}>Click to upload a photo</div>
                  <div style={{ color: 'var(--color-text-3)', fontSize: '0.75rem', marginTop: '0.25rem' }}>JPG, PNG, WEBP</div>
                </>
              )}
            </div>
            <input id="mem-file" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

            <div className="form-group">
              <label className="form-label">Caption / Description</label>
              <input
                className="form-input"
                placeholder="e.g. Ravi and Priya at Diwali celebration, 2019"
                value={form.caption}
                onChange={e => setForm(p => ({ ...p, caption: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">People in this photo</label>
              <input
                className="form-input"
                placeholder="e.g. Priya (daughter), Arjun (grandson)"
                value={form.people}
                onChange={e => setForm(p => ({ ...p, people: e.target.value }))}
              />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Year / Date</label>
                <input
                  className="form-input"
                  placeholder="e.g. 2019"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <button
              className="btn btn--gold btn--full"
              onClick={handleSave}
              disabled={!preview || saving}
              style={{ opacity: !preview ? 0.5 : 1 }}
            >
              {saving ? '⏳ Saving...' : saved ? '✅ Memory Saved!' : '💾 Save Memory'}
            </button>
          </div>
        </div>

        {/* Memory grid */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Saved Memories ({memories.length})</h2>
            {memories.length > 0 && (
              <Link to="/memories/theater" className="btn btn--sm btn--secondary">▶ Play</Link>
            )}
          </div>

          {memories.length === 0 ? (
            <div className="card card--no-hover" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-2)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌅</div>
              <p>No memories yet. Upload the first one!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {memories.map(mem => (
                <div key={mem.id} className="card card--no-hover" style={{ padding: '0.75rem', position: 'relative' }}>
                  <img src={mem.src} alt={mem.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10, marginBottom: '0.5rem' }} />
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-2)', lineHeight: 1.4, marginBottom: '0.5rem' }}>
                    {mem.caption}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge--gold" style={{ fontSize: '0.65rem' }}>{mem.category}</span>
                    <button
                      onClick={() => handleDelete(mem.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-3)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}
                    >🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
