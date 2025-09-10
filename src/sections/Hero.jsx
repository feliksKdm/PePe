import { div } from "motion/react-client"
import { FlipWords } from "../components/FlipWords"
import { ParalaxBackground } from "../components/ParalaxBackground"

function Hero () {
  return ( 
    
    <div className="min-h-screen flex flex-col  items-center text-center c-space rounded-3xl z-100 pt-20 md:pt-40">
      <div className="z-10 text-white">
        <h1 className=" text-4xl font-bold mb-4 md:text-7xl">Hi, im Feliks</h1>
        <h2 
        className="text-3xl text-center md:text-6xl">Building</h2>
        
        <div>
          <FlipWords 
            words={["websites", "apps", "idk", "stuff :O", "I can do Big Data actually"]}
            duration={2000}
            className="text-3xl font-bold  p-3 md:text-6xl" 
          />
        </div>
      </div>
      
      <ParalaxBackground />                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
    </div>

    

  )
}

export default Hero