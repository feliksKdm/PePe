import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../components/ToolCard'
import { tools } from '../constants'

const ToolsTeaser = () => {
  return (
    <section className="relative c-space section-spacing !min-h-0" id="tools">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-storm to-indigo p-8 md:p-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] text-aqua uppercase">
              The Lab
            </p>
            <h2 className="text-heading mt-3">Tools you can actually use</h2>
            <p className="subtext mt-3 max-w-lg">
              I build small AI tools for my own workflow and keep them open for
              everyone — voice cloning, text-to-speech and image upscaling live
              today; transcription and video generation on the bench.
            </p>
          </div>
          <Link
            to="/tools"
            className="rounded-full bg-radial from-lavender to-royal px-6 py-3 text-sm hover-animation"
          >
            Open the Lab →
          </Link>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, i) => (
            <motion.div
              key={tool.slug}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.06, ease: 'easeOut' }}
            >
              <Link
                to={`/tools/${tool.slug}`}
                className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-primary/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-aqua/40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{tool.emoji}</span>
                  <StatusBadge status={tool.status} />
                </div>
                <p className="font-bold">{tool.name}</p>
                <p className="subtext !text-xs">{tool.tagline}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ToolsTeaser
