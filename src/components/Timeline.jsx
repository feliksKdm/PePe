"use client";;
import { useScroll, useTransform, motion } from "motion/react";
import React, { useEffect, useRef, useState } from "react";

export const Timeline = ({
  data
}) => {
  const ref = useRef(null);
  const containerRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div
      className="c-space section-spacing"
      ref={containerRef}>
      <h2 className="text-heading">Work Experience</h2>
      <p className="subtext mt-3 max-w-xl">
        The checkpoints so far — school, freelance, and the AI systems I build
        on my own time.
      </p>
      <div ref={ref} className="relative pb-20">
        {data.map((item, index) => (
          <div key={index} className="flex justify-start pt-10 md:pt-40 md:gap-10">
            <div
              className="sticky flex flex-col md:flex-row z-10 items-center top-40 self-start max-w-xs lg:max-w-sm md:w-full">
              <div
                className="h-10 absolute -left-[15px] w-10 rounded-full bg-white dark:bg-midnight flex items-center justify-center">
                <div
                  className="h-4 w-4 rounded-full bg-neutral-800 border border-neutral-700 p-2" />
              </div>
              <div
              className="hidden md:flex flex-col gap-2 text-xl font-bold md:text-2xl md:pl-20 text-neutral-300">
                <h3 className="text-3xl">{item.date}</h3>
                <h3 className="text-neutral-400">{item.job}</h3>
                <h3 className="text-neutral-500">{item.title}</h3>
              </div>
            </div>

            <div className="relative pl-20 pr-4 md:pl-4 w-full">
              <div
                className="md:hidden block text-2xl mb-4 text-left font-bold text-neutral-300 gap-5">
                <h3>{item.date}</h3>
                <h3>{item.title}</h3>
              </div>
              <div>
                {item.contents.map((content) => (
                  <p key={content} className="text-neutral-400 mb-3 font-normal">
                    {content}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
        <div
          style={{
            height: height + "px",
          }}
          className="absolute md:left-1 left-1 top-0 overflow-hidden w-[2px] bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-neutral-200 dark:via-neutral-700 to-transparent to-[99%]  [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)] ">
          <motion.div
            style={{
              height: heightTransform,
              opacity: opacityTransform,
            }}
            className="absolute inset-x-0 top-0  w-[2px] bg-gradient-to-t from-purple-500 via-lavender to-transparent from-[0%] via-[10%] rounded-full" />
        </div>
      </div>
    </div>
  );
};
