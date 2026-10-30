import { useEffect, useState } from 'react'

interface Props {
  onDone: () => void
}

export default function SplashScreen({ onDone }: Props) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!fading) return
    const timer = setTimeout(onDone, 500)
    return () => clearTimeout(timer)
  }, [fading, onDone])

  return (
    /* Fondo oscuro full-screen */
    <div
      className="fixed inset-0 z-[100] bg-black flex justify-center"
      style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.5s ease-out' }}
      onClick={() => setFading(true)}
    >
      {/* Contenedor mismo ancho que AppShell */}
      <div className="relative w-full max-w-lg overflow-hidden cursor-pointer">
        {/* Imagen de fondo */}
        <img
          src="/portada.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top"
          draggable={false}
        />

        {/* Degradado inferior */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

        {/* Botón de entrada */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-12 flex flex-col items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); setFading(true) }}
            className="w-full max-w-xs bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-4 rounded-2xl text-lg shadow-lg"
          >
            Comenzar
          </button>
          <p className="text-white/40 text-xs">Toca en cualquier lugar para continuar</p>
        </div>
      </div>
    </div>
  )
}
