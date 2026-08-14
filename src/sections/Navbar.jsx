import { useState } from "react";
import { motion } from "motion/react";
import { Link, useLocation } from "react-router-dom";

function Navigation({ onNavigate }) {
  const { pathname } = useLocation();
  const anchors = [
    { label: "Home", hash: "#home" },
    { label: "About", hash: "#about" },
    { label: "Projects", hash: "#projects" },
    { label: "Work", hash: "#work" },
    { label: "Contact", hash: "#contact" },
  ];

  return (
    <ul className="nav-ul">
      {anchors.map((item) => (
        <li key={item.hash} className="nav-li">
          {pathname === "/" ? (
            <a href={item.hash} className="nav-link" onClick={onNavigate}>
              {item.label}
            </a>
          ) : (
            <Link to={`/${item.hash}`} className="nav-link" onClick={onNavigate}>
              {item.label}
            </Link>
          )}
        </li>
      ))}
      <li className="nav-li">
        <Link
          to="/tools"
          onClick={onNavigate}
          className={`nav-link flex items-center gap-1.5 ${
            pathname.startsWith("/tools") ? "text-white" : ""
          }`}
        >
          <span className="bg-gradient-to-r from-aqua to-lavender bg-clip-text text-transparent font-medium">
            Tools
          </span>
          <span className="rounded-full bg-aqua/15 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-aqua">
            LAB
          </span>
        </Link>
      </li>
    </ul>
  );
}

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  return (
    <div className="fixed inset-x-0 z-20 w-full backdrop-blur-lg bg-primary/40">
      <div className="mx-auto c-space max-w-7xl">
        <div className="flex items-center justify-between p-2 md:p-0">
          <Link
            to="/"
            className="text-xl font-bold transition-colors text-neutral-300 hover:text-white"
          >
            Feliks
          </Link>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex cursor-pointer text-neutral-500 hover:text-white focus:outline-none sm:hidden"
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            <img
              src={isOpen ? "/assets/close.svg" : "/assets/menu.svg"}
              alt="toggle"
              className="w-6 h-6"
            />
          </button>
          <nav className="hidden sm:flex">
            <Navigation />
          </nav>
        </div>
      </div>
      {isOpen && (
        <motion.div
          className="block overflow-hidden text-center sm:hidden"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          style={{ maxHeight: "100vh" }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <Navigation onNavigate={close} />
        </motion.div>
      )}
    </div>
  );
}

export default Navbar;
