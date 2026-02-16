import { useState, useEffect, useCallback } from 'react'
import './App.css'

const EDGE_FN = 'https://aquysbccogwqloydoymz.supabase.co/functions/v1/sonoglyph-generate'
const MANDARIN_FN = 'https://aquysbccogwqloydoymz.supabase.co/functions/v1/mandarin-decompose'

const MODES = ['Cinematic', 'Ethereal', 'Industrial', 'Organic', 'Geometric'] as const
type Mode = typeof MODES[number]
type Tab = 'encode' | 'review' | 'mandarin' | 'mandarin-review'

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

interface MandarinResult {
  character: string
  pinyin: string
  definition: string
  character_type: { category: string; category_pinyin: string; explanation: string }
  radical_tree: string
  radicals: Array<{ component: string; pinyin: string; meaning: string; symbolism: string; visual_description: string }>
  mnemonics: Array<{ type: string; bridge: string; explanation: string }>
  etymology: string
  scene_description: string
  render_prompt: string
}

interface HistoryEntry { word: string; mode: Mode; result: SonoglyphResult; timestamp: number }

// SM-2 Spaced Repetition
interface SM2Card {
  word: string
  ef: number
  interval: number
  reps: number
  nextReview: number
  result: SonoglyphResult
}

interface MandarinSM2Card {
  word: string
  character: string
  pinyin: string
  ef: number
  interval: number
  reps: number
  nextReview: number
  result: MandarinResult
}

