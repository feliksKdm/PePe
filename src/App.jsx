import React from 'react'
import Navbar from './sections/Navbar'
import Hero from './sections/Hero'
import About from './sections/About'
import Projects from './sections/Projects'
import Expiriences from './sections/Expiriences'
import Footer from './sections/Footer'

function App() {
  return (
    <div className='container mx-auto max-w-7xl'>
      <Navbar />
      <Hero />
      <About />
      <Projects />
      <Expiriences />
      <Footer />
      <div className='min-h-screen'></div>
      {/*footer*/}
    </div>
  )
}

export default App