import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { FlipWords } from "../components/FlipWords"
import { ParalaxBackground } from "../components/ParalaxBackground"
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Sparkles } from "@react-three/drei"
import { GirlSpace } from "../components/GirlSpace"
import { easing } from "maath"
import { useMediaQuery } from "react-responsive"
import { Suspense } from "react"
import Loader from "../components/Loader"

function Hero() {
  const isMobile = useMediaQuery({ maxWidth: 853 });

  const variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <section
      className="min-h-screen flex flex-col items-center justify-start c-space md:items-start md:justify-start z-100 pt-24 md:pt-40"
      id="home"
    >
      <div className="z-10 text-white text-4xl font-bold [text-shadow:2px_2px_6px_rgba(0,0,0,0.4)]">
        <motion.p
          className="mb-4 font-mono text-xs font-normal tracking-[0.3em] text-aqua uppercase"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.8 }}
        >
          AI Engineer · Brooklyn, NY
        </motion.p>

        <motion.h1
          className="text-4xl font-bold mb-4 md:text-7xl"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          Hi, I&apos;m Feliks
        </motion.h1>

        <motion.h2
          className="text-3xl md:text-6xl"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          Building
        </motion.h2>

        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1 }}
        >
          <FlipWords
            words={[
              "computer vision systems",
              "detection pipelines",
              "recognition APIs",
              "AI tools for everyone",
            ]}
            duration={2400}
            className="text-3xl font-bold md:text-6xl"
          />
        </motion.div>

        <motion.div
          className="mt-8 flex flex-wrap gap-4"
          variants={variants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 1.3 }}
        >
          <a
            href="#projects"
            className="rounded-full bg-radial from-lavender to-royal px-6 py-3 text-sm font-normal hover-animation"
          >
            View projects
          </a>
          <Link
            to="/tools"
            className="rounded-full border border-white/15 bg-primary/40 px-6 py-3 text-sm font-normal backdrop-blur hover-animation hover:border-aqua/50"
          >
            Try my AI tools →
          </Link>
        </motion.div>
      </div>

      <ParalaxBackground />

      <figure
        className="inset-0 absolute z-1"
        style={{ width: "100vw", height: "100vh" }}
      >
        <Canvas
          camera={{ fov: 70, position: [0, 1, 3] }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <Suspense fallback={<Loader />}>
            {/* Moody rim lighting — enough to read the model, not a spotlight */}
            <ambientLight intensity={0.28} color="#b8c5ff" />
            <directionalLight position={[-4, 3, -3]} intensity={1.1} color="#7a57db" />
            <pointLight position={[3, -1, 4]} intensity={0.5} color="#33c2cc" />

            <Float speed={1} rotationIntensity={0.4} floatIntensity={0.9}>
              <GirlSpace
                position={isMobile ? [0, -2.8, 2] : [1.8, -6.3, 0]}
                scale={isMobile ? 0.035 : 0.069}
                rotation={isMobile ? [-0.2, Math.PI / 6, 0] : [-0.2, -Math.PI / 5, 0]}
              />

              {/* Drifting star dust around the model */}
              <Sparkles
                count={60}
                scale={isMobile ? 6 : 10}
                size={2.2}
                speed={0.35}
                opacity={0.55}
                color="#a78bfa"
              />
            </Float>

            <Rig />
          </Suspense>
        </Canvas>
      </figure>

      {/* Scroll indicator */}
      <motion.a
        href="#about"
        className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1 font-mono text-[10px] tracking-[0.3em] text-neutral-400 transition-colors hover:text-white md:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
      >
        SCROLL
        <motion.span
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          ↓
        </motion.span>
      </motion.a>
    </section>
  )
}

function Rig() {
  // Single owner of the camera: smooth mouse parallax, no OrbitControls
  // fighting it every frame (that fight was the stutter).
  return useFrame((state, delta) => {
    easing.damp3(
      state.camera.position,
      [state.mouse.x / 5, 1 + state.mouse.y / 5, 3],
      0.5,
      delta
    )
    state.camera.lookAt(0, 0, 0)
  })
}

export default Hero
