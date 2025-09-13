import { section } from "motion/react-client"


function About() {
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
            <div className="flex items-end grid-default-color grid-2">

            </div>
            {/* Grid 3 */}
            <div className="flex items-end grid-black-color grid-3">
            </div>
            {/* Grid 4 */}
            <div className="flex items-end grid-special-color grid-4">
            </div>
            {/* Grid 5 */}
            <div className="flex items-end grid-default-color grid-5">
            </div>
        </div>
    </section>
  )
}

export default About