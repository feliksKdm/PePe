import { lazy, Suspense } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import GradioEmbed from '../components/GradioEmbed'
import { StatusBadge, getTool } from '../components/ToolCard'
import { tools } from '../constants'

// Tools built directly into the site (code-split so they only load on demand)
const CUSTOM_TOOLS = {
  'text-to-speech': lazy(() => import('../components/tts/TextToSpeech')),
}

const ToolDetail = () => {
  const { slug } = useParams()
  const tool = getTool(slug)

  if (!tool) return <Navigate to="/tools" replace />

  const others = tools.filter((t) => t.slug !== slug).slice(0, 3)

  return (
    <section className="c-space min-h-screen pt-28 md:pt-36 pb-20">
      <Link
        to="/tools"
        className="font-mono text-xs tracking-widest text-neutral-400 transition-colors hover:text-white"
      >
        ← BACK TO THE LAB
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-gradient-to-b from-storm to-indigo text-3xl">
          {tool.emoji}
        </span>
        <div>
          <h1 className="text-heading">{tool.name}</h1>
          <p className="subtext mt-1">{tool.tagline}</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={tool.status} />
        </div>
      </div>

      <p className="subtext mt-6 max-w-2xl md:text-base">{tool.description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {tool.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-neutral-400"
          >
            {tag}
          </span>
        ))}
      </div>

      {tool.notice && (
        <div className="mt-6 flex max-w-2xl gap-3 rounded-xl border border-sand/30 bg-sand/5 p-4">
          <span aria-hidden>⚠️</span>
          <p className="text-sm leading-relaxed text-sand">{tool.notice}</p>
        </div>
      )}

      <div className="mt-10">
        {tool.type === 'custom' && CUSTOM_TOOLS[tool.slug] ? (
          (() => {
            const CustomTool = CUSTOM_TOOLS[tool.slug]
            return (
              <Suspense
                fallback={
                  <p className="font-mono text-xs text-neutral-500">
                    loading tool…
                  </p>
                }
              >
                <CustomTool />
              </Suspense>
            )
          })()
        ) : tool.type === 'gradio' ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-primary/60 p-2 md:p-4">
            <GradioEmbed
              src={tool.src}
              height={tool.embedHeight || 720}
              title={tool.name}
            />
            <p className="p-3 text-center font-mono text-[10px] text-neutral-500">
              Runs on a Hugging Face Space — first load can take a moment while
              the model wakes up.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-gradient-to-b from-storm/60 to-indigo/60 p-10 text-center">
            <p className="text-4xl">🚧</p>
            <h2 className="mt-4 text-xl font-bold">On the workbench</h2>
            <p className="subtext mx-auto mt-2 max-w-md">
              This tool is in active development. It will appear here the
              moment it ships — no account, no paywall.
            </p>
            <a
              href={`mailto:altymysovfeliks@gmail.com?subject=Notify me: ${tool.name}`}
              className="mt-6 inline-block rounded-full bg-radial from-lavender to-royal px-6 py-3 text-sm hover-animation"
            >
              Notify me when it&apos;s live
            </a>
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div className="mt-16">
          <p className="font-mono text-xs tracking-[0.3em] text-neutral-500 uppercase">
            More from the Lab
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {others.map((t) => (
              <Link
                key={t.slug}
                to={`/tools/${t.slug}`}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-aqua/40 hover:text-white"
              >
                <span>{t.emoji}</span> {t.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default ToolDetail
