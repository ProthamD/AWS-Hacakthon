import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Play, Trash2, ImageIcon, Film } from 'lucide-react';

interface Memory { id: string; url: string; caption: string; date: string; }

function useMemories() {
  const [mems, setMems] = useState<Memory[]>(() => {
    try { return JSON.parse(localStorage.getItem('sahay_memories') || '[]'); } catch { return []; }
  });
  const save = (m: Memory[]) => { setMems(m); localStorage.setItem('sahay_memories', JSON.stringify(m)); };
  const add = (m: Memory) => save([...mems, m]);
  const remove = (id: string) => save(mems.filter(m => m.id !== id));
  return { mems, add, remove };
}

export default function MemoriesAdminPage() {
  const { mems, add, remove } = useMemories();
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleAdd = () => {
    if (!preview) return;
    add({
      id: Date.now().toString(),
      url: preview,
      caption: caption.trim() || 'A cherished memory',
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    setPreview(null);
    setCaption('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="font-ui page-container" style={{ maxWidth: 700 }}>

      {/* Header */}
      <div className="anim-fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>04 / Memory Theater</div>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 300, color: 'var(--c-text-1)', letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 10 }}>
            Family Memories
          </h1>
          <p style={{ fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.65, maxWidth: 420 }}>
            These photos are narrated to your patient during confused or distressed moments with calming AI voice — helping them reconnect with their story.
          </p>
        </div>
        {mems.length > 0 && (
          <Link
            to="/memories/theater"
            className="btn btn-primary"
            style={{ flexShrink: 0, gap: 8 }}
          >
            <Film size={14} strokeWidth={1.8} />
            Preview Theater
          </Link>
        )}
      </div>

      {/* Upload card */}
      <div className="glass-card anim-fade-up" style={{ animationDelay: '0.08s', padding: 24, marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text-3)', marginBottom: 16 }}>
          Add a Memory
        </div>

        {/* Drop zone */}
        <div
          className={`drop-zone${dragging ? ' active' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
          role="button"
          tabIndex={0}
          aria-label="Upload a memory photo"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
          style={{ marginBottom: 16, borderColor: preview ? 'var(--c-accent)' : undefined }}
        >
          {preview ? (
            <img
              src={preview}
              alt="Memory preview"
              style={{ maxHeight: 220, maxWidth: '100%', margin: '0 auto', display: 'block', borderRadius: 8, objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={20} strokeWidth={1.5} style={{ color: 'var(--c-text-3)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--c-text-2)', fontWeight: 500 }}>Click or drag a photo here</div>
                <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 4 }}>JPG, PNG, WEBP — stays on your device</div>
              </div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} aria-hidden="true" />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="input-field"
            style={{ flex: 1 }}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Caption — e.g. 'Our trip to Rishikesh, 2018'"
            aria-label="Memory caption"
          />
          <button
            onClick={handleAdd}
            disabled={!preview}
            className="btn btn-primary"
            style={{
              flexShrink: 0,
              background: preview ? 'var(--c-accent)' : 'rgba(255,255,255,0.05)',
              color: preview ? '#fff' : 'var(--c-text-4)',
              boxShadow: preview ? '0 2px 16px rgba(124,111,250,0.35)' : 'none',
              cursor: preview ? 'pointer' : 'not-allowed',
              minWidth: 80,
            }}
          >
            <ImageIcon size={13} strokeWidth={1.8} />
            Add
          </button>
        </div>
      </div>

      {/* Memory grid */}
      {mems.length === 0 ? (
        <div className="anim-fade-in" style={{ textAlign: 'center', padding: '56px 0', color: 'var(--c-text-4)', fontSize: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <ImageIcon size={24} strokeWidth={1} style={{ color: 'var(--c-text-4)' }} />
          </div>
          No memories yet — add your first photo above.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--c-text-2)', fontWeight: 600 }}>{mems.length} {mems.length === 1 ? 'memory' : 'memories'}</div>
            {mems.length > 0 && (
              <Link to="/memories/theater" style={{ fontSize: 12, color: 'var(--c-accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Play size={12} strokeWidth={2} /> Preview all
              </Link>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
            {mems.map(m => (
              <div key={m.id} className="memory-card anim-scale-in">
                <img
                  src={m.url}
                  alt={m.caption}
                  style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
                <div className="memory-card-overlay">
                  <div style={{ fontSize: 12, color: 'rgba(240,240,248,0.85)', marginBottom: 2, lineHeight: 1.4, fontWeight: 500 }}>{m.caption}</div>
                  <div style={{ fontSize: 10, color: 'var(--c-text-4)' }}>{m.date}</div>
                </div>
                <button
                  className="memory-delete-btn"
                  onClick={() => remove(m.id)}
                  aria-label={`Remove memory: ${m.caption}`}
                >
                  <Trash2 size={12} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
