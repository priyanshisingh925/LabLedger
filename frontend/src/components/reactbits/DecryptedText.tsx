import { useEffect, useState, useRef } from "react";

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  characters?: string;
  className?: string;
  animateOn?: "view" | "hover" | "mount";
  revealDirection?: "start" | "end" | "center";
}

const DEFAULT_CHARS = "ABCDEF0123456789!@#$%^&*<>~_=";

export function DecryptedText({
  text,
  speed = 40,
  maxIterations = 10,
  characters = DEFAULT_CHARS,
  className = "",
  animateOn = "mount",
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovered, setIsHovered] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split("")
          .map((letter, index) => {
            if (letter === " ") return " ";
            if (index < iteration) {
              return text[index];
            }
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join("")
      );

      if (iteration >= text.length) {
        clearInterval(interval);
      }

      iteration += 1 / (maxIterations / 2);
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, maxIterations, characters, isHovered]);

  const handleMouseEnter = () => {
    if (animateOn === "hover" && isMounted.current) {
      setIsHovered((h) => !h);
    }
  };

  useEffect(() => {
    isMounted.current = true;
  }, []);

  return (
    <span className={`inline-block font-mono ${className}`} onMouseEnter={handleMouseEnter}>
      {displayText}
    </span>
  );
}
