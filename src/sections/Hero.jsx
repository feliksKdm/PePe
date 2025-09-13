import { motion } from "framer-motion"
import { FlipWords } from "../components/FlipWords"
import { ParalaxBackground } from "../components/ParalaxBackground"
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls} from "@react-three/drei"
import { Float } from "@react-three/drei";
import { GirlSpace } from "../components/GirlSpace"
import { easing } from "maath"
import { useMediaQuery } from "react-responsive";
import { Suspense } from "react"
import Loader from "../components/Loader";


function Hero () {
  const isMobile = useMediaQuery({ maxWidth: 853 });

  const variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  };
  return ( 
    <section className="min-h-screen flex flex-col  items-center justify-start c-space md:items-start md:justify-start z-100 pt-20 md:pt-40 ">
      <div className="z-10  text-white text-4xl font-bold [text-shadow:2px_2px_6px_rgba(0,0,0,0.4)]">

        <motion.h1 
        className=" text-4xl font-bold mb-4 md:text-7xl"
        variants={variants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 1 }}
        >Hi, im Feliks</motion.h1>

        <motion.h2 
        className="text-3xl md:text-6xl"
        variants={variants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 1 }}>Building</motion.h2>
        
        <motion.div
        variants={variants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 1 }}>
          <FlipWords 
            words={["websites", "apps", "idk", "stuff :O", "I can do Big Data actually"]}
            duration={2400}
            className="text-3xl font-bold md:text-6xl " 
          />
        </motion.div>
      </div>
      
      <ParalaxBackground />    

      <figure className="inset-0 absolute z-1 "
      style={{ width: "100vw", height: "100vh"}}
      >
        
          <Canvas camera={{ fov: 70 }}>
          <Suspense fallback={<Loader />}>

          
              <Float>
                <GirlSpace 
                position={isMobile ? [0,-2.8, 2] : [1.8,-6.3,0]}
                scale={isMobile ? 0.035 : 0.069}
                rotation={isMobile ? [-0.2, Math.PI/6, 0] : [-0.2, -Math.PI/5, 0]}
                />

                <OrbitControls 
                  enableZoom={false} 
                  enablePan={false} 
                  rotateSpeed={0.3} 
                  minPolarAngle={Math.PI / 3}
                maxPolarAngle={Math.PI / 2} 
                />

                <Rig />
              </Float>
            </Suspense>
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