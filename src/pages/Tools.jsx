import { useEffect, useState } from 'react'
import { Particles } from '../components/Particles'
import ToolCard from '../components/ToolCard'
import { tools } from '../constants'

const CATEGORIES = [
  { key: 'all', label: 'All tools' },
  { key: 'audio', label: '🎧 Audio' },
  { key: 'image', label: '🖼️ Image' },
  { key: 'data', label: '🧮 Data' },
]

const live = tools.filter((t) => t.status === 'live')
const STATS = [
  [live.length, 'live tools'],
  [live.filter((t) => t.runs === 'gpu').length, 'on cloud GPUs'],
  [live.filter((t) => t.runs === 'browser').length, 'fully in your browser'],
  ['0', 'sign-ups or paywalls'],
]

const Tools = () => {
  const [category, setCategory] = useState('all')
  const shown = tools.filter((t) => category === 'all' || t.category === category)

  useEffect(() => {
    const previous = document.title
    document.title = "The Lab — free AI tools by Feliks Altymyshov"
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <section className="relative c-space min-h-screen pt-28 md:pt-36 pb-20">
      <Particles className="absolute inset-0 -z-50" quantity={80} ease={80} color={'#ffffff'} refresh />

      <p className="font-mono text-xs tracking-[0.3em] text-aqua uppercase">The Lab</p>
      <h1 className="text-heading mt-3 md:text-5xl">AI tools, free to use</h1>
      <p className="subtext mt-4 max-w-2xl md:text-lg">
        Image and video generation, voice cloning, speech, music, transcription and data analysis — things I build for myself and
        leave open for everyone. Heavy models run on Hugging Face GPUs; the rest run privately in your browser.
      </p>

      <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map(([n, label]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-primary/60 px-4 py-3 backdrop-blur-sm">
            <p className="text-2xl font-semibold">{n}</p>
            <p className="text-xs text-neutral-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-2" role="tablist" aria-label="Filter tools">
        {CATEGORIES.map((c) => {
          const count = c.key === 'all' ? tools.length : tools.filter((t) => t.category === c.key).length
          return (
            <button
              key={c.key}
              role="tab"
              aria-selected={category === c.key}
              onClick={() => setCategory(c.key)}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-all ${
                category === c.key
                  ? 'border-lavender bg-lavender/20 text-white'
                  : 'border-white/10 text-neutral-400 hover:border-aqua/40 hover:text-white'
              }`}
            >
              {c.label} <span className="font-mono text-[11px] opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((tool, i) => (
          <ToolCard key={tool.slug} tool={tool} index={i} />
        ))}
      </div>

      <p className="mt-14 text-center font-mono text-xs text-neutral-500">
        Have an idea for a tool I should build?{' '}
        <a href="mailto:altymysovfeliks@gmail.com" className="text-aqua hover:underline">
          Tell me →
        </a>
      </p>
    </section>
  )
}

export default Tools
