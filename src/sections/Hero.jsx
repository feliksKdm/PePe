import { div } from "motion/react-client"
import { FlipWords } from "../components/FlipWords"

function Hero () {
  return ( 
    <div className="min-h-screen flex flex-col  items-center text-center c-space rounded-3xl z-10 pt-20 md:pt-40">
      <h1 className="text-4xl font-bold mb-4 text-neutral-300 md:text-7xl">Hi, im Feliks</h1>
      <h2 
      className="text-3xl text-neutral-300 text-center md:text-6xl">Building</h2>
      <div>
        <FlipWords 
          words={["websites", "apps", "idk", "stuff :O", "I can do Big Data actually"]}
          duration={2000}
          className="text-3xl font-bold text-neutral-300 p-3 md:text-6xl" 
        />
      </div>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
    </div>
  )
}

export default Hero