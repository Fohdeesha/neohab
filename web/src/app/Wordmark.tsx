/** The neohab wordmark. The "n" is tinted openHAB-orange as the brand accent. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <h1 className={'nh-wordmark' + (className ? ' ' + className : '')}>
      <span className="nh-wordmark__n">n</span>eohab
    </h1>
  )
}
