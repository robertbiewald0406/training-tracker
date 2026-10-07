// Auffaelliger Warnhinweis einer Uebung (plan.json: warning). Sonnengelb nur als Flaeche, Text Indigo.
export function Warning({ text }: { text?: string }) {
  if (!text) return null
  return (
    <p role="note" className="border-[3px] border-ink bg-sun px-3 py-2 text-lg font-bold">
      <span className="font-display uppercase tracking-wide">Achtung: </span>
      {text}
    </p>
  )
}
