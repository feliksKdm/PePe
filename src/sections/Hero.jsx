import { div } from "motion/react-client"
import { FlipWords } from "../components/FlipWords"
import { ParalaxBackground } from "../components/ParalaxBackground"
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from "@react-three/drei"
import { GirlSpace } from "../components/GirlSpace"

function Hero () {
  return ( 
    
    <section className="min-h-screen flex flex-col  items-center justify-center text-center c-space rounded-3xl z-100 pt-5 md:pt-10 ">
      <div className="z-10  text-white text-4xl font-bold [text-shadow:2px_2px_6px_rgba(0,0,0,0.4)]">
        <h1 className=" text-4xl font-bold mb-4 md:text-7xl">Hi, im Feliks</h1>
        <h2 
        className="text-3xl text-center md:text-6xl">Building</h2>
        
        <div>
          <FlipWords 
            words={["websites", "apps", "idk", "stuff :O", "I can do Big Data actually"]}
            duration={2000}
            className="text-3xl font-bold  p-3 md:text-6xl " 
          />
        </div>
      </div>
      
      <ParalaxBackground />    

      <figure className="inset-0 absolute z-1 "
      style={{ width: "100vw", height: "100vh"}}
      >

        <Canvas >

          <GirlSpace 
          position={[0, -6.3, 0]} scale={0.065}
          rotation={[0, Math.PI / 4, 0]}
          castShadow
          />

          <OrbitControls 
          enableZoom={true}
          maxPolarAngle={Math.PI / 2} 
          />

        </Canvas>

      </figure>

    </section>

    

  )
}

export default Hero