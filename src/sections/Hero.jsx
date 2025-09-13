import { div } from "motion/react-client"
import { FlipWords } from "../components/FlipWords"
import { ParalaxBackground } from "../components/ParalaxBackground"
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from "@react-three/drei"
import { GirlSpace } from "../components/GirlSpace"
import { use } from "react"
import { easing } from "maath"

function Hero () {
  return ( 
    
    <section className="min-h-screen flex flex-col  items-center justify-start text-center c-space rounded-3xl z-100 pt-20 md:pt-40 ">
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
        <Canvas camera={{ fov: 50 }}>
          <GirlSpace 
          position={ [0, -6.3, 0]} scale={ 0.065}
          rotation={ [-0.2, Math.PI / 6, 0]}
          />

          <OrbitControls 
          enableZoom={true}
          maxPolarAngle={Math.PI / 2} 
          />

          <Rig />
        </Canvas>

      </figure>

    </section>

    

  )
}

function Rig() {
  return useFrame((state, delta) => {
    easing.damp3(state.camera.position, 
      [state.mouse.x / 5, 1 + state.mouse.y / 5, 3], 0.5, 
      delta
    )
  }
  )
}

export default Hero