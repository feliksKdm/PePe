import { OrbitingCircles } from "./OrbitingCircles";

export function Frameworks() {
  const skills = [
    "javascript",
    "react",
    "tailwindcss",
    "vitejs",
    "git",
    "html5",
    "css3",
    "sqlite",
    "threejs",
    "cplusplus",
    "azure",
  ];
  return (
    <div className="relative flex h-[15rem] w-full flex-col items-center justify-center">
      <OrbitingCircles iconSize={30}>
        {skills.map((skill) => (
          <Icon key={skill} src={`assets/logos/${skill}.svg`} />
        ))}
      </OrbitingCircles>
      <OrbitingCircles iconSize={20} radius={100} reverse speed={2}>
        {skills.map((skill) => (
          <Icon key={`inner-${skill}`} src={`assets/logos/${skill}.svg`} />
        ))}
      </OrbitingCircles>
    </div>
  );
}

const Icon = ({ src }) => (
  <img src={src} className="duration-200 rounded-sm hover:scale-110" />
);
