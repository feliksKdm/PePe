import Card from "../components/Card"
import {Globe} from "../components/Globe"
import {useRef} from "react"

function About() {
    const grid2Container = useRef();
  return (
    <section 
    className="c-space section-spacing">
        <h2 className="text-heading">About Me</h2>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mt-12 md:auto-rows-[18rem]">
            {/* Grid 1 */}
            <div className="flex items-end grid-default-color grid-1">
                <img 
                src="assets/coding-pov.png" 
                className="absolute scale-[1.75] -right-[5rem] -top-[1rem] md:scale-[3] md:left-50 md:inset-y-10 lg:scale-[2.5]"/>

                <div className="z-10">
                    <p className="headtext">Hi, I'm Feliks Altymyshov </p>
                    <p className="subtext">For 4 years, I’ve been blending front-end, back-end, and data science to craft innovative software and turn raw data into clear, actionable stories.</p>
                </div>
            </div>
            {/* Grid 2 */}
            <div className="flex grid-default-color grid-2">
                <div ref={grid2Container} className="flex items-center justify-center w-full h-full">
                    <p className="flex items-center text-5xl text-gray-500"> Front </p>
                    <Card
                    style={{ rotate: "75deg", top: "30%", left: "20%" }}
                    text="GRASP"
                    containerRef={grid2Container}
                    />
                    <Card
                    style={{ rotate: "-30deg", top: "60%", left: "45%" }}
                    text="SOLID"
                    containerRef={grid2Container}
                    />
                    <Card
                    style={{ rotate: "90deg", bottom: "30%", left: "70%" }}
                    text="Design Patterns"
                    containerRef={grid2Container}
                    />
                    <Card
                    style={{ rotate: "-45deg", top: "55%", left: "0%" }}
                    text="Design Principles"
                    containerRef={grid2Container}
                    />
                    <Card
                    style={{ rotate: "20deg", top: "10%", left: "38%" }}
                    text="SRP"
                    containerRef={grid2Container}
                    />
                    <Card
                    style={{ rotate: "30deg", top: "70%", left: "70%" }}
                    image="assets/logos/csharp-pink.png"
                    containerRef={grid2Container}
                    />
                    <Card
                    style={{ rotate: "-45deg", top: "70%", left: "25%" }}
                    image="assets/logos/dotnet-pink.png"
                    containerRef={grid2Container}
                    />
                    <Card
                    style={{ rotate: "-45deg", top: "5%", left: "10%" }}
                    image="assets/logos/blazor-pink.png"
                    containerRef={grid2Container}
                    />
                </div>
            </div>
            {/* Grid 3 */}
            <div className="flex grid-black-color grid-3">
                <div className="z-10 p-6">
                    <p className="headtext">Time Zone</p>
                    <p className="subtext w-[45%]"> I live in Jupiter, so I'm open to remote work worldwide. </p>
                    <figure className="absolute left-[30%] top-[0%] -z-10 w-[300px] h-[300px] md:w-[400px] md:h-[400px] lg:w-[500px] lg:h-[500px]">
                        <Globe />
                    </figure>
                </div>
            </div>
            {/* Grid 4 */}
            <div className="flex grid-special-color grid-4">
            </div>
            {/* Grid 5 */}
            <div className="flex grid-default-color grid-5">
            </div>
        </div>
    </section>
  )
}

export default About