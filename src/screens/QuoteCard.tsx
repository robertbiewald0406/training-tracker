import { quoteCredit, type Quote } from '../lib/quotes'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Scene } from '../ui/Scene'
import { Wordmark } from '../ui/Wordmark'
import { Star, Sun } from '../ui/icons'

// Vollbild-Karte vor der ersten Uebung. Zitat auf ruhigem Kartengrund, Dekoration nur am Rand.
export function QuoteCard({ quote, onGo }: { quote: Quote; onGo: () => void }) {
  const credit = quoteCredit(quote)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zitat zum Start"
      className="fixed inset-0 z-40 overflow-y-auto bg-gradient-to-b from-sky-top to-sky-bottom"
    >
      <Scene />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 pb-44 pt-6">
        <Sun className="mx-auto size-24" />
        <Card className="space-y-5 p-5">
          <div className="flex justify-center gap-2 text-neon" aria-hidden="true">
            <Star className="size-6" />
            <Star className="size-6" />
            <Star className="size-6" />
          </div>
          <blockquote className="font-display text-3xl leading-tight">„{quote.text}“</blockquote>
          <div className="border-t-[3px] border-ink pt-3 text-lg">
            {credit.kind === 'original' && <Wordmark size="sm" />}
            {credit.kind === 'belegt' && (
              <p>
                <span className="font-bold">{credit.author}</span>
                {credit.source && <span className="block text-base">{credit.source}</span>}
              </p>
            )}
            {credit.kind === 'zugeschrieben' && (
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{credit.author}</span>
                <span className="border-[2px] border-ink bg-baby px-2 text-sm font-bold uppercase tracking-wide">
                  zugeschrieben
                </span>
              </p>
            )}
          </div>
        </Card>
        <Button variant="primary" autoFocus onClick={onGo}>
          Los
        </Button>
      </div>
    </div>
  )
}
