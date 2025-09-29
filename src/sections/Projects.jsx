import { section } from 'motion/react-client'
import Project from '../components/Project'
import { myProjects } from '../constants'
import React from 'react'

const Projects = () => {
  return (
    <section className='relative c-space section-spacing' id='projects'>
      <h2 className='text-heading'>Selected Projects</h2>
      <div className='bg-gradient-to-r from-transparent via-neutral-700 to-transparent mt-12 h-[1px] w-full'>
        { myProjects.map((project) => (
          <Project key={project.id}/> ))}
      </div>
    </section>
  )
}

export default Projects