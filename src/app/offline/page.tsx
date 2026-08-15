export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center text-center p-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Sin conexión</h1>
        <p className="text-gray-600">
          No tienes internet en este momento. Si ya habías abierto esta
          pantalla antes, tus datos guardados siguen disponibles.
        </p>
      </div>
    </div>
  );
}