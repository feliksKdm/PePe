import { Link } from "react-router-dom";
import { mySocials } from "../constants";

const Footer = () => {
  return (
    <section className="flex flex-wrap items-center justify-between gap-5 pb-3 text-sm text-neutral-400 c-space">
      <div className="mb-4 bg-gradient-to-r from-transparent via-neutral-700 to-transparent h-[1px] w-full" />
      <div className="flex gap-4">
        <a href="/#home" className="transition-colors hover:text-white">
          Home
        </a>
        <Link to="/tools" className="transition-colors hover:text-white">
          Tools
        </Link>
        <a
          href="https://github.com/feliksKdm"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-white"
        >
          GitHub
        </a>
      </div>
      <div className="flex gap-3">
        {mySocials.map((social) => (
          <a
            href={social.href}
            key={social.name}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.name}
          >
            <img
              src={social.icon}
              className={`w-5 h-5 ${social.name === "GitHub" ? "invert opacity-80" : ""}`}
              alt={social.name}
            />
          </a>
        ))}
      </div>
      <p>© 2026 Feliks Altymyshov. Built from scratch — no templates left standing.</p>
    </section>
  );
};

export default Footer;