function sm2<T extends { ef: number; interval: number; reps: number; nextReview: number }>(card: T, quality: number): T {
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

function loadMandarinCards(): MandarinSM2Card[] {
  try { return JSON.parse(localStorage.getItem('sonoglyph_mandarin_cards') || '[]') }
  catch { return [] }
}
function saveMandarinCards(c: MandarinSM2Card[]) { localStorage.setItem('sonoglyph_mandarin_cards', JSON.stringify(c)) }

const REFINE_OPTIONS = [
  { label: 'Stronger phonetic clarity', instruction: 'Strengthen the phonetic clarity: make each sound-to-object mapping more immediately recognizable and aurally obvious. Keep the same scene world.' },
  { label: 'Deeper semantic structure', instruction: 'Deepen the semantic structure: make the functional behaviors more precisely mirror the concept\'s real-world mechanics. Keep the same scene world.' },
  { label: 'Different aesthetic mode', instruction: 'Shift the aesthetic mode to a contrasting style while preserving all phonetic mappings and semantic functions. Reimagine the scene in the new aesthetic.' },
  { label: 'More recursive symbolism', instruction: 'Add recursive symbolism: make the objects and their interactions self-referentially encode the concept at multiple scales. The scene should contain the concept within the concept.' },
  { label: 'Greater emotional tone', instruction: 'Amplify the emotional resonance: make the scene evoke a visceral feeling that mirrors what it feels like to experience or understand this concept. Keep all phonetic and semantic elements.' },
]

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem('sonoglyph_history') || '[]') }
  catch { return [] }
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
  const [tab, setTab] = useState<Tab>('encode')
  const [cards, setCards] = useState<SM2Card[]>(loadCards)
  const [reviewCard, setReviewCard] = useState<SM2Card | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)

  // Image generation
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  // Shuffle/Rewrite state
  const [rewriteIdx, setRewriteIdx] = useState<number | null>(null)
  const [rewriteText, setRewriteText] = useState('')

  // Mandarin state
  const [mandarinInput, setMandarinInput] = useState('')
  const [mandarinResult, setMandarinResult] = useState<MandarinResult | null>(null)
  const [mandarinCards, setMandarinCards] = useState<MandarinSM2Card[]>(loadMandarinCards)
  const [mandarinReviewCard, setMandarinReviewCard] = useState<MandarinSM2Card | null>(null)
  const [mandarinImageUrl, setMandarinImageUrl] = useState<string | null>(null)
  const [mandarinImageLoading, setMandarinImageLoading] = useState(false)
  const [showMandarinAnswer, setShowMandarinAnswer] = useState(false)
  const [showHints, setShowHints] = useState(false)

  useEffect(() => { saveHistory(history) }, [history])
  useEffect(() => { saveCards(cards) }, [cards])
  useEffect(() => { saveMandarinCards(mandarinCards) }, [mandarinCards])

  const dueCards = cards.filter(c => c.nextReview <= Date.now())
  const dueMandarinCards = mandarinCards.filter(c => c.nextReview <= Date.now())

  // Clear image when result changes
  useEffect(() => { setImageUrl(null) }, [result])
  useEffect(() => { setMandarinImageUrl(null) }, [mandarinResult])

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
    const remaining = cards.filter(c => c.nextReview <= Date.now() && c.word !== reviewCard.word)
    setReviewCard(remaining.length ? remaining[0] : null)
  }

  const startMandarinReview = () => {
    const due = mandarinCards.filter(c => c.nextReview <= Date.now())
    setMandarinReviewCard(due.length ? due[0] : null)
    setShowMandarinAnswer(false)
    setShowHints(false)
  }

  const rateMandarinCard = (quality: number) => {
    if (!mandarinReviewCard) return
    const updated = sm2(mandarinReviewCard, quality)
    setMandarinCards(prev => prev.map(c => c.character === updated.character ? updated : c))
    setShowMandarinAnswer(false)
    setShowHints(false)
    const remaining = mandarinCards.filter(c => c.nextReview <= Date.now() && c.character !== mandarinReviewCard.character)
    setMandarinReviewCard(remaining.length ? remaining[0] : null)
  }

  // Generate image from render prompt
  const generateImage = (prompt: string, target: 'english' | 'mandarin') => {
    const setter = target === 'english' ? setImageLoading : setMandarinImageLoading
    const urlSetter = target === 'english' ? setImageUrl : setMandarinImageUrl
    setter(true)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true`
    urlSetter(url)
    setter(false)
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

  // Shuffle a single phonetic mapping
  const shuffleMapping = async (idx: number) => {
    if (!result) return
    const pm = result.phonetic_mapping[idx]
    const instruction = `Regenerate ONLY the phonetic mapping for the sound '${pm.sound}'. Find a different object that still sounds like '${pm.sound}' and serves the same semantic role. Keep everything else unchanged.`
    await generate(instruction)
  }

  // Rewrite a single phonetic mapping with custom text
  const rewriteMapping = async (idx: number) => {
    if (!result || !rewriteText.trim()) return
    const pm = result.phonetic_mapping[idx]
    const instruction = `For the phonetic mapping of '${pm.sound}': ${rewriteText.trim()}. Adjust the scene accordingly but keep all other mappings unchanged.`
    setRewriteIdx(null)
    setRewriteText('')
    await generate(instruction)
  }

  // Mandarin generate
  const generateMandarin = async () => {
    const char = mandarinInput.trim()
    if (!char) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(MANDARIN_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: char, mode }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const data: MandarinResult = await res.json()
      setMandarinResult(data)

      // Add to mandarin SM-2 queue
      setMandarinCards(prev => {
        if (prev.some(c => c.character === data.character)) return prev
        return [...prev, {
          word: data.character,
          character: data.character,
          pinyin: data.pinyin,
          ef: 2.5, interval: 1, reps: 0,
          nextReview: Date.now() + 86400000,
          result: data,
        }]
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (word.trim()) generate()
  }

  const handleMandarinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mandarinInput.trim()) generateMandarin()
  }

  const loadFromHistory = (entry: HistoryEntry) => {
    setWord(entry.word)
    setResult(entry.result)
    setError('')
    setTab('encode')
  }

  const currentImageUrl = tab === 'mandarin' ? mandarinImageUrl : imageUrl
  const currentImageLoading = tab === 'mandarin' ? mandarinImageLoading : imageLoading

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

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
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
          <button
            className={`refine-btn ${tab === 'mandarin' ? 'active' : ''}`}
            style={tab === 'mandarin' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => setTab('mandarin')}
          >Mandarin</button>
          <button
            className={`refine-btn ${tab === 'mandarin-review' ? 'active' : ''}`}
            style={tab === 'mandarin-review' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => { setTab('mandarin-review'); startMandarinReview() }}
          >
            Mandarin Review{dueMandarinCards.length > 0 ? ` (${dueMandarinCards.length})` : ''}
          </button>
        </div>

        {/* ===== REVIEW TAB ===== */}
        {tab === 'review' && (
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
        )}

        {/* ===== MANDARIN REVIEW TAB ===== */}
        {tab === 'mandarin-review' && (
          <div>
            {!mandarinReviewCard ? (
              <div className="card" style={{ opacity: 1, textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--text-dim)', fontSize: 16 }}>
                  {mandarinCards.length === 0 ? 'No Mandarin cards yet -- decompose some characters first!' : 'All caught up! No Mandarin cards due for review.'}
                </p>
              </div>
            ) : (
              <div className="card" style={{ opacity: 1 }}>
                <div className="card-label">Recall the Character</div>
                <p className="scene-text" style={{ marginBottom: 20 }}>{mandarinReviewCard.result.scene_description}</p>

                <button className="refine-btn" style={{ marginBottom: 12 }} onClick={() => setShowHints(!showHints)}>
                  {showHints ? 'Hide Hints' : 'Show Radical Hints'}
                </button>
                {showHints && (
                  <pre className="radical-tree">{mandarinReviewCard.result.radical_tree}</pre>
                )}

                {!showMandarinAnswer ? (
                  <button className="generate-btn" style={{ marginTop: 16 }} onClick={() => setShowMandarinAnswer(true)}>Show Answer</button>
                ) : (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16, textAlign: 'center' }}>
                      <p className="character-display">{mandarinReviewCard.character}</p>
                      <p className="pinyin-display">{mandarinReviewCard.pinyin}</p>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>{mandarinReviewCard.result.definition}</p>
                    </div>
                    <div style={{ marginTop: 20 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>How well did you recall it?</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1, 2, 3, 4, 5].map(q => (
                          <button key={q} className="refine-btn" onClick={() => rateMandarinCard(q)}
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
            {mandarinCards.length > 0 && (
              <div style={{ marginTop: 24, fontSize: 13, color: 'var(--text-dim)' }}>
                {mandarinCards.length} card{mandarinCards.length !== 1 ? 's' : ''} total -- {dueMandarinCards.length} due now
              </div>
            )}
          </div>
        )}

        {/* ===== MANDARIN ENCODE TAB ===== */}
        {tab === 'mandarin' && (
          <>
            <form className="input-section" onSubmit={handleMandarinSubmit}>
              <input
                className="word-input mandarin-input"
                type="text"
                placeholder="Enter Chinese characters... (e.g. random = sui2 bian4)"
                value={mandarinInput}
                onChange={e => setMandarinInput(e.target.value)}
                disabled={loading}
                spellCheck={false}
              />
              <select
                className="mode-select"
                value={mode}
                onChange={e => setMode(e.target.value as Mode)}
                disabled={loading}
              >
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button className="generate-btn" type="submit" disabled={loading || !mandarinInput.trim()}>
                {loading ? 'Decomposing...' : 'Decompose'}
              </button>
            </form>

            {loading && (
              <div className="loading">
                <div className="dots"><span /><span /><span /></div>
                <span>Decomposing character...</span>
              </div>
            )}

            {error && <div className="error">{error}</div>}

            {mandarinResult && !loading && (
              <div className="results">
                {/* Definition */}
                <div className="card">
                  <div className="card-label">Definition</div>
                  <p className="character-display">{mandarinResult.character}</p>
                  <p className="pinyin-display">{mandarinResult.pinyin}</p>
                  <p>{mandarinResult.definition}</p>
                </div>

                {/* Radical Tree */}
                <div className="card">
                  <div className="card-label">Radical Decomposition</div>
                  <pre className="radical-tree">{mandarinResult.radical_tree}</pre>
                  <div className="radical-legend">
                    {mandarinResult.radicals.map(r => (
                      <div key={r.component} className="radical-item">
                        <span className="radical-char">{r.component}</span>
                        <span className="radical-pinyin">({r.pinyin})</span>
                        <span className="radical-meaning">{r.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Character Type */}
                <div className="card">
                  <div className="card-label">Character Type</div>
                  <div className="character-type">
                    <span className="type-badge">{mandarinResult.character_type.category} ({mandarinResult.character_type.category_pinyin})</span>
                    <p className="type-description">{mandarinResult.character_type.explanation}</p>
                  </div>
                </div>

                {/* Mnemonics */}
                <div className="card">
                  <div className="card-label">Mnemonics</div>
                  <div className="mnemonic-bridges">
                    {mandarinResult.mnemonics.map((m, i) => (
                      <div key={i} className="mnemonic-item">
                        <div className="mnemonic-type">{m.type.replace(/_/g, ' ')}</div>
                        <p className="mnemonic-text">{m.bridge}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{m.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Etymology */}
                <div className="card">
                  <div className="card-label">Etymology</div>
                  <p style={{ fontSize: 14, lineHeight: 1.7 }}>{mandarinResult.etymology}</p>
                </div>

                {/* Scene */}
                <div className="card">
                  <div className="card-label">Visual Scene</div>
                  <p className="scene-text mandarin-scene">{mandarinResult.scene_description}</p>
                </div>

                {/* Render Prompt */}
                <div className="card">
                  <div className="card-label">Render Prompt</div>
                  <div className="render-prompt">{mandarinResult.render_prompt}</div>
                </div>

                {/* Generate Image */}
                <div className="card" style={{ opacity: 1 }}>
                  <button
                    className="generate-btn"
                    onClick={() => generateImage(mandarinResult.render_prompt, 'mandarin')}
                    disabled={mandarinImageLoading}
                    style={{ width: '100%' }}
                  >
                    {mandarinImageLoading ? 'Generating...' : 'Generate Image'}
                  </button>
                  {mandarinImageUrl && (
                    <div className="generated-image-container">
                      <img src={mandarinImageUrl} alt="Mnemonic scene" className="generated-image" />
                      <a href={mandarinImageUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
                        Download Image
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== ENCODE TAB ===== */}
        {tab === 'encode' && (
        <>
        <form className="input-section" onSubmit={handleSubmit}>
          <input
            className="word-input"
            type="text"
            placeholder="Enter a word to encode..."
            value={word}
            onChange={e => setWord(e.target.value)}
            disabled={loading}
            spellCheck={true}
            autoCorrect="on"
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

              {/* Phonetic Mapping with Shuffle/Rewrite */}
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
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button
                          className="refine-btn"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={loading}
                          onClick={() => shuffleMapping(i)}
                        >Shuffle</button>
                        <button
                          className="refine-btn"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={loading}
                          onClick={() => { setRewriteIdx(rewriteIdx === i ? null : i); setRewriteText('') }}
                        >Rewrite</button>
                      </div>
                      {rewriteIdx === i && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                          <input
                            type="text"
                            placeholder="e.g. use a trumpet instead"
                            value={rewriteText}
                            onChange={e => setRewriteText(e.target.value)}
                            style={{
                              flex: 1, padding: '6px 10px', fontSize: 12,
                              background: 'var(--bg)', border: '1px solid var(--border)',
                              borderRadius: 6, color: 'var(--text)',
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') rewriteMapping(i) }}
                          />
                          <button
                            className="generate-btn"
                            style={{ fontSize: 11, padding: '6px 12px' }}
                            disabled={loading || !rewriteText.trim()}
                            onClick={() => rewriteMapping(i)}
                          >Go</button>
                        </div>
                      )}
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

              {/* Generate Image */}
              <div className="card" style={{ opacity: 1 }}>
                <button
                  className="generate-btn"
                  onClick={() => generateImage(result.render_prompt, 'english')}
                  disabled={currentImageLoading}
                  style={{ width: '100%' }}
                >
                  {imageLoading ? 'Generating...' : 'Generate Image'}
                </button>
                {imageUrl && (
                  <div className="generated-image-container">
                    <img src={imageUrl} alt="Mnemonic scene" className="generated-image" />
                    <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
                      Download Image
                    </a>
                  </div>
                )}
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
