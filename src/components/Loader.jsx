import { Html, useProgress } from "@react-three/drei"


function Loader() {
  return (
    <Html center className="text-xl font-normal text-center">
        {useProgress().progress}% Loaded... 
    </Html>
  )
}

export default Loader