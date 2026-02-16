import { useState, useEffect, useCallback } from 'react'
import './App.css'

const EDGE_FN = 'https://aquysbccogwqloydoymz.supabase.co/functions/v1/sonoglyph-generate'

const MODES = ['Cinematic', 'Ethereal', 'Industrial', 'Organic', 'Geometric'] as const
type Mode = typeof MODES[number]

interface PhoneticMap { sound: string; object: string; role: string }
interface SonoglyphResult {
  word: string
  mode: Mode
  definition: string
  phonetic_mapping: PhoneticMap[]
  functional_extraction: string[]
  scene_description: string
  render_prompt: string
}

interface HistoryEntry { word: string; mode: Mode; result: SonoglyphResult; timestamp: number }

// SM-2 Spaced Repetition
interface SM2Card {
  word: string
  ef: number        // easiness factor (>= 1.3)
  interval: number  // days until next review
  reps: number      // consecutive correct reps
  nextReview: number // timestamp ms
  result: SonoglyphResult
}

function sm2(card: SM2Card, quality: number): SM2Card {
  let { ef, interval, reps } = card
  if (quality < 3) {
    reps = 0; interval = 1
  } else {
    if (reps === 0) interval = 1
    else if (reps === 1) interval = 6
    else interval = Math.round(interval * ef)
    reps++
  }
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  return { ...card, ef, interval, reps, nextReview: Date.now() + interval * 86400000 }
}

function loadCards(): SM2Card[] {
  try { return JSON.parse(localStorage.getItem('sonoglyph_cards') || '[]') }
  catch { return [] }
}
function saveCards(c: SM2Card[]) { localStorage.setItem('sonoglyph_cards', JSON.stringify(c)) }

const REFINE_OPTIONS = [
  { label: 'Stronger phonetic clarity', instruction: 'Strengthen the phonetic clarity: make each sound-to-object mapping more immediately recognizable and aurally obvious. Keep the same scene world.' },
  { label: 'Deeper semantic structure', instruction: 'Deepen the semantic structure: make the functional behaviors more precisely mirror the concept\'s real-world mechanics. Keep the same scene world.' },
  { label: 'Different aesthetic mode', instruction: 'Shift the aesthetic mode to a contrasting style while preserving all phonetic mappings and semantic functions. Reimagine the scene in the new aesthetic.' },
  { label: 'More recursive symbolism', instruction: 'Add recursive symbolism: make the objects and their interactions self-referentially encode the concept at multiple scales. The scene should contain the concept within the concept.' },
  { label: 'Greater emotional tone', instruction: 'Amplify the emotional resonance: make the scene evoke a visceral feeling that mirrors what it feels like to experience or understand this concept. Keep all phonetic and semantic elements.' },
]

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem('sonoglyph_history') || '[]')
  } catch { return [] }
}

function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem('sonoglyph_history', JSON.stringify(h.slice(0, 50)))
}

