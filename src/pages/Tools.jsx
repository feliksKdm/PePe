import { Particles } from '../components/Particles'
import ToolCard from '../components/ToolCard'
import { tools } from '../constants'

const Tools = () => {
  return (
    <section className="relative c-space min-h-screen pt-28 md:pt-36 pb-20">
      <Particles
        className="absolute inset-0 -z-50"
        quantity={80}
        ease={80}
        color={'#ffffff'}
        refresh
      />

      <p className="font-mono text-xs tracking-[0.3em] text-aqua uppercase">
        The Lab
      </p>
      <h1 className="text-heading mt-3 md:text-5xl">AI tools, free to use</h1>
      <p className="subtext mt-4 max-w-xl md:text-lg">
        Things I build for myself and leave open for everyone. Live tools run
        in your browser — the rest are on the bench, in active development.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool, i) => (
          <ToolCard key={tool.slug} tool={tool} index={i} />
        ))}
      </div>

      <p className="mt-14 text-center font-mono text-xs text-neutral-500">
        Have an idea for a tool I should build?{' '}
        <a
          href="mailto:altymysovfeliks@gmail.com"
          className="text-aqua hover:underline"
        >
          Tell me →
        </a>
      </p>
    </section>
  )
}

export default Tools
