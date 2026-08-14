import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { tools } from '../constants'

export const StatusBadge = ({ status }) => (
  <span
    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono tracking-widest uppercase ${
      status === 'live'
        ? 'border-mint/40 text-mint'
        : 'border-sand/40 text-sand'
    }`}
  >
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        status === 'live' ? 'bg-mint animate-pulse' : 'bg-sand'
      }`}
    />
    {status === 'live' ? 'Live' : 'In development'}
  </span>
)

const ToolCard = ({ tool, index = 0 }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: 'easeOut' }}
    >
      <Link
        to={`/tools/${tool.slug}`}
        className="group flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-storm to-indigo p-6 transition-all duration-300 hover:-translate-y-1 hover:border-aqua/40"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-primary/60 text-2xl">
            {tool.emoji}
          </span>
          <StatusBadge status={tool.status} />
        </div>
        <h3 className="mt-5 text-xl font-bold">{tool.name}</h3>
        <p className="subtext mt-2 flex-1">{tool.tagline}</p>
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
        <p className="mt-5 text-sm text-aqua opacity-80 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100">
          {tool.status === 'live' ? 'Open tool →' : 'View roadmap →'}
        </p>
      </Link>
    </motion.div>
  )
}

export const getTool = (slug) => tools.find((t) => t.slug === slug)

export default ToolCard
