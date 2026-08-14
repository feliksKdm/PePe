import Project from '../components/Project'
import { myProjects } from '../constants'

const Projects = () => {
  return (
    <section className="relative c-space section-spacing" id="projects">
      <h2 className="text-heading">Selected Projects</h2>
      <p className="subtext mt-3 max-w-xl">
        Computer vision and machine learning, built end to end — from dataset
        to deployed API. Every card links to the code.
      </p>
      <div className="mt-6 h-[1px] w-full bg-gradient-to-r from-transparent via-neutral-700 to-transparent" />

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {myProjects.map((project, i) => (
          <Project key={project.id} project={project} index={i} />
        ))}
      </div>
    </section>
  )
}

export default Projects
