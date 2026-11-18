export function AutumnMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M49 82V44M49 62L29 42M49 55L70 34M49 73L69 57"
        stroke="#897055"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M45 48C14 55 9 27 17 13C40 13 51 26 45 48Z" fill="#a9b1b1" />
      <path d="M50 43C45 16 62 8 79 9C84 28 73 45 50 43Z" fill="#c6a353" />
      <path d="M40 66C16 70 5 54 9 39C29 36 45 46 40 66Z" fill="#ae665d" />
      <path d="M56 65C52 45 70 39 89 43C90 63 74 73 56 65Z" fill="#638b7a" />
      <path
        d="M33 85H65"
        stroke="#897055"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
