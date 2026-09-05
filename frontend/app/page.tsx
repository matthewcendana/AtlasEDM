import { SearchBar } from "./_components/SearchBar";
import { PoweredByEdmtrain } from "./_components/PoweredByEdmtrain";
import { LandingMapLoader } from "./_components/LandingMapLoader";

export default function Home() {
  return (
    <main className="flex flex-col md:min-h-screen md:flex-row">
      <section className="flex w-full flex-col bg-surface-sunken px-8 py-10 md:min-h-screen md:w-1/2 md:px-20 md:py-14 lg:px-28">
        <div className="flex flex-1 flex-col justify-center gap-10">
          <div className="animate-fade-up flex flex-col gap-4">
            <h1 className="text-6xl font-black tracking-tight text-text-primary sm:text-7xl">
              AtlasEDM
            </h1>
            <p className="max-w-lg text-lg text-text-secondary">
              An interactive map of upcoming EDM events and festivals
            </p>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <SearchBar />
          </div>
        </div>
        <PoweredByEdmtrain />
      </section>

      <section className="relative h-64 w-full overflow-hidden bg-panel-dark sm:h-80 md:h-auto md:w-1/2">
        <LandingMapLoader />
      </section>
    </main>
  );
}