export default function App() {
  const [word, setWord] = useState('')
  const [mode, setMode] = useState<Mode>('Cinematic')
  const [result, setResult] = useState<SonoglyphResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [tab, setTab] = useState<'encode' | 'review'>('encode')
  const [cards, setCards] = useState<SM2Card[]>(loadCards)
  const [reviewCard, setReviewCard] = useState<SM2Card | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)

  useEffect(() => { saveHistory(history) }, [history])
  useEffect(() => { saveCards(cards) }, [cards])

  const dueCards = cards.filter(c => c.nextReview <= Date.now())

  const startReview = () => {
    const due = cards.filter(c => c.nextReview <= Date.now())
    setReviewCard(due.length ? due[0] : null)
    setShowAnswer(false)
  }

  const rateCard = (quality: number) => {
    if (!reviewCard) return
    const updated = sm2(reviewCard, quality)
    setCards(prev => prev.map(c => c.word === updated.word ? updated : c))
    setShowAnswer(false)
    // next due card
    const remaining = cards.filter(c => c.nextReview <= Date.now() && c.word !== reviewCard.word)
    setReviewCard(remaining.length ? remaining[0] : null)
  }

  const generate = useCallback(async (refineInstruction?: string) => {
    const target = word.trim()
    if (!target && !refineInstruction) return
    setLoading(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        word: result?.word || target,
        mode,
      }
      if (refineInstruction && result) {
        body.refine = refineInstruction
        body.previous = result
      }

      const res = await fetch(EDGE_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const data: SonoglyphResult = await res.json()
      setResult(data)

      if (!refineInstruction) {
        setHistory(prev => {
          const filtered = prev.filter(h => h.word.toLowerCase() !== data.word.toLowerCase())
          return [{ word: data.word, mode, result: data, timestamp: Date.now() }, ...filtered]
        })
        // Add to spaced repetition queue
        setCards(prev => {
          if (prev.some(c => c.word.toLowerCase() === data.word.toLowerCase())) return prev
          return [...prev, { word: data.word, ef: 2.5, interval: 1, reps: 0, nextReview: Date.now() + 86400000, result: data }]
        })
      } else {
        setHistory(prev =>
          prev.map(h => h.word.toLowerCase() === data.word.toLowerCase()
            ? { ...h, result: data, timestamp: Date.now() } : h)
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [word, mode, result])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (word.trim()) generate()
  }

  const loadFromHistory = (entry: HistoryEntry) => {
    setWord(entry.word)
    setResult(entry.result)
    setError('')
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2>History</h2>
        {history.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, padding: '0 8px' }}>
            No words encoded yet
          </p>
        )}
        {history.map((entry) => (
          <button
            key={entry.word}
            className={`history-item ${result?.word === entry.word ? 'active' : ''}`}
            onClick={() => loadFromHistory(entry)}
          >
            {entry.word}
          </button>
        ))}
        {history.length > 0 && (
          <button className="clear-btn" onClick={() => { setHistory([]); setResult(null) }}>
            Clear history
          </button>
        )}
      </aside>

      {/* Main content */}
      <main className="main">
        <div className="logo-section">
          <h1>Sono<span>glyph</span></h1>
          <p>Structural mnemonic encoding through phonetic scene construction</p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button
            className={`refine-btn ${tab === 'encode' ? 'active' : ''}`}
            style={tab === 'encode' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => setTab('encode')}
          >Encode</button>
          <button
            className={`refine-btn ${tab === 'review' ? 'active' : ''}`}
            style={tab === 'review' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => { setTab('review'); startReview() }}
          >
            Review{dueCards.length > 0 ? ` (${dueCards.length})` : ''}
          </button>
        </div>

        {tab === 'review' ? (
          <div>
            {!reviewCard ? (
              <div className="card" style={{ opacity: 1, textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--text-dim)', fontSize: 16 }}>
                  {cards.length === 0 ? 'No cards yet -- encode some words first!' : 'All caught up! No cards due for review.'}
                </p>
              </div>
            ) : (
              <div className="card" style={{ opacity: 1 }}>
                <div className="card-label">Recall the Word</div>
                <p className="scene-text" style={{ marginBottom: 20 }}>{reviewCard.result.scene_description}</p>
                {!showAnswer ? (
                  <button className="generate-btn" onClick={() => setShowAnswer(true)}>Show Answer</button>
                ) : (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
                      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>{reviewCard.word}</p>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>{reviewCard.result.definition}</p>
                    </div>
                    <div style={{ marginTop: 20 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>How well did you recall it?</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1, 2, 3, 4, 5].map(q => (
                          <button key={q} className="refine-btn" onClick={() => rateCard(q)}
                            style={{ flex: 1, textAlign: 'center' }}>
                            {q === 1 ? 'Again' : q === 2 ? 'Hard' : q === 3 ? 'OK' : q === 4 ? 'Good' : 'Easy'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {cards.length > 0 && (
              <div style={{ marginTop: 24, fontSize: 13, color: 'var(--text-dim)' }}>
                {cards.length} card{cards.length !== 1 ? 's' : ''} total -- {dueCards.length} due now
              </div>
            )}
          </div>
        ) : (
        <>
        <form className="input-section" onSubmit={handleSubmit}>
          <input
            className="word-input"
            type="text"
            placeholder="Enter a word to encode..."
            value={word}
            onChange={e => setWord(e.target.value)}
            disabled={loading}
          />
          <select
            className="mode-select"
            value={mode}
            onChange={e => setMode(e.target.value as Mode)}
            disabled={loading}
          >
            {MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="generate-btn" type="submit" disabled={loading || !word.trim()}>
            {loading ? 'Encoding...' : 'Encode'}
          </button>
        </form>

        {loading && (
          <div className="loading">
            <div className="dots"><span /><span /><span /></div>
            <span>Constructing mnemonic scene...</span>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {result && !loading && (
          <>
            <div className="results">
              {/* Definition */}
              <div className="card">
                <div className="card-label">Definition</div>
                <p>{result.definition}</p>
              </div>

              {/* Phonetic Mapping */}
              <div className="card">
                <div className="card-label">Phonetic Mapping</div>
                <div className="phonetic-grid">
                  {result.phonetic_mapping.map((pm, i) => (
                    <div className="phonetic-item" key={i}>
                      <div className="sound">{pm.sound}</div>
                      <div className="object">{pm.object}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                        {pm.role}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Functional Extraction */}
              <div className="card">
                <div className="card-label">Functional Extraction</div>
                <ul className="behavior-list">
                  {result.functional_extraction.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Scene Description */}
              <div className="card">
                <div className="card-label">Unified Scene</div>
                <p className="scene-text">{result.scene_description}</p>
              </div>

              {/* Render Prompt */}
              <div className="card">
                <div className="card-label">Render Prompt</div>
                <div className="render-prompt">{result.render_prompt}</div>
              </div>
            </div>

            {/* Refine */}
            <div className="refine-section">
              <h3>Refine</h3>
              <div className="refine-buttons">
                {REFINE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    className="refine-btn"
                    disabled={loading}
                    onClick={() => generate(opt.instruction)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        </>
        )}
      </main>
    </div>
  )
}
