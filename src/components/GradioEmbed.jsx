/**
 * Embeds a Hugging Face Space via iframe.
 *
 * Why iframe and not the <gradio-app> web component: the web component is
 * version-locked (a 4.x script can't render a 6.x Space, and two Spaces on
 * different Gradio versions can't coexist in one SPA because the custom
 * element registers globally once). The iframe is version-agnostic and lets
 * us grant microphone access for voice tools.
 */
const GradioEmbed = ({ src, height = 720, title = 'AI tool' }) => {
  return (
    <iframe
      src={`${src}?__theme=dark`}
      title={title}
      allow="microphone; camera; clipboard-write; autoplay"
      className="w-full rounded-xl border-0 bg-transparent"
      style={{ height: `${height}px` }}
      loading="lazy"
    />
  )
}

export default GradioEmbed
