import {motion} from "motion/react"

const Card = ( {style , text, image, containerRef} ) => {
  return image && !text ? (
    <motion.img 
      src={image} 
      className="absolute w-15 cursor-grab"
      style={style}
      whileHover={{ scale: 1.05 }}
      drag
      dragConstraints={containerRef}
      dragElasticity={1}
    />
  ) : (
    <motion.div className="absolute px-1 py-4 text-xl w-[12rem] text-center rounded-full ring ring-gray-700 font-extralight bg-storm cursor-grab" style={style}
    dragConstraints={containerRef}
    drag
    whileHover={{ scale: 1.05 }}
    dragElasticity={1}
    >
        {text}
    </motion.div>
  )
}

export default Card