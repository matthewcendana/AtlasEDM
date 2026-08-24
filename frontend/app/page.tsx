import Image from "next/image";
import { LocationSearch } from "./_components/LocationSearch";
import { PoweredByEdmtrain } from "./_components/PoweredByEdmtrain";

export default function Home() {
  return (
    <main className="flex flex-col md:min-h-screen md:flex-row">
      <section className="flex w-full flex-col bg-panel-light px-8 py-10 md:min-h-screen md:w-1/2 md:px-20 md:py-14 lg:px-28">
        <div className="flex flex-1 flex-col justify-center gap-10">
          <div className="flex flex-col gap-4">
            <h1 className="text-6xl font-black tracking-tight text-zinc-950 sm:text-7xl">
              AtlasEDM
            </h1>
            <p className="max-w-lg text-lg text-zinc-500">
              An interactive map of upcoming EDM events and festivals
            </p>
          </div>
          <LocationSearch />
        </div>
        <PoweredByEdmtrain />
      </section>

      <section className="relative h-64 w-full overflow-hidden bg-panel-dark sm:h-80 md:h-auto md:w-1/2">
        <Image
          src="/images/world-map.svg"
          alt="World map"
          fill
          unoptimized
          className="object-cover opacity-90"
          style={{ objectPosition: "15% 38%" }}
        />
      </section>
    </main>
  );
}
