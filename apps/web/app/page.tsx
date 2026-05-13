const defaultVite = "http://localhost:5173";

export default function Home() {
  const viteUrl = process.env.NEXT_PUBLIC_VITE_DEV_URL ?? defaultVite;

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-950">
      <iframe
        title="ugSOT Newsletter Admin"
        src={viteUrl}
        className="h-full w-full flex-1 border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
