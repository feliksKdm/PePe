import { useState } from "react";
import { motion } from "motion/react";

function Navigation () {
  return ( 
    <ul className="nav-ul">
      <li className="nav-li">
        <a href="/" className="nav-link">Home</a>
      </li>
      <li className="nav-li">
        <a href="#work" className="nav-link">Work</a>
      </li>
      <li className="nav-li">
        <a href="#about" className="nav-link">About</a>
      </li>
      <li className="nav-li">
        <a href="#contact" className="nav-link">Contact</a>
      </li>
    </ul>
  )
}

function Navbar () {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="fixed inset-x-0 z-20 w-full backdrop-blur-lg bg-primary/40">
      <div className="mx-auto c-space max-w-7xl">
        <div className="flex items-center justify-between p-2 md:p-0">
          <a 
          href="/"
          className="text-xl font-bold transition-colors text-neutral-300 hover:text-white">
          Feliks
          </a>
          <button onClick={() => setIsOpen(!isOpen)}
            className="flex coursor-pointer text-neutral-500 hover:text-white focus:outline-none sm:hidden">
            <img src={isOpen ? "assets/close.svg" : "assets/menu.svg"} 
            alt="toggle" 
            className="w-6 h-6"/>
          </button>
          <nav className="hidden sm:flex">
            <Navigation />
          </nav>
        </div>
      </div>
      {isOpen && (<motion.div className="block overflow-hidden text-center sm:hidden"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        style={{ maxHeight: "100vh" }}
        transition={{ duration: 0.3, ease: "easeInOut" }}>
        <Navigation />
      </motion.div>)}
    </div>
  )
}

export default Navbar