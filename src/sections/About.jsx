import Card from "../components/Card"
import { Globe } from "../components/Globe"
import CopyEmailButton from "../components/CopyEmailButton"
import { useRef } from "react"
import { Frameworks } from "../components/Frameworks"

function About() {
  const grid2Container = useRef();
  return (
    <section className="c-space section-spacing" id="about">
      <h2 className="text-heading">About Me</h2>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mt-12 md:auto-rows-[18rem]">
        {/* Grid 1 — intro */}
        <div className="flex items-end grid-default-color grid-1">
          <img
            src="assets/coding-pov.png"
            className="absolute scale-[1.75] -right-[5rem] -top-[1rem] md:scale-[3] md:left-50 md:inset-y-10 lg:scale-[2.5]"
          />
          <div className="z-10">
            <p className="headtext">Hi, I&apos;m Feliks Altymyshov</p>
            <p className="subtext">
              AI engineer focused on computer vision — I build detection
              pipelines, recognition APIs and the backends that serve them.
              Models that only work in notebooks don&apos;t count; I ship the
              whole system.
            </p>
          </div>
        </div>

        {/* Grid 2 — draggable AI stack cards */}
        <div className="flex grid-default-color grid-2">
          <div
            ref={grid2Container}
            className="flex items-center justify-center w-full h-full"
          >
            <p className="flex items-center text-5xl text-gray-500">AI Stack</p>
            <Card
              style={{ rotate: "75deg", top: "30%", left: "20%" }}
              text="PyTorch"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-30deg", top: "60%", left: "45%" }}
              text="YOLO"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "90deg", bottom: "30%", left: "70%" }}
              text="OpenCV"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-45deg", top: "55%", left: "0%" }}
              text="FastAPI"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "20deg", top: "10%", left: "38%" }}
              text="OCR"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "30deg", top: "70%", left: "70%" }}
              text="PostgreSQL"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-45deg", top: "70%", left: "25%" }}
              text="Docker"
              containerRef={grid2Container}
            />
            <Card
              style={{ rotate: "-45deg", top: "5%", left: "10%" }}
              text="scikit-learn"
              containerRef={grid2Container}
            />
          </div>
        </div>

        {/* Grid 3 — location / globe */}
        <div className="flex grid-black-color grid-3">
          <div className="z-10 p-6">
            <p className="headtext">Time Zone</p>
            <p className="subtext w-[45%]">
              Based in Brooklyn, New York — open to remote work worldwide.
            </p>
            <figure className="absolute left-[30%] top-[0%] -z-10 w-[300px] h-[300px] md:w-[400px] md:h-[400px] lg:w-[500px] lg:h-[500px]">
              <Globe />
            </figure>
          </div>
        </div>

        {/* Grid 4 — contact CTA */}
        <div className="flex grid-special-color grid-4">
          <div className="flex flex-col items-center justify-center gap-4 size-full">
            <p className="text-center headtext">
              Have a project or an internship in mind?
            </p>
            <CopyEmailButton />
          </div>
        </div>

        {/* Grid 5 — tech stack + orbiting icons */}
        <div className="flex grid-default-color grid-5">
          <div className="z-10 w-[50%]">
            <p className="headtext">Tech Stack</p>
            <p className="subtext">
              Python is home base — PyTorch, OpenCV and scikit-learn for the
              models, FastAPI and PostgreSQL for the serving, React and
              Tailwind when it needs a face. Always learning the next layer:
              AWS, distributed systems, LLM engineering.
            </p>
          </div>
          <div className="absolute inset-y-0 md:inset-y-9 start-[50%] w-full h-full md:scale-125">
            <Frameworks />
          </div>
        </div>
      </div>
    </section>
  )
}

export default About
