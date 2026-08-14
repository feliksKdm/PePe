import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

const Project = ({ project, index = 0 }) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, delay: index * 0.07, ease: 'easeOut' }}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-storm to-indigo transition-all duration-300 hover:-translate-y-1 hover:border-white/25"
      >
        {/* Stylized preview banner */}
        <div
          className={`relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br ${project.gradient}`}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'url(/assets/grid.png)',
              backgroundSize: '240px',
            }}
          />
          <span className="text-6xl drop-shadow-lg transition-transform duration-500 group-hover:scale-110">
            {project.emoji}
          </span>
          <span
            className="absolute bottom-3 right-4 font-mono text-[10px] tracking-widest text-white/40"
          >
            0{project.id} // PROJECT
          </span>
        </div>

        <div className="flex flex-1 flex-col p-6">
          <h3 className="text-xl font-bold">{project.title}</h3>
          <p className="subtext mt-2 flex-1">{project.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-neutral-400"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="cursor-pointer rounded-full bg-radial from-lavender to-royal px-5 py-2.5 text-sm hover-animation"
            >
              Read more
            </button>
            <a
              href={project.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <img src="/assets/logos/github.svg" alt="" className="h-4 w-4 invert opacity-80" />
              GitHub
            </a>
          </div>
        </div>
      </motion.article>

      {/* Detail modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-primary/80 p-5 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b from-midnight to-navy p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{project.emoji}</span>
                  <h3 className="text-2xl font-bold">{project.title}</h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="cursor-pointer rounded-full p-1 text-neutral-400 transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <img src="/assets/close.svg" alt="" className="h-6 w-6" />
                </button>
              </div>

              <p className="subtext mt-4">{project.description}</p>

              <ul className="mt-5 space-y-2.5">
                {project.subDescription.map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-neutral-400">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project.accent }}
                    />
                    {line}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap gap-2">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-neutral-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <a
                href={project.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-radial from-lavender to-royal py-3 text-sm hover-animation"
              >
                <img src="/assets/logos/github.svg" alt="" className="h-4 w-4 invert opacity-80" />
                View on GitHub
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default Project
