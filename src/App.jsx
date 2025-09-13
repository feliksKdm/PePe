import React from 'react'
import Navbar from './sections/Navbar'
import Hero from './sections/Hero'
import About from './sections/About'

function App() {
  return (
    <div className='container mx-auto max-w-7xl'>
      <Navbar />
      <Hero />
      <About />
      <div className='min-h-screen'></div>
      {/*main section*/}
      {/*footer*/}
    </div>
  )
}

export default App